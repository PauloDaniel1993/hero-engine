## ADDED Requirements

### Requirement: Hero Engine ships versioned managed compendia
The module SHALL ship versioned Actor, Item, and Macro compendia for Thar’gunn content. Every managed template and created world document SHALL carry a stable managed key, content version, template version, and source hash.

#### Scenario: Module is installed in a new world
- **WHEN** a GM opens the Thar’gunn installer in a world without its content
- **THEN** the installer resolves all required templates from module compendia and can create the complete managed document set

### Requirement: Install and reconcile operations are previewable and idempotent
The installer SHALL calculate and display a plan before writing. Re-running an unchanged plan SHALL create no duplicates and SHALL not reset mechanic state, user-editable fields, ownership, hotbar assignments, or audit history.

#### Scenario: First installation
- **WHEN** the GM confirms a preview containing missing managed documents
- **THEN** Hero Engine creates each stable managed key once, records the result, and links the created documents

#### Scenario: Reconcile is run twice
- **WHEN** a completed installation is reconciled again without template changes
- **THEN** the second preview reports no content mutations

### Requirement: Reconciliation changes only module-owned fields
Templates SHALL distinguish module-owned fields from user-editable fields. Reconciliation SHALL update module-owned rules, activities, flags, localization references, and asset paths while preserving declared user-editable names, biography, notes, inventory, HP, ownership additions, and other unrelated data.

#### Scenario: User edited a preserved field
- **WHEN** a newer template is reconciled after the user changed a declared user-editable field
- **THEN** the user value remains and the report identifies it as preserved

#### Scenario: Managed activity is outdated
- **WHEN** a managed activity’s content version is older than the template
- **THEN** reconciliation updates the owned activity fields and retains unrelated item data

### Requirement: Unknown and DDB-managed content is never automatically deleted
Hero Engine SHALL remove duplicates automatically only when multiple documents carry the same Hero Engine managed key. Suspected DDB or user duplicates without that key SHALL require a separate reviewed curation plan after backup.

#### Scenario: DDB creates a similar item
- **WHEN** a DDB refresh creates an untagged item with the same display name as a managed item
- **THEN** reconciliation leaves it untouched and reports the collision for review

#### Scenario: Two managed copies share a key
- **WHEN** duplicate module-created documents carry the same managed key
- **THEN** reconciliation selects the canonical document deterministically, repairs references, and can remove only the redundant managed copy after preview confirmation

### Requirement: Backup is mandatory before live curation or deployment
The workflow SHALL require actor JSON exports, a world/module backup, installed-module manifest and per-file hashes, and a timestamped module rollback copy before changing live actors or replacing the installed build. It SHALL record where each backup can be restored from.

#### Scenario: Backup evidence is missing
- **WHEN** a GM attempts live actor curation or module deployment without recorded backup evidence
- **THEN** the workflow blocks the mutation and identifies the missing backup

### Requirement: DDB refresh repair restores managed content
Hero Engine SHALL provide a repair operation that recreates missing managed items or activities, refreshes links by stable key, preserves canonical mechanic state, and mirrors required ownership after a DDB Importer refresh.

#### Scenario: DDB removed the mythic weapon item
- **WHEN** canonical state remains but the managed weapon is missing after import
- **THEN** repair recreates the weapon from the current template and relinks records and macros without resetting state

### Requirement: Linked actor ownership follows Thar’gunn
The managed Ultimate form and Skeldr actor SHALL mirror Thar’gunn’s non-default owner permissions while retaining GM ownership. Reconciliation SHALL add or update required mirrored ownership but SHALL not remove unrelated GM permissions silently.

#### Scenario: Thar’gunn gains a new owner
- **WHEN** reconciliation runs after a user receives owner permission on Thar’gunn
- **THEN** the linked Ultimate and Skeldr actors receive equivalent usable ownership

### Requirement: Managed macros resolve by stable keys
The module SHALL provide installable hotbar macros for opening the Mechanics window, attempting Siphon, activating the Ultimate, and accessing frequent actions. Macros SHALL resolve the controlled token or owned actor and managed content at execution time rather than embedding world-specific actor, item, or activity IDs.

#### Scenario: Actor document ID changes
- **WHEN** a managed actor is recreated and a player runs an installed macro
- **THEN** the macro resolves the current actor or managed link and continues working without manual ID edits

### Requirement: Localization and artwork are packaged locally
All managed content and installer UI SHALL have complete pt-BR and English localization. Skeldr, the weapon, Ultimate form, March aura, Echo categories, and Nameless Sovereign SHALL use packaged optimized WebP assets with no remote runtime dependency.

#### Scenario: World language changes
- **WHEN** the world switches between pt-BR and English
- **THEN** managed controls, item rules, prompts, and chat output use the selected locale without missing keys

#### Scenario: Internet is unavailable
- **WHEN** Foundry runs without internet access
- **THEN** every managed portrait, token, icon, and aura remains available from the installed module

### Requirement: Complete installed-module drift is ported to source
Before the feature build replaces the live module, the repository SHALL contain every intentional installed manifest/version/compatibility, runtime, CSS, and localization change. Generated bundle patches SHALL be represented in TypeScript or source assets, not preserved only by copying the bundle.

#### Scenario: Baseline source build is deployed
- **WHEN** the reconciled repository is built and deployed before Thar’gunn feature work
- **THEN** browser tests confirm the existing GM scene-control button, searchable actor and item pickers, category filters, Save/Cancel behavior, mechanics launcher/popout, and open-section persistence remain available

### Requirement: Release requires all quality gates
Publishing SHALL occur only after unit/integration tests, typecheck/import guard, production build, backup verification, live GM/player smoke tests, T3 browser-controlled end-to-end tests, DDB repair simulation, reload recovery, and rollback rehearsal pass.

#### Scenario: A browser workflow fails
- **WHEN** any required browser-controlled capture, Ultimate, expiry, recovery, or UI regression test fails
- **THEN** the release workflow stops before commit, push, or GitHub release publication

#### Scenario: All gates pass
- **WHEN** every required gate passes on the release candidate
- **THEN** the workflow may version, commit, push, package, publish, and read back the GitHub release artifacts
