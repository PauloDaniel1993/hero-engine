/**
 * Attaching/detaching mechanics to actors (GM-only). Item archetype mechanics
 * bind to a specific Item: state lives on the item and follows it across
 * owners; the actor keeps a pointer flag that re-resolves on item transfer.
 */
import { MODULE_ID } from "../constants";
import { localize } from "./i18n";
import { getPlugin } from "./registry";
import { makeContext, buildEvalData } from "./runtime";
import {
  initialState,
  readState,
  resolveAttachment,
  setActorAttachment,
  writeState,
  clearState,
  canonicalActor,
  type Attachment,
} from "./state";

export async function attachMechanic(actor: any, pluginId: string, options: { item?: any } = {}): Promise<void> {
  const stableActor = canonicalActor(actor);
  const plugin = getPlugin(pluginId);
  if (!plugin) throw new Error(`hero-engine: unknown mechanic "${pluginId}"`);
  if (!game.user.isGM) throw new Error("hero-engine: only the GM can attach mechanics");
  if (plugin.archetype === "item" && !options.item) {
    throw new Error(`hero-engine: "${pluginId}" is an item mechanic — pass the item to bind`);
  }
  if (resolveAttachment(actor, pluginId)) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.AlreadyAttached"));
    return;
  }

  const stateDoc = plugin.archetype === "item" ? options.item : stableActor;
  const att: Attachment = { actor, canonicalActor: stableActor, stateDoc, item: options.item, pluginId };

  // Existing state on the item (weapon changing hands) is kept intact.
  if (!readState(stateDoc, pluginId)) {
    const bootstrap = initialState(plugin, { ...(actor.getRollData?.() ?? {}), cfg: {} });
    await writeState(stateDoc, pluginId, bootstrap);
    // Re-init with full eval data now that values exist (formula initials/maxes).
    const state = readState(stateDoc, pluginId)!;
    buildEvalData(att, plugin, state);
  }
  if (plugin.archetype === "item") {
    await options.item.setFlag(MODULE_ID, "boundPlugin", pluginId);
  }
  await setActorAttachment(stableActor, pluginId, plugin.archetype === "item" ? { itemUuid: options.item.uuid } : {});

  const ctx = makeContext(att);
  if (ctx) await plugin.hooks?.onAttach?.(ctx);
  ui.notifications?.info(localize("HEROENGINE.Attach.Done", { mechanic: localize(plugin.nameKey) }));
}

export async function detachMechanic(actor: any, pluginId: string): Promise<void> {
  if (!game.user.isGM) throw new Error("hero-engine: only the GM can detach mechanics");
  const plugin = getPlugin(pluginId);
  const att = resolveAttachment(actor, pluginId);
  if (att && plugin) {
    const ctx = makeContext(att);
    if (ctx) {
      // End any running transformation so no effects/forms are orphaned.
      const { endTransform } = await import("./transforms");
      await endTransform(ctx, plugin, att, "manual");
      await plugin.hooks?.onDetach?.(ctx);
    }
    await clearState(att.stateDoc, pluginId);
    if (att.item) await att.item.unsetFlag(MODULE_ID, "boundPlugin");
  }
  await setActorAttachment(canonicalActor(actor), pluginId, null);
}

/**
 * When an item bound to a mechanic is created on a new actor (weapon changes
 * hands), re-point the attachment automatically. Registered in main.ts.
 */
export function watchItemTransfers(): void {
  Hooks.on("createItem", async (item: any) => {
    if (!game.user.isGM) return;
    const pluginId = item.getFlag?.(MODULE_ID, "boundPlugin");
    if (!pluginId || !item.actor) return;
    await setActorAttachment(item.actor, pluginId, { itemUuid: item.uuid });
    ui.notifications?.info(
      localize("HEROENGINE.Attach.Rebound", { mechanic: pluginId, actor: item.actor.name })
    );
  });
  Hooks.on("deleteItem", async (item: any) => {
    if (!game.user.isGM) return;
    const pluginId = item.getFlag?.(MODULE_ID, "boundPlugin");
    if (!pluginId || !item.actor) return;
    await setActorAttachment(item.actor, pluginId, null);
  });
}
