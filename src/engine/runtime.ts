/**
 * Runtime: builds MechanicContexts, applies declarative StateOps with
 * clamping/threshold/audit semantics, and executes actions, prompts and
 * triggers. Everything a plugin can do at play time funnels through here.
 */
import type {
  ActionDef,
  MechanicContext,
  MechanicPlugin,
  NumberOrFormula,
  PromptDef,
  PromptOutcome,
  PromptResult,
  SecureTargetRequest,
  StateOp,
  TriggerDef,
  TriggerPayload,
} from "../api/types";
import { getCompat } from "../compat";
import { FormulaError, containsDice, evaluateFormula, resolveNumeric } from "./formulas";
import { resolveConfig } from "./config-resolution";
import { localize } from "./i18n";
import { getPlugin } from "./registry";
import { intervalReady, intervalRemaining, formatRemaining } from "./recharge-math";
import { postChat, rollDice, rollSaveVsDc, rollSilent } from "./rolls";
import { canOperate, emit, promptTargetUser } from "./sockets";
import { enqueueAdjudication } from "./adjudications";
import { activateTransform, endTransform } from "./transforms";
import { getWorldConfig } from "./settings";
import {
  appendAudit,
  readOverrides,
  readState,
  resolveAttachment,
  writeState,
  type Attachment,
  type InstanceState,
} from "./state";
import type { Bounds } from "./trackers";
import { applyDelta, thresholdsCrossed } from "./trackers";
import { makeRecordAccessor } from "./records";

/** Cooldown sentinels stored in state.cooldowns. */
const CD_READY = -1;
const CD_SPENT = -2; // waiting for a rest/dawn event

/** Foundry dot-path updates used for owner-authored, server-attributed requests. */
export function secureRequestUpdate(requestId: string, pluginId: string, request: SecureTargetRequest, createdAt = Date.now()): Record<string, unknown> {
  return { [`flags.hero-engine.secureRequests.${requestId}`]: { ...request, createdAt, pluginId } };
}

export function secureRequestRemovalUpdate(requestId: string): Record<string, unknown> {
  return { [`flags.hero-engine.secureRequests.-=${requestId}`]: null };
}

// ---------------------------------------------------------------------------
// Evaluation data

/**
 * Assemble the formula variable space for one instance: actor roll data,
 * tracker/resource values, lazily-evaluated derived values, and `cfg` —
 * resolved config values with formula fields evaluated on demand.
 * Runtime cycles throw FormulaError.
 */
export function buildEvalData(att: Attachment, plugin: MechanicPlugin, state: InstanceState): Record<string, unknown> {
  const rollData = (att.actor as any).getRollData?.() ?? {};
  const data: Record<string, unknown> = { ...rollData, ...state.values };
  const rawCfg = resolveConfig(plugin.configSchema ?? [], readOverrides(att.stateDoc, plugin.id), getWorldConfig(plugin.id));
  const resolving = new Set<string>();
  const cfg: Record<string, unknown> = {};
  data["cfg"] = cfg;

  for (const field of plugin.configSchema ?? []) {
    const raw = rawCfg[field.key];
    if (field.type === "formula" && typeof raw === "string") {
      Object.defineProperty(cfg, field.key, {
        enumerable: true,
        configurable: true,
        get: () => {
          const tag = `cfg.${field.key}`;
          if (resolving.has(tag)) throw new FormulaError(`circular config reference "${tag}"`, raw);
          resolving.add(tag);
          try {
            return evaluateFormula(raw, data);
          } finally {
            resolving.delete(tag);
          }
        },
      });
    } else if (field.type === "dice") {
      // Dice strings are not numeric; plugins roll them via ctx.rollDice(ctx.config(key)).
    } else if (field.type === "number") {
      cfg[field.key] = Number(raw);
    } else {
      cfg[field.key] = raw;
    }
  }

  for (const d of plugin.derived ?? []) {
    Object.defineProperty(data, d.id, {
      enumerable: true,
      configurable: true,
      get: () => {
        if (resolving.has(d.id)) throw new FormulaError(`circular derived reference "${d.id}"`, d.formula);
        resolving.add(d.id);
        try {
          return evaluateFormula(d.formula, data);
        } finally {
          resolving.delete(d.id);
        }
      },
    });
  }
  return data;
}

export function valueBounds(plugin: MechanicPlugin, id: string, data: Record<string, unknown>): Bounds {
  const tracker = plugin.trackers?.find((t) => t.id === id);
  if (tracker) {
    return {
      min: tracker.min !== undefined ? resolveNumeric(tracker.min, data) : 0,
      max: tracker.max !== undefined ? resolveNumeric(tracker.max, data) : Number.MAX_SAFE_INTEGER,
    };
  }
  const resource = plugin.resources?.find((r) => r.id === id);
  if (resource) return { min: 0, max: resolveNumeric(resource.max, data) };
  return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER };
}

// ---------------------------------------------------------------------------
// State mutation with clamping, thresholds, audit

async function setValue(
  att: Attachment,
  plugin: MechanicPlugin,
  state: InstanceState,
  id: string,
  next: number,
  source: string
): Promise<number> {
  const data = buildEvalData(att, plugin, state);
  const bounds = valueBounds(plugin, id, data);
  const prev = state.values[id] ?? 0;
  const clamped = Math.min(Math.max(next, bounds.min), bounds.max);
  state.values[id] = clamped;
  appendAudit(state, `${id}: ${prev} -> ${clamped} (${source})`);

  const tracker = plugin.trackers?.find((t) => t.id === id);
  if (tracker?.thresholds?.length) {
    const { activated, deactivated } = thresholdsCrossed(prev, clamped, tracker.thresholds);
    for (const th of activated) {
      await postChat(att.actor, "HEROENGINE.Chat.ThresholdUp", {
        tracker: localize(tracker.labelKey),
        threshold: localize(th.labelKey),
        value: clamped,
      });
      await plugin.hooks?.onThreshold?.(makeContext(att)!, tracker, th, "up");
    }
    for (const th of deactivated) {
      await plugin.hooks?.onThreshold?.(makeContext(att)!, tracker, th, "down");
    }
  }
  return clamped;
}

export async function applyOpsTo(
  att: Attachment,
  plugin: MechanicPlugin,
  ops: StateOp[],
  source: string
): Promise<void> {
  if (!ops.length) return;
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;
  for (const op of ops) {
    if (op.target.startsWith("flag:")) {
      const name = op.target.slice(5);
      state.flags[name] = op.op === "set" ? op.value : Number(state.flags[name] ?? 0) + resolveOpAmount(att, plugin, state, op.amount);
      appendAudit(state, `flag ${name} = ${JSON.stringify(state.flags[name])} (${source})`);
    } else if (op.op === "set") {
      await setValue(att, plugin, state, op.target, Number(op.value ?? 0), source);
    } else {
      const delta = resolveOpAmount(att, plugin, state, op.amount);
      await setValue(att, plugin, state, op.target, (state.values[op.target] ?? 0) + delta, source);
    }
  }
  await writeState(att.stateDoc, plugin.id, state);
}

function resolveOpAmount(
  att: Attachment,
  plugin: MechanicPlugin,
  state: InstanceState,
  amount: NumberOrFormula | undefined
): number {
  if (amount === undefined) return 0;
  return resolveNumeric(amount, buildEvalData(att, plugin, state));
}

// ---------------------------------------------------------------------------
// Context

export function makeContext(att: Attachment): MechanicContext | null {
  const plugin = getPlugin(att.pluginId);
  if (!plugin) return null;
  const state = () => readState(att.stateDoc, att.pluginId);

  let ctx!: MechanicContext;
  ctx = {
    actor: att.actor,
    item: att.item,
    pluginId: att.pluginId,
    config<T>(key: string): T {
      const rawCfg = resolveConfig(plugin.configSchema ?? [], readOverrides(att.stateDoc, plugin.id), getWorldConfig(plugin.id));
      return rawCfg[key] as T;
    },
    state: {
      get: (id) => state()?.values[id] ?? 0,
      set: async (id, value) => {
        const s = state();
        if (!s) return 0;
        const v = await setValue(att, plugin, s, id, value, "api:set");
        await writeState(att.stateDoc, plugin.id, s);
        return v;
      },
      adjust: async (id, delta) => {
        const s = state();
        if (!s) return 0;
        const v = await setValue(att, plugin, s, id, (s.values[id] ?? 0) + delta, "api:adjust");
        await writeState(att.stateDoc, plugin.id, s);
        return v;
      },
      getFlag: <T>(name: string) => state()?.flags[name] as T | undefined,
      setFlag: async (name, value) => {
        const s = state();
        if (!s) return;
        s.flags[name] = value;
        appendAudit(s, `flag ${name} = ${JSON.stringify(value)} (api)`);
        await writeState(att.stateDoc, plugin.id, s);
      },
      activeStance: (groupId) => state()?.stances[groupId] ?? null,
      transform: () => {
        const t = state()?.transform;
        return t ? { id: t.id, roundsLeft: t.roundsLeft } : null;
      },
    },
    records: makeRecordAccessor(att, plugin, () => ctx),
    requestSecureTarget: async (request) => {
      const requestId = foundry.utils.randomID();
      await att.canonicalActor.update(secureRequestUpdate(requestId, plugin.id, request));
    },
    evalFormula: (formula) => {
      const s = state();
      if (!s) return 0;
      return resolveNumeric(formula, buildEvalData(att, plugin, s));
    },
    rollDice: async (formula, flavorKey) => {
      const s = state();
      const data = s ? buildEvalData(att, plugin, s) : {};
      return rollDice(att.actor, formula, data, flavorKey);
    },
    openPrompt: (promptId, extraData) => executePromptLocally(att, promptId, extraData),
    activateTransform: async (transformId) => {
      const c = makeContext(att);
      if (c) await activateTransform(c, plugin, transformId, att);
    },
    endTransform: async () => {
      const c = makeContext(att);
      if (c) await endTransform(c, plugin, att, "manual");
    },
    queueAdjudication: (adjudicationId, note) => enqueueAdjudication(att, adjudicationId, note),
    rollTable: (tableId) => rollConsequenceTable(att, plugin, tableId),
    postChat: (key, data) => postChat(att.actor, key, data),
    postCard: async (opts) => {
      const { postCard } = await import("../ui/chat-cards");
      await postCard(att.actor, plugin.id, opts);
    },
    applyOps: (ops) => applyOpsTo(att, plugin, ops, "api:ops"),
    fireTrigger: async (triggerId, payload) => {
      const trigger = plugin.triggers?.find((t) => t.id === triggerId);
      if (trigger) await fireTriggerLocal(att, plugin, trigger, payload ?? { event: "manual" });
    },
  };
  return ctx;
}

export function contextFor(actor: any, pluginId: string): MechanicContext | null {
  const att = resolveAttachment(actor, pluginId);
  return att ? makeContext(att) : null;
}

// ---------------------------------------------------------------------------
// Consequence tables

export async function rollConsequenceTable(
  att: Attachment,
  plugin: MechanicPlugin,
  tableId: string
): Promise<{ roll: number; textKey: string }> {
  const table = plugin.tables?.find((t) => t.id === tableId);
  if (!table) throw new Error(`hero-engine: unknown table "${tableId}"`);
  const roll = await rollSilent(table.die);
  const entry = table.entries.find((e) => roll >= e.min && roll <= e.max) ?? table.entries.at(-1)!;
  await postChat(att.actor, "HEROENGINE.Chat.TableResult", {
    table: localize(table.labelKey),
    roll,
    result: localize(entry.textKey),
  });
  if (entry.apply?.length) await applyOpsTo(att, plugin, entry.apply, `table:${tableId}`);
  return { roll, textKey: entry.textKey };
}

// ---------------------------------------------------------------------------
// Cooldowns

export interface CooldownStatus {
  ready: boolean;
  remainingText?: string;
}

export function cooldownStatus(att: Attachment, plugin: MechanicPlugin, action: ActionDef): CooldownStatus {
  if (!action.cooldown) return { ready: true };
  const state = readState(att.stateDoc, plugin.id);
  const stored = state?.cooldowns[action.id];
  if (action.cooldown.type === "interval") {
    if (stored === undefined || stored === CD_READY) return { ready: true };
    const hours = resolveNumeric(action.cooldown.hours ?? 24, state ? buildEvalData(att, plugin, state) : {});
    const now = game.time.worldTime as number;
    if (intervalReady(stored, now, hours)) return { ready: true };
    return { ready: false, remainingText: formatRemaining(intervalRemaining(stored, now, hours)) };
  }
  return stored === CD_SPENT
    ? { ready: false, remainingText: localize(`HEROENGINE.Cooldown.${action.cooldown.type}`) }
    : { ready: true };
}

async function markCooldown(att: Attachment, plugin: MechanicPlugin, action: ActionDef): Promise<void> {
  if (!action.cooldown) return;
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;
  state.cooldowns[action.id] = action.cooldown.type === "interval" ? (game.time.worldTime as number) : CD_SPENT;
  await writeState(att.stateDoc, plugin.id, state);
}

/** Clear event-based cooldowns when their event fires (rest/dawn handlers call this). */
export async function clearEventCooldowns(
  att: Attachment,
  plugin: MechanicPlugin,
  eventType: "longRest" | "shortRest" | "dawn"
): Promise<void> {
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;
  let dirty = false;
  for (const action of plugin.actions ?? []) {
    if (action.cooldown?.type === eventType && state.cooldowns[action.id] === CD_SPENT) {
      state.cooldowns[action.id] = CD_READY;
      dirty = true;
    }
  }
  if (dirty) await writeState(att.stateDoc, plugin.id, state);
}

// ---------------------------------------------------------------------------
// Actions

export async function executeAction(att: Attachment, actionId: string): Promise<void> {
  const plugin = getPlugin(att.pluginId);
  if (!plugin) return;
  const action = plugin.actions?.find((a) => a.id === actionId);
  if (!action) return;

  if (!canOperate(att.actor)) return;
  if (action.gmOnly && !game.user.isGM) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.GMOnly"));
    return;
  }

  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;

  if (action.requiresFlag && !state.flags[action.requiresFlag]) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.Unavailable"));
    return;
  }
  if (action.forbidsFlag && state.flags[action.forbidsFlag]) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.Unavailable"));
    return;
  }
  const cd = cooldownStatus(att, plugin, action);
  if (!cd.ready) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.OnCooldown", { remaining: cd.remainingText ?? "" }));
    return;
  }

  // Affordability check before any side effect.
  const data = buildEvalData(att, plugin, state);
  const costs = (action.costs ?? []).map((c) => ({ resource: c.resource, amount: resolveNumeric(c.amount, data) }));
  for (const cost of costs) {
    if ((state.values[cost.resource] ?? 0) < cost.amount) {
      ui.notifications?.warn(localize("HEROENGINE.Errors.NotEnough", { resource: cost.resource }));
      return;
    }
  }

  // Optional prompt first — dismissing an optional prompt aborts at no cost.
  let promptResult: PromptResult | null = null;
  if (action.prompt) {
    promptResult = await executePromptLocally(att, action.prompt);
    if (promptResult === null) return;
  }

  // Pay costs and apply declarative ops.
  const payOps: StateOp[] = costs.map((c) => ({ op: "adjust", target: c.resource, amount: -c.amount }));
  await applyOpsTo(att, plugin, [...payOps, ...(action.apply ?? [])], `action:${action.id}`);

  if (action.roll) {
    const s2 = readState(att.stateDoc, plugin.id)!;
    await rollDice(att.actor, resolveDiceFormula(action.roll.formula, att, plugin, s2), buildEvalData(att, plugin, s2), action.roll.flavorKey);
  }
  if (action.transform) {
    const ctx = makeContext(att);
    if (ctx) await activateTransform(ctx, plugin, action.transform, att);
  }
  if (action.adjudicate) await enqueueAdjudication(att, action.adjudicate);
  if (action.table) await rollConsequenceTable(att, plugin, action.table);

  await markCooldown(att, plugin, action);
  await postChat(att.actor, "HEROENGINE.Chat.ActionUsed", { action: localize(action.labelKey) });

  if (action.runHook) {
    const ctx = makeContext(att);
    if (ctx) await plugin.hooks?.onActionUse?.(ctx, action, promptResult);
  }
}

/** Dice config fields may be referenced as `@cfg.<key>` inside roll formulas: inline them. */
function resolveDiceFormula(formula: string, att: Attachment, plugin: MechanicPlugin, state: InstanceState): string {
  return formula.replace(/@cfg\.([a-zA-Z_][a-zA-Z0-9_]*)/g, (whole, key: string) => {
    const field = plugin.configSchema?.find((f) => f.key === key);
    if (field?.type === "dice" || field?.type === "formula") {
      const rawCfg = resolveConfig(plugin.configSchema ?? [], readOverrides(att.stateDoc, plugin.id), getWorldConfig(plugin.id));
      return `(${String(rawCfg[key])})`;
    }
    return whole;
  });
}

// ---------------------------------------------------------------------------
// Prompts

export async function executePromptLocally(
  att: Attachment,
  promptId: string,
  extraData?: Record<string, unknown>
): Promise<PromptResult | null> {
  const plugin = getPlugin(att.pluginId);
  const prompt = plugin?.prompts?.find((p) => p.id === promptId);
  if (!plugin || !prompt) return null;
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return null;
  const compat = getCompat();
  const data = buildEvalData(att, plugin, state);

  if (prompt.save) {
    const dc = Math.round(evaluateFormula(prompt.save.dcFormula, data));
    const abilityLabel = (ab: string) => (CONFIG as any).DND5E?.abilities?.[ab]?.label ?? ab.toUpperCase();
    const buttons = prompt.save.abilities.map((ab) => ({ id: ab, label: abilityLabel(ab) }));
    const body = `${prompt.bodyKey ? localize(prompt.bodyKey, extraData) : ""}<p><strong>${localize(
      "HEROENGINE.Prompt.SaveVsDc",
      { dc }
    )}</strong></p>`;
    const ability = await compat.dialog.buttons({
      title: localize(prompt.titleKey),
      content: body,
      buttons,
      dismissable: prompt.optional ?? false,
    });
    if (ability === null) return prompt.optional ? null : null;

    const save = await rollSaveVsDc(att.actor, ability, dc);
    if (!save) return null;
    let success = save.success;
    if (prompt.save.nat20AutoSuccess && save.natural === 20) success = true;
    if (prompt.save.nat1AutoFailure && save.natural === 1) success = false;

    const result: PromptResult = { promptId, success, total: save.total, natural: save.natural, ability };
    const outcome = success ? prompt.save.onSuccess : prompt.save.onFailure;
    await postChat(att.actor, success ? "HEROENGINE.Chat.SaveSuccess" : "HEROENGINE.Chat.SaveFailure", {
      prompt: localize(prompt.titleKey),
      total: save.total,
      dc,
    });
    await applyPromptOutcome(att, plugin, prompt, outcome, result);
    return result;
  }

  if (prompt.choices?.length) {
    const choiceId = await compat.dialog.buttons({
      title: localize(prompt.titleKey),
      content: prompt.bodyKey ? localize(prompt.bodyKey, extraData) : "",
      buttons: prompt.choices.map((c) => ({ id: c.id, label: localize(c.labelKey) })),
      dismissable: prompt.optional ?? false,
    });
    if (choiceId === null) return null;
    const choice = prompt.choices.find((c) => c.id === choiceId)!;
    const result: PromptResult = { promptId, choiceId };
    if (choice.apply?.length) await applyOpsTo(att, plugin, choice.apply, `prompt:${prompt.id}`);
    if (choice.chatKey) await postChat(att.actor, choice.chatKey);
    await plugin.hooks?.onPromptResolved?.(makeContext(att)!, prompt, result);
    return result;
  }
  return null;
}

async function applyPromptOutcome(
  att: Attachment,
  plugin: MechanicPlugin,
  prompt: PromptDef,
  outcome: PromptOutcome | undefined,
  result: PromptResult
): Promise<void> {
  if (outcome?.apply?.length) await applyOpsTo(att, plugin, outcome.apply, `prompt:${prompt.id}`);
  if (outcome?.chatKey) await postChat(att.actor, outcome.chatKey);
  if (outcome?.transform) {
    const ctx = makeContext(att);
    if (ctx) await activateTransform(ctx, plugin, outcome.transform, att);
  }
  if (outcome?.runHook || prompt.save?.onSuccess?.runHook || prompt.save?.onFailure?.runHook) {
    const ctx = makeContext(att);
    if (ctx) await plugin.hooks?.onPromptResolved?.(ctx, prompt, result);
  }
}

/** Open a prompt on the responsible user's client (socket-routed when remote). */
export async function routePrompt(att: Attachment, promptId: string, extra?: Record<string, unknown>): Promise<void> {
  const target = promptTargetUser(att.actor);
  if (!target) {
    ui.notifications?.warn(localize("HEROENGINE.Socket.WaitingForGM"));
    return;
  }
  if (target.id === game.user.id) {
    await executePromptLocally(att, promptId, extra);
  } else {
    emit({
      type: "openPrompt",
      targetUserId: target.id,
      actorUuid: att.actor.uuid,
      pluginId: att.pluginId,
      promptId,
      extra,
    });
  }
}

// ---------------------------------------------------------------------------
// Triggers

export async function fireTriggerLocal(
  att: Attachment,
  plugin: MechanicPlugin,
  trigger: TriggerDef,
  payload: TriggerPayload
): Promise<void> {
  if (trigger.gmConfirmKey) {
    const { requestGmConfirm } = await import("./sockets");
    const ok = await requestGmConfirm(localize(trigger.gmConfirmKey));
    if (!ok) return;
  }
  if (trigger.apply?.length) await applyOpsTo(att, plugin, trigger.apply, `trigger:${trigger.id}`);
  if (trigger.prompt) await routePrompt(att, trigger.prompt, payload.data);
  if (trigger.runHook) {
    const ctx = makeContext(att);
    if (ctx) await plugin.hooks?.onTrigger?.(ctx, trigger, payload);
  }
}
