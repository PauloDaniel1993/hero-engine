/**
 * GM adjudication queue. Entries persist in a world setting (GM-writable);
 * player-initiated enqueues relay through the GM socket.
 */
import { localize } from "./i18n";
import { getAdjudicationQueue, setAdjudicationQueue, type QueuedAdjudication } from "./settings";
import { emitToGM } from "./sockets";
import type { Attachment } from "./state";

export async function enqueueAdjudication(att: Attachment, adjudicationId: string, note?: string): Promise<void> {
  if (game.user.isGM) {
    await enqueueDirect({
      id: foundry.utils.randomID(),
      actorUuid: (att.actor as any).uuid,
      pluginId: att.pluginId,
      adjudicationId,
      note,
      queuedAt: Date.now(),
    });
  } else {
    emitToGM({
      type: "queueAdjudication",
      actorUuid: (att.actor as any).uuid,
      pluginId: att.pluginId,
      adjudicationId,
      note,
    });
  }
}

/** GM-side: append to the persisted queue and badge the panel. */
export async function enqueueDirect(entry: QueuedAdjudication): Promise<void> {
  const queue = getAdjudicationQueue();
  queue.push(entry);
  await setAdjudicationQueue(queue);
  ui.notifications?.info(localize("HEROENGINE.Adjudication.Queued"));
  Hooks.callAll("heroEngine.adjudicationQueued", entry);
}

export async function removeQueued(entryId: string): Promise<QueuedAdjudication | null> {
  const queue = getAdjudicationQueue();
  const index = queue.findIndex((e) => e.id === entryId);
  if (index < 0) return null;
  const [entry] = queue.splice(index, 1);
  await setAdjudicationQueue(queue);
  return entry ?? null;
}

export function pendingCount(): number {
  return getAdjudicationQueue().length;
}
