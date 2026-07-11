import { MODULE_ID } from "../constants";

/**
 * Suppression never mutates or deletes source Items/Activities. A managed
 * marker effect blocks only the matching activity while active; deleting the
 * effect restores the source document exactly.
 */
export function initSuppressionGuard(): void {
  Hooks.on("dnd5e.preUseActivity", (activity: any) => {
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!actor) return;
    const itemId = activity?.item?.id;
    const activityId = activity?.id ?? activity?._id;
    const blocked = actor.effects?.find?.((effect: any) => {
      const opaque = effect.getFlag?.(MODULE_ID, "sourceOpaqueId");
      return opaque === `item:${itemId}` || opaque === `activity:${itemId}:${activityId}`;
    });
    if (!blocked) return;
    ui.notifications?.warn(game.i18n.localize("HEROENGINE.Thargunn.Siphon.SuppressedUse"));
    return false;
  });
}
