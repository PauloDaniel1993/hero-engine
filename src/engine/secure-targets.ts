import type { SecureTargetRequest } from "../api/types";
import { MODULE_ID } from "../constants";
import { getPlugin } from "./registry";
import { makeContext } from "./runtime";
import { activeGM } from "./sockets";
import { canonicalActor, resolveAttachment } from "./state";

let registered = false;

/** Trusted GM boundary for owner-originated target workflows. */
export function initSecureTargetRequests(): void {
  if (registered) return;
  registered = true;
  Hooks.on("updateActor", async (updatedActor: any, changes: any, _options: any, userId: string) => {
    if (!game.user?.isGM || activeGM()?.id !== game.user.id) return;
    const requests = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.secureRequests`) as Record<string, SecureTargetRequest & { pluginId?: string }> | undefined;
    if (!requests || typeof requests !== "object") return;
    const actor = canonicalActor(updatedActor);
    const trustedUser = game.users?.get?.(userId);
    if (!trustedUser || !actor.testUserPermission?.(trustedUser, "OWNER")) {
      console.warn("hero-engine | rejected secure target request from non-owner", { actor: actor.uuid, userId });
      return;
    }
    for (const [requestId, request] of Object.entries(requests)) {
      try {
        if (!request.pluginId || !request.eventId || !request.targetUuid) throw new Error("malformed request");
        if (Date.now() - Number(request.createdAt ?? 0) > 30_000) throw new Error("expired request");
        const att = resolveAttachment(actor, request.pluginId);
        const plugin = att ? getPlugin(att.pluginId) : null;
        const ctx = att ? makeContext(att) : null;
        if (!att || !plugin || !ctx || !plugin.hooks?.onSecureTargetRequest) throw new Error("unsupported request");
        if (request.weaponUuid) {
          const weapon = actor.items?.find((item: any) => item.uuid === request.weaponUuid);
          if (!weapon || weapon.getFlag?.(MODULE_ID, "managed")?.key !== "thargunn.item.weapon") throw new Error("wrong weapon");
        }
        const targetDoc = await (globalThis as any).fromUuid?.(request.targetUuid);
        const target = targetDoc?.actor ?? targetDoc;
        if (!target || target.documentName !== "Actor") throw new Error("target is unavailable");
        await plugin.hooks.onSecureTargetRequest(ctx, request, target, userId);
      } catch (error) {
        console.warn("hero-engine | secure target request rejected", requestId, error);
      } finally {
        await actor.unsetFlag(MODULE_ID, `secureRequests.${requestId}`);
      }
    }
  });
}
