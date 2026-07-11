import type { Attachment } from "./state";

export const MECHANIC_SETTLED_HOOK = "heroEngine.mechanicSettled";

export interface MechanicSettlement {
  actorIds: string[];
  pluginId: string;
  kind: "action" | "record-action";
  id: string;
}

export function mechanicSettlement(att: Attachment, kind: MechanicSettlement["kind"], id: string): MechanicSettlement {
  return {
    actorIds: [...new Set([att.actor?.id, att.canonicalActor?.id, att.stateDoc?.actor?.id, att.stateDoc?.id].filter((value): value is string => typeof value === "string" && value.length > 0))],
    pluginId: att.pluginId,
    kind,
    id,
  };
}

export function notifyMechanicSettled(att: Attachment, kind: MechanicSettlement["kind"], id: string): void {
  Hooks.callAll(MECHANIC_SETTLED_HOOK, mechanicSettlement(att, kind, id));
}
