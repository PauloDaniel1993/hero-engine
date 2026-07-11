import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MechanicContext, MechanicPlugin } from "../src/api/types";
import { ensureAttachmentReady, isJsonSafe, makeRecordAccessor, validateRecordData } from "../src/engine/records";
import { initialState, type Attachment } from "../src/engine/state";

function fixture(capacity = 2) {
  const plugin: MechanicPlugin = {
    id: "records-test", version: "1.0.0", archetype: "character", nameKey: "test",
    recordCollections: [{
      id: "echoes", labelKey: "test", schemaVersion: 1, capacity: "@slots",
      fields: [
        { key: "name", type: "string", labelKey: "test", required: true },
        { key: "tier", type: "number", labelKey: "test", min: 1, max: 5 },
        { key: "category", type: "choice", labelKey: "test", choices: ["action", "spell"] },
      ],
    }],
  };
  const flags: any = { mechanics: { [plugin.id]: initialState(plugin, { cfg: {} }) } };
  const stateDoc: any = {
    id: "actor", uuid: "Actor.actor",
    getFlag: (_scope: string, key: string) => key === "mechanics" ? flags.mechanics : undefined,
    setFlag: async (_scope: string, path: string, value: unknown) => {
      const [, pluginId] = path.split(".");
      flags.mechanics[pluginId!] = structuredClone(value);
    },
  };
  const actor: any = { id: "actor", uuid: "Actor.actor", testUserPermission: () => true };
  const att: Attachment = { actor, canonicalActor: actor, stateDoc, pluginId: plugin.id };
  let formulaCapacity = capacity;
  let ctx!: MechanicContext;
  ctx = {
    actor, canonicalActor: actor, pluginId: plugin.id,
    config: () => undefined as never,
    state: {} as any,
    records: {} as any,
    requestSecureTarget: async () => {},
    evalFormula: () => formulaCapacity,
    rollDice: async () => 0, openPrompt: async () => null, activateTransform: async () => {}, endTransform: async () => {},
    queueAdjudication: async () => {}, rollTable: async () => ({ roll: 1, textKey: "" }), postChat: async () => {},
    postCard: async () => {}, applyOps: async () => {}, fireTrigger: async () => {},
  };
  ctx.records = makeRecordAccessor(att, plugin, () => ctx);
  return { plugin, att, ctx, flags, setCapacity: (value: number) => { formulaCapacity = value; } };
}

describe("record collections", () => {
  beforeEach(() => {
    (globalThis as any).game = { user: { id: "owner", isGM: true } };
  });
  afterEach(() => { delete (globalThis as any).game; });

  it("rejects non-JSON and schema-invalid data", () => {
    expect(isJsonSafe({ ok: [1, "x", true, null] })).toBe(true);
    expect(isJsonSafe({ bad: Number.NaN })).toBe(false);
    const cycle: any = {}; cycle.self = cycle;
    expect(isJsonSafe(cycle)).toBe(false);
    const { plugin } = fixture();
    const def = plugin.recordCollections![0]!;
    expect(validateRecordData(def, { name: "Fireball", tier: 3, category: "spell" })).toEqual([]);
    expect(validateRecordData(def, { name: "Bad", tier: 9, category: "trait" })).toEqual(expect.arrayContaining([
      "tier is above 5", "category is not an allowed choice",
    ]));
  });

  it("preserves overflow, blocked slots, and atomically replaces a full collection", async () => {
    const { att, plugin, ctx, setCapacity } = fixture(2);
    await ensureAttachmentReady(att, plugin, () => ctx);
    const first = await ctx.records.create("echoes", { name: "Charge", tier: 2, category: "action" });
    await ctx.records.create("echoes", { name: "Storm", tier: 3, category: "spell" });
    await expect(ctx.records.create("echoes", { name: "Full", tier: 1, category: "action" })).rejects.toThrow(/full/);
    const pending = await ctx.records.create("echoes", { name: "Pending", tier: 4, category: "spell" }, { pendingWhenFull: true });
    let snapshot = ctx.records.list("echoes");
    expect(snapshot.pending).toHaveLength(1);
    const pendingId = snapshot.pending[0]!.id;
    const replacement = await ctx.records.replacePending("echoes", pendingId, first.id);
    expect(replacement.id).toBe(pending.id);
    expect(ctx.records.get("echoes", first.id)).toBeNull();
    expect(ctx.records.get("echoes", pending.id)?.data.name).toBe("Pending");

    setCapacity(1);
    snapshot = ctx.records.list("echoes");
    expect(snapshot.slots).toHaveLength(1);
    expect(snapshot.overflow).toHaveLength(1);
    expect(snapshot.overflow[0]?.record).not.toBeNull();
    await ctx.records.block("echoes", snapshot.slots[0]!.id, "fractured");
    expect(ctx.records.list("echoes").slots[0]?.blocked?.reason).toBe("fractured");
    await ctx.records.unblock("echoes", snapshot.slots[0]!.id);
    expect(ctx.records.list("echoes").slots[0]?.blocked).toBeNull();
  });

  it("settles duplicate creates once", async () => {
    const { ctx } = fixture(2);
    const data = { name: "Once", tier: 1, category: "action" } as const;
    const first = await ctx.records.create("echoes", data, { idempotencyKey: "event-1" });
    const second = await ctx.records.create("echoes", data, { idempotencyKey: "event-1" });
    expect(second.id).toBe(first.id);
    expect(ctx.records.list("echoes").slots.filter((slot) => slot.record)).toHaveLength(1);
  });

  it("enters read-only recovery for newer stored schemas", async () => {
    const { att, plugin, ctx, flags } = fixture(1);
    flags.mechanics[plugin.id].collections.echoes = { schemaVersion: 99, slots: [], pending: [] };
    await ensureAttachmentReady(att, plugin, () => ctx);
    expect(ctx.records.list("echoes").recovery).toMatch(/newer-schema/);
    await expect(ctx.records.create("echoes", { name: "No", tier: 1, category: "action" })).rejects.toThrow(/read-only/);
  });

  it("migrates records in order and rolls back to read-only recovery on failure", async () => {
    const ok = fixture(1);
    const record = await ok.ctx.records.create("echoes", { name: "Legacy", tier: 1, category: "action" });
    ok.plugin.recordCollections![0]!.schemaVersion = 2;
    ok.plugin.hooks = {
      migrateRecord: (_collectionId, current, from, to) => ({
        ...current, schemaVersion: to, data: { ...current.data, name: `${current.data.name}-${from}-${to}` },
      }),
    };
    await ensureAttachmentReady(ok.att, ok.plugin, () => ok.ctx);
    expect(ok.ctx.records.get("echoes", record.id)?.data.name).toBe("Legacy-1-2");

    const failed = fixture(1);
    await failed.ctx.records.create("echoes", { name: "Untouched", tier: 1, category: "action" });
    failed.plugin.recordCollections![0]!.schemaVersion = 2;
    failed.plugin.hooks = { migrateRecord: () => { throw new Error("broken migration"); } };
    await ensureAttachmentReady(failed.att, failed.plugin, () => failed.ctx);
    const snapshot = failed.ctx.records.list("echoes");
    expect(snapshot.recovery).toMatch(/migration-failed/);
    expect(snapshot.slots[0]?.record?.data.name).toBe("Untouched");
  });

  it("runs idempotent projection reconciliation after records are ready", async () => {
    const { att, plugin, ctx } = fixture(1);
    let reconciled = 0;
    plugin.hooks = { onRecordsReady: async (received) => { expect(received).toBe(ctx); reconciled += 1; } };
    await ensureAttachmentReady(att, plugin, () => ctx);
    expect(reconciled).toBe(1);
  });

  it("removes linked record Items from canonical and actor-swap projections", async () => {
    const { att, ctx } = fixture(1);
    const record = await ctx.records.create("echoes", { name: "Breath", tier: 1, category: "action" });
    const item = (id: string) => ({ id, getFlag: (_scope: string, key: string) => key === "managed" ? { recordId: record.id } : undefined });
    const deleted: string[] = [];
    const actor = (id: string) => ({
      id, items: [item(`${id}-item`)], testUserPermission: () => true,
      deleteEmbeddedDocuments: async (_type: string, ids: string[]) => { deleted.push(...ids); },
    });
    att.canonicalActor = actor("base");
    att.actor = actor("ultimate");

    await ctx.records.remove("echoes", record.id);
    expect(deleted).toEqual(["base-item", "ultimate-item"]);
    expect(ctx.records.get("echoes", record.id)).toBeNull();
  });
});
