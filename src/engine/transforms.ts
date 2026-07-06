/**
 * Transformation lifecycle. Two strategies share duration/expiry/consequence:
 * - overlay: Active Effects + temporary granted items on the same actor.
 * - actor-swap: dnd5e polymorph-style swap into a prepared form Actor.
 * Round countdown is driven by the trigger bus (turn-end of the transformed
 * actor). Natural expiry fires the declared consequence; a GM early end does
 * not (the GM can apply it manually from the panel).
 */
import type { MechanicContext, MechanicPlugin, TransformDef } from "../api/types";
import { getCompat } from "../compat";
import { MODULE_ID } from "../constants";
import { localize } from "./i18n";
import { postChat } from "./rolls";
import { appendAudit, readState, writeState, type Attachment } from "./state";

function resolveStrategy(ctx: MechanicContext, def: TransformDef): "overlay" | "actor-swap" {
  if (def.strategy !== "config") return def.strategy;
  const configured = ctx.config<string>(`transform.${def.id}.strategy`);
  if (configured === "overlay" || configured === "actor-swap") return configured;
  return def.overlay ? "overlay" : "actor-swap";
}

export async function activateTransform(
  ctx: MechanicContext,
  plugin: MechanicPlugin,
  transformId: string,
  att: Attachment
): Promise<void> {
  const def = plugin.transformations?.find((t) => t.id === transformId);
  if (!def) throw new Error(`hero-engine: unknown transformation "${transformId}"`);
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;
  if (state.transform) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.AlreadyTransformed"));
    return;
  }

  const strategy = resolveStrategy(ctx, def);
  const rounds = Math.max(1, Math.round(ctx.evalFormula(def.durationRounds)));
  const actor: any = att.actor;

  if (strategy === "overlay") {
    const effectIds: string[] = [];
    const itemIds: string[] = [];
    if (def.overlay?.effects?.length) {
      const created = await actor.createEmbeddedDocuments(
        "ActiveEffect",
        def.overlay.effects.map((e) => ({
          ...e,
          name: (e as any).name ?? localize(def.labelKey),
          flags: { ...((e as any).flags ?? {}), [MODULE_ID]: { transform: `${plugin.id}/${def.id}` } },
        }))
      );
      effectIds.push(...created.map((d: any) => d.id));
    }
    if (def.overlay?.grantItems?.length) {
      const created = await actor.createEmbeddedDocuments(
        "Item",
        def.overlay.grantItems.map((i) => ({
          ...i,
          flags: { ...((i as any).flags ?? {}), [MODULE_ID]: { transform: `${plugin.id}/${def.id}` } },
        }))
      );
      itemIds.push(...created.map((d: any) => d.id));
    }
    state.transform = { id: def.id, strategy, roundsLeft: rounds, effectIds, itemIds };
  } else {
    const formName = def.swap?.formActorName ?? "";
    const formActor = game.actors?.getName?.(formName);
    if (!formActor) {
      ui.notifications?.error(localize("HEROENGINE.Errors.FormActorMissing", { name: formName }));
      return;
    }
    await getCompat().transformInto(actor, formActor, {
      keepHpPercent: def.swap?.hpCarry === "keep-percent",
    });
    state.transform = { id: def.id, strategy, roundsLeft: rounds };
  }

  appendAudit(state, `transform ${def.id} activated (${strategy}, ${rounds} rounds)`);
  await writeState(att.stateDoc, plugin.id, state);
  await postChat(actor, "HEROENGINE.Chat.TransformStart", {
    form: localize(def.labelKey),
    rounds,
  });
}

/** Decrement the round counter at the end of the transformed actor's turn. */
export async function tickTransform(att: Attachment, plugin: MechanicPlugin): Promise<"expired" | "running" | "none"> {
  const state = readState(att.stateDoc, plugin.id);
  if (!state?.transform) return "none";
  state.transform.roundsLeft -= 1;
  if (state.transform.roundsLeft > 0) {
    await writeState(att.stateDoc, plugin.id, state);
    return "running";
  }
  await writeState(att.stateDoc, plugin.id, state);
  return "expired";
}

export async function endTransform(
  ctx: MechanicContext,
  plugin: MechanicPlugin,
  att: Attachment,
  reason: "expired" | "manual"
): Promise<void> {
  const state = readState(att.stateDoc, plugin.id);
  const active = state?.transform;
  if (!state || !active) return;
  const def = plugin.transformations?.find((t) => t.id === active.id);
  const actor: any = att.actor;

  if (active.strategy === "overlay") {
    if (active.effectIds?.length) {
      const existing = active.effectIds.filter((id) => actor.effects?.get?.(id));
      if (existing.length) await actor.deleteEmbeddedDocuments("ActiveEffect", existing);
    }
    if (active.itemIds?.length) {
      const existing = active.itemIds.filter((id) => actor.items?.get?.(id));
      if (existing.length) await actor.deleteEmbeddedDocuments("Item", existing);
    }
  } else {
    await getCompat().revertOriginalForm(actor);
  }

  state.transform = null;
  appendAudit(state, `transform ${active.id} ended (${reason})`);
  await writeState(att.stateDoc, plugin.id, state);
  await postChat(actor, "HEROENGINE.Chat.TransformEnd", {
    form: def ? localize(def.labelKey) : active.id,
  });

  if (reason === "expired" && def?.onExpire) {
    const after = def.onExpire;
    if (after.apply?.length) await ctx.applyOps(after.apply);
    if (after.chatKey) await ctx.postChat(after.chatKey);
    if (after.table) await ctx.rollTable(after.table);
    if (after.adjudicate) await ctx.queueAdjudication(after.adjudicate);
    if (after.runHook && def) await plugin.hooks?.onTransformExpire?.(ctx, def);
  }
}
