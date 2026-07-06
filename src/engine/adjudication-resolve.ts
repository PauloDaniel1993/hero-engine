/**
 * GM-side resolution of queued adjudications (invoked from the GM panel).
 */
import { localize } from "./i18n";
import { getPlugin } from "./registry";
import { removeQueued } from "./adjudications";
import { applyOpsTo, makeContext } from "./runtime";
import { postChat } from "./rolls";
import { resolveAttachment } from "./state";

/**
 * Resolve one queue entry. `resultId` is a choice id for `choice` kind, or
 * "confirm"/"deny" for `confirm` kind.
 */
export async function resolveAdjudication(entryId: string, resultId: string): Promise<void> {
  if (!game.user.isGM) return;
  const entry = await removeQueued(entryId);
  if (!entry) return;

  const actor = await (globalThis as any).fromUuid(entry.actorUuid);
  const plugin = getPlugin(entry.pluginId);
  if (!actor || !plugin) return;
  const att = resolveAttachment(actor, entry.pluginId);
  if (!att) return;
  const def = plugin.adjudications?.find((a) => a.id === entry.adjudicationId);
  if (!def) return;

  let label = resultId;
  if (def.kind === "choice") {
    const choice = def.choices?.find((c) => c.id === resultId);
    if (!choice) return;
    label = localize(choice.labelKey);
    if (choice.apply?.length) await applyOpsTo(att, plugin, choice.apply, `adjudication:${def.id}`);
  } else {
    const ops = resultId === "confirm" ? def.onConfirm : def.onDeny;
    label = localize(resultId === "confirm" ? "HEROENGINE.Adjudication.Confirmed" : "HEROENGINE.Adjudication.Denied");
    if (ops?.length) await applyOpsTo(att, plugin, ops, `adjudication:${def.id}`);
  }

  await postChat(actor, "HEROENGINE.Chat.Adjudicated", {
    title: localize(def.titleKey),
    result: label,
  });
  if (def.runHook) {
    const ctx = makeContext(att);
    if (ctx) await plugin.hooks?.onAdjudicated?.(ctx, def, resultId);
  }
  Hooks.callAll("heroEngine.adjudicationResolved", entry, resultId);
}
