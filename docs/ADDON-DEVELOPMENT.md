# Hero Engine add-on development handbook

This is the implementation contract for new Hero Engine mechanics and character
add-ons. It complements the field-by-field reference in
[`PLUGIN-GUIDE.md`](../PLUGIN-GUIDE.md). Start from the working
[`example-flaming-sword`](../src/plugins/example-flaming-sword/index.ts) and use
[`src/api/types.ts`](../src/api/types.ts) as the source of truth for the public
API. [`types/types.d.ts`](../types/types.d.ts) is the generated contract for
external modules.

The words **MUST**, **SHOULD**, and **MAY** below describe requirements,
recommendations, and optional behavior.

## 1. Choose the extension layer first

Hero Engine supports three related but different kinds of add-on work:

| Layer | Use it for | Where it lives | Allowed dependencies |
| --- | --- | --- | --- |
| Mechanic plugin | Resources, trackers, triggers, actions, stances, transformations, records, and rule hooks | `src/plugins/<plugin-id>/` or another Foundry module | Hero Engine public API only |
| Managed content | Actors, Items, Activities, Effects, Macros, compendia, artwork, and repeatable world installation | `src/managed/`, `packs-src/`, and `assets/` | Public API plus the module's Foundry integration layer |
| External add-on module | A separately released package that registers one or more mechanics | Its own Foundry module | The published Hero Engine API; never Hero Engine internals |

Keep rules in a mechanic plugin even when an add-on also installs Items and
Macros. Managed content is an adapter: it presents those rules through dnd5e
documents and calls the same stable action IDs.

Do not put installer or document-reconciliation code under `src/plugins/`.
Built-in plugin imports are checked during the build and may only reach the
public API (`../../api`, `../../api/types`) or files inside their own plugin
folder.

## 2. Public API and compatibility contract

An add-on MUST depend only on `MechanicPlugin`, `MechanicContext`, and
`HeroEngineAPI` as published by Hero Engine. Never import from `src/engine`,
`src/ui`, `src/compat`, or a built bundle.

The stable runtime entry point is:

```js
game.modules.get("hero-engine")?.api
```

External modules SHOULD register during Hero Engine's registration hook:

```js
Hooks.once("init", () => {
  Hooks.on("heroEngine.registerMechanics", (api) => {
    const supportedMajor = 2;
    const actualMajor = Number(String(api.apiVersion).split(".")[0]);
    if (actualMajor !== supportedMajor) {
      throw new Error(`My Add-on requires Hero Engine API ${supportedMajor}.x`);
    }
    api.register(myPlugin);
  });
});
```

Late registration is also supported with `api.register(myPlugin)`, but the hook
is preferred because it participates in the normal setup lifecycle. Duplicate
plugin IDs and invalid definitions are rejected with field-path errors.

An external Foundry module SHOULD declare both Hero Engine and dnd5e in its
manifest. Update the minimum versions to the first versions actually tested:

```json
{
  "relationships": {
    "requires": [
      {
        "id": "hero-engine",
        "type": "module",
        "compatibility": { "minimum": "1.0.5" }
      }
    ],
    "systems": [
      {
        "id": "dnd5e",
        "type": "system",
        "compatibility": { "minimum": "4.0.0" }
      }
    ]
  }
}
```

External TypeScript projects SHOULD vendor or otherwise consume the published
`types/types.d.ts`. Do not copy implementation files to obtain types.

## 3. Smallest useful mechanic

Prefer declarative definitions. Use hooks only for logic that the declarations
cannot express.

The import below is for a built-in plugin. An external TypeScript module should
import `MechanicPlugin` from its copy of the published declaration instead.

```ts
import type { MechanicPlugin } from "../../api";

export const myMechanic: MechanicPlugin = {
  id: "my-mechanic",
  version: "1.0.0",
  archetype: "character",
  nameKey: "MYADDON.Name",
  descriptionKey: "MYADDON.Description",

  i18n: {
    en: {
      MYADDON: {
        Name: "My Mechanic",
        Description: "A short player-facing explanation.",
        Charges: "Charges",
        Use: "Use power",
        ConfigResources: "Resources",
        ConfigMax: "Maximum charges"
      }
    },
    "pt-BR": {
      MYADDON: {
        Name: "Minha Mecânica",
        Description: "Uma explicação curta para o jogador.",
        Charges: "Cargas",
        Use: "Usar poder",
        ConfigResources: "Recursos",
        ConfigMax: "Máximo de cargas"
      }
    }
  },

  resources: [
    {
      id: "charges",
      labelKey: "MYADDON.Charges",
      max: "@cfg.maxCharges",
      initial: 0,
      recharge: [{ on: "longRest", amount: "full" }]
    }
  ],

  actions: [
    {
      id: "use-power",
      labelKey: "MYADDON.Use",
      costs: [{ resource: "charges", amount: 1 }]
    }
  ],

  configSchema: [
    {
      key: "maxCharges",
      type: "number",
      labelKey: "MYADDON.ConfigMax",
      groupKey: "MYADDON.ConfigResources",
      default: 3,
      min: 1
    }
  ]
};
```

For a built-in plugin, import it in `src/main.ts` and add it to the registration
list. For an external add-on, register the object with the hook above.

Registration makes a mechanic available; it does not attach it to every actor.
Use the public API for installation or GM tooling:

```js
await api.attach(actor, "my-mechanic");
await api.attach(actor, "my-item-mechanic", { item });
await api.detach(actor, "my-mechanic");
```

An item-archetype attachment MUST include the Item it binds. Installation UI
SHOULD preview the actor, mechanic, and bound Item before it writes.

### Identifier rules

- Plugin, resource, action, trigger, prompt, stance, transformation, table, and
  collection IDs MUST be stable, unique within their scope, and kebab-case.
- Treat an ID as persisted data and as a macro API. Renaming one requires an
  explicit migration or compatibility alias.
- Plugin `version` describes the mechanic. `api.apiVersion` describes the
  engine contract. They are independent.
- Never hard-code a world Actor, Item, token, scene, or user ID in released
  content.

## 4. Rules and configuration contract

Every balance knob MUST be in `configSchema`: costs, caps, dice, formulas,
thresholds, durations, save DCs, range, scaling, and recharge amounts. Group
related fields with `groupKey` and give non-obvious fields a `hintKey`.

Configuration resolves in this order:

1. Per-instance override.
2. World configuration.
3. Plugin default.

Read configuration only through `ctx.config(key)`. Use `@cfg.<key>` in
declarative formulas. Avoid duplicating a configured value in code, an Item,
and a macro; one source must be authoritative.

Actions with a cost or irreversible effect SHOULD use a declared prompt. The
engine resolves the prompt before applying the cost. A dismissed dialog MUST
make no state or document change.

Hooks MUST:

- await every dialog, roll, chat message, document mutation, and context call;
- return cleanly on cancellation before any cost or mutation;
- avoid partial writes, or compensate them if an atomic operation is not
  possible;
- use `ctx.state`, `ctx.records`, `ctx.applyOps`, and other context services
  instead of writing mechanic flags directly;
- leave the declared action path as the single authoritative workflow.

Both a Mechanics-window button and a dnd5e Activity MUST call the same action:

```js
await game.modules.get("hero-engine").api.runAction(
  actor,
  "my-mechanic",
  "use-power"
);
```

This is also the stable macro contract. A macro SHOULD resolve the actor from
the controlled token and then `game.user.character`; it MUST NOT embed an Actor
ID.

## 5. Persistence and actor-swap contract

Hero Engine owns canonical mechanic state.

- A `character` mechanic stores state on its canonical actor.
- An `item` mechanic stores state on the bound Item so it follows transfers.
- A temporary or alternate-form actor is a view of the canonical actor's
  mechanic, not a second state owner.
- Granted Items, effects, chat cards, and managed activities are projections;
  they MUST NOT become the source of truth for charges, records, or cooldowns.

Transformation and actor-swap workflows MUST preserve:

- the canonical actor link;
- current resources, trackers, records, and flags;
- ownership and the user-character relationship;
- token identity where the workflow promises it;
- valid links from projected Items back to their canonical records.

Do not copy the whole mechanic flag tree between actors. Use the engine's
attachment and transformation APIs so cleanup and expiry continue to work.
Within a plugin, `ctx.actor` is the current runtime form and
`ctx.canonicalActor` is the stable owner. Persistent Items and Activities
projected from records MUST be created and resolved through
`ctx.canonicalActor`; damage, token effects, and form-local combat behavior
normally use `ctx.actor`.

Presentation state is client-local. Collapsed sections, search text, filters,
and scroll positions MUST NOT be written to the world or actor.

## 6. Structured records contract

Use `recordCollections` for captured abilities, named legends, prepared forms,
or any other slotted structured data. Do not invent an untyped parallel array
in a flag.

A record MUST:

- contain JSON-safe data only—no Foundry Documents, functions, class instances,
  DOM nodes, or cyclic values;
- carry the collection's `schemaVersion` and have a migration when that schema
  changes;
- use a stable record ID for linked Items and actions;
- define capacity and lifecycle explicitly;
- use `idempotencyKey` when a hook, socket, or importer event may be delivered
  more than once.

Choose the lifecycle deliberately:

- `permanent`: remains until a rule removes it;
- `world-time`: expires against Foundry world time;
- `combat-time`: anchors to combat, round, and turn;
- `transform`: expires with the transformation activation;
- `manual`: expires only through an explicit workflow.

Capacity overflow and pending replacement are normal states. The UI and rules
MUST not silently delete a record when the collection is full. Use the provided
create, replace, cancel, block, unblock, expire, and action operations.

Linked projected Items SHOULD carry the canonical `recordId`. If a projected
Item is missing, the add-on SHOULD offer a deterministic repair from record
data rather than treating the projection as authoritative.

Use `onRecordsReady` for idempotent projection repair after schema migration
and lifecycle cleanup. The hook may run repeatedly and MUST produce no
duplicates. It should also remove safe-to-delete projections left on a runtime
actor by an older actor-swap implementation.

## 7. Reactive window contract

Every completed mechanic action MUST refresh an already-open Mechanics window.
The supported paths already emit a settlement notification:

- `api.runAction(...)` for declared actions;
- `ctx.records.runAction(...)` for record actions.

Do not bypass those paths by invoking a hook directly. Custom async hooks MUST
return only after their final mutation finishes; otherwise the settlement and
rerender happen too early.

Hero Engine emits `heroEngine.mechanicSettled` after a supported action settles.
The payload contains `actorIds`, `pluginId`, `kind`, and `id`. UI integrations
MAY observe it, but rules code SHOULD not use it as another trigger bus.

Rerendering MUST preserve:

- the Mechanics window's vertical scroll;
- per-collection scroll;
- collapsed/open region state;
- search and category filters.

A rerender MUST not register duplicate listeners or cause another rules
mutation.

## 8. UI and interaction rules

The actor sheet contains only the Hero Engine launcher. Mechanics belong in the
standalone Mechanics window; do not inject a second full mechanic panel into
the character sheet.

New UI MUST follow the existing dark basalt, thunder, and stolen-gold visual
language. Reuse existing `--he-*` variables and `.hero-engine-*` / `.he-*`
components before adding a new pattern.

### Regions and layout

- Every major region MUST be collapsible using accessible
  `<details>/<summary>` semantics.
- A summary SHOULD show an icon, short title, optional one-line description,
  useful count such as `3/10`, and a chevron.
- Open state SHOULD be remembered per user, actor, plugin, and region.
- Desktop layouts MAY use two columns; narrow windows MUST collapse to one.
- Long content MUST use a bounded-height inner scroll area. Avoid expanding a
  dialog wider than the viewport or creating a horizontal button wall.
- Primary actions remain visible and visually distinct from destructive
  actions. Disabled actions SHOULD explain the unmet prerequisite.

### Dialogs and selection lists

Use Foundry's `DialogV2` for custom dialogs. A long selection dialog MUST have:

- a search field that searches all relevant names and metadata;
- category filters, including an `All` option;
- compact selectable cards or rows, not hundreds of equal-sized buttons;
- an explicit primary action and an explicit Cancel action;
- Save and Cancel for editable forms;
- a readable dark theme for native selects and their options;
- keyboard focus, useful labels, and a clear selected state;
- internal scrolling while the title and action footer remain reachable.

Search and filters MUST cover the content the dialog promises. For example, an
Item picker must include weapons, equipment, consumables, tools, loot, spells,
and feats when those categories are allowed, and let the user exclude any
category.

### Safety and accessibility

- Escape every actor-, item-, record-, and user-controlled value before placing
  it in HTML. Never interpolate untrusted rich text into controls.
- Use localized labels rather than icon-only controls. When an icon-only button
  is appropriate, provide a title and accessible label.
- Do not use color as the only indication of selected, warning, disabled, or
  destructive state.
- Keep text and native form controls readable in Foundry's dark theme.
- GM-only launchers and controls MUST be omitted for non-GMs, not merely hidden
  after interaction.

## 9. Localization contract

All player- and GM-facing text MUST use localization keys. Built-in mechanics
MUST keep `en` and `pt-BR` complete and structurally identical. The localization
check rejects missing or extra keys.

Use concise labels and separate hint/description keys for explanation. Never
show a raw localization key to the user. Dynamic chat and UI values SHOULD be
passed as interpolation data rather than assembled into an English sentence in
code.

## 10. Security, permissions, and timing

The player may request an operation; the active GM is authoritative for hidden
targets and privileged mutations.

- Revalidate actor ownership, target existence, Item binding, range/category,
  opportunity IDs, and once-per-turn timing at execution time.
- Never trust target statistics, feature source data, costs, or outcomes sent
  in a player payload.
- Send opaque IDs or redacted choices to players. Do not disclose private Actor
  documents or GM-only metadata merely to build a picker.
- Use `ctx.requestSecureTarget(...)` for owner-authored requests involving a
  target whose authoritative data must be resolved by a GM.
- Mark record actions `ownerOnly` or `gmOnly` where appropriate and enforce the
  same permission in any alternate UI path.
- Make socket and chat-card operations idempotent. Assume retries, reconnects,
  double-clicks, and multiple active clients can happen.

Rules time MUST use Foundry world time or combat round/turn anchors. Do not use
`Date.now()`, browser timers, or `setTimeout` as the authority for a duration.
Wall-clock time is acceptable only for non-rules presentation such as a brief
animation.

## 11. Managed content contract

Use managed content when the add-on needs real dnd5e Actors, Items, Activities,
Effects, Macros, or compendia. The installer MUST be a reconciler: running it
twice produces the same intended world state without accumulating duplicates.

Managed documents use stable metadata under `flags.hero-engine.managed`:

```ts
interface ManagedMetadata {
  key: string;
  contentVersion: number;
  templateVersion: number;
  sourceHash: string;
  recordId?: string;
}
```

The stable `key`, not the visible document name, identifies owned content. A
reconciler MUST:

1. Preview and report create, update, adopt, no-op, and collision operations
   before writing.
2. Require or record backup evidence before mutating a live world.
3. Update only fields the add-on owns.
4. Preserve biography, notes, ownership, token identity, attunement, unrelated
   inventory, and current HP state unless the specification explicitly says
   otherwise.
5. Never delete or merge unknown content just because its name is similar.
6. Deduplicate only documents carrying the same managed key.
7. Detect importer refreshes and repair managed fields and links without
   fighting unrelated importer-owned fields.
8. Report collisions that need a GM decision instead of guessing.

dnd5e Items and Activities are the player-facing workflow, not a second rules
engine. Use stable 16-character alphanumeric document and Activity IDs in
source data. Pack sources SHOULD be deterministic JSON, compiled into LevelDB
by `npm run packs`.

Artwork MUST be local to the module, preferably WebP, and referenced as
`modules/<module-id>/assets/...`. Runtime content MUST NOT depend on a remote
image URL.

## 12. Source layout

A substantial built-in add-on typically looks like this:

```text
src/
  plugins/my-mechanic/
    index.ts                 # public-contract rules only
  managed/
    my-mechanic-installer.ts # idempotent Foundry document reconciliation
packs-src/
  my-mechanic-actors.json
  my-mechanic-items.json
  my-mechanic-macros.json
assets/my-mechanic/
  icons/
  portraits/
lang/
  en.json
  pt-BR.json
test/
  my-mechanic*.test.ts
```

Small mechanics need only the plugin folder and localization. Do not add
compendia or an installer without a real player workflow that requires them.
When adding a pack, also declare it in `module.json` and add its deterministic
source/output mapping to `scripts/build-packs.mjs`.

## 13. Testing and verification

Run all repository gates before committing:

```bash
npm run check
npm test
npm run build
```

`npm run check` typechecks, enforces the plugin import boundary, and validates
localization parity. `npm run build` regenerates packs and declarations and
audits the production bundle.

Automated tests SHOULD cover:

- formulas, resource clamping, thresholds, costs, and prerequisites;
- cancellation with no cost or partial mutation;
- record capacity, pending replacement, expiry, migration, and idempotency;
- secure owner/GM request validation and redaction;
- transformation and canonical actor resolution;
- managed installer preview, repeatability, adoption, collision reporting, and
  preservation of user-owned fields;
- UI model search, category filtering, permission gating, and state restore;
- listener cleanup and one settlement per completed action.

Then test in a cloned or disposable Foundry world using
[`SMOKE-TEST.md`](SMOKE-TEST.md). At minimum, test as both GM and player:

1. Registration, world configuration, attach, detach, and item transfer.
2. Every action's success, failed prerequisite, and Cancel path.
3. Rest, combat turn, world-time, and transformation expiry.
4. Open-window refresh after every action and record action.
5. Collapsible regions, search/filter persistence, and narrow-window layout.
6. Actor swap with tokens on a scene and linked Items present.
7. Installer preview, first install, second install, and importer-refresh repair.
8. No private target data exposed to the player client.

Back up the real world before the first managed-content installation. Stop or
deactivate the world before replacing loaded pack databases or a deployed
bundle.

## 14. Release and maintenance rules

- Keep commits atomic: contract, mechanic, managed content, UI, tests, and docs
  should be separable whenever practical.
- Update the mechanic semver when its persisted behavior or schema changes.
- Add migrations before shipping a record or state schema change.
- Update module version and changelog only for an actual release.
- Build from clean sources; never edit `dist`, `scripts/hero-engine.mjs`, or a
  deployed copy as the primary change.
- Verify the installed manifest, bundle, pack contents, and checksums after
  deployment or release publication.
- Preserve old action and record IDs used by Macros and chat cards, or provide
  a deliberate migration path.

## 15. Common failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Open window changes only after close/reopen | Hook was called directly, async work was not awaited, or the action bypassed `runAction` | Route through `api.runAction` / `ctx.records.runAction` and await the full hook |
| Cost is spent after Cancel | Mutation happens before prompt resolution | Use a declared prompt and return before mutation when dismissed |
| Alternate form has different charges | State was copied to the form actor | Resolve and mutate the canonical attachment only |
| Duplicate Items after reinstall | Reconciler matched by name or lacked a stable managed key | Match `flags.hero-engine.managed.key` and make reconciliation idempotent |
| Picker is unreadable or enormous | Native light options or unbounded button layout | Apply the shared dark controls, cards, search, filters, and bounded scrolling |
| Collapsible section closes after action | Open state was kept only in the replaced DOM | Restore client-local state using the actor/plugin/region presentation key |
| Player can infer hidden creature data | Client received authoritative target documents | Resolve opaque target requests on the active GM client |
| Expiry changes after reload | Duration used wall-clock timers | Persist world/combat lifecycle anchors |
| Build rejects a built-in plugin import | Plugin reached engine or UI internals | Use only `../../api`, `../../api/types`, and local plugin files |
| Localization check fails | `en` and `pt-BR` trees differ | Add the same key structure to both locales |

## 16. Definition of done

An add-on is ready only when:

- its rules are expressed through the public API with stable IDs;
- every tuning value is configurable and every visible string is localized;
- cancellation is side-effect free and async workflows are fully awaited;
- canonical state survives transfer, transformation, rerender, reload, and
  reconnect;
- every major UI region is collapsible, responsive, searchable where needed,
  and accessible in the dark theme;
- completed actions update open windows without losing scroll, filters, or
  collapsed state;
- privileged operations are GM-authoritative, redacted, and idempotent;
- managed installation is previewable, repeatable, conservative, and backed up;
- checks, tests, production build, and live GM/player smoke tests pass;
- documentation explains installation, use, repair, rollback, and any migration.
