/**
 * Stance groups: mutually exclusive modes with Active Effect bundles.
 * Switching removes the previous stance's effects and applies the new ones.
 */
import { MODULE_ID } from "../constants";
import { localize } from "./i18n";
import { getPlugin } from "./registry";
import { resolveNumeric } from "./formulas";
import { postChat } from "./rolls";
import { buildEvalData, applyOpsTo } from "./runtime";
import { canOperate } from "./sockets";
import { appendAudit, readState, writeState, type Attachment } from "./state";

export async function setStance(att: Attachment, groupId: string, stanceId: string | null): Promise<void> {
  const plugin = getPlugin(att.pluginId);
  if (!plugin || !canOperate(att.actor)) return;
  const group = plugin.stances?.find((g) => g.id === groupId);
  if (!group) return;
  const state = readState(att.stateDoc, plugin.id);
  if (!state) return;

  const current = state.stances[groupId] ?? null;
  if (current === stanceId) return;
  if (stanceId === null && !group.allowNone) return;

  const next = stanceId ? group.stances.find((s) => s.id === stanceId) : null;
  if (stanceId && !next) return;

  // Switch cost (e.g. Dorian pays 1 charge to swap climate effects mid-duration).
  if (group.switchCost && current !== null && stanceId !== null) {
    const cost = resolveNumeric(group.switchCost.amount, buildEvalData(att, plugin, state));
    if ((state.values[group.switchCost.resource] ?? 0) < cost) {
      ui.notifications?.warn(localize("HEROENGINE.Errors.NotEnough", { resource: group.switchCost.resource }));
      return;
    }
    await applyOpsTo(att, plugin, [{ op: "adjust", target: group.switchCost.resource, amount: -cost }], `stance:${groupId}`);
  }

  const actor: any = att.actor;
  const marker = `${plugin.id}/${groupId}`;

  // Remove previous stance effects.
  const stale = (actor.effects ?? []).filter(
    (e: any) => e.getFlag?.(MODULE_ID, "stance") === marker
  );
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map((e: any) => e.id));

  // Apply new stance effects.
  if (next?.effects?.length) {
    await actor.createEmbeddedDocuments(
      "ActiveEffect",
      next.effects.map((e) => ({
        ...e,
        name: (e as any).name ?? localize(next.labelKey),
        flags: { ...((e as any).flags ?? {}), [MODULE_ID]: { stance: marker } },
      }))
    );
  }

  const fresh = readState(att.stateDoc, plugin.id)!;
  fresh.stances[groupId] = stanceId;
  appendAudit(fresh, `stance ${groupId} -> ${stanceId ?? "none"}`);
  await writeState(att.stateDoc, plugin.id, fresh);
  await postChat(actor, "HEROENGINE.Chat.StanceChanged", {
    group: localize(group.labelKey),
    stance: next ? localize(next.labelKey) : localize("HEROENGINE.Stance.None"),
  });
}
