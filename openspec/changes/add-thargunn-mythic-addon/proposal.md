## Why

Thar’gunn’s current Foundry actors contain a level-12 DDB character, an incomplete level-20 clone, and an unmodified Nine Lives Stealer, while the 602-line mythic design depends on persistent stolen abilities, companion state, campaign progression, and a five-turn transformation that Hero Engine cannot yet represent safely. This change turns that design into a complete built-in addon while adding reusable engine primitives for future mechanics with dynamic records, private-target workflows, and managed world content.

## What Changes

- Add a character-owned **Ladrão da Décima Vida** mechanic with a GM-milestoned five-level weapon, dawn/blood recharge, selectable weapon forms, Essence Siphon, temporary and permanent Hollow Echoes, Hunger/Legend’s Weight thresholds, Essence Debt, Recorded Legends, the Rite of the Tenth Legend, purification, and audited recovery.
- Add reusable structured record collections so plugins can persist, validate, render, act from, block, replace, expire, and migrate dynamic entries such as Hollow Echo slots.
- Add GM-authoritative target selection that can expose a redacted eligible-feature list to an actor owner, copy the selected feature into a normalized record, and temporarily suppress supported target items or activities without revealing private actor data.
- Add Skeldr as a linked, scalable Huge companion actor with a guardian-thunder combat kit, presence/defeat/return state, normal protective rules, Ultimate enhancements, and shared ownership derived from Thar’gunn.
- Rebuild the existing `Thar’gunn - Ultimate` actor as a native level-20 prepared form. Hero Engine will perform a five-turn hybrid actor swap while retaining character-owned state, enforcing prerequisites, resolving the access save and Usurped first turn, refreshing Legendary Points, and applying Name Fracture settlement.
- Replace the unavailable Ascended Devastating Strike with an explicitly provisional configurable weapon strike that defaults to `4d12 force + 4d12 thunder`; keep the form and configuration migration-ready for official Ascended content later.
- Add a visual-and-guided 165-foot Field of the Tenth March, Skeldr movement tracking for Thunderous Step, linked dnd5e activities, installable hotbar macros, bilingual pt-BR/English content, and per-client themes with a GM world default.
- Add module compendia and an idempotent installer/reconciler for the mythic weapon, feature items, both actor forms, Skeldr, macros, effects, and generated artwork. Reconciliation must survive DDB Importer refreshes without altering unrelated content.
- Reconcile every intentional change currently installed in Foundry back into repository source before rebuilding, including module/Foundry compatibility versioning, manifest metadata, runtime behavior, CSS, localization, and the improved GM scene-control launcher, actor-sheet Mechanics button, searchable/filterable dialogs, mechanics popout, and open-section persistence.
- Back up and safely curate the live actors, remove confirmed module/DDB duplicates, preserve inventory and ownership, deploy the build, run automated and live smoke tests, run T3 browser-controlled end-to-end tests, then publish after all gates pass.

Non-goals for this change are an official level-24 Ascended implementation, automatic interpretation of every arbitrary monster ability, full canvas interception of token movement, Argon Combat HUD integration, token-HUD shortcuts, or a separate dependent addon module.

## Capabilities

### New Capabilities

- `mechanic-record-collections`: Typed, persistent, migratable plugin-owned record collections with capacity rules, lifecycle state, record actions, validation, and generated UI.
- `secure-target-selection`: GM-authoritative redacted target-feature selection, direct player capture, and reversible game-time suppression without disclosing private actor data.
- `managed-world-content`: Versioned compendium templates plus idempotent install, reconcile, backup, ownership, DDB-refresh repair, and migration behavior.
- `thargunn-mythic-addon`: The complete Thar’gunn weapon, Hollow Echo, drawback, legend, rite, Skeldr, level-20 Ultimate, artwork, macro, and themed user experience.

### Modified Capabilities

None. This repository has no existing OpenSpec capability baselines; the reusable engine behavior and Thar’gunn addon are introduced as new specifications.

## Impact

- Public plugin types, validation, runtime state, sockets, trigger bus, transformations, timing, configuration, adjudication, chat cards, and UI require extension.
- New built-in plugin, compendium packs, generated assets, localization keys, macros, actor/item templates, schema versions, and migration code are added.
- The live `Thar’gunn`, `Thar’gunn - Ultimate`, and new Skeldr actors are affected only after JSON backup and installer preview; the current installed module is also backed up before deployment.
- Midi-QOL/DAE integration is used when available with core-dnd5e fallbacks; Sequencer may render packaged aura assets but is not required for state correctness.
- Primary risks are loss of locally installed UI changes during source rebuild, DDB content drift, permissions around private targets, actor-swap cleanup, duplicate trigger delivery, and interrupted timed-state recovery. The design and tasks must provide explicit rollback and idempotency for each.
