## ADDED Requirements

### Requirement: Plugins can declare structured record collections
Hero Engine SHALL extend the public plugin contract with record collection definitions that declare a stable collection ID, localization keys, schema version, capacity formula, visibility, ordering, lifecycle policy, and permitted record actions. Registration SHALL reject duplicate IDs, invalid formulas, unsupported schemas, or action references.

#### Scenario: Valid collection registers
- **WHEN** a plugin declares a collection with a unique ID, valid capacity formula, supported record schema, and valid actions
- **THEN** Hero Engine registers the plugin and exposes the collection through the public API and generated UI

#### Scenario: Invalid collection is isolated
- **WHEN** a plugin declares an invalid collection or references an unknown record action
- **THEN** Hero Engine rejects that plugin with an exact validation path and continues loading other plugins

### Requirement: Record state is versioned and JSON-safe
Hero Engine SHALL persist collection records under the attachment’s authoritative state document using JSON-safe data, stable record IDs, a state schema version, per-collection schema versions, and an audit trail. Existing scalar-only state SHALL remain readable.

#### Scenario: Existing attachment gains collections
- **WHEN** an attachment created before record collections is loaded after the upgrade
- **THEN** Hero Engine migrates it to the current schema without changing existing tracker, resource, stance, transform, cooldown, flag, or audit values

#### Scenario: Non-serializable data is rejected
- **WHEN** a plugin attempts to store a Foundry document, function, cyclic object, or other non-JSON-safe value in a record
- **THEN** the mutation is rejected without changing the persisted collection

### Requirement: Record mutations are atomic, permission-aware, and audited
Hero Engine SHALL provide public context methods to list, get, create, update, remove, block, unblock, and expire records. Actor owners MAY request permitted actions, but authoritative writes SHALL occur on the authoritative client and SHALL record the user, timestamp, source, and before/after summary.

#### Scenario: Owner creates a permitted record
- **WHEN** an actor owner completes a plugin-authorized record creation workflow
- **THEN** the authoritative client validates and writes the record once and appends an audit entry

#### Scenario: Unauthorized mutation is rejected
- **WHEN** a non-owner and non-GM attempts a record mutation or an owner attempts a GM-only action
- **THEN** Hero Engine rejects the request and leaves state unchanged

### Requirement: Capacity and blocked slots are enforced
Hero Engine SHALL evaluate collection capacity from the current actor, mechanic state, and resolved configuration. It SHALL distinguish occupied, empty, and blocked capacity and SHALL prevent an ordinary create operation from exceeding usable capacity.

#### Scenario: Collection is full
- **WHEN** a create operation targets a collection with no unblocked empty capacity
- **THEN** Hero Engine returns a full-capacity result without deleting or replacing any record

#### Scenario: Capacity increases
- **WHEN** a tracker or configuration change increases a collection’s capacity
- **THEN** existing records remain stable and the newly available slots become usable immediately

#### Scenario: Capacity decreases below occupancy
- **WHEN** a capacity formula decreases below the number of existing records
- **THEN** Hero Engine preserves every record, marks the overflow as unavailable, and requires an explicit management workflow before additional records can be created

### Requirement: Replacement workflows preserve pending records
Hero Engine SHALL allow a plugin to hold a proposed record as pending while a user selects an existing record for removal. The replacement SHALL be transactional: cancellation or a failed prerequisite leaves the original collection unchanged, while successful settlement removes exactly the selected record and inserts exactly the pending record.

#### Scenario: Replacement is cancelled
- **WHEN** a user cancels a full-collection replacement workflow
- **THEN** the pending record is discarded or retained according to plugin policy and no existing record is removed

#### Scenario: Replacement succeeds
- **WHEN** the plugin’s replacement prerequisites and consequences resolve successfully
- **THEN** Hero Engine removes the chosen record, creates the pending record in the freed slot, and records both changes in one audit settlement

### Requirement: Records support game-time and combat-time lifecycle anchors
Record lifecycle metadata SHALL support absolute Foundry world-time expiry, combat round/turn anchors, transform-bound expiry, and manual expiry. Wall-clock time SHALL NOT determine rules expiry.

#### Scenario: Ten-round combat expiry
- **WHEN** a record is configured for one minute in combat and ten complete rounds pass at its initiative anchor
- **THEN** Hero Engine expires the record exactly once

#### Scenario: Sixty seconds of world time
- **WHEN** a one-minute record exists outside combat and Foundry world time advances by 60 seconds
- **THEN** Hero Engine expires the record even if more or less than 60 real seconds passed

#### Scenario: Reload after overdue expiry
- **WHEN** the world reloads after a persisted record’s game-time deadline
- **THEN** Hero Engine reconciles and expires it once without duplicating cleanup effects

### Requirement: Generated collection UI is usable and stateful
Hero Engine SHALL render declared collections in the Mechanics window with localized titles, capacity, search, filters, ordering, empty/blocked/temporary states, record details, and permitted actions. Open sections, search text, and filter choices SHALL persist per client without mutating world state.

#### Scenario: Large collection remains navigable
- **WHEN** a collection contains enough records to exceed the available window height
- **THEN** its record area scrolls independently, controls remain readable, and Save/Cancel or action controls remain reachable

#### Scenario: Client presentation persists
- **WHEN** a user reopens a Mechanics window after expanding a collection and applying a filter
- **THEN** Hero Engine restores that user’s presentation state without changing another user’s view

### Requirement: Record actions can link to managed dnd5e activities
Records SHALL be able to reference stable managed-content keys for generated or existing dnd5e Items and Activities. A record action SHALL resolve the current document at execution time and SHALL fail safely with a repair affordance when the managed document is absent or stale.

#### Scenario: Linked activity executes
- **WHEN** an owner activates a usable record whose managed dnd5e activity exists
- **THEN** Hero Engine validates record state and costs, then launches that activity through the supported dnd5e workflow

#### Scenario: Linked item was removed by an importer
- **WHEN** a record’s managed item cannot be resolved
- **THEN** Hero Engine preserves the record, blocks execution, and offers an audited reconciliation action instead of deleting data

### Requirement: Collection migrations fail safely
Each collection SHALL provide deterministic migration steps between schema versions. Hero Engine SHALL preserve the pre-migration state if any step fails and SHALL put the attachment into read-only recovery mode when stored data is newer than the running module.

#### Scenario: Migration succeeds
- **WHEN** stored collection data has an older supported schema version
- **THEN** Hero Engine migrates it in order, validates the result, persists the new version, and appends a migration audit entry

#### Scenario: Downgrade encounters newer data
- **WHEN** an older Hero Engine build loads attachment state written by a newer unsupported schema
- **THEN** it does not overwrite the state and shows the GM how to restore a compatible module or backup
