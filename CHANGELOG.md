# Changelog

## 1.0.10 — 2026-07-11

- Apply Ultimate expiry damage and persistent consequence effects to canonical
  Thar’gunn after dnd5e deletes the temporary transformed Actor.
- Complete Legendary Point and Ultimate-state cleanup after both automatic and
  owner-triggered de-transformation.

## 1.0.9 — 2026-07-11

- Recover a player's persisted Ultimate approval request when the GM logs in
  after the request was made, even when the original socket delivery was lost.
- Deduplicate reconnect and live socket delivery so the GM receives exactly
  one ruling for the same pending transformation.
- Add an owner-accessible End transformation control to the Mechanics window;
  the normal Ultimate expiry consequences still run during a manual return.

## 1.0.8 — 2026-07-11

- Add rich action help cards after a 500 ms hover or keyboard focus, with the
  action description, evaluated resource costs, readiness, and every active
  blocker.
- Keep disabled actions hoverable and explain Thar’gunn-specific requirements,
  including Ultimate state, pending GM approval, the Field, Skeldr, cooldowns,
  ownership, and insufficient Legendary Points.
- Document the add-on contract for action descriptions and exact localized
  availability reasons.

## 1.0.7 — 2026-07-11

- Carry Rage into the Ultimate actor swap through a managed form effect,
  including Rage damage, physical resistance, Strength advantage, and the
  visible Rage status without consuming a second Rage use.
- Correct the Ultimate weapon from the ranged-distance field to dnd5e 5.3's
  melee `range.reach` field and set its reach to 10 feet.
- Bump the managed template version so rerunning the installer repairs existing
  Ultimate actors and their weapon copies deterministically.

## 1.0.6 — 2026-07-11

- Route player-triggered Ultimate transformations through the persistent GM
  ruling queue; the actor swap now runs with GM authority only after approval.
- Revalidate actor ownership, Rage, Skeldr, weapon attunement, long-rest
  readiness, and active-form state when the GM confirms the ruling.
- Leave Ultimate readiness, cooldown state, fractures, legendary points, and
  Skeldr unchanged when the GM denies a request or the actor swap fails.
- Apply Skeldr projections only after a successful transformation and delay the
  "confirmed" ruling card until the GM-side hook has actually completed.
- Add the public `ActionDef.announceUse` contract for deferred workflows and
  make flag-gated actions visibly unavailable while awaiting resolution.

## 1.0.5 — 2026-07-11

- Expose the stable canonical actor in the public mechanic context while
  retaining the current actor-swap form as the runtime actor.
- Create, find, and automatically repair Hollow Echo Items and dnd5e Activities
  on base Thar’gunn, including records captured while Ultimate is active.
- Remove misplaced or orphaned Ultimate-form projections and clean linked Items
  from both actors when a record is consumed, erased, or expires.
- Reconcile projections idempotently after record migrations and lifecycle
  cleanup so existing `REPAIR NEEDED` records recover when Mechanics opens.

## 1.0.4 — 2026-07-11

- Emit a mechanic-settled event after every action and record action finishes,
  including Siphon flows launched from sheet activities, macros, or chat cards.
- Include runtime, canonical, and state-owner actor identities so an Ultimate
  actor-swap popout refreshes when canonical Thar’gunn state changes.
- Keep document-driven refresh as a cross-client fallback for authoritative GM
  settlements and embedded Item/Active Effect updates.

## 1.0.3 — 2026-07-11

- Refresh open Mechanics popouts automatically after actor flag, embedded
  Item, and Active Effect changes.
- Refresh again when an in-window action, record action, trigger, adjustment,
  pending replacement, or stance workflow has fully settled.
- Debounce multi-document Foundry updates and preserve window/collection
  scroll positions, disclosure state, search text, and filters while rendering.

## 1.0.2 — 2026-07-11

- Make the complete Mechanics card and every character, active-state,
  record-collection, action, and manual-trigger region independently
  collapsible.
- Persist each region's open/closed state per client, actor, and mechanic.
- Add consistent disclosure styling, compact closed summaries, counters, and
  keyboard-accessible native controls in English and pt-BR.
- Replace the legacy one-button-per-feature Hollow Echo chooser with a
  searchable, category-filtered responsive card picker.
- Recognize Rage from dnd5e actor effects, recent DDB Rage activity cards, and
  a bounded Hero Engine Rage-use anchor so Ultimate prerequisites match play.

## 1.0.1 — 2026-07-11

- Fix Foundry 14 managed activity IDs so base/Ultimate features and all four
  Skeldr features are created as valid dnd5e activities.
- Reconcile weapon activities from serialized source data and remove the
  original imported attack, leaving exactly the three managed weapon forms.
- Persist Skeldr's dnd5e creature size as Huge in addition to its 3×3 token.
- Validate the repair through disposable clone install/reconcile, Echo/Field/
  Ultimate workflows, and backed-up real-actor curation.

## 1.0.0 — 2026-07-11

- Port the complete improved live UI into TypeScript source: GM scene-control
  launcher, searchable actor/item pickers, categorized binding, explicit
  Save/Cancel flows, sheet-only Mechanics launcher, persistent sections, and
  redesigned configuration/chat/dialog styling.
- Add the public versioned record-collection API with capacity, blocked slots,
  overflow recovery, atomic pending replacement, migrations, lifecycle expiry,
  linked activities, and responsive search/filter UI.
- Add the built-in Thar’gunn mythic addon, original offline artwork, managed
  Actor/Item/Macro compendia, backup-gated idempotent installer, Skeldr,
  Ladrão da Décima Vida, Hollow Echoes, drawbacks, rite, field, and Ultimate.
- Add active-GM validation for owner-authored target requests, Midi-QOL kill
  attribution/deduplication, and dnd5e 5.3/Foundry 14 actor-swap compatibility.
- Add localization and bundle audits plus expanded automated rule, migration,
  installer, security-envelope, and regression coverage.

### Migration and safety

- Back up a world before running `installThargunn()`; the installer rejects a
  live mutation until backup evidence is recorded in module settings.
- Same-name unmanaged documents are reported, never deleted automatically.
- Existing v0.1 scalar mechanic state remains compatible; record state is
  added lazily and preserves newer-schema data in read-only recovery mode.
