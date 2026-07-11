import { afterEach, describe, expect, it } from "vitest";
import { echoProjectionActor, eligibleFeatures, isRaging, reconcileEchoProjections, ultimateAccessCancelled } from "../src/plugins/thargunn";

describe("Thar’gunn eligible feature extraction", () => {
  afterEach(() => {
    delete (globalThis as any).game;
    delete (globalThis as any).foundry;
  });

  it("normalizes items, activities, spells, class features, and actor traits", () => {
    const target = {
      items: [
        { id: "spell", name: "Meteor Swarm", type: "spell", system: { level: 9, description: { value: "<p>Fire from heaven</p>" }, activities: {} } },
        { id: "class", name: "Divine Spark", type: "class", system: { description: { value: "Class power" }, activities: {} } },
        { id: "multi", name: "Multiattack", type: "feat", system: { description: { value: "Three attacks" }, activities: { a1: { _id: "a1", type: "attack", name: "Multiattack" } } } },
        { id: "lair", name: "Lair Action: Collapse", type: "feat", system: { description: { value: "Collapse" }, activities: {} } },
      ],
      system: {
        resources: { legact: { max: 3 }, legres: { max: 3 } },
        traits: { dr: { value: new Set(["fire", "cold"]) } },
        attributes: { senses: { darkvision: 120, blindsight: 30 }, spellcasting: "cha" },
      },
    };
    const features = eligibleFeatures(target);
    expect(features.map((feature) => feature.category)).toEqual(expect.arrayContaining([
      "spell", "class-feature", "multiattack", "lair-action", "legendary-resistance", "resistance", "sense",
    ]));
    expect(features.find((feature) => feature.opaqueId === "item:spell")).toMatchObject({ label: "Meteor Swarm", spellLevel: 9, description: " Fire from heaven " });
    expect(features.every((feature) => feature.opaqueId.length > 0 && feature.label.length > 0)).toBe(true);
  });

  it("caps hostile documents to a bounded picker", () => {
    const target = { items: Array.from({ length: 120 }, (_, index) => ({ id: `f${index}`, name: `Feature ${index}`, type: "feat", system: { description: { value: "x" }, activities: {} } })), system: { resources: {}, traits: {}, attributes: {} } };
    expect(eligibleFeatures(target)).toHaveLength(80);
  });

  it("recognizes dnd5e actor effects and recent DDB Rage activity cards", () => {
    const actor: any = { id: "base", statuses: new Set(), effects: [], items: [{ id: "rage-item", name: "Rage", system: { identifier: "rage", uses: { spent: 1 } } }] };
    (globalThis as any).game = { time: { worldTime: 100 }, messages: { contents: [{ timestamp: 9_900, speaker: { actor: "base" }, flags: { dnd5e: { item: { id: "rage-item" } } } }] } };
    expect(isRaging(actor, undefined, 10_000)).toBe(true);
    (globalThis as any).game.messages.contents = [];
    actor.effects = [{ name: "Raging", disabled: false, isSuppressed: false, statuses: new Set() }];
    expect(isRaging(actor, undefined, 10_000)).toBe(true);
  });

  it("rejects stale Rage cards and accepts the bounded Hero Engine use anchor", () => {
    const actor: any = { id: "base", statuses: new Set(), effects: [], items: [{ id: "rage-item", system: { identifier: "rage", uses: { spent: 1 } } }] };
    (globalThis as any).game = { time: { worldTime: 500 }, messages: { contents: [{ timestamp: 1, speaker: { actor: "base" }, flags: { dnd5e: { item: { id: "rage-item" } } } }] } };
    expect(isRaging(actor, undefined, 3_700_002)).toBe(false);
    const ctx: any = { state: { getFlag: (key: string) => key === "rageExpiresAtWorldTime" ? 501 : 0 } };
    expect(isRaging(actor, ctx, 3_700_002)).toBe(true);
  });

  it("treats closing or canceling the Ultimate access prompt as an abort", () => {
    expect(ultimateAccessCancelled(null)).toBe(true);
    expect(ultimateAccessCancelled({ promptId: "ultimate-access", dismissed: true })).toBe(true);
    expect(ultimateAccessCancelled({ promptId: "ultimate-access", success: false })).toBe(false);
    expect(ultimateAccessCancelled({ promptId: "ultimate-access", success: true })).toBe(false);
  });

  it("repairs Echo Items on canonical Thar’gunn and removes Ultimate-form copies", async () => {
    const record: any = {
      id: "echo-record-1", schemaVersion: 1, createdAt: 1, createdBy: "gm", temporary: true,
      data: { name: "Sleep Breath", category: "trait", tier: "minor", cost: 1, soulDamage: "2d10", description: "Sleep cone" },
    };
    const document = (source: any, id: string) => ({
      ...source, id,
      getFlag: (scope: string, key: string) => source.flags?.[scope]?.[key],
    });
    let created = 0;
    const canonical: any = {
      id: "base", items: [], testUserPermission: () => true,
      createEmbeddedDocuments: async (_type: string, sources: any[]) => {
        created += sources.length;
        canonical.items.push(...sources.map((source, index) => document(source, `created-${index}`)));
      },
    };
    const legacy = document({ flags: { "hero-engine": { managed: { key: "thargunn.item.echo", recordId: record.id } } } }, "legacy");
    const orphan = document({ flags: { "hero-engine": { managed: { key: "thargunn.item.echo", recordId: "expired-record" } } } }, "orphan");
    const runtime: any = {
      id: "ultimate", items: [legacy, orphan], testUserPermission: () => true,
      deleteEmbeddedDocuments: async (_type: string, ids: string[]) => { runtime.items = runtime.items.filter((item: any) => !ids.includes(item.id)); },
    };
    (globalThis as any).game = { user: { isGM: true }, i18n: { localize: (key: string) => key } };
    (globalThis as any).foundry = { utils: { randomID: () => "EchoActivity0001" } };
    const empty = { id: "temporary-echoes", schemaVersion: 1, capacity: 0, slots: [], pending: [], overflow: [] };
    const ctx: any = {
      actor: runtime, canonicalActor: canonical,
      records: { list: (id: string) => id === "echoes" ? { ...empty, id, capacity: 1, slots: [{ id: "slot-1", record }] } : empty },
    };

    expect(echoProjectionActor(ctx)).toBe(canonical);
    await reconcileEchoProjections(ctx);
    expect(canonical.items).toHaveLength(1);
    expect(canonical.items[0].getFlag("hero-engine", "managed").recordId).toBe(record.id);
    expect(runtime.items).toHaveLength(0);

    await reconcileEchoProjections(ctx);
    expect(created).toBe(1);
    expect(canonical.items).toHaveLength(1);
  });
});
