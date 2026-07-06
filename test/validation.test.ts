import { describe, expect, it } from "vitest";
import type { MechanicPlugin } from "../src/api/types";
import { validatePlugin } from "../src/engine/validation";

function minimal(overrides: Partial<MechanicPlugin> = {}): MechanicPlugin {
  return {
    id: "test-mechanic",
    version: "1.0.0",
    archetype: "character",
    nameKey: "TEST.name",
    ...overrides,
  };
}

describe("validatePlugin", () => {
  it("accepts a minimal valid plugin", () => {
    expect(validatePlugin(minimal())).toEqual([]);
  });

  it("accepts a plugin exercising every declarative primitive", () => {
    const plugin = minimal({
      trackers: [
        {
          id: "pi",
          labelKey: "x",
          min: 0,
          max: 50,
          thresholds: [
            { at: 10, labelKey: "x" },
            { at: 20, labelKey: "x" },
          ],
        },
      ],
      resources: [
        {
          id: "charges",
          labelKey: "x",
          max: "3 + @bookLevel",
          recharge: [{ on: "longRest", amount: "full", conditionKey: "x", fallbackAmount: "2d8 + 4" }],
        },
      ],
      derived: [{ id: "bookLevel", formula: "clamp(1 + floor(@pi / 10), 1, 5)" }],
      prompts: [
        {
          id: "berserk-save",
          titleKey: "x",
          save: {
            abilities: ["wis", "cha"],
            dcFormula: "12 + @pi",
            onFailure: { apply: [{ op: "set", target: "flag:berserk", value: true }] },
          },
        },
      ],
      triggers: [
        { id: "on-crit", labelKey: "x", event: "crit-received", prompt: "berserk-save" },
        { id: "gain", labelKey: "x", event: "attack-hit", apply: [{ op: "adjust", target: "charges", amount: 1 }] },
      ],
      actions: [
        {
          id: "ultimate",
          labelKey: "x",
          costs: [{ resource: "charges", amount: 5 }],
          transform: "avatar",
          cooldown: { type: "interval", hours: "24 * 7" },
        },
      ],
      stances: [
        {
          id: "posturas",
          labelKey: "x",
          switchOn: "turn-start",
          stances: [
            { id: "a", labelKey: "x" },
            { id: "b", labelKey: "x" },
          ],
        },
      ],
      transformations: [
        {
          id: "avatar",
          labelKey: "x",
          strategy: "overlay",
          durationRounds: 5,
          overlay: { effects: [] },
          onExpire: { adjudicate: "price", table: "price-table" },
        },
      ],
      tables: [
        {
          id: "price-table",
          labelKey: "x",
          die: "1d6",
          entries: [{ min: 1, max: 6, textKey: "x" }],
        },
      ],
      adjudications: [
        {
          id: "price",
          titleKey: "x",
          kind: "choice",
          choices: [{ id: "vida", labelKey: "x", apply: [{ op: "adjust", target: "pi", amount: 1 }] }],
        },
      ],
      configSchema: [
        { key: "dc.base", type: "formula", labelKey: "x", default: "12 + @pi" },
        { key: "maxCharges", type: "number", labelKey: "x", default: 12 },
      ],
    });
    expect(validatePlugin(plugin)).toEqual([]);
  });

  it("rejects bad ids and missing basics with field paths", () => {
    const issues = validatePlugin({ ...minimal({ id: "Bad Id!" }), version: "", archetype: "weapon" as never });
    const paths = issues.map((i) => i.path);
    expect(paths).toContain("id");
    expect(paths).toContain("version");
    expect(paths).toContain("archetype");
  });

  it("rejects references to unknown prompts/resources/transforms", () => {
    const issues = validatePlugin(
      minimal({
        triggers: [{ id: "t", labelKey: "x", event: "manual", prompt: "nope" }],
        actions: [{ id: "a", labelKey: "x", costs: [{ resource: "ghost", amount: 1 }], transform: "missing" }],
      })
    );
    expect(issues.some((i) => i.path === "triggers[0].prompt" && /nope/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.path === "actions[0].costs[0].resource")).toBe(true);
    expect(issues.some((i) => i.path === "actions[0].transform")).toBe(true);
  });

  it("rejects a tracker referencing an undefined derived variable", () => {
    const issues = validatePlugin(
      minimal({ trackers: [{ id: "pi", labelKey: "x", max: "10 + @bookLevel" }] })
    );
    expect(issues.some((i) => i.path === "trackers[0].max" && /@bookLevel/.test(i.message))).toBe(true);
  });

  it("rejects derived cycles naming the cycle", () => {
    const issues = validatePlugin(
      minimal({
        derived: [
          { id: "a", formula: "@b + 1" },
          { id: "b", formula: "@a + 1" },
        ],
      })
    );
    expect(issues.some((i) => i.path === "derived" && /a -> b|b -> a/.test(i.message))).toBe(true);
  });

  it("rejects duplicate and colliding ids across the @variable namespace", () => {
    const issues = validatePlugin(
      minimal({
        trackers: [{ id: "pi", labelKey: "x" }],
        resources: [{ id: "pi", labelKey: "x", max: 5 }],
      })
    );
    expect(issues.some((i) => /collides/.test(i.message))).toBe(true);
  });

  it("rejects unordered thresholds and bad tables", () => {
    const issues = validatePlugin(
      minimal({
        trackers: [
          {
            id: "peso",
            labelKey: "x",
            thresholds: [
              { at: 5, labelKey: "x" },
              { at: 3, labelKey: "x" },
            ],
          },
        ],
        tables: [{ id: "t", labelKey: "x", die: "banana", entries: [{ min: 4, max: 2, textKey: "x" }] }],
      })
    );
    expect(issues.some((i) => i.path === "trackers[0].thresholds")).toBe(true);
    expect(issues.some((i) => i.path === "tables[0].die")).toBe(true);
    expect(issues.some((i) => i.path === "tables[0].entries[0]")).toBe(true);
  });

  it("requires conditionKey when fallbackAmount is set", () => {
    const issues = validatePlugin(
      minimal({
        resources: [{ id: "c", labelKey: "x", max: 5, recharge: [{ on: "dawn", amount: "full", fallbackAmount: "1d4" }] }],
      })
    );
    expect(issues.some((i) => /conditionKey/.test(i.message))).toBe(true);
  });

  it("rejects config schema problems", () => {
    const issues = validatePlugin(
      minimal({
        configSchema: [
          { key: "a", type: "choice", labelKey: "x", default: "y" },
          { key: "a", type: "number", labelKey: "x", default: 1 },
          { key: "f", type: "formula", labelKey: "x", default: "1 + @nope" },
        ],
      })
    );
    expect(issues.some((i) => i.path === "configSchema[0].choices")).toBe(true);
    expect(issues.some((i) => /duplicate key "a"/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.path === "configSchema[2].default" && /@nope/.test(i.message))).toBe(true);
  });
});
