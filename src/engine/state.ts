/**
 * State layer: mechanic instance state persisted in module-scoped flags.
 * - character archetype: state lives on the Actor.
 * - item archetype: state lives on the bound Item, so it follows the weapon
 *   when it changes hands; the Actor keeps a lightweight attachment pointer.
 * State is inert without the module and travels with actor/item exports.
 */
import type { MechanicPlugin } from "../api/types";
import { AUDIT_CAP, FLAGS, MODULE_ID } from "../constants";
import { resolveNumeric } from "./formulas";
import { clampValue } from "./trackers";

export interface AuditEntry {
  at: number; // real-world epoch ms
  user: string;
  message: string;
}

export interface TransformState {
  id: string;
  strategy: "overlay" | "actor-swap";
  roundsLeft: number;
  /** Overlay bookkeeping for full revert. */
  effectIds?: string[];
  itemIds?: string[];
}

export interface InstanceState {
  values: Record<string, number>; // trackers + resources by id
  flags: Record<string, unknown>; // named state flags
  stances: Record<string, string | null>; // groupId -> active stance id
  transform: TransformState | null;
  cooldowns: Record<string, number>; // actionId -> last-used worldTime seconds
  ultimateAttempted?: boolean;
  audit: AuditEntry[];
}

export interface Attachment {
  actor: any;
  /** The document holding state: bound item for item archetype, else the actor. */
  stateDoc: any;
  item?: any;
  pluginId: string;
}

function emptyState(): InstanceState {
  return { values: {}, flags: {}, stances: {}, transform: null, cooldowns: {}, audit: [] };
}

export function readState(stateDoc: any, pluginId: string): InstanceState | null {
  const all = stateDoc.getFlag(MODULE_ID, FLAGS.mechanics) as Record<string, InstanceState> | undefined;
  return all?.[pluginId] ? { ...emptyState(), ...all[pluginId] } : null;
}

export async function writeState(stateDoc: any, pluginId: string, state: InstanceState): Promise<void> {
  await stateDoc.setFlag(MODULE_ID, `${FLAGS.mechanics}.${pluginId}`, state);
}

export async function clearState(stateDoc: any, pluginId: string): Promise<void> {
  await stateDoc.unsetFlag(MODULE_ID, `${FLAGS.mechanics}.${pluginId}`);
}

export function readOverrides(stateDoc: any, pluginId: string): Record<string, unknown> {
  const all = stateDoc.getFlag(MODULE_ID, FLAGS.overrides) as Record<string, Record<string, unknown>> | undefined;
  return all?.[pluginId] ?? {};
}

export async function writeOverrides(
  stateDoc: any,
  pluginId: string,
  overrides: Record<string, unknown>
): Promise<void> {
  // Replace wholesale so deleted keys actually clear (Foundry merges by default).
  const all = {
    ...((stateDoc.getFlag(MODULE_ID, FLAGS.overrides) as Record<string, unknown>) ?? {}),
    [pluginId]: overrides,
  };
  await stateDoc.unsetFlag(MODULE_ID, FLAGS.overrides);
  await stateDoc.setFlag(MODULE_ID, FLAGS.overrides, all);
}

export function appendAudit(state: InstanceState, message: string): void {
  state.audit.push({ at: Date.now(), user: game.user?.name ?? "system", message });
  if (state.audit.length > AUDIT_CAP) state.audit.splice(0, state.audit.length - AUDIT_CAP);
}

/** Initialize state for a fresh attachment from the plugin's declared initials. */
export function initialState(plugin: MechanicPlugin, evalData: Record<string, unknown>): InstanceState {
  const state = emptyState();
  for (const t of plugin.trackers ?? []) {
    const min = t.min !== undefined ? resolveNumeric(t.min, evalData) : 0;
    state.values[t.id] = t.initial !== undefined ? resolveNumeric(t.initial, evalData) : min;
  }
  for (const r of plugin.resources ?? []) {
    state.values[r.id] = r.initial !== undefined ? resolveNumeric(r.initial, evalData) : 0;
  }
  for (const g of plugin.stances ?? []) {
    state.stances[g.id] = null;
  }
  appendAudit(state, "attached");
  return state;
}

/** Attachment registry on the actor. */
export function actorAttachments(actor: any): Record<string, { itemUuid?: string }> {
  return (actor.getFlag(MODULE_ID, FLAGS.attachments) as Record<string, { itemUuid?: string }>) ?? {};
}

export async function setActorAttachment(
  actor: any,
  pluginId: string,
  info: { itemUuid?: string } | null
): Promise<void> {
  if (info === null) {
    await actor.unsetFlag(MODULE_ID, `${FLAGS.attachments}.${pluginId}`);
  } else {
    await actor.setFlag(MODULE_ID, `${FLAGS.attachments}.${pluginId}`, info);
  }
}

/** Resolve all live attachments for an actor (item pointers resolved). */
export function resolveAttachments(actor: any): Attachment[] {
  const out: Attachment[] = [];
  for (const [pluginId, info] of Object.entries(actorAttachments(actor))) {
    if (info.itemUuid) {
      const item = actor.items?.find((i: any) => i.uuid === info.itemUuid || i.getFlag?.(MODULE_ID, "boundPlugin") === pluginId);
      if (item) out.push({ actor, stateDoc: item, item, pluginId });
      // Item gone (weapon handed off): attachment is dormant on this actor.
    } else {
      out.push({ actor, stateDoc: actor, pluginId });
    }
  }
  return out;
}

export function resolveAttachment(actor: any, pluginId: string): Attachment | null {
  return resolveAttachments(actor).find((a) => a.pluginId === pluginId) ?? null;
}
