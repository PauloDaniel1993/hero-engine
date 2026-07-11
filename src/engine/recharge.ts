/**
 * Recharge engine (Foundry glue over recharge-math): rest-based rules with
 * conditional GM confirmation, dawn crossing and interval cooldowns on world
 * time, and GM manual force/reset.
 */
import type { MechanicPlugin, RechargeRule, ResourceDef } from "../api/types";
import { localize } from "./i18n";
import { resolveNumeric } from "./formulas";
import { getPlugin } from "./registry";
import { dawnCrossed } from "./recharge-math";
import { postChat, rollSilent } from "./rolls";
import { buildEvalData, clearEventCooldowns, makeContext } from "./runtime";
import { getDawnHour } from "./settings";
import { requestGmConfirm } from "./sockets";
import { appendAudit, readState, resolveAttachments, writeState, type Attachment } from "./state";

async function applyRule(
  att: Attachment,
  plugin: MechanicPlugin,
  resource: ResourceDef,
  rule: RechargeRule
): Promise<void> {
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;

  let amount = rule.amount;
  let consumedConditionFlag = false;
  if (rule.conditionFlag) {
    const confirmed = state.flags[rule.conditionFlag] === true;
    consumedConditionFlag = true;
    state.flags[rule.conditionFlag] = false;
    if (!confirmed) amount = rule.fallbackAmount ?? "none";
  } else if (rule.conditionKey) {
    const confirmed = await requestGmConfirm(
      `${(att.actor as any).name}: ${localize(rule.conditionKey)}`
    );
    if (!confirmed) amount = rule.fallbackAmount ?? "none";
  }

  const data = buildEvalData(att, plugin, state);
  const max = resolveNumeric(resource.max, data);
  const prev = state.values[resource.id] ?? 0;
  let next = prev;

  if (rule.setTo !== undefined && amount === rule.amount) {
    next = rule.setTo;
  } else if (amount === "full") {
    next = max;
  } else if (amount && amount !== "none") {
    next = prev + (await rollSilent(amount, data));
  }
  next = Math.min(Math.max(next, 0), max);
  if (next === prev) {
    if (consumedConditionFlag) await writeState(att.stateDoc, plugin.id, state);
    return;
  }

  state.values[resource.id] = next;
  appendAudit(state, `${resource.id}: ${prev} -> ${next} (recharge:${rule.on})`);
  await writeState(att.stateDoc, plugin.id, state);
  await postChat(att.actor, "HEROENGINE.Chat.Recharged", {
    resource: localize(resource.labelKey),
    value: next,
    max,
  });
  const ctx = makeContext(att);
  if (ctx) await plugin.hooks?.onRecharge?.(ctx, resource, rule, next - prev);
}

/** Rest completion: apply matching recharge rules + clear event cooldowns. */
export async function handleRest(actor: any, kind: "rest-short" | "rest-long"): Promise<void> {
  const on = kind === "rest-long" ? "longRest" : "shortRest";
  for (const att of resolveAttachments(actor)) {
    const plugin = getPlugin(att.pluginId);
    if (!plugin) continue;
    for (const resource of plugin.resources ?? []) {
      for (const rule of resource.recharge ?? []) {
        if (rule.on === on) await applyRule(att, plugin, resource, rule);
      }
    }
    await clearEventCooldowns(att, plugin, on);
  }
}

/** World-time advancement: dawn recharges for every attached mechanic in the world. */
export async function handleWorldTime(prev: number, next: number): Promise<void> {
  if (!dawnCrossed(prev, next, getDawnHour())) return;
  for (const actor of game.actors ?? []) {
    for (const att of resolveAttachments(actor)) {
      const plugin = getPlugin(att.pluginId);
      if (!plugin) continue;
      for (const resource of plugin.resources ?? []) {
        for (const rule of resource.recharge ?? []) {
          if (rule.on === "dawn") await applyRule(att, plugin, resource, rule);
        }
      }
      await clearEventCooldowns(att, plugin, "dawn");
    }
  }
}

/** GM manual override: refill (or empty) a pool regardless of rules. */
export async function forceRecharge(att: Attachment, resourceId: string, to: "full" | "empty"): Promise<void> {
  const plugin = getPlugin(att.pluginId);
  if (!plugin) return;
  const resource = plugin.resources?.find((r) => r.id === resourceId);
  const state = readState(att.stateDoc, plugin.id);
  if (!resource || !state) return;
  const max = resolveNumeric(resource.max, buildEvalData(att, plugin, state));
  const prev = state.values[resourceId] ?? 0;
  state.values[resourceId] = to === "full" ? max : 0;
  appendAudit(state, `${resourceId}: ${prev} -> ${state.values[resourceId]} (GM force)`);
  await writeState(att.stateDoc, plugin.id, state);
}

/** GM manual override: reset an action cooldown to ready. */
export async function resetCooldown(att: Attachment, actionId: string): Promise<void> {
  const state = readState(att.stateDoc, att.pluginId);
  if (!state) return;
  state.cooldowns[actionId] = -1;
  appendAudit(state, `cooldown ${actionId} reset (GM force)`);
  await writeState(att.stateDoc, att.pluginId, state);
}
