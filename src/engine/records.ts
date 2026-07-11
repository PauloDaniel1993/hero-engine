import type {
  JsonValue,
  MechanicContext,
  MechanicPlugin,
  MechanicRecord,
  RecordAccessor,
  RecordCollectionDef,
  RecordCollectionSnapshot,
  RecordCreateOptions,
  RecordSlot,
} from "../api/types";
import { canOperate } from "./sockets";
import { appendAudit, mutateState, readState, type Attachment, type InstanceState } from "./state";

export function isJsonSafe(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonSafe(entry, seen))
    : Object.getPrototypeOf(value) === Object.prototype && Object.values(value as Record<string, unknown>).every((entry) => isJsonSafe(entry, seen));
  seen.delete(value as object);
  return valid;
}

function collectionDef(plugin: MechanicPlugin, collectionId: string): RecordCollectionDef {
  const def = plugin.recordCollections?.find((entry) => entry.id === collectionId);
  if (!def) throw new Error(`hero-engine: unknown record collection "${collectionId}"`);
  return def;
}

export function validateRecordData(def: RecordCollectionDef, data: Record<string, JsonValue>): string[] {
  if (!isJsonSafe(data)) return ["record data must be finite, acyclic JSON"];
  const errors: string[] = [];
  const fields = new Map(def.fields.map((field) => [field.key, field]));
  for (const key of Object.keys(data)) if (!fields.has(key)) errors.push(`unknown field "${key}"`);
  for (const field of def.fields) {
    const value = data[field.key];
    if (value === undefined) {
      if (field.required) errors.push(`${field.key} is required`);
      continue;
    }
    const expectedType = field.type === "choice" ? "string" : field.type;
    if (field.type !== "json" && typeof value !== expectedType) errors.push(`${field.key} must be ${expectedType}`);
    if (field.type === "choice" && (typeof value !== "string" || !field.choices?.includes(value))) errors.push(`${field.key} is not an allowed choice`);
    if (field.type === "number" && typeof value === "number") {
      if (field.min !== undefined && value < field.min) errors.push(`${field.key} is below ${field.min}`);
      if (field.max !== undefined && value > field.max) errors.push(`${field.key} is above ${field.max}`);
    }
  }
  return errors;
}

function randomId(): string {
  return (globalThis as any).foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 16) ?? `${Date.now()}${Math.random()}`.replace(/\D/g, "").slice(0, 16);
}

function capacity(def: RecordCollectionDef, ctx: MechanicContext): number {
  const value = typeof def.capacity === "number" ? def.capacity : ctx.evalFormula(def.capacity);
  return Math.max(0, Math.floor(value));
}

function ensureSlots(state: InstanceState, def: RecordCollectionDef, wanted: number): { slots: RecordSlot[]; pending: any[]; schemaVersion: number; recovery?: string } {
  const stored = state.collections[def.id] ?? { schemaVersion: def.schemaVersion, slots: [], pending: [] };
  state.collections[def.id] = stored;
  const existing = new Set(stored.slots.map((slot) => slot.id));
  for (let index = stored.slots.length; index < wanted; index += 1) {
    let id = `${def.id}-${index + 1}`;
    while (existing.has(id)) id = `${def.id}-${randomId()}`;
    existing.add(id);
    stored.slots.push({ id, record: null, blocked: null });
  }
  return stored;
}

function snapshotFrom(state: InstanceState, def: RecordCollectionDef, ctx: MechanicContext): RecordCollectionSnapshot {
  const wanted = capacity(def, ctx);
  const stored = ensureSlots(state, def, wanted);
  return {
    id: def.id,
    schemaVersion: stored.schemaVersion,
    capacity: wanted,
    slots: stored.slots.slice(0, wanted),
    overflow: stored.slots.slice(wanted),
    pending: [...stored.pending],
    recovery: stored.recovery,
  };
}

function requireWritable(att: Attachment, def: RecordCollectionDef, state: InstanceState): void {
  if (!canOperate(att.canonicalActor)) throw new Error("hero-engine: record operation requires actor ownership");
  const stored = state.collections[def.id];
  if (stored?.recovery) throw new Error(`hero-engine: collection is read-only (${stored.recovery})`);
  if (stored && stored.schemaVersion > def.schemaVersion) throw new Error("hero-engine: stored collection schema is newer than this module");
}

function findRecordSlot(state: InstanceState, collectionId: string, recordId: string): RecordSlot | null {
  return state.collections[collectionId]?.slots.find((slot) => slot.record?.id === recordId) ?? null;
}

export async function ensureAttachmentReady(att: Attachment, plugin: MechanicPlugin, getContext: () => MechanicContext): Promise<void> {
  if (!plugin.recordCollections?.length) return;
  await mutateState(att.stateDoc, plugin.id, (state) => {
    for (const def of plugin.recordCollections ?? []) {
      const stored = ensureSlots(state, def, capacity(def, getContext()));
      if (stored.schemaVersion > def.schemaVersion) {
        stored.recovery = `newer-schema:${stored.schemaVersion}`;
        continue;
      }
      const backup = structuredClone(stored);
      try {
        while (stored.schemaVersion < def.schemaVersion) {
          const from = stored.schemaVersion;
          const to = from + 1;
          if (!plugin.hooks?.migrateRecord) throw new Error(`missing migration ${from}->${to}`);
          for (const slot of stored.slots) {
            if (slot.record) slot.record = plugin.hooks.migrateRecord(def.id, slot.record, from, to);
          }
          for (const pending of stored.pending) pending.record = plugin.hooks.migrateRecord(def.id, pending.record, from, to);
          stored.schemaVersion = to;
        }
        delete stored.recovery;
      } catch (error) {
        state.collections[def.id] = { ...backup, recovery: `migration-failed:${error instanceof Error ? error.message : String(error)}` };
      }
    }
  });
  await reconcileRecordLifecycles(att, plugin, getContext);
}

function lifecycleExpired(record: MechanicRecord, transformActivationId?: string): boolean {
  const lifecycle = record.lifecycle;
  if (!lifecycle || lifecycle.type === "permanent" || lifecycle.type === "manual") return false;
  if (lifecycle.type === "world-time") return lifecycle.worldTime !== undefined && Number(game.time?.worldTime ?? 0) >= lifecycle.worldTime;
  if (lifecycle.type === "transform") return !transformActivationId || lifecycle.transformActivationId !== transformActivationId;
  if (lifecycle.type === "combat-time") {
    const combat = game.combat;
    if (!combat || combat.uuid !== lifecycle.combatUuid) return true;
    const current = Number(combat.round ?? 0) * 1000 + Number(combat.turn ?? 0);
    const expiry = Number(lifecycle.round ?? 0) * 1000 + Number(lifecycle.turn ?? 0);
    return current >= expiry;
  }
  return false;
}

async function removeSuppression(recordId: string): Promise<void> {
  if (!game.user?.isGM) return;
  for (const actor of game.actors ?? []) {
    const ids = actor.effects?.filter?.((effect: any) => effect.getFlag?.("hero-engine", "suppressionId") === recordId).map((effect: any) => effect.id) ?? [];
    if (ids.length) await actor.deleteEmbeddedDocuments?.("ActiveEffect", ids);
  }
}

async function removeLinkedRecordItems(att: Attachment, recordId: string): Promise<void> {
  const actor = att.canonicalActor as any;
  const ids = actor.items?.filter?.((item: any) => item.getFlag?.("hero-engine", "managed")?.recordId === recordId).map((item: any) => item.id) ?? [];
  if (ids.length && (game.user?.isGM || actor.testUserPermission?.(game.user, "OWNER"))) {
    await actor.deleteEmbeddedDocuments?.("Item", ids);
  }
}

export async function reconcileRecordLifecycles(att: Attachment, plugin: MechanicPlugin, getContext: () => MechanicContext): Promise<string[]> {
  if (!plugin.recordCollections?.length) return [];
  const expired: string[] = [];
  await mutateState(att.stateDoc, plugin.id, (state) => {
    const activationId = state.transform?.activationId;
    for (const def of plugin.recordCollections ?? []) {
      const stored = ensureSlots(state, def, capacity(def, getContext()));
      for (const slot of stored.slots) {
        if (slot.record && lifecycleExpired(slot.record, activationId)) {
          expired.push(slot.record.id);
          appendAudit(state, `record ${def.id}/${slot.record.id} expired`);
          slot.record = null;
        }
      }
      stored.pending = stored.pending.filter((pending) => {
        const remove = (pending.expiresAt !== undefined && Date.now() >= pending.expiresAt) || lifecycleExpired(pending.record, activationId);
        if (remove) expired.push(pending.record.id);
        return !remove;
      });
    }
  });
  for (const id of expired) {
    await removeSuppression(id);
    await removeLinkedRecordItems(att, id);
  }
  return expired;
}

/** Convert a temporary record to a permanent slot when its suppressed source dies. */
export async function convertTemporaryRecord(recordId: string): Promise<boolean> {
  if (!game.user?.isGM) return false;
  for (const actor of game.actors ?? []) {
    for (const att of (await import("./state")).resolveAttachments(actor)) {
      const plugin = (await import("./registry")).getPlugin(att.pluginId);
      const ctx = plugin ? (await import("./runtime")).makeContext(att) : null;
      if (!plugin || !ctx || !plugin.recordCollections?.some((def) => def.id === "temporary-echoes") || !plugin.recordCollections.some((def) => def.id === "echoes")) continue;
      const record = ctx.records.get("temporary-echoes", recordId);
      if (!record) continue;
      await ctx.records.create("echoes", record.data, { temporary: false, pendingWhenFull: true, lifecycle: { type: "permanent" }, idempotencyKey: `death-convert:${recordId}` });
      await ctx.records.remove("temporary-echoes", recordId, `death-remove:${recordId}`);
      await removeSuppression(recordId);
      return true;
    }
  }
  return false;
}

export function makeRecordAccessor(att: Attachment, plugin: MechanicPlugin, getContext: () => MechanicContext): RecordAccessor {
  const snapshot = (collectionId: string) => {
    const def = collectionDef(plugin, collectionId);
    const state = readState(att.stateDoc, plugin.id);
    if (!state) throw new Error(`hero-engine: missing state for ${plugin.id}`);
    return snapshotFrom(state, def, getContext());
  };
  return {
    list: snapshot,
    get(collectionId, recordId) {
      const current = snapshot(collectionId);
      return [...current.slots, ...current.overflow].find((slot) => slot.record?.id === recordId)?.record ?? current.pending.find((pending) => pending.record.id === recordId)?.record ?? null;
    },
    async create(collectionId, data, options: RecordCreateOptions = {}) {
      const def = collectionDef(plugin, collectionId);
      const errors = validateRecordData(def, data);
      if (errors.length) throw new Error(`hero-engine: invalid record: ${errors.join("; ")}`);
      const record: MechanicRecord = {
        id: randomId(), schemaVersion: def.schemaVersion, createdAt: Date.now(), createdBy: game.user?.id ?? "system",
        data: structuredClone(data), temporary: options.temporary, lifecycle: options.lifecycle,
      };
      const result = await mutateState(att.stateDoc, plugin.id, (state) => {
        requireWritable(att, def, state);
        const current = snapshotFrom(state, def, getContext());
        const slot = current.slots.find((candidate) => !candidate.blocked && !candidate.record);
        if (slot) slot.record = record;
        else if (options.pendingWhenFull) state.collections[def.id]!.pending.push({ id: randomId(), record, createdAt: Date.now() });
        else throw new Error("hero-engine: record collection is full");
        appendAudit(state, `record ${def.id}/${record.id} created`);
        return record;
      }, { idempotencyKey: options.idempotencyKey });
      if (!result.applied) {
        const existing = this.list(collectionId);
        const duplicate = [...existing.slots, ...existing.overflow].map((slot) => slot.record).find((entry) => entry?.data && JSON.stringify(entry.data) === JSON.stringify(data));
        if (duplicate) return duplicate;
        throw new Error("hero-engine: duplicate record operation already settled");
      }
      return result.value!;
    },
    async update(collectionId, recordId, patch, idempotencyKey) {
      const def = collectionDef(plugin, collectionId);
      const result = await mutateState(att.stateDoc, plugin.id, (state) => {
        requireWritable(att, def, state);
        const slot = findRecordSlot(state, collectionId, recordId);
        if (!slot?.record) throw new Error("hero-engine: record not found");
        const next = { ...slot.record.data, ...structuredClone(patch) };
        const errors = validateRecordData(def, next);
        if (errors.length) throw new Error(`hero-engine: invalid record: ${errors.join("; ")}`);
        slot.record.data = next;
        appendAudit(state, `record ${def.id}/${recordId} updated`);
        return slot.record;
      }, { idempotencyKey });
      if (!result.value) throw new Error("hero-engine: duplicate record update");
      return result.value;
    },
    async remove(collectionId, recordId, idempotencyKey) {
      const def = collectionDef(plugin, collectionId);
      await mutateState(att.stateDoc, plugin.id, (state) => {
        requireWritable(att, def, state);
        const slot = findRecordSlot(state, collectionId, recordId);
        if (!slot?.record) return;
        slot.record = null;
        appendAudit(state, `record ${def.id}/${recordId} removed`);
      }, { idempotencyKey });
      await removeSuppression(recordId);
      await removeLinkedRecordItems(att, recordId);
    },
    async block(collectionId, slotId, reason) {
      if (!game.user?.isGM) throw new Error("hero-engine: only the GM can block a record slot");
      const def = collectionDef(plugin, collectionId);
      await mutateState(att.stateDoc, plugin.id, (state) => {
        const current = snapshotFrom(state, def, getContext());
        const slot = [...current.slots, ...current.overflow].find((candidate) => candidate.id === slotId);
        if (!slot) throw new Error("hero-engine: slot not found");
        slot.blocked = { reason, at: Date.now(), by: game.user.id };
        appendAudit(state, `record slot ${def.id}/${slotId} blocked`);
      });
    },
    async unblock(collectionId, slotId) {
      if (!game.user?.isGM) throw new Error("hero-engine: only the GM can unblock a record slot");
      const def = collectionDef(plugin, collectionId);
      await mutateState(att.stateDoc, plugin.id, (state) => {
        const current = snapshotFrom(state, def, getContext());
        const slot = [...current.slots, ...current.overflow].find((candidate) => candidate.id === slotId);
        if (!slot) throw new Error("hero-engine: slot not found");
        slot.blocked = null;
        appendAudit(state, `record slot ${def.id}/${slotId} unblocked`);
      });
    },
    async expire(collectionId, recordId) { await this.remove(collectionId, recordId, `expire:${collectionId}:${recordId}`); },
    async replacePending(collectionId, pendingId, eraseRecordId) {
      const def = collectionDef(plugin, collectionId);
      const before = this.list(collectionId);
      const pendingRecord = before.pending.find((entry) => entry.id === pendingId)?.record;
      const erasedRecord = this.get(collectionId, eraseRecordId);
      if (!pendingRecord || !erasedRecord) throw new Error("hero-engine: pending replacement is no longer valid");
      if (plugin.hooks?.onRecordReplacement) await plugin.hooks.onRecordReplacement(getContext(), def, pendingRecord, erasedRecord);
      let erasedRecordId: string | undefined;
      const result = await mutateState(att.stateDoc, plugin.id, (state) => {
        requireWritable(att, def, state);
        const stored = state.collections[def.id];
        const pendingIndex = stored?.pending.findIndex((entry) => entry.id === pendingId) ?? -1;
        const erased = findRecordSlot(state, collectionId, eraseRecordId);
        if (!stored || pendingIndex < 0 || !erased?.record) throw new Error("hero-engine: pending replacement is no longer valid");
        erasedRecordId = erased.record.id;
        const [pending] = stored.pending.splice(pendingIndex, 1);
        const record = pending!.record;
        erased.record = record;
        appendAudit(state, `record ${def.id}/${eraseRecordId} replaced by ${record.id}`);
        return record;
      }, { idempotencyKey: `replace:${collectionId}:${pendingId}` });
      if (!result.value) throw new Error("hero-engine: pending replacement already settled");
      if (erasedRecordId) {
        await removeSuppression(erasedRecordId);
        await removeLinkedRecordItems(att, erasedRecordId);
      }
      return result.value;
    },
    async cancelPending(collectionId, pendingId) {
      const def = collectionDef(plugin, collectionId);
      let cancelledRecordId: string | undefined;
      await mutateState(att.stateDoc, plugin.id, (state) => {
        requireWritable(att, def, state);
        const stored = state.collections[def.id];
        const index = stored?.pending.findIndex((entry) => entry.id === pendingId) ?? -1;
        if (stored && index >= 0) cancelledRecordId = stored.pending.splice(index, 1)[0]?.record.id;
      }, { idempotencyKey: `cancel:${collectionId}:${pendingId}` });
      if (cancelledRecordId) {
        await removeSuppression(cancelledRecordId);
        await removeLinkedRecordItems(att, cancelledRecordId);
      }
    },
    async runAction(collectionId, recordId, actionId) {
      const def = collectionDef(plugin, collectionId);
      const action = def.actions?.find((candidate) => candidate.id === actionId);
      const record = this.get(collectionId, recordId);
      if (!action || !record) throw new Error("hero-engine: record action not found");
      if (action.gmOnly && !game.user?.isGM) throw new Error("hero-engine: record action is GM-only");
      if (action.ownerOnly && !canOperate(att.canonicalActor)) throw new Error("hero-engine: record action requires ownership");
      await plugin.hooks?.onRecordAction?.(getContext(), def, record, action);
    },
  };
}
