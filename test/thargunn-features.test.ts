import { afterEach, describe, expect, it } from "vitest";
import { eligibleFeatures, isRaging, ultimateAccessCancelled } from "../src/plugins/thargunn";

describe("Thar’gunn eligible feature extraction", () => {
  afterEach(() => { delete (globalThis as any).game; });

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
});
