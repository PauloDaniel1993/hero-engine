import type { RecordCollectionSnapshot } from "../api/types";

export interface RecordRenderRow {
  kind: "slot" | "pending";
  id: string;
  status: "empty" | "blocked" | "temporary" | "permanent" | "pending";
  overflow: boolean;
  missingLink: boolean;
}

/** Pure deterministic model used by the sheet renderer and UI fixtures. */
export function buildRecordRenderModel(snapshot: RecordCollectionSnapshot, linkedRecordIds?: ReadonlySet<string>): RecordRenderRow[] {
  const pending = snapshot.pending.map((entry) => ({ kind: "pending" as const, id: entry.id, status: "pending" as const, overflow: false, missingLink: linkedRecordIds ? !linkedRecordIds.has(entry.record.id) : false }));
  const slots = [...snapshot.slots, ...snapshot.overflow].map((slot, index) => ({
    kind: "slot" as const,
    id: slot.id,
    status: slot.blocked ? "blocked" as const : slot.record ? (slot.record.temporary ? "temporary" as const : "permanent" as const) : "empty" as const,
    overflow: index >= snapshot.slots.length,
    missingLink: !!slot.record && linkedRecordIds ? !linkedRecordIds.has(slot.record.id) : false,
  }));
  return [...pending, ...slots];
}
