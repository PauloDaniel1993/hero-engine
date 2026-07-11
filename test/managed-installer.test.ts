import { afterEach, describe, expect, it } from "vitest";
import { previewThargunnInstall } from "../src/managed/thargunn-installer";

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
});
