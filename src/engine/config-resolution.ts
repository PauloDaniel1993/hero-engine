/**
 * Pure config resolution: per-instance override -> world setting -> plugin
 * schema default. Overrides are stored sparsely; a missing key falls through.
 */
import type { ConfigFieldDef } from "../api/types";
import { validateFormula } from "./formulas";

export function schemaDefaults(schema: ConfigFieldDef[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema) out[field.key] = field.default;
  return out;
}

/** Resolve one key through the three layers. */
export function resolveConfigValue(
  key: string,
  instanceOverrides: Record<string, unknown> | undefined,
  worldValues: Record<string, unknown> | undefined,
  defaults: Record<string, unknown>
): unknown {
  if (instanceOverrides && Object.prototype.hasOwnProperty.call(instanceOverrides, key)) {
    return instanceOverrides[key];
  }
  if (worldValues && Object.prototype.hasOwnProperty.call(worldValues, key)) {
    return worldValues[key];
  }
  return defaults[key];
}

/** Fully resolved config object for an instance. */
export function resolveConfig(
  schema: ConfigFieldDef[] = [],
  instanceOverrides: Record<string, unknown> | undefined,
  worldValues: Record<string, unknown> | undefined
): Record<string, unknown> {
  const defaults = schemaDefaults(schema);
  const out: Record<string, unknown> = {};
  for (const field of schema) {
    out[field.key] = resolveConfigValue(field.key, instanceOverrides, worldValues, defaults);
  }
  return out;
}

/**
 * Validate a single config value against its field definition.
 * Returns null when valid, else a message. Invalid values must never
 * overwrite the previously stored value (enforced by the forms).
 */
export function validateConfigValue(
  field: ConfigFieldDef,
  value: unknown,
  knownVariables: ReadonlySet<string>
): string | null {
  switch (field.type) {
    case "number": {
      const n = Number(value);
      if (typeof value === "string" && value.trim() === "") return "A number is required";
      if (!Number.isFinite(n)) return "A number is required";
      if (field.min !== undefined && n < field.min) return `Minimum is ${field.min}`;
      if (field.max !== undefined && n > field.max) return `Maximum is ${field.max}`;
      return null;
    }
    case "boolean":
      return typeof value === "boolean" ? null : "true/false required";
    case "string":
      return typeof value === "string" ? null : "Text required";
    case "choice":
      if (!field.choices) return "Field has no choices defined";
      return Object.prototype.hasOwnProperty.call(field.choices, String(value))
        ? null
        : "Not one of the allowed choices";
    case "formula":
      if (typeof value !== "string" || value.trim() === "") return "A formula is required";
      return validateFormula(value, knownVariables);
    case "dice":
      if (typeof value !== "string" || value.trim() === "") return "A dice expression is required";
      return validateFormula(value, knownVariables, undefined, { allowDice: true });
  }
}
