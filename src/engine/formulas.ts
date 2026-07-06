/**
 * Deterministic formula evaluation for mechanic variables — DCs, derived
 * values, costs, durations. `"12 + @pi"`, `"1 + floor(@pi / 10)"`, etc.
 *
 * Implemented as a small recursive-descent parser: no JavaScript `eval`, no
 * `Function`, ever. Formulas containing dice terms (`2d8 + 4`) are NOT handled
 * here — the runtime routes those through Foundry's Roll engine (see rolls.ts).
 */

export class FormulaError extends Error {
  constructor(message: string, public readonly formula: string) {
    super(`${message} in formula "${formula}"`);
    this.name = "FormulaError";
  }
}

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  floor: (x) => Math.floor(x!),
  ceil: (x) => Math.ceil(x!),
  round: (x) => Math.round(x!),
  abs: (x) => Math.abs(x!),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  clamp: (x, lo, hi) => Math.min(Math.max(x!, lo!), hi!),
  // Comparisons return 0/1 so thresholds can gate values, e.g. Presa's
  // max charges under the curse: "12 - 4 * gte(@peso, 4)".
  gte: (a, b) => (a! >= b! ? 1 : 0),
  gt: (a, b) => (a! > b! ? 1 : 0),
  lte: (a, b) => (a! <= b! ? 1 : 0),
  lt: (a, b) => (a! < b! ? 1 : 0),
  eq: (a, b) => (a! === b! ? 1 : 0),
  /** iif(cond, then, else) */
  iif: (cond, a, b) => (cond ? a! : b!),
};

const VARIABLE_PATTERN = "@([a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z_][a-zA-Z0-9_]*)*)";

/** All `@variable` references in a formula (dotted paths preserved). */
export function extractVariables(formula: string): string[] {
  const out = new Set<string>();
  // Fresh instance per call: a shared global regex carries lastIndex state
  // between callers and silently skips matches.
  for (const m of formula.matchAll(new RegExp(VARIABLE_PATTERN, "g"))) out.add(m[1]!);
  return [...out];
}

/** True when the formula contains dice notation and must go through Foundry Roll. */
export function containsDice(formula: string): boolean {
  return /(^|[^a-zA-Z0-9_])\d*d\d+/i.test(formula);
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: string };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula[j]!)) j++;
      const raw = formula.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new FormulaError(`Invalid number "${raw}"`, formula);
      tokens.push({ kind: "num", value });
      i = j;
    } else if (ch === "@") {
      const re = new RegExp(VARIABLE_PATTERN, "y");
      re.lastIndex = i;
      const m = re.exec(formula);
      if (!m) throw new FormulaError(`Invalid variable at position ${i}`, formula);
      tokens.push({ kind: "var", name: m[1]! });
      i += m[0].length;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < formula.length && /[a-zA-Z0-9_]/.test(formula[j]!)) j++;
      tokens.push({ kind: "ident", name: formula.slice(i, j) });
      i = j;
    } else if ("+-*/(),".includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      i++;
    } else {
      throw new FormulaError(`Unexpected character "${ch}"`, formula);
    }
  }
  return tokens;
}

/** Resolves a dotted variable path against a data object. */
function lookup(data: Record<string, unknown>, path: string): number {
  let node: unknown = data;
  for (const part of path.split(".")) {
    if (node == null || typeof node !== "object") return NaN;
    node = (node as Record<string, unknown>)[part];
  }
  const n = Number(node);
  return Number.isFinite(n) ? n : NaN;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly formula: string,
    private readonly data: Record<string, unknown>
  ) {}

  parse(): number {
    const value = this.expr();
    if (this.pos !== this.tokens.length) throw new FormulaError("Unexpected trailing input", this.formula);
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eatOp(op: string): boolean {
    const t = this.peek();
    if (t?.kind === "op" && t.op === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expr(): number {
    let left = this.term();
    for (;;) {
      if (this.eatOp("+")) left += this.term();
      else if (this.eatOp("-")) left -= this.term();
      else return left;
    }
  }

  private term(): number {
    let left = this.factor();
    for (;;) {
      if (this.eatOp("*")) left *= this.factor();
      else if (this.eatOp("/")) {
        const right = this.factor();
        if (right === 0) throw new FormulaError("Division by zero", this.formula);
        left /= right;
      } else return left;
    }
  }

  private factor(): number {
    if (this.eatOp("-")) return -this.factor();
    if (this.eatOp("+")) return this.factor();
    return this.primary();
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new FormulaError("Unexpected end of formula", this.formula);
    if (t.kind === "num") {
      this.pos++;
      return t.value;
    }
    if (t.kind === "var") {
      this.pos++;
      const value = lookup(this.data, t.name);
      if (Number.isNaN(value)) throw new FormulaError(`Unknown variable "@${t.name}"`, this.formula);
      return value;
    }
    if (t.kind === "ident") {
      const fn = FUNCTIONS[t.name];
      if (!fn) throw new FormulaError(`Unknown function "${t.name}"`, this.formula);
      this.pos++;
      if (!this.eatOp("(")) throw new FormulaError(`Expected "(" after ${t.name}`, this.formula);
      const args: number[] = [];
      if (!this.eatOp(")")) {
        do {
          args.push(this.expr());
        } while (this.eatOp(","));
        if (!this.eatOp(")")) throw new FormulaError('Expected ")"', this.formula);
      }
      return fn(...args);
    }
    if (t.kind === "op" && t.op === "(") {
      this.pos++;
      const value = this.expr();
      if (!this.eatOp(")")) throw new FormulaError('Expected ")"', this.formula);
      return value;
    }
    throw new FormulaError(`Unexpected token`, this.formula);
  }
}

/**
 * Evaluate a deterministic formula against a variable data object.
 * Throws FormulaError on syntax errors, unknown variables/functions, or dice.
 */
export function evaluateFormula(formula: string, data: Record<string, unknown> = {}): number {
  if (containsDice(formula)) {
    throw new FormulaError("Dice formulas must be rolled, not evaluated deterministically", formula);
  }
  return new Parser(tokenize(formula), formula, data).parse();
}

/** Evaluate a NumberOrFormula. */
export function resolveNumeric(value: number | string, data: Record<string, unknown> = {}): number {
  return typeof value === "number" ? value : evaluateFormula(value, data);
}

/**
 * Validate syntax and variable references without needing real values.
 * `knownVariables` are bare mechanic ids; dotted paths under `allowedRoots`
 * (actor roll data like `abilities.str.mod`) are accepted structurally.
 * Returns null if valid, else a human-readable error.
 */
export function validateFormula(
  formula: string,
  knownVariables: ReadonlySet<string>,
  allowedRoots: ReadonlySet<string> = DEFAULT_ROLLDATA_ROOTS,
  options: { allowDice?: boolean } = {}
): string | null {
  const vars = (() => {
    try {
      return extractVariables(formula);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  })();
  if (typeof vars === "string") return vars;

  for (const v of vars) {
    const root = v.split(".")[0]!;
    if (!knownVariables.has(v) && !knownVariables.has(root) && !allowedRoots.has(root)) {
      return `Unknown variable "@${v}"`;
    }
  }
  if (containsDice(formula)) {
    return options.allowDice ? null : "Dice notation is not allowed in this field";
  }
  // Syntax check: substitute every variable with 1 and parse.
  const data: Record<string, unknown> = {};
  for (const v of vars) {
    let node = data;
    const parts = v.split(".");
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts.at(-1)!] = 1;
  }
  try {
    evaluateFormula(formula, data);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * Variable roots accepted in formulas beyond mechanic ids:
 * actor roll data (validated at runtime against the actor) and `cfg` —
 * resolved config values, which is how plugins expose tunable formulas
 * (e.g. dcFormula: "@cfg.berserkerDc" with a `formula` config field).
 */
export const DEFAULT_ROLLDATA_ROOTS: ReadonlySet<string> = new Set([
  "abilities",
  "attributes",
  "details",
  "skills",
  "prof",
  "classes",
  "item",
  "level",
  "cfg",
]);

/**
 * Detect reference cycles among derived definitions.
 * Returns null if acyclic, else the cycle as a list of ids.
 */
export function detectDerivedCycle(derived: { id: string; formula: string }[]): string[] | null {
  const ids = new Set(derived.map((d) => d.id));
  const refs = new Map<string, string[]>();
  for (const d of derived) {
    refs.set(
      d.id,
      extractVariables(d.formula).filter((v) => ids.has(v))
    );
  }
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const s = state.get(id);
    if (s === "done") return null;
    if (s === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    state.set(id, "visiting");
    stack.push(id);
    for (const ref of refs.get(id) ?? []) {
      const cycle = visit(ref);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };

  for (const d of derived) {
    const cycle = visit(d.id);
    if (cycle) return cycle;
  }
  return null;
}
