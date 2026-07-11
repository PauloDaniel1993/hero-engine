# Hero Engine — Plugin Author Guide

A **mechanic** (a weapon's or character's bespoke ruleset) is a plain object
implementing `MechanicPlugin`. Typed declarations live in `types/types.d.ts`
(emitted from `src/api/types.ts`) — point your editor at them for autocomplete.

The engine supplies: state persistence (actor/item flags), versioned structured
record collections, clamped trackers
with threshold ladders, resource pools with recharge rules, a trigger bus over
dnd5e events, save/choice prompts, stances, timed transformations, consequence
tables, a GM adjudication queue, auto-generated config UI (world defaults +
per-actor overrides), chat cards, and a sheet panel. You declare; it runs.

## Registering

```js
// 1. From a world script or another module — at startup:
Hooks.on("heroEngine.registerMechanics", (api) => api.register(myPlugin));

// 2. Any time after startup:
game.modules.get("hero-engine").api.register(myPlugin);
```

Registration validates the whole definition. Errors name the exact field
(`actions[2].costs[0].resource: references unknown resource "ghost"`), and a
bad plugin never breaks the others. Duplicate ids are rejected.

Start by copying `src/plugins/example-flaming-sword/` — it is a fully
commented minimal plugin (one resource, one recharge, one trigger, one action).

## The declarative vocabulary

| Primitive | Declares | Example from the built-ins |
|---|---|---|
| `trackers` | bounded numbers with threshold ladders | PI 0–50; Peso da Tempestade 1–6 ladder |
| `resources` | spendable pools + recharge rules | Storm Charges (reset 0 on long rest); Book charges (never) |
| `derived` | named formulas usable as `@id` | `bookLevel = clamp(1 + floor(@pi/10), 1, 5)` |
| `triggers` | engine event → gains/prompt/hook | crit-received → Berserker save |
| `prompts` | save or choice dialogs with outcomes | Ultimate save: nat20/nat1, success/failure branch |
| `actions` | buttons: costs, cooldowns, rolls, transforms | Julgamento: 12 charges + damage roll + adjudication |
| `stances` | mutually exclusive modes with Active Effects | the four Posturas da Tempestade |
| `transformations` | timed forms: overlay or actor-swap | Raven Queen / Vecna, 5 rounds, expiry consequence |
| `tables` | dice consequence tables | d6 Preço do Poder |
| `adjudications` | GM judgment calls (confirm/choice) | "valid sentient sacrifice?"; oath progress |
| `configSchema` | every tunable knob | all of the above's numbers, dice and formulas |
| `recordCollections` | dynamic slotted records with actions, expiry, pending replacement and migrations | Thar’gunn's Hollow Echoes and Recorded Legends |
| `hooks` | code escape hatch | Deimos' two-outcome Ultimate branching |

### Engine events

`attack-hit`, `crit-dealt`, `crit-received`, `reduced-to-zero`, `damage-taken`,
`ally-downed`, `rest-short`, `rest-long`, `turn-start`, `turn-end`,
`combat-round`, `world-time-advanced` — plus `"manual"` for sheet-button-only
triggers. Every automated trigger also gets a manual fallback button unless
`manualFallback: false`.

## Formulas

Formula strings are evaluated by a safe parser (never JS `eval`). Available:

- `+ - * / ( )`, `floor ceil round abs min max clamp`
- comparison gates returning 0/1: `gte gt lte lt eq`, and `iif(cond, a, b)`
- `@variables`: your tracker/resource/derived ids, actor roll data
  (`@prof`, `@abilities.str.mod`, ...), and **`@cfg.<key>`** — resolved config
  values.

`@cfg` is how you make *formulas themselves* configurable: declare a `formula`
config field and reference it. Example (Presa's curse):

```js
resources: [{ id: "cargas", max: "@cfg.maxCargas - @cfg.pesoCargaPenalty * gte(@peso, @cfg.pesoPenaltyAt)", ... }]
```

Dice expressions (`2d8 + 4`) are only legal in `dice` config fields, `roll`
formulas and recharge amounts — they go through Foundry's Roll engine and are
posted to chat. Deterministic fields reject dice at validation time.

## Configuration

Each `configSchema` field appears in the auto-generated GM form
(world defaults) and in the per-actor override editor. Resolution order is
**instance override → world setting → plugin default**, live at every read.
Formula/dice fields validate on save with a live preview; invalid input never
overwrites the stored value.

## Permissions

Actor owners can use actions, answer prompts, and switch stances on their own
mechanics. Config, overrides, attachment, manual tracker edits, and anything
declared as an `adjudication` are GM-only. Player operations needing elevated
writes relay through the GM's client automatically; with no GM online they
queue with a notification.

## Recharge & time

`RechargeRule.on`: `longRest` / `shortRest` / `dawn` / `manual`.
`amount`: `"full"`, `"none"`, or dice/formula; `setTo` hard-sets instead.
`conditionKey` asks the GM a yes/no first ("under open sky?"); on "no" the
`fallbackAmount` applies. Action `cooldown`: `interval` (hours of world time,
formula allowed — `24 * 7` for weekly), or rest/dawn based. Dawn hour is a
module setting (default 06:00).

## Hooks (the escape hatch)

`onAttach/onDetach`, `onTrigger`, `onActionUse`, `onPromptResolved`,
`onThreshold`, `onTransformExpire`, `onAdjudicated`, `onRecharge`. Each
receives a `MechanicContext`:

```ts
ctx.config(key)                 // resolved config value
ctx.state.get/set/adjust        // clamped tracker/resource access
ctx.state.getFlag/setFlag       // named state flags
ctx.records.list/get/create     // structured record registry
ctx.records.update/remove       // authoritative record mutation
ctx.records.replacePending      // atomic full-slot replacement
ctx.requestSecureTarget(...)    // owner request revalidated by the active GM
ctx.evalFormula("@cfg.dc")      // deterministic evaluation
ctx.rollDice("8d8", flavorKey)  // chat-visible roll
ctx.openPrompt(promptId)        // run a declared prompt now
ctx.activateTransform(id) / ctx.endTransform()
ctx.queueAdjudication(id, note)
ctx.rollTable(tableId)
ctx.postChat(key, data) / ctx.postCard({ titleKey, buttons })
ctx.applyOps([...])             // declarative StateOps
ctx.fireTrigger(triggerId)      // replay a trigger (same path as automation)
```

Plugins may import **only** from the public API entry (`hero-engine/src/api`
for built-ins; external plugins just use the global API object + the published
types). The build fails if a built-in reaches into engine internals.

## Coverage matrix — Dorian and Thar’gunn

Verified capability mapping for the two remaining documented mechanics. ✅ =
expressible today, 🔧 = expressible via `hooks`, ❗ = named follow-up gap.

### Dorian — Cajado do Grande Carvalho & Hearthstone Gem

| Doc element | API primitive |
|---|---|
| 20 Cargas Primordiais; full recharge on long rest under open sky/forest/Feywild; else 2d8+4 at dawn | ✅ `ResourceDef.recharge`: `longRest` + `conditionKey`, plus `dawn` rule |
| 0-charges d20 risk (on a 1, planar powers close for 7 days) | 🔧 `hooks.onActionUse` roll + state flag + `interval` lockout |
| Staff spells for charges (fog cloud 1 … storm of vengeance 9) | ✅ `ActionDef.costs` per spell |
| Controle Climático: 3 charges, 4 modes, switch for 1 charge | ✅ `StanceGroupDef` with `switchCost` |
| Salto Entre Mundos (8 charges) | ✅ `ActionDef` |
| O Mundo Protege o Lar: 1/long rest, d6 price | ✅ `cooldown: longRest` + `ConsequenceTableDef` |
| Lar Vivo consecration (30 days, one at a time) | ✅ `AdjudicationDef` + state flags (narrative) |
| Ultimate 1×/7 days | ✅ `cooldown: { type: "interval", hours: "24 * 7" }` |
| Pulso da Hearthstone (choice each turn) | ✅ `turn-start` trigger + choice `PromptDef` |
| Final choice (banimento/milagre/santuário) + Preço Épico (fixed + d4) | ✅ `TransformDef.onExpire` + prompt + table |

### Thar’gunn — Ladrão da Décima Vida (built in)

| Doc element | API primitive |
|---|---|
| Weapon level 1–5, slots and charges per level | ✅ tracker + `derived` |
| Cargas recharge at dawn only if the weapon "tasted blood" | ✅ `dawn` rule + `conditionKey` |
| Sifão de Essência on nat-20 or kill | ✅ `crit-dealt` / `reduced-to-zero` triggers + save prompt |
| Eco Oco storage: dynamic stolen abilities with per-Echo costs/erasure | ✅ `recordCollections`, linked managed dnd5e activities, pending replacement and lifecycle cleanup |
| Marcas de Fome ladder 3/5/7/10 | ✅ tracker thresholds |
| Dano na Alma per Eco use (2d10–8d10) | 🔧 `hooks.onActionUse` + `ctx.rollDice` |
| Dívida de Essência (-10 max HP each) | 🔧 tracker + hook-applied Active Effect |
| Campo da Décima Marcha (spend ALL charges) | ✅ cost formula `@cargas` (spend-all) |
| Lendas Gravadas (10 to break the bond); Rito: 2-of-3 checks DC 25 | ✅ tracker; 🔧 hook chaining three save prompts |
| Ultimate: 5 rounds, Legendary Points 3/turn | ✅ `TransformDef`; LP = resource + `turn-start` set-to-3 trigger |
| Fraturas de Nome + end damage `12d12 + 2d12/fratura` | ✅ tracker; 🔧 `onTransformExpire` roll with formula |

Thar’gunn is also the reference implementation for secure target requests,
managed content reconciliation, actor-swap canonical state, and record-linked
dnd5e activities. Plugin code still imports only the public API contract.
