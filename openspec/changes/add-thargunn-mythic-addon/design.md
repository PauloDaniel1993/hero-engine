## Context

Hero Engine 0.1.0 already provides numeric trackers and resources, safe formulas, event triggers, prompts, timed transformations, Active Effect stances, consequence tables, configurable values, sockets, chat cards, and GM adjudication. Its plugin guide explicitly identifies Thar’gunn’s dynamic Hollow Echo list as the missing v1 primitive.

The live world contains:

- `Thar’gunn` (`Owx9HA0KRtcB8xWe`), a level-12 DDB character with 57 items, two Path of the Giant subclass records, and a standard equipped but unattuned Nine Lives Stealer Halberd.
- `Thar’gunn - Ultimate` (`VJ2nFvMjvYiHIO7w`), a level-20 clone with 65 items and eight additional normal barbarian features, but none of the custom mythic rules.
- No Skeldr actor, no Thar’gunn Hero Engine attachment, no custom mythic items, and no existing state to migrate.

The installed module has intentional changes made after its repository source was built. The current manifest matches the checked-out manifest at inspection time, but compatibility/version metadata must be rechecked at implementation time because the user reports changing the module version for the Foundry upgrade. CSS grew from 128 to 1,393 lines, both locale files gained the new dialog/panel/picker vocabulary, and runtime UI behavior was patched directly in the bundle. Rebuilding directly from GitHub can regress version metadata, the live GM scene-control button, searchable actor/item selectors, category filters, explicit Save/Cancel dialogs, mechanics popout, actor-sheet launcher, and collapsible-section persistence. Full installed-to-source reconciliation is therefore a prerequisite, not cleanup after the feature.

The rules source is `/home/paulo/Documents/rpg/Thargunn_Mecanica_Mitica.md`. The implementation target is the confirmed repository at `/home/paulo/Documents/rpg/hero-engine`. Portuguese is authoritative and English is required. Foundry game time, not wall-clock time, governs all rules durations.

## Goals / Non-Goals

**Goals:**

- Ship a complete, faithful Thar’gunn addon inside Hero Engine with configurable numbers and bilingual content.
- Add reusable dynamic record collections and secure target-feature workflows to the public plugin contract.
- Keep all authoritative mechanic state on Thar’gunn so it survives weapon-form changes and actor swaps.
- Safely curate the two live actors, create Skeldr, create module-managed content, and remain repairable after DDB refreshes.
- Automate deterministic rules while preserving explicit GM workflows for narrative or ambiguous consequences.
- Provide a beautiful responsive Mechanics window, dnd5e activities, hotbar macros, generated artwork, automated tests, live smoke tests, and T3 browser-controlled end-to-end proof.

**Non-Goals:**

- Implementing unpublished Ascended levels 21–24 or pretending provisional text is official.
- Automatically translating arbitrary monster abilities into balanced playable rules without player classification.
- Fully intercepting and rewriting every token movement path inside the 165-foot field.
- Adding Argon Combat HUD or token-HUD-specific controls in the first release.
- Creating a separate Thar’gunn module or storing authoritative state on the embedded weapon.
- Deleting non-module world content automatically, even when it appears duplicated.

## Decisions

### 1. Reconcile the complete live-module baseline before feature work

The repository becomes the only build source, but the installed module is treated as evidence of required behavior. The implementation first inventories manifest/version/compatibility metadata and hashes every installed file, records browser screenshots and behavioral checks, ports all intentional runtime, CSS, localization, and manifest changes into source, and adds regression tests or smoke steps before adding Thar’gunn. Generated bundle edits are translated back to TypeScript rather than copied forward as opaque patches.

Alternative: start from GitHub and reapply UI later. Rejected because every development build could temporarily destroy the user’s current workflow and make later regressions difficult to distinguish from new-feature bugs.

### 2. Character-owned authoritative state

The addon is a built-in `character` mechanic. The mythic weapon, Ultimate form weapon, Skeldr, generated Echo features, and macros carry stable managed-content identifiers but never own canonical counters or records.

The state document stores a versioned Thar’gunn state with these logical groups:

- scalar values: weapon level, charges, temporary Hunger, permanent Hunger, Essence Debt, Recorded Legend count, Name Fractures, Legendary Points, and field/ritual counters;
- flags: blood since dawn, bond broken, Siphon lock, Ultimate cooldown, Usurped state, first-Echo GM choice, player-action lock, Skeldr present/absent, and recovery conditions;
- record collections: permanent Echo slots, temporary Echoes, Recorded Legend log, pending captures, suppressions, blocked slots, and recovery history;
- links: managed weapon key/UUID, Ultimate form actor key/UUID, Skeldr key/UUID, and generated feature keys;
- timing: combat round/turn anchors and world-time expiries that can be recovered after reload.

The weapon remains one item with halberd, greataxe, and giant-throw activities. The prepared Ultimate actor has a module-managed mirror of that weapon for attacks during the swap. Because neither item stores the mechanic, `transformInto(... keepItems: false)` cannot erase state.

Alternative: item-owned state. Rejected because the current actor-swap replaces embedded items and would invalidate the attachment and state document. Alternative: two synchronized plugins. Rejected because cross-plugin atomicity and migration would be more complex without delivering user value.

### 3. Reusable mechanic record collections

Extend `MechanicPlugin` with declarative collection definitions and extend `MechanicContext` with a records API. A collection definition declares its ID, label, schema/version, capacity formula, visibility, ordering, permitted record actions, and lifecycle behavior. The runtime provides validated create/update/remove/block/unblock/expire operations, audit entries, atomic capacity checks, collection migrations, and generated UI.

Records are JSON-safe values. Plugin hooks normalize domain data and render or execute domain-specific record actions through public context methods; built-in plugins still cannot import engine internals. Hollow Echo records include stable record ID, source snapshot metadata, redacted presentation, selected category, tier, charge cost, soul-damage formula, Debt behavior, temporary/permanent status, expiry anchor, suppression reference, blocked state, and generated item key.

The existing scalar state shape remains readable. State gains a `schemaVersion` and `records` map. Migration is lazy on attachment resolution and can also be run by the installer. Failed migrations preserve the previous flag value, disable mutation for that attachment, and surface a GM recovery error.

Alternative: encode Echoes into arbitrary state flags. Rejected because flags provide no shared validation, capacity enforcement, action UI, expiry, or future plugin reuse. Alternative: make duplicated target items authoritative. Rejected because item schemas and DDB updates are unstable and cannot express blocked or pending slots reliably.

### 4. GM-authoritative secure target selection

The actor owner initiates Siphon only from an engine-recorded qualifying opportunity made with the managed mythic weapon. A short-lived opportunity contains attacker, target, item/activity, natural d20, hit/kill kind, combat anchor, and a consumed flag.

For a private target, the player sends only the opportunity ID and target UUID to the active authoritative GM client. The GM client:

1. revalidates ownership, target, item/activity, range of time, opportunity state, and once-per-turn limits;
2. extracts eligible embedded items, activities, spellcasting groups, and supported actor traits;
3. returns opaque choice IDs plus only player-safe name, type, activation, and redacted summary;
4. keeps full source documents and private descriptions on the GM client;
5. resolves the target’s Charisma save;
6. receives the player’s selected category and validates it against the current weapon level;
7. creates the normalized record and suppression atomically, then consumes the opportunity.

The player chooses the feature and the rules-defined category; no pre-capture GM approval is required. The GM can correct an existing record through audited management tools.

Supported embedded items/activities are disabled non-destructively where dnd5e allows it. Unsupported traits receive a named suppression effect and warning. Suppression stores enough prior state to restore exactly. Deletion and recreation are forbidden. Duplicate socket delivery and reconnects are idempotent by opportunity and suppression IDs.

Alternative: reveal the target sheet. Rejected because it leaks GM-only data. Alternative: copy client-visible data directly. Rejected because owners normally lack observer permission and clients are not authoritative for hostile documents.

### 5. Game-time and combat-time scheduler

The existing transform turn tick is generalized into persisted duration anchors:

- a normal one-minute Siphon suppression expires after ten complete combat rounds at the matching initiative anchor, or after 60 seconds of Foundry world-time advancement outside combat;
- an Ultimate Siphon suppression expires when the Ultimate ends;
- the Ultimate ends at the end of Thar’gunn’s fifth turn, not after five wall-clock minutes or five unrelated combatants;
- Skeldr’s `1d4 days` absence uses world time and exposes a GM “return early through a protective legend” action;
- dawn and long-rest locks use existing world/recharge events but persist their last processed event ID to prevent duplicate resolution.

On ready, combat updates, world-time updates, and attachment open, overdue durations reconcile once. No `setTimeout` is authoritative.

### 6. Safe hybrid level-20 transformation

The existing `Thar’gunn - Ultimate` actor is backed up and rebuilt as a native level-20 barbarian form. It retains normal level-20 proficiency, Rage, masteries, HP, and class features. It adds only the explicitly custom form behavior: Huge size, +10-foot reach, damage resistance except psychic/force/radiant, the mythic weapon mirror, Skeldr enhancement, two Mythical Techniques, Legendary Points, the provisional strike, and Fracture state.

Activation uses a bonus-action workflow and a hard checklist for Rage, linked Skeldr presence, weapon attunement, and long-rest cooldown. A GM can override with an audit reason. If the bond is not broken, the player selects Wisdom or Charisma against `24 + Essence Debt - Recorded Legends`. Failure creates Marcha Usurpada; a natural 1 additionally locks player addon actions for the first turn and exposes a GM takeover panel without changing actor ownership.

The transform compatibility layer captures HP percentage before transformation, preserves Hero Engine flags/links, uses the form actor only as a static source, and guarantees revert/cleanup from expiry, manual end, combat deletion, module reload, or recovery action. The transformed actor’s linked form items are presentation and activity surfaces only.

Alternative: overlay every level-20 field and item. Rejected because it is harder to verify, clean up, and later replace with Ascended content. Alternative: separate manually controlled actor. Rejected because it duplicates combat/token state and breaks the five-turn lifecycle.

### 7. Deterministic automation with explicit narrative rulings

The engine automatically handles formulas, costs, saves, thresholds, damage, standard effects, turn refreshes, game-time expiry, maximum-HP penalties, Skeldr absence, and slot blocking. It uses GM workflows for:

- whether a high-tier Hunger mark becomes permanent;
- Recorded Legend awards and log entries;
- threshold-five demands and threshold-seven compulsions;
- the threshold-ten identity/name consequence;
- choosing a slot blocked by seven Fractures;
- purification scope and proof;
- abilities that cannot be technically suppressed;
- an early Skeldr return through a protective legendary deed.

This honors the hybrid automation decision while keeping deterministic resource operations atomic and auditable.

### 8. Skeldr as a linked scalable companion

Skeldr is a module-managed Huge companion actor with a 3×3 token and ownership mirrored from Thar’gunn. His normal “guardian thunder charger” suite contains a horn attack, a movement-gated thunder charge/trample, an earthshaking control action, and a protective reaction. HP, attack, save DC, damage, and selected defenses derive from Thar’gunn’s level/proficiency plus weapon level through configurable formulas.

The link is by stable managed key with UUID caching, not actor name alone. Presence requires a valid, non-defeated linked actor/token or an explicit GM narrative-presence override. At 0 HP, Skeldr becomes thunder-absent rather than dead, is removed or disabled safely, and receives a persisted `1d4` game-day return time. The Ultimate temporarily sets speed to 120 feet, ignores difficult terrain and opportunity attacks, and enables Legendary Point movement/rescue actions.

### 9. Field and movement techniques use guided canvas automation

The Field of the Tenth March creates a packaged 165-foot moving aura centered on Thar’gunn. Sequencer enhances the visual when active, but a core canvas fallback remains. Range membership and selected-enemy status are tracked. Reliable difficult-terrain or speed effects are applied; the enhanced attempt-to-leave save is a guided action because Foundry cannot consistently distinguish path intent, teleport, forced movement, and normal movement across every movement module.

Skeldr token updates accumulate movement distance per turn. At 20 feet, Thunderous Step arms. The next managed mythic-weapon hit offers the rider, enforces once per turn, rolls `8d12 thunder + 8d12 force`, resolves the Strength save, and applies push/prone/reaction loss. Gargantuan targets receive the alternative `4d12 thunder` instead of push.

### 10. Module-managed content and reconciliation

Add versioned Actor, Item, and Macro compendia. Every created document carries `flags.hero-engine.managed` with a stable key, content version, template version, and source hash. The installer supports preview, install, reconcile, and repair modes:

- it creates missing managed content;
- updates only fields owned by the module;
- preserves user-editable fields declared by the template;
- replaces stale references by stable key;
- removes only duplicate documents carrying the same managed key;
- never deletes unknown DDB or user content;
- records every change in a report.

The one-time live curation of the duplicate subclass records is a separate reviewed migration after JSON backup; it is not generalized as automatic duplicate deletion. After a DDB refresh, “Repair Thar’gunn” restores module-managed items, activities, links, and ownership without overwriting unrelated inventory.

Hotbar macros resolve actors and managed content by key at runtime rather than hard-coded world IDs. The three player surfaces are the Mechanics window, real sheet activities, and macros. Argon and token HUD remain out of scope.

### 11. UI, themes, localization, and assets

The Thar’gunn window uses basalt surfaces, restrained thunder-blue light, stolen-gold accents, carved-rune separators, and increasing void accents for Hunger, Debt, and Fractures. A GM world setting selects the default theme; a client-scoped setting overrides it for that user. Resolution is client override → world default → basalt theme.

The window groups weapon/charges, permanent and temporary Echoes, drawbacks, legends/rite, Skeldr, Ultimate checklist/state, actions, field, and recovery. Search, filters, keyboard focus, scrolling, Save/Cancel behavior, responsive sizing, and open-section persistence reuse the corrected module patterns.

All strings exist in pt-BR and English. Generated WebP assets include Skeldr portrait/token, mythic weapon, Ultimate portrait/token, March aura, Echo category icons, and Nameless Sovereign art. Source prompts/metadata and optimization scripts are kept so assets can be regenerated; no remote runtime assets are required.

### 12. Future Ascended compatibility

The level-20 form records a chassis provider ID and version. Native level-20 values and the provisional Devastating Strike (`4d12 force + 4d12 thunder` by default) are isolated from Thar’gunn’s custom rules. When official Ascended content is available, a future migration can replace the form template and mapped activities without changing Echoes, drawbacks, links, cooldowns, or audit history.

## Risks / Trade-offs

- **[Repository build regresses installed UI]** → Capture the live behavior first, reconcile TypeScript/CSS/localization before feature work, and make those behaviors part of browser smoke tests.
- **[Private target data leaks through sockets or logs]** → Send opaque choice IDs and redacted summaries only; keep full source documents on the authoritative GM client and test socket payloads.
- **[Player-direct capture produces overpowered Echoes]** → Require a validated rules category, enforce weapon-level eligibility and default costs, provide an audited GM correction tool, and keep all numeric mappings configurable.
- **[Actor swap loses state/items or calculates HP incorrectly]** → Keep canonical state on the actor, mirror presentation items on the form, capture HP percentage before swapping, and add crash/reload/revert tests.
- **[dnd5e/Midi-QOL hooks fire twice]** → Normalize events into stable IDs, record processed IDs, and make opportunity/suppression/action settlement idempotent.
- **[World time is not advanced outside combat]** → Display the absolute game-time expiry and provide a GM reconcile/expire control; never use real time as a substitute.
- **[165-foot aura is expensive on token-heavy scenes]** → Recompute membership only on relevant token updates/turn transitions, debounce visuals, and fall back to guided enforcement.
- **[DDB refresh overwrites custom content]** → Reconcile by stable managed key, keep canonical state separate from DDB items, expose a repair preview, and never auto-delete unknown data.
- **[Generated art inflates the module]** → Optimize to appropriately sized WebP assets, share category artwork where possible, and set a bundle-size check.
- **[Automatic publishing releases a bad migration]** → Gate publishing on clean Git state, tests, build/check, backup verification, live smoke test, T3 browser test, and successful rollback rehearsal.

## Migration Plan

1. Record the Git commit, live module manifest/version/compatibility metadata, per-file hashes, world/system/module versions, active module list, current actor IDs/ownership/items, and screenshots of all corrected Hero Engine menus. Classify every installed-versus-source difference as intentional, generated, or stale before changing source.
2. Export JSON backups of both Thar’gunn actors, create a Foundry world/module backup, and copy the installed Hero Engine directory to a timestamped rollback location outside the deployment path.
3. Port and verify the installed UI improvements in repository source. Build and deploy this baseline alone; run existing smoke tests and compare browser behavior before continuing.
4. Add record collections, secure target selection, timing recovery, public types, migrations, and tests. Verify existing plugins remain behaviorally unchanged.
5. Add managed compendia, installer preview/reconcile, assets, localization, and macros. Test install/repair in a disposable actor/world copy.
6. Add the Thar’gunn plugin and configure a cloned pair of actors plus Skeldr. Run deterministic rule tests and browser workflows on clones.
7. Present the live curation preview, then modify the backed-up real actors in place: preserve inventory/biography/ownership, repair the duplicate subclass entries, replace the standard weapon, attach the character mechanic, rebuild the Ultimate form, and link Skeldr.
8. Run automated tests, `npm run check`, production build, live GM and player smoke tests, T3 browser-controlled capture/Ultimate/expiry/recovery tests, DDB repair simulation, reload recovery, and rollback rehearsal.
9. If every gate passes, update version/changelog, commit, push, package, and publish the GitHub release. Read back the release manifest and download artifact, then verify Foundry recognizes the published version.

Rollback restores the actor JSON exports, world/module backup, and previous installed module directory. The addon must detect newer state when an older module is restored and enter read-only recovery mode rather than overwriting it.

## Open Questions

No blocking design questions remain. The native level-20 chassis and provisional strike are deliberately configurable because the user plans to retune them later. Official Ascended rules and their future mapping are outside this change and will require a separate proposal when source material exists.
