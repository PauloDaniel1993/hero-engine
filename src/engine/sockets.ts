/**
 * Socket relay and permission utilities.
 *
 * Players own their actors, so most state writes are direct document updates.
 * The relay covers the elevated cases: queueing adjudications (world-setting
 * write, GM-only), GM confirmations requested from a player client, and
 * prompts that must open on a specific user's screen.
 *
 * When no GM is connected, elevated ops queue in this client's memory with a
 * visible notification, and re-emit when a GM connects (`userConnected`).
 */
import { SOCKET_NAME } from "../constants";
import { localize } from "./i18n";

type SocketMessage =
  | { type: "openPrompt"; targetUserId: string; actorUuid: string; pluginId: string; promptId: string; extra?: Record<string, unknown> }
  | { type: "queueAdjudication"; actorUuid: string; pluginId: string; adjudicationId: string; note?: string }
  | { type: "gmConfirm"; replyId: string; fromUserId: string; question: string }
  | { type: "gmConfirmReply"; replyId: string; targetUserId: string; answer: boolean };

type Handler = (msg: SocketMessage) => void | Promise<void>;

const handlers = new Set<Handler>();
const confirmResolvers = new Map<string, (answer: boolean) => void>();
const offlineQueue: SocketMessage[] = [];

export function activeGM(): any | null {
  return game.users?.activeGM ?? game.users?.find((u: any) => u.isGM && u.active) ?? null;
}

export function isAuthoritativeClient(): boolean {
  const gm = activeGM();
  if (gm) return game.user.id === gm.id;
  // No GM online: lowest-id active user is authoritative so hooks that fire on
  // every client (combat turns, world time) execute exactly once.
  const active = game.users?.filter((u: any) => u.active) ?? [];
  const lowest = active.sort((a: any, b: any) => a.id.localeCompare(b.id))[0];
  return lowest ? game.user.id === lowest.id : true;
}

/** First connected non-GM owner of the actor, else the active GM, else null. */
export function promptTargetUser(actor: any): any | null {
  const owners = game.users?.filter(
    (u: any) => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")
  );
  if (owners?.length) return owners[0];
  return activeGM();
}

export function onSocketMessage(handler: Handler): void {
  handlers.add(handler);
}

export function initSockets(): void {
  game.socket.on(SOCKET_NAME, (msg: SocketMessage) => {
    if (msg.type === "gmConfirmReply") {
      if (msg.targetUserId !== game.user.id) return;
      confirmResolvers.get(msg.replyId)?.(msg.answer);
      confirmResolvers.delete(msg.replyId);
      return;
    }
    for (const handler of handlers) {
      Promise.resolve(handler(msg)).catch((e) => console.error("hero-engine | socket handler", e));
    }
  });

  // Drain the offline queue when a GM connects.
  Hooks.on("userConnected", (user: any, connected: boolean) => {
    if (connected && user.isGM && offlineQueue.length) {
      const queued = offlineQueue.splice(0);
      for (const msg of queued) game.socket.emit(SOCKET_NAME, msg);
      ui.notifications?.info(localize("HEROENGINE.Socket.QueueDrained", { count: queued.length }));
    }
  });
}

export function emit(msg: SocketMessage): void {
  game.socket.emit(SOCKET_NAME, msg);
}

/** Send to the GM, or queue with a notification when none is connected. */
export function emitToGM(msg: SocketMessage): boolean {
  if (activeGM()) {
    emit(msg);
    return true;
  }
  offlineQueue.push(msg);
  ui.notifications?.warn(localize("HEROENGINE.Socket.WaitingForGM"));
  return false;
}

/** Ask the GM a yes/no question from any client; resolves with the answer. */
export async function requestGmConfirm(question: string): Promise<boolean> {
  const { getCompat } = await import("../compat");
  if (game.user.isGM) {
    return getCompat().dialog.confirm({ title: localize("HEROENGINE.GMConfirm.Title"), content: question });
  }
  const replyId = foundry.utils.randomID();
  const delivered = emitToGM({ type: "gmConfirm", replyId, fromUserId: game.user.id, question });
  if (!delivered) return false; // queued for later; treat as unconfirmed now
  return new Promise((resolve) => {
    confirmResolvers.set(replyId, resolve);
    setTimeout(() => {
      if (confirmResolvers.delete(replyId)) resolve(false);
    }, 120_000);
  });
}

/** GM-side responder for gmConfirm requests. Registered once at ready. */
export function registerGmConfirmResponder(): void {
  onSocketMessage(async (msg) => {
    if (msg.type !== "gmConfirm" || !game.user.isGM || !isAuthoritativeClient()) return;
    const { getCompat } = await import("../compat");
    const answer = await getCompat().dialog.confirm({
      title: localize("HEROENGINE.GMConfirm.Title"),
      content: msg.question,
    });
    emit({ type: "gmConfirmReply", replyId: msg.replyId, targetUserId: msg.fromUserId, answer });
  });
}

/** Can this user operate the mechanic's player-facing controls? */
export function canOperate(actor: any): boolean {
  return game.user.isGM || actor.testUserPermission?.(game.user, "OWNER") === true;
}

export function requireGM(): boolean {
  if (!game.user.isGM) {
    ui.notifications?.warn(localize("HEROENGINE.Errors.GMOnly"));
    return false;
  }
  return true;
}
