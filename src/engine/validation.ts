/**
 * Plugin definition validation. Pure: returns a list of errors with field
 * paths; the registry rejects the plugin (in isolation) when any exist.
 */
import type {
  ConfigFieldDef,
  MechanicPlugin,
  NumberOrFormula,
  StateOp,
} from "../api/types";
import { detectDerivedCycle, validateFormula } from "./formulas";

const ID_RE = /^[a-z][a-z0-9-]*$/;

export interface ValidationIssue {
  path: string;
  message: string;
}

/** All bare `@variable` names a plugin's formulas may reference. */
export function mechanicVariables(plugin: MechanicPlugin): Set<string> {
  const vars = new Set<string>();
  for (const t of plugin.trackers ?? []) vars.add(t.id);
  for (const r of plugin.resources ?? []) vars.add(r.id);
  for (const d of plugin.derived ?? []) vars.add(d.id);
  return vars;
}

export function validatePlugin(plugin: MechanicPlugin): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message });

  if (!plugin.id || !ID_RE.test(plugin.id)) err("id", `must be kebab-case (got "${plugin.id}")`);
  if (!plugin.version) err("version", "is required");
  if (plugin.archetype !== "character" && plugin.archetype !== "item") {
    err("archetype", `must be "character" or "item" (got "${plugin.archetype}")`);
  }
  if (!plugin.nameKey) err("nameKey", "is required");

  const vars = mechanicVariables(plugin);
  const checkFormula = (path: string, value: NumberOrFormula | undefined, allowDice = false) => {
    if (value === undefined || typeof value === "number") return;
    const problem = validateFormula(value, vars, undefined, { allowDice });
    if (problem) err(path, problem);
  };

  // Unique ids across the shared @variable namespace, and per collection.
  const seenVarIds = new Map<string, string>();
  const uniqueIn = (collection: string, defs: { id: string }[] | undefined, sharesVars: boolean) => {
    const local = new Set<string>();
    (defs ?? []).forEach((d, i) => {
      const path = `${collection}[${i}].id`;
      if (!d.id || !ID_RE.test(d.id.replace(/[A-Z]/g, (c) => c.toLowerCase()))) {
        if (!d.id || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(d.id)) err(path, `invalid id "${d.id}"`);
      }
      if (local.has(d.id)) err(path, `duplicate id "${d.id}" in ${collection}`);
      local.add(d.id);
      if (sharesVars) {
        const prior = seenVarIds.get(d.id);
        if (prior && prior !== collection) {
          err(path, `id "${d.id}" collides with a ${prior} id (trackers/resources/derived share @names)`);
        }
        seenVarIds.set(d.id, collection);
      }
    });
  };
  uniqueIn("trackers", plugin.trackers, true);
  uniqueIn("resources", plugin.resources, true);
  uniqueIn("derived", plugin.derived, true);
  uniqueIn("prompts", plugin.prompts, false);
  uniqueIn("triggers", plugin.triggers, false);
  uniqueIn("actions", plugin.actions, false);
  uniqueIn("stances", plugin.stances, false);
  uniqueIn("transformations", plugin.transformations, false);
  uniqueIn("tables", plugin.tables, false);
  uniqueIn("adjudications", plugin.adjudications, false);
  uniqueIn("recordCollections", plugin.recordCollections, false);

  const promptIds = new Set((plugin.prompts ?? []).map((p) => p.id));
  const transformIds = new Set((plugin.transformations ?? []).map((t) => t.id));
  const tableIds = new Set((plugin.tables ?? []).map((t) => t.id));
  const adjudicationIds = new Set((plugin.adjudications ?? []).map((a) => a.id));
  const resourceIds = new Set((plugin.resources ?? []).map((r) => r.id));

  const checkRef = (path: string, id: string | undefined, pool: Set<string>, kind: string) => {
    if (id !== undefined && !pool.has(id)) err(path, `references unknown ${kind} "${id}"`);
  };
  const checkOps = (path: string, ops: StateOp[] | undefined) => {
    (ops ?? []).forEach((op, i) => {
      const p = `${path}[${i}]`;
      if (op.op !== "adjust" && op.op !== "set") err(`${p}.op`, `must be "adjust" or "set"`);
      if (op.target.startsWith("flag:")) {
        if (op.target.length <= 5) err(`${p}.target`, "empty flag name");
      } else if (!vars.has(op.target) || (plugin.derived ?? []).some((d) => d.id === op.target)) {
        err(`${p}.target`, `"${op.target}" is not a tracker or resource id`);
      }
      if (op.op === "adjust") checkFormula(`${p}.amount`, op.amount);
    });
  };

  (plugin.trackers ?? []).forEach((t, i) => {
    const p = `trackers[${i}]`;
    checkFormula(`${p}.min`, t.min);
    checkFormula(`${p}.max`, t.max);
    checkFormula(`${p}.initial`, t.initial);
    const ats = (t.thresholds ?? []).map((th) => th.at);
    if (ats.some((a, j) => j > 0 && a <= ats[j - 1]!)) {
      err(`${p}.thresholds`, "must be in strictly ascending order of `at`");
    }
  });

  (plugin.resources ?? []).forEach((r, i) => {
    const p = `resources[${i}]`;
    checkFormula(`${p}.max`, r.max);
    checkFormula(`${p}.initial`, r.initial);
    (r.recharge ?? []).forEach((rule, j) => {
      const rp = `${p}.recharge[${j}]`;
      if (!["longRest", "shortRest", "dawn", "manual"].includes(rule.on)) {
        err(`${rp}.on`, `invalid recharge event "${rule.on}"`);
      }
      if (rule.amount === undefined && rule.setTo === undefined) {
        err(rp, "needs `amount` or `setTo`");
      }
      for (const [k, v] of [
        ["amount", rule.amount],
        ["fallbackAmount", rule.fallbackAmount],
      ] as const) {
        if (typeof v === "string" && v !== "full" && v !== "none") {
          checkFormula(`${rp}.${k}`, v, true);
        }
      }
      if (rule.fallbackAmount !== undefined && rule.conditionKey === undefined && rule.conditionFlag === undefined) {
        err(`${rp}.fallbackAmount`, "requires `conditionKey` or `conditionFlag`");
      }
    });
  });

  if (plugin.derived?.length) {
    (plugin.derived ?? []).forEach((d, i) => checkFormula(`derived[${i}].formula`, d.formula));
    const cycle = detectDerivedCycle(plugin.derived);
    if (cycle) err("derived", `circular reference: ${cycle.join(" -> ")}`);
  }

  (plugin.prompts ?? []).forEach((pr, i) => {
    const p = `prompts[${i}]`;
    if (!pr.save && !pr.choices?.length) err(p, "needs `save` or `choices`");
    if (pr.save) {
      if (!pr.save.abilities?.length) err(`${p}.save.abilities`, "at least one ability required");
      checkFormula(`${p}.save.dcFormula`, pr.save.dcFormula);
      for (const [branch, outcome] of [
        ["onSuccess", pr.save.onSuccess],
        ["onFailure", pr.save.onFailure],
      ] as const) {
        if (!outcome) continue;
        checkOps(`${p}.save.${branch}.apply`, outcome.apply);
        checkRef(`${p}.save.${branch}.transform`, outcome.transform, transformIds, "transformation");
      }
    }
    (pr.choices ?? []).forEach((c, j) => checkOps(`${p}.choices[${j}].apply`, c.apply));
  });

  (plugin.triggers ?? []).forEach((t, i) => {
    const p = `triggers[${i}]`;
    checkOps(`${p}.apply`, t.apply);
    checkRef(`${p}.prompt`, t.prompt, promptIds, "prompt");
  });

  (plugin.actions ?? []).forEach((a, i) => {
    const p = `actions[${i}]`;
    (a.costs ?? []).forEach((c, j) => {
      checkRef(`${p}.costs[${j}].resource`, c.resource, resourceIds, "resource");
      checkFormula(`${p}.costs[${j}].amount`, c.amount);
    });
    checkOps(`${p}.apply`, a.apply);
    checkRef(`${p}.prompt`, a.prompt, promptIds, "prompt");
    checkRef(`${p}.transform`, a.transform, transformIds, "transformation");
    checkRef(`${p}.adjudicate`, a.adjudicate, adjudicationIds, "adjudication");
    checkRef(`${p}.table`, a.table, tableIds, "table");
    if (a.cooldown?.type === "interval") checkFormula(`${p}.cooldown.hours`, a.cooldown.hours);
  });

  (plugin.stances ?? []).forEach((g, i) => {
    const p = `stances[${i}]`;
    if (!g.stances?.length) err(`${p}.stances`, "at least one stance required");
    if (g.switchCost) checkRef(`${p}.switchCost.resource`, g.switchCost.resource, resourceIds, "resource");
    const local = new Set<string>();
    (g.stances ?? []).forEach((s, j) => {
      if (local.has(s.id)) err(`${p}.stances[${j}].id`, `duplicate stance id "${s.id}"`);
      local.add(s.id);
    });
  });

  (plugin.transformations ?? []).forEach((t, i) => {
    const p = `transformations[${i}]`;
    checkFormula(`${p}.durationRounds`, t.durationRounds);
    if (t.strategy === "overlay" && !t.overlay) err(`${p}.overlay`, "required for strategy overlay");
    if (t.strategy === "actor-swap" && !t.swap) err(`${p}.swap`, "required for strategy actor-swap");
    if (t.strategy === "config" && !t.overlay && !t.swap) {
      err(p, 'strategy "config" needs at least one of overlay/swap definitions');
    }
    if (t.onExpire) {
      checkOps(`${p}.onExpire.apply`, t.onExpire.apply);
      checkRef(`${p}.onExpire.adjudicate`, t.onExpire.adjudicate, adjudicationIds, "adjudication");
      checkRef(`${p}.onExpire.table`, t.onExpire.table, tableIds, "table");
    }
  });

  (plugin.tables ?? []).forEach((t, i) => {
    const p = `tables[${i}]`;
    if (!/^\d*d\d+$/i.test(t.die)) err(`${p}.die`, `"${t.die}" is not a die expression`);
    if (!t.entries?.length) err(`${p}.entries`, "at least one entry required");
    (t.entries ?? []).forEach((e, j) => {
      if (e.min > e.max) err(`${p}.entries[${j}]`, "min > max");
      checkOps(`${p}.entries[${j}].apply`, e.apply);
    });
  });

  (plugin.adjudications ?? []).forEach((a, i) => {
    const p = `adjudications[${i}]`;
    if (a.kind === "choice" && !a.choices?.length) err(`${p}.choices`, "required for kind choice");
    (a.choices ?? []).forEach((c, j) => checkOps(`${p}.choices[${j}].apply`, c.apply));
    checkOps(`${p}.onConfirm`, a.onConfirm);
    checkOps(`${p}.onDeny`, a.onDeny);
  });

  (plugin.recordCollections ?? []).forEach((collection, i) => {
    const p = `recordCollections[${i}]`;
    if (!Number.isInteger(collection.schemaVersion) || collection.schemaVersion < 1) err(`${p}.schemaVersion`, "must be a positive integer");
    checkFormula(`${p}.capacity`, collection.capacity);
    if (!collection.labelKey) err(`${p}.labelKey`, "is required");
    if (!["public", "owner", "gm", undefined].includes(collection.visibility)) err(`${p}.visibility`, "is invalid");
    const fieldKeys = new Set<string>();
    collection.fields.forEach((field, j) => {
      const fp = `${p}.fields[${j}]`;
      if (!field.key || !/^[a-z][a-zA-Z0-9]*$/.test(field.key)) err(`${fp}.key`, `invalid field key "${field.key}"`);
      if (fieldKeys.has(field.key)) err(`${fp}.key`, `duplicate field key "${field.key}"`);
      fieldKeys.add(field.key);
      if (field.type === "choice" && !field.choices?.length) err(`${fp}.choices`, "required for choice field");
    });
    const actionIds = new Set<string>();
    (collection.actions ?? []).forEach((action, j) => {
      const ap = `${p}.actions[${j}]`;
      if (!ID_RE.test(action.id)) err(`${ap}.id`, `invalid id "${action.id}"`);
      if (actionIds.has(action.id)) err(`${ap}.id`, `duplicate action id "${action.id}"`);
      actionIds.add(action.id);
    });
    if (collection.lifecycle?.type !== "permanent" && collection.lifecycle?.type !== "manual") {
      checkFormula(`${p}.lifecycle.duration`, collection.lifecycle?.duration);
      if (collection.lifecycle && collection.lifecycle.duration === undefined) err(`${p}.lifecycle.duration`, "is required");
    }
  });

  validateConfigSchema(plugin.configSchema ?? [], vars, err);

  return issues;
}

function validateConfigSchema(
  schema: ConfigFieldDef[],
  vars: Set<string>,
  err: (path: string, message: string) => void
): void {
  const keys = new Set<string>();
  schema.forEach((f, i) => {
    const p = `configSchema[${i}]`;
    if (!f.key) err(`${p}.key`, "is required");
    if (keys.has(f.key)) err(`${p}.key`, `duplicate key "${f.key}"`);
    keys.add(f.key);
    if (!f.labelKey) err(`${p}.labelKey`, "is required");
    if (f.type === "choice" && !f.choices) err(`${p}.choices`, "required for type choice");
    if (f.default === undefined) err(`${p}.default`, "is required");
    if (f.type === "formula" && typeof f.default === "string") {
      const problem = validateFormula(f.default, vars);
      if (problem) err(`${p}.default`, problem);
    }
    if (f.type === "dice" && typeof f.default === "string") {
      const problem = validateFormula(f.default, vars, undefined, { allowDice: true });
      if (problem) err(`${p}.default`, problem);
    }
  });
}
