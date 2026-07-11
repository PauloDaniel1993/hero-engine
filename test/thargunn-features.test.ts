import { describe, expect, it } from "vitest";
import { eligibleFeatures } from "../src/plugins/thargunn";

describe("Thar’gunn eligible feature extraction", () => {
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
});
