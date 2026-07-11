## 1. Baseline inventory and rollback evidence

- [x] 1.1 Record the repository commit, Node/npm versions, Foundry build, dnd5e version, active integration versions, and current Hero Engine manifest/version/compatibility metadata.
- [x] 1.2 Hash and inventory every file in the installed Hero Engine directory and classify repository-versus-installed differences as intentional, generated, or stale.
- [x] 1.3 Capture T3 browser screenshots and a behavior checklist for the current GM scene-control launcher, GM panel, actor/item search, category filters, Save/Cancel dialogs, actor-sheet button, mechanics popout, and persistent manual-trigger section.
- [x] 1.4 Export JSON backups of `Thar’gunn` and `Thar’gunn - Ultimate`, including ownership, prototype tokens, items, effects, and flags.
- [x] 1.5 Create and verify a Foundry world backup plus a timestamped copy of the installed Hero Engine module outside its deployment path.
- [x] 1.6 Document exact actor IDs, item counts, duplicate subclass candidates, managed weapon source item, current ownership, and the absence of Skeldr and Thar’gunn mechanic state.

## 2. Port the complete installed-module baseline to source

- [x] 2.1 Port intentional module/Foundry compatibility version and manifest metadata changes from the installed module to repository source.
- [x] 2.2 Port the installed GM scene-control button and application-opening behavior into TypeScript source.
- [x] 2.3 Port the actor-sheet Mechanics launcher, standalone mechanics popout, size behavior, and open-section persistence into TypeScript source.
- [x] 2.4 Port searchable actor selection, count/empty states, and the searchable category-filtered item binding picker with explicit Save and Cancel.
- [x] 2.5 Port the improved confirmation, choice, input, configuration, chat-card, and GM-panel markup into source.
- [x] 2.6 Port the installed 1,393-line CSS behavior into maintainable source styles without copying obsolete selectors blindly.
- [x] 2.7 Port and reconcile all installed pt-BR and English localization additions.
- [x] 2.8 Add regression checks for the ported baseline and verify `npm test`, `npm run check`, and `npm run build` before beginning Thar’gunn features.
- [x] 2.9 Deploy the baseline-only build to the backed-up world and reproduce the captured T3 browser behavior with no regressions.

## 3. Record collection public API and state schema

- [x] 3.1 Add typed record collection, record action, record lifecycle, and record mutation definitions to `src/api/types.ts` and emitted declarations.
- [x] 3.2 Extend plugin validation for collection IDs, schemas, capacity formulas, action references, visibility, and lifecycle policies.
- [x] 3.3 Add versioned `records` storage and schema metadata to instance state while preserving scalar-only state compatibility.
- [x] 3.4 Implement JSON-safety validation and stable record-ID generation.
- [x] 3.5 Implement authoritative list/get/create/update/remove/block/unblock/expire context methods with permission checks and audit entries.
- [x] 3.6 Implement capacity calculation, blocked/empty/occupied states, overflow preservation, and atomic full-collection rejection.
- [x] 3.7 Implement transactional pending-record replacement and cancellation.
- [x] 3.8 Implement ordered collection migrations, rollback-on-failure, and read-only recovery for newer stored schemas.
- [x] 3.9 Add unit tests for validation, serialization, permissions, capacity changes, replacement atomicity, migrations, and downgrade safety.

## 4. Collection UI and linked activities

- [x] 4.1 Add reusable collection rendering with capacity, temporary/permanent/blocked badges, ordering, empty states, and record details.
- [x] 4.2 Add collection search, category filters, independent scrolling, keyboard focus, and responsive layouts.
- [x] 4.3 Persist collection section/search/filter presentation per client without world-state writes.
- [x] 4.4 Add record-action dispatch through the public plugin context.
- [x] 4.5 Add stable managed Item/Activity resolution and a repair state when linked content is missing.
- [x] 4.6 Add UI tests or deterministic render fixtures for large, empty, blocked, temporary, and missing-link collections.

## 5. Secure target selection and rules timing

- [x] 5.1 Add weapon/activity-specific qualifying opportunity records with stable event IDs, target identity, combat/world anchor, TTL, and single-use state.
- [x] 5.2 Normalize dnd5e and Midi-QOL attack/kill hooks so duplicate delivery cannot create duplicate opportunities.
- [x] 5.3 Add GM-authoritative socket requests that revalidate owner, actor, target, managed weapon, trigger, TTL, and once-per-turn rules.
- [x] 5.4 Build eligible feature extraction for Items, Activities, spell groups, legendary/lair/class features, and supported actor traits.
- [x] 5.5 Implement opaque redacted player descriptors and tests proving private actor data never crosses the socket boundary.
- [x] 5.6 Add the direct player feature picker and validated category chooser.
- [x] 5.7 Implement authoritative target saving throws, normalized capture settlement, and idempotent duplicate response handling.
- [x] 5.8 Implement non-destructive supported Item/Activity suppression plus visible fallback suppression effects.
- [x] 5.9 Add persisted game-time/combat-time anchors for ten-round, 60-world-second, transform-bound, and manual expiry.
- [x] 5.10 Reconcile overdue opportunities, records, and suppressions on ready, combat changes, world-time changes, attachment open, and GM recovery.
- [ ] 5.11 Add tests for private targets, no-GM behavior, wrong-weapon rejection, save outcomes, suppression restoration, reload recovery, and missing source documents.

## 6. Managed compendia, installer, and DDB repair

- [x] 6.1 Define stable managed keys, content/template versions, source hashes, and owned-versus-preserved field policies.
- [x] 6.2 Add Actor, Item, and Macro compendium packs to the module manifest and build pipeline.
- [x] 6.3 Implement installer preview and change reports before any world mutation.
- [x] 6.4 Implement idempotent creation and reconciliation by stable managed key.
- [x] 6.5 Restrict automatic duplicate removal to documents sharing the same Hero Engine managed key.
- [x] 6.6 Implement linked UUID repair, user-field preservation, ownership mirroring, and canonical-state preservation.
- [x] 6.7 Implement a DDB-refresh repair mode that restores missing weapon/features/activities without touching unrelated imported content.
- [x] 6.8 Enforce recorded backup evidence before live actor curation or installed-module deployment.
- [ ] 6.9 Add dry-run, first-install, repeated-reconcile, version-upgrade, DDB-collision, missing-item, and ownership tests.

## 7. Artwork, localization, and content templates

- [x] 7.1 Define a consistent basalt/thunder/stolen-gold visual brief and asset dimensions for all generated content.
- [x] 7.2 Generate, review, crop, and optimize Skeldr portrait and transparent token WebP assets.
- [x] 7.3 Generate and optimize the Ladrão da Décima Vida weapon artwork.
- [x] 7.4 Generate and optimize Ultimate Thar’gunn portrait/token artwork.
- [x] 7.5 Generate and optimize the moving March field aura asset.
- [x] 7.6 Generate and optimize Hollow Echo category icon assets.
- [x] 7.7 Generate and optimize Nameless Sovereign narrative artwork.
- [x] 7.8 Store asset prompts/metadata and add a bundle-size/no-remote-asset check.
- [x] 7.9 Author matching pt-BR and English localization for every addon control, rule, activity, prompt, adjudication, installer report, and recovery state.
- [x] 7.10 Add localization parity validation and raw-key detection.

## 8. Thar’gunn weapon, progression, and Hollow Echoes

- [x] 8.1 Create the built-in character plugin with the selected fresh level-1 initial state and versioned state migration.
- [x] 8.2 Implement GM-milestone weapon levels and configurable default slot/charge progression.
- [x] 8.3 Create the single attuned Ladrão da Décima Vida template with halberd, greataxe, and giant-throw activities and form selection.
- [x] 8.4 Implement qualifying-living-blood detection, dawn refill, flag reset, and no-blood result.
- [x] 8.5 Implement normal weapon-specific natural-20/kill Siphon opportunities and the configurable Charisma save DC.
- [x] 8.6 Define validated Echo categories, level eligibility, default charge costs, soul-damage tiers, and high-tier Debt behavior.
- [x] 8.7 Implement temporary normal/Ultimate Echoes and death-before-expiry permanent conversion.
- [x] 8.8 Implement generated Echo feature items/activities while keeping structured records authoritative.
- [x] 8.9 Implement atomic Echo use: cost, activity, Hunger, resistance-ignoring soul damage, Debt, and high-tier permanent-Hunger ruling.
- [x] 8.10 Implement full-slot pending capture, player-selected erasure, Wisdom save, and transactional replacement.
- [x] 8.11 Implement all six erasure consequences, including GM adjudication for the erased ability manifesting against Thar’gunn.
- [ ] 8.12 Add unit/integration tests for every weapon level, category, capture outcome, expiry, conversion, Echo cost, damage tier, and erasure result.

## 9. Drawbacks, field, legends, rite, and recovery

- [x] 9.1 Implement separate temporary/permanent Hunger pools, combined thresholds, long-rest clearing, and GM permanence decisions.
- [x] 9.2 Implement the unbroken-bond 3/5/7/10 threshold workflows.
- [x] 9.3 Implement liberation conversion to Legend’s Weight with equivalent self-imposed threshold behavior and no direct Sovereign control.
- [x] 9.4 Implement Essence Debt, reversible `-10 max HP` per point, and narrative warnings at three and five.
- [x] 9.5 Implement GM-only named Recorded Legend entries and counter derivation.
- [x] 9.6 Implement the Rite prerequisite checklist, three DC-25 checks, two-of-three result, failure costs, natural-one escalation, and success transition.
- [x] 9.7 Implement Field of the Tenth March spend-all activation, aura duration, long-rest locks, and normal/Ultimate rules.
- [x] 9.8 Implement the moving 165-foot core aura plus optional Sequencer rendering and guided exit-save action.
- [x] 9.9 Implement the selective GM purification/recovery dialog and reversible managed effects.
- [ ] 9.10 Add tests for rests, permanent marks, every threshold, Debt HP changes, Legend awards, rite branches, field locks, and selective recovery.

## 10. Skeldr companion

- [x] 10.1 Create the managed Huge 3×3 Skeldr actor/token template and stable character link.
- [x] 10.2 Mirror Thar’gunn owner permissions onto Skeldr without removing unrelated GM permissions.
- [x] 10.3 Implement configurable scaling from Thar’gunn level/proficiency and weapon level while preserving HP percentage on reconcile.
- [x] 10.4 Author horn, thunder charge/trample, earthshaking control, and protective reaction activities.
- [x] 10.5 Implement presence detection, difficult-terrain interaction, protective-control advantage, and once-per-short-rest Hunger prevention.
- [x] 10.6 Implement zero-HP thunder absence, persisted `1d4` game-day return, and GM early-return-through-legend workflow.
- [x] 10.7 Implement Ultimate speed, terrain, opportunity-attack, point-movement, and ally-rescue enhancements.
- [ ] 10.8 Add tests for scaling, ownership, presence, protection cooldown, defeat idempotency, world-time return, and early return.

## 11. Native level-20 Ultimate

- [x] 11.1 Back up and rebuild the managed `Thar’gunn - Ultimate` template as a clean native level-20 barbarian form.
- [x] 11.2 Fix transform HP-percentage capture to occur before actor swap and preserve Hero Engine flags/links across transform/revert.
- [x] 11.3 Implement the hard Rage/Skeldr/attunement/long-rest checklist and audited GM override.
- [x] 11.4 Implement player-selected Wisdom/Charisma access save and bond-broken bypass.
- [x] 11.5 Implement Marcha Usurpada, two starting Fractures, GM first-Echo selection, natural-one first-turn addon lock, GM takeover panel, and automatic unlock.
- [x] 11.6 Implement five-Thar’gunn-turn lifecycle, reload/combat-removal recovery, and safe manual end.
- [x] 11.7 Apply and clean up Huge size, +10-foot reach, resistance exceptions, mythic weapon presentation, and Skeldr enhancements.
- [x] 11.8 Implement three Legendary Points at turn start, expiry of unspent points, and state-gated action visibility.
- [x] 11.9 Link one-point Skeldr movement and Mighty Impel actions.
- [x] 11.10 Implement the configurable two-point provisional weapon strike defaulting to `4d12 force + 4d12 thunder`.
- [x] 11.11 Link the two-point Echo action, three-point second Siphon, and three-point Skeldr ally-at-1-HP action.
- [x] 11.12 Track Skeldr movement, arm Thunderous Step at 20 feet, and implement normal/Gargantuan outcomes once per turn.
- [x] 11.13 Implement once-per-turn Ultimate Siphon and the paid second-use allowance.
- [x] 11.14 Implement every Name Fracture trigger with duplicate-event protection.
- [x] 11.15 Implement expiry damage and the 3/5/7/10 consequences, including GM slot selection and identity ruling.
- [x] 11.16 Isolate chassis provider/version and provisional strike configuration for future official Ascended migration.
- [ ] 11.17 Add tests for prerequisite failures, overrides, save branches, every turn boundary, crash/reload/revert, points, techniques, Fractures, and expiry settlement.

## 12. Mechanics window, configuration, and macros

- [x] 12.1 Build the Thar’gunn Mechanics window sections for weapon/charges, Echoes, drawbacks, Legends/rite, Skeldr, Ultimate checklist/state, field, actions, and recovery.
- [x] 12.2 Apply the basalt/thunder/stolen-gold theme and responsive, scroll-safe, keyboard-usable controls.
- [x] 12.3 Add GM world-default and client-scoped theme settings with client → world → built-in precedence.
- [ ] 12.4 Expose every selected numeric formula, dice formula, threshold, duration, scaling value, and provisional chassis value through grouped GM configuration and per-actor overrides.
- [x] 12.5 Create real dnd5e feature/weapon activities and ensure the Mechanics window launches the same managed workflows.
- [x] 12.6 Create installable macros for opening mechanics, Siphon, Ultimate activation, and selected frequent actions using stable runtime resolution.
- [ ] 12.7 Add UI regression tests/fixtures for themes, search/filter, blocked/temporary Echoes, checklist errors, GM rulings, Save/Cancel, scroll, and persisted sections.

## 13. Automated verification

- [ ] 13.1 Run the full Vitest suite and add coverage for every new pure formula, state transition, migration, and timing function.
- [x] 13.2 Run TypeScript checking, public declaration generation, plugin import guard, and production build.
- [ ] 13.3 Validate all OpenSpec scenarios against automated or named manual test coverage.
- [x] 13.4 Verify existing Presa, Deimos, and example plugins remain compatible with the extended API and state schema.
- [ ] 13.5 Test socket security and idempotency with GM/owner/non-owner client simulations.
- [x] 13.6 Test managed installer/reconcile/repair and state migration against disposable fixtures.
- [x] 13.7 Confirm built artifacts contain no external runtime asset URLs, raw localization keys, or source-only imports.

## 14. Live deployment, actor curation, and browser proof

- [x] 14.1 Build the release candidate and verify recorded backups before replacing the installed module.
- [x] 14.2 Deploy to the Foundry module folder, restart/reload safely, and verify the module version/compatibility metadata shown by Foundry.
- [x] 14.3 Run installer preview against cloned Thar’gunn actors and verify no unrelated content would change.
- [ ] 14.4 Exercise fresh attach, all three weapon forms, blood/dawn recharge, normal capture, temporary expiry, permanent conversion, full-slot erasure, and repair on clones.
- [ ] 14.5 Exercise Hunger, Debt, Legend, rite, field, Skeldr defeat/return, purification, and DDB-repair workflows on clones.
- [ ] 14.6 Exercise normal and Usurped Ultimate activation, five-turn swap, every point action, Thunderous Step, Ultimate Siphon, Fracture settlement, reload recovery, and revert on clones.
- [ ] 14.7 Use T3 browser control to repeat the required GM and player end-to-end workflows and capture screenshots/recordings as evidence.
- [ ] 14.8 Rehearse module and actor rollback, then restore the release candidate and verify state integrity.
- [x] 14.9 Review and confirm the real-actor curation plan, then apply it in place to backed-up `Thar’gunn` and `Thar’gunn - Ultimate`, create/link Skeldr, and preserve intended ownership/inventory/biography.
- [x] 14.10 Repeat critical T3 browser workflows on the real actors and verify the player’s macros and sheet activities.

## 15. Version, publish, and readback

- [x] 15.1 Update module version, compatibility metadata, changelog, README/plugin guide, and release notes with the new capabilities and migration warnings.
- [x] 15.2 Confirm every quality gate and backup/rollback reference is recorded before publication.
- [x] 15.3 Commit the intentional source, OpenSpec, tests, compendia, generated assets, and documentation changes without local backup or secret files.
- [x] 15.4 Push the repository branch and create the GitHub release with `module.json` and `hero-engine.zip` assets.
- [x] 15.5 Download and inspect the published manifest and archive, verify checksums/content/version, and confirm Foundry can discover the released version.
