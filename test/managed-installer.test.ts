import { afterEach, describe, expect, it } from "vitest";
import { managedActivityId, previewThargunnInstall, reconcileUltimateRuntimeActor, ultimateRageEffectSource, ultimateWeaponRangeUpdate } from "../src/managed/thargunn-installer";

function collection<T extends { id: string; name?: string }>(entries: T[]) {
  const value: any = entries;
  value.get = (id: string) => entries.find((entry) => entry.id === id);
  value.getName = (name: string) => entries.find((entry) => entry.name === name);
  return value;
}

describe("managed Thar’gunn installer preview", () => {
  afterEach(() => { delete (globalThis as any).game; });

  it("plans adoption without deleting untagged same-name content", async () => {
    const items = collection<any>([
      { id: "m2guptM3HxmWjIsH", uuid: "Actor.base.Item.weapon", name: "Nine Lives Stealer Halberd", type: "weapon", getFlag: () => undefined },
      { id: "sub-a", name: "Path of the Giant (GotG)", type: "subclass", system: { identifier: "giant" }, getFlag: () => undefined },
      { id: "sub-b", name: "Path of the Giant", type: "subclass", system: { identifier: "path-of-the-giant" }, getFlag: () => undefined },
    ]);
    const base: any = { id: "Owx9HA0KRtcB8xWe", uuid: "Actor.base", name: "Thar’gunn", items, getFlag: () => undefined };
    const ultimate: any = { id: "VJ2nFvMjvYiHIO7w", uuid: "Actor.ultimate", name: "Thar’gunn - Ultimate", items: collection([]), getFlag: () => undefined };
    const actors = collection<any>([base, ultimate]);
    (globalThis as any).game = { actors, macros: collection([]) };

    const report = await previewThargunnInstall();
    expect(report.warnings).toEqual([]);
    expect(report.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "thargunn.actor.base", action: "adopt" }),
      expect.objectContaining({ key: "thargunn.actor.skeldr", action: "create" }),
      expect.objectContaining({ key: "thargunn.item.weapon", action: "adopt" }),
      expect.objectContaining({ key: "thargunn.subclass.giant", action: "report" }),
    ]));
    expect(report.changes.some((change) => change.action === ("delete" as any))).toBe(false);
  });

  it("reports a missing source weapon without mutating anything", async () => {
    const base: any = { id: "Owx9HA0KRtcB8xWe", uuid: "Actor.base", name: "Thar’gunn", items: collection([]), getFlag: () => undefined };
    const ultimate: any = { id: "VJ2nFvMjvYiHIO7w", uuid: "Actor.ultimate", name: "Thar’gunn - Ultimate", items: collection([]), getFlag: () => undefined };
    (globalThis as any).game = { actors: collection<any>([base, ultimate]), macros: collection([]) };
    const report = await previewThargunnInstall();
    expect(report.warnings.join(" ")).toMatch(/source item is missing/i);
    expect(report.dryRun).toBe(true);
  });

  it("generates deterministic Foundry-compatible managed activity IDs", () => {
    const first = managedActivityId("thargunn.feature.field");
    expect(first).toHaveLength(16);
    expect(first).toMatch(/^[A-Za-z0-9]+$/);
    expect(managedActivityId("thargunn.feature.field")).toBe(first);
    expect(managedActivityId("thargunn.feature.siphon")).not.toBe(first);
  });

  it("carries Rage into the Ultimate form without consuming another use", () => {
    const source: any = ultimateRageEffectSource();
    expect(source.statuses).toContain("rage");
    expect(source.transfer).toBe(false);
    expect(source.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "system.bonuses.mwak.damage", value: "@scale.barbarian.rage-damage" }),
      expect.objectContaining({ key: "system.abilities.str.save.roll.mode", value: 1 }),
      expect.objectContaining({ key: "system.abilities.str.check.roll.mode", value: 1 }),
    ]));
    expect(source.flags["hero-engine"].managed.key).toBe("thargunn.effect.ultimate-rage");
  });

  it("writes Ultimate melee reach to the dnd5e reach field", () => {
    expect(ultimateWeaponRangeUpdate()).toEqual({
      "system.range.value": null,
      "system.range.long": null,
      "system.range.reach": 10,
      "system.range.units": "ft",
    });
  });

  it("repairs Rage and reach on an already-active dnd5e Ultimate actor", async () => {
    const weapon = { update: async (changes: Record<string, unknown>) => { (weapon as any).changes = changes; }, getFlag: (_scope: string, key: string) => key === "managed" ? { key: "thargunn.item.weapon" } : undefined };
    const created: any[] = [];
    const original = {
      id: "base",
      items: collection([]),
      getFlag: (scope: string, key: string) => scope === "hero-engine" && key === "attachments" ? { "thargunn-mythic": {} } : undefined,
    };
    const runtime = {
      items: collection<any>([weapon as any]), effects: collection([]),
      getFlag: (scope: string, key: string) => scope === "hero-engine" && key === "managed" ? { key: "thargunn.actor.ultimate" }
        : scope === "dnd5e" && key === "originalActor" ? "base" : undefined,
      createEmbeddedDocuments: async (_type: string, sources: any[]) => { created.push(...sources); },
    };
    (globalThis as any).game = { actors: { get: (id: string) => id === "base" ? original : null } };

    expect(await reconcileUltimateRuntimeActor(runtime)).toBe(true);
    expect((weapon as any).changes["system.range.reach"]).toBe(10);
    expect(created).toHaveLength(1);
    expect(created[0].statuses).toContain("rage");
  });
});
