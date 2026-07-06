import { describe, expect, it } from "vitest";
import type { ConfigFieldDef } from "../src/api/types";
import { resolveConfig, resolveConfigValue, schemaDefaults, validateConfigValue } from "../src/engine/config-resolution";

const schema: ConfigFieldDef[] = [
  { key: "maxCharges", type: "number", labelKey: "x", default: 12, min: 1 },
  { key: "berserkerDc", type: "formula", labelKey: "x", default: "12 + @pi" },
  { key: "rechargeDice", type: "dice", labelKey: "x", default: "2d8 + 4" },
  { key: "strategy", type: "choice", labelKey: "x", default: "overlay", choices: { overlay: "a", "actor-swap": "b" } },
];

describe("resolution order", () => {
  it("override -> world -> default", () => {
    const defaults = schemaDefaults(schema);
    expect(resolveConfigValue("maxCharges", { maxCharges: 8 }, { maxCharges: 10 }, defaults)).toBe(8);
    expect(resolveConfigValue("maxCharges", {}, { maxCharges: 10 }, defaults)).toBe(10);
    expect(resolveConfigValue("maxCharges", {}, {}, defaults)).toBe(12);
    expect(resolveConfigValue("maxCharges", undefined, undefined, defaults)).toBe(12);
  });

  it("clearing an override falls back to world immediately", () => {
    const defaults = schemaDefaults(schema);
    const overrides: Record<string, unknown> = { maxCharges: 8 };
    delete overrides["maxCharges"];
    expect(resolveConfigValue("maxCharges", overrides, { maxCharges: 10 }, defaults)).toBe(10);
  });

  it("resolves the full object sparsely", () => {
    const cfg = resolveConfig(schema, { maxCharges: 8 }, { berserkerDc: "10 + 2 * @pi" });
    expect(cfg["maxCharges"]).toBe(8);
    expect(cfg["berserkerDc"]).toBe("10 + 2 * @pi");
    expect(cfg["rechargeDice"]).toBe("2d8 + 4");
  });
});

describe("validateConfigValue", () => {
  const vars = new Set(["pi", "charges"]);
  it("validates numbers with bounds", () => {
    expect(validateConfigValue(schema[0]!, 5, vars)).toBeNull();
    expect(validateConfigValue(schema[0]!, 0, vars)).toMatch(/Minimum/);
    expect(validateConfigValue(schema[0]!, "abc", vars)).toMatch(/number/);
  });
  it("rejects unknown variables in formulas, keeping the old value semantics", () => {
    expect(validateConfigValue(schema[1]!, "12 + @pi", vars)).toBeNull();
    expect(validateConfigValue(schema[1]!, "12 + @pii", vars)).toMatch(/@pii/);
    expect(validateConfigValue(schema[1]!, "2d8", vars)).toMatch(/Dice/);
  });
  it("allows dice only in dice fields", () => {
    expect(validateConfigValue(schema[2]!, "3d10 + @pi", vars)).toBeNull();
    expect(validateConfigValue(schema[2]!, "", vars)).not.toBeNull();
  });
  it("validates choices", () => {
    expect(validateConfigValue(schema[3]!, "overlay", vars)).toBeNull();
    expect(validateConfigValue(schema[3]!, "nope", vars)).toMatch(/choices/);
  });
});
