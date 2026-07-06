import { describe, expect, it } from "vitest";
import {
  containsDice,
  detectDerivedCycle,
  evaluateFormula,
  extractVariables,
  resolveNumeric,
  validateFormula,
} from "../src/engine/formulas";

describe("evaluateFormula", () => {
  it("evaluates arithmetic with precedence", () => {
    expect(evaluateFormula("2 + 3 * 4")).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4")).toBe(20);
    expect(evaluateFormula("10 / 4")).toBe(2.5);
    expect(evaluateFormula("-3 + 5")).toBe(2);
  });

  it("resolves @variables including dotted paths", () => {
    expect(evaluateFormula("12 + @pi", { pi: 15 })).toBe(27);
    expect(evaluateFormula("8 + @prof + @abilities.str.mod", { prof: 8, abilities: { str: { mod: 5 } } })).toBe(21);
  });

  it("evaluates the documented mechanic formulas", () => {
    // Deimos: book level, Berserker DC, Ultimate DC
    expect(evaluateFormula("clamp(1 + floor(@pi / 10), 1, 5)", { pi: 0 })).toBe(1);
    expect(evaluateFormula("clamp(1 + floor(@pi / 10), 1, 5)", { pi: 14 })).toBe(2);
    expect(evaluateFormula("clamp(1 + floor(@pi / 10), 1, 5)", { pi: 47 })).toBe(5);
    expect(evaluateFormula("12 + @bookLevel + floor(@pi / 5)", { bookLevel: 2, pi: 14 })).toBe(16);
    expect(evaluateFormula("12 + @bookLevel + floor(@pi / 5)", { bookLevel: 5, pi: 47 })).toBe(26);
  });

  it("supports functions", () => {
    expect(evaluateFormula("min(3, 7)")).toBe(3);
    expect(evaluateFormula("max(3, 7, 5)")).toBe(7);
    expect(evaluateFormula("ceil(1.2)")).toBe(2);
    expect(evaluateFormula("round(1.5)")).toBe(2);
    expect(evaluateFormula("abs(-4)")).toBe(4);
  });

  it("supports comparison gates (Presa curse: max charges 12 -> 8 at Peso 4)", () => {
    const maxCharges = "12 - 4 * gte(@peso, 4)";
    expect(evaluateFormula(maxCharges, { peso: 3 })).toBe(12);
    expect(evaluateFormula(maxCharges, { peso: 4 })).toBe(8);
    expect(evaluateFormula("iif(gt(@x, 5), 100, 200)", { x: 6 })).toBe(100);
    expect(evaluateFormula("iif(gt(@x, 5), 100, 200)", { x: 5 })).toBe(200);
  });

  it("throws on unknown variables", () => {
    expect(() => evaluateFormula("12 + @pii", { pi: 3 })).toThrow(/Unknown variable "@pii"/);
  });

  it("throws on syntax errors", () => {
    expect(() => evaluateFormula("12 +")).toThrow();
    expect(() => evaluateFormula("floor 3")).toThrow();
    expect(() => evaluateFormula("2 ** 3")).toThrow();
    expect(() => evaluateFormula("1 / 0")).toThrow(/Division by zero/);
  });

  it("refuses dice formulas", () => {
    expect(() => evaluateFormula("2d8 + 4")).toThrow(/rolled/);
  });

  it("never uses JS eval semantics", () => {
    expect(() => evaluateFormula("globalThis")).toThrow();
    expect(() => evaluateFormula("constructor")).toThrow();
  });
});

describe("resolveNumeric", () => {
  it("passes numbers through and evaluates strings", () => {
    expect(resolveNumeric(5)).toBe(5);
    expect(resolveNumeric("2 + @x", { x: 3 })).toBe(5);
  });
});

describe("extractVariables / containsDice", () => {
  it("extracts unique variables", () => {
    expect(extractVariables("@pi + @pi + @abilities.wis.mod").sort()).toEqual(["abilities.wis.mod", "pi"]);
  });
  it("detects dice", () => {
    expect(containsDice("2d8 + 4")).toBe(true);
    expect(containsDice("1d20")).toBe(true);
    expect(containsDice("12 + @pi")).toBe(false);
    expect(containsDice("@dread + 1")).toBe(false); // identifier containing 'd' is not dice
  });
});

describe("validateFormula", () => {
  const known = new Set(["pi", "charges"]);
  it("accepts known variables and rolldata roots", () => {
    expect(validateFormula("12 + @pi", known)).toBeNull();
    expect(validateFormula("@prof + @abilities.cha.mod", known)).toBeNull();
  });
  it("rejects unknown variables with the variable named", () => {
    expect(validateFormula("12 + @pii", known)).toMatch(/@pii/);
  });
  it("rejects dice unless allowed", () => {
    expect(validateFormula("2d8 + 4", known)).toMatch(/Dice/);
    expect(validateFormula("2d8 + 4", known, undefined, { allowDice: true })).toBeNull();
  });
  it("rejects syntax errors", () => {
    expect(validateFormula("12 +", known)).not.toBeNull();
  });
});

describe("detectDerivedCycle", () => {
  it("returns null for acyclic definitions", () => {
    expect(
      detectDerivedCycle([
        { id: "a", formula: "@b + 1" },
        { id: "b", formula: "2" },
      ])
    ).toBeNull();
  });
  it("names the cycle", () => {
    const cycle = detectDerivedCycle([
      { id: "a", formula: "@b + 1" },
      { id: "b", formula: "@a + 1" },
    ]);
    expect(cycle).toContain("a");
    expect(cycle).toContain("b");
  });
  it("detects self-reference", () => {
    expect(detectDerivedCycle([{ id: "a", formula: "@a" }])).toEqual(["a", "a"]);
  });
});
