/**
 * Trigger bus: normalizes Foundry/dnd5e hooks into engine events and
 * dispatches them to the attached mechanics of the involved actors.
 *
 * Client execution rules:
 * - Hooks that fire on EVERY client (updateActor, updateCombat, updateWorldTime)
 *   execute only on the authoritative client (active GM, else lowest-id user).
 * - Hooks that fire only where the action happened (attack rolls, rests)
 *   execute right there.
 */
import type { EngineEvent } from "../api/types";
import { getCompat } from "../compat";
import { getPlugin } from "./registry";
import { handleRest, handleWorldTime } from "./recharge";
import { executePromptLocally, fireTriggerLocal, makeContext } from "./runtime";
import { isAuthoritativeClient, onSocketMessage } from "./sockets";
import { resolveAttachment, resolveAttachments } from "./state";
import { endTransform, tickTransform } from "./transforms";
import { enqueueDirect } from "./adjudications";

/** Dispatch one engine event to every subscribed mechanic on an actor. */
export async function dispatchEvent(actor: any, event: EngineEvent, data?: Record<string, unknown>): Promise<void> {
  for (const att of resolveAttachments(actor)) {
    const plugin = getPlugin(att.pluginId);
    if (!plugin) continue;
    for (const trigger of plugin.triggers ?? []) {
      if (trigger.event !== event) continue;
      try {
        await fireTriggerLocal(att, plugin, trigger, { event, data });
      } catch (e) {
        console.error(`hero-engine | trigger ${plugin.id}/${trigger.id}`, e);
      }
    }
  }
}

function combatAllies(actor: any): any[] {
  const combat = game.combat;
  if (!combat) return [];
  const mine = combat.combatants.find((c: any) => c.actor?.id === actor.id);
  if (!mine) return [];
  return combat.combatants
    .filter(
      (c: any) =>
        c.actor &&
        c.actor.id !== actor.id &&
        c.token?.disposition === mine.token?.disposition
    )
    .map((c: any) => c.actor);
}

export function initTriggerBus(): void {
  const compat = getCompat();
  const hpBeforeUpdate = new Map<string, number>();

  // --- Attack outcomes (fire on the rolling client) --------------------------
  compat.onAttackResult(async ({ attacker, target, isCrit, isHit, eventId, itemUuid, activityUuid }) => {
    const attackData = { targetUuid: target?.uuid, eventId, itemUuid, activityUuid };
    if (isHit) await dispatchEvent(attacker, "attack-hit", attackData);
    if (isCrit) {
      await dispatchEvent(attacker, "crit-dealt", attackData);
      if (target) await dispatchEvent(target, "crit-received", { attackerUuid: attacker?.uuid, eventId, itemUuid, activityUuid });
    }
  });

  // --- Rests (fire on the initiating client) --------------------------------
  compat.onRestCompleted(async ({ actor, kind, eventId }) => {
    await handleRest(actor, kind);
    await dispatchEvent(actor, kind, { eventId });
  });

  // --- HP watching: damage-taken, ally-downed, reduced-to-zero ---------------
  Hooks.on("preUpdateActor", (actor: any, changes: any) => {
    if (foundry.utils.getProperty(changes, "system.attributes.hp.value") === undefined) return;
    const current = actor.system?.attributes?.hp?.value;
    if (typeof current === "number") hpBeforeUpdate.set(actor.uuid, current);
  });
  Hooks.on("updateActor", async (actor: any, changes: any, _options: any, _userId: string) => {
    if (!isAuthoritativeClient()) return;
    const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (newHp === undefined) return;
    const prevHp = hpBeforeUpdate.get(actor.uuid);
    hpBeforeUpdate.delete(actor.uuid);

    if (typeof prevHp === "number" && newHp < prevHp) {
      await dispatchEvent(actor, "damage-taken", { amount: prevHp - newHp });
    }
    if (newHp <= 0 && (typeof prevHp !== "number" || prevHp > 0)) {
      // Allies of the downed actor:
      for (const ally of combatAllies(actor)) {
        await dispatchEvent(ally, "ally-downed", { downedUuid: actor.uuid, downedName: actor.name });
      }
      // Kill credit needs a correlated damage workflow; never infer it from the current combatant.
    }
  });

  // --- Combat turns/rounds + transformation ticking --------------------------
  Hooks.on("updateCombat", async (combat: any, changes: any, _options: any, _userId: string) => {
    if (!isAuthoritativeClient()) return;
    if (changes.turn === undefined && changes.round === undefined) return;

    const previous = combat.previous;
    const prevCombatant = previous?.combatantId ? combat.combatants.get(previous.combatantId) : null;
    const prevActor = prevCombatant?.actor;
    const currentActor = combat.combatant?.actor;

    if (prevActor && prevActor.id !== currentActor?.id) {
      await dispatchEvent(prevActor, "turn-end");
      // Tick transformations at the end of the transformed actor's turn.
      for (const att of resolveAttachments(prevActor)) {
        const plugin = getPlugin(att.pluginId);
        if (!plugin) continue;
        const status = await tickTransform(att, plugin);
        if (status === "expired") {
          const ctx = makeContext(att);
          if (ctx) await endTransform(ctx, plugin, att, "expired");
        }
      }
    }
    if (currentActor && prevActor?.id !== currentActor.id) {
      await dispatchEvent(currentActor, "turn-start");
    }
    if (changes.round !== undefined && previous?.round !== undefined && changes.round > previous.round) {
      for (const combatant of combat.combatants) {
        if (combatant.actor) await dispatchEvent(combatant.actor, "combat-round", { round: changes.round });
      }
    }
  });

  // --- World time -------------------------------------------------------------
  Hooks.on("updateWorldTime", async (worldTime: number, dt: number) => {
    if (!isAuthoritativeClient()) return;
    const prev = worldTime - dt;
    await handleWorldTime(prev, worldTime);
    for (const actor of game.actors ?? []) {
      if (resolveAttachments(actor).length) {
        await dispatchEvent(actor, "world-time-advanced", { worldTime, dt });
      }
    }
  });

  // --- Socket-routed work for this client -------------------------------------
  onSocketMessage(async (msg) => {
    if (msg.type === "openPrompt" && msg.targetUserId === game.user.id) {
      const actor = await fromUuidSafe(msg.actorUuid);
      if (!actor) return;
      const att = resolveAttachment(actor, msg.pluginId);
      if (att) await executePromptLocally(att, msg.promptId, msg.extra);
    }
    if (msg.type === "queueAdjudication" && game.user.isGM && isAuthoritativeClient()) {
      await enqueueDirect({
        id: foundry.utils.randomID(),
        actorUuid: msg.actorUuid,
        pluginId: msg.pluginId,
        adjudicationId: msg.adjudicationId,
        note: msg.note,
        queuedAt: Date.now(),
      });
    }
  });
}

async function fromUuidSafe(uuid: string): Promise<any | null> {
  try {
    const doc = await (globalThis as any).fromUuid(uuid);
    return doc?.documentName === "Actor" ? doc : doc?.actor ?? doc;
  } catch {
    return null;
  }
}
