## ADDED Requirements

### Requirement: Target workflows are GM-authoritative
Hero Engine SHALL resolve private hostile-actor feature selection and mutation on an active authoritative GM client. Player requests SHALL identify a validated mechanic opportunity and target but SHALL NOT contain authoritative source data supplied by the player.

#### Scenario: Owner starts a target workflow
- **WHEN** an actor owner uses a valid unconsumed target opportunity while an authoritative GM is online
- **THEN** the GM client revalidates the opportunity and creates a short-lived selection session

#### Scenario: No GM is available
- **WHEN** an owner starts a private-target workflow without an authoritative GM client
- **THEN** Hero Engine leaves the opportunity unconsumed and informs the player that GM authority is required

### Requirement: Players receive only redacted eligible choices
The authoritative client SHALL extract eligible embedded Items, Activities, supported spellcasting groups, and supported actor traits. It SHALL send the player only opaque choice IDs, player-safe names, types, activation summaries, and redacted descriptions. Private descriptions, GM notes, hidden statistics, document UUIDs, and the complete target actor SHALL remain undisclosed.

#### Scenario: Private NPC feature list is requested
- **WHEN** a player lacks observer permission for the target actor
- **THEN** the returned socket payload contains only redacted eligible descriptors and opaque IDs

#### Scenario: Payload is inspected
- **WHEN** a secure-target-selection response is logged or examined on the player client
- **THEN** it contains no full target document, private description, GM note, secret statistic, or reusable source UUID

### Requirement: Opportunities are specific, short-lived, and single-use
An opportunity SHALL record attacker, target, mechanic, managed item/activity, trigger kind, combat/world-time anchor, and consumption state. The authoritative client SHALL reject opportunities with a mismatched actor, target, item, expired anchor, ineligible trigger, violated once-per-turn limit, or prior consumption.

#### Scenario: Duplicate socket delivery
- **WHEN** the same valid selection settlement arrives more than once
- **THEN** Hero Engine creates at most one record, applies at most one suppression, and reports the previously completed result

#### Scenario: Wrong weapon is used
- **WHEN** a critical hit or kill was produced by an attack other than the managed mythic weapon activity
- **THEN** Hero Engine does not create a Siphon opportunity

### Requirement: Direct player selection uses validated classification
After a failed target save, the player SHALL select the source feature and one category allowed by the current mechanic state. Hero Engine SHALL derive default cost, soul-damage tier, Debt behavior, and restrictions from that category and SHALL reject categories that the current weapon level cannot store.

#### Scenario: Allowed category is selected
- **WHEN** the player selects an eligible source and a category permitted at the current weapon level
- **THEN** Hero Engine creates a normalized pending or stored record using the configured defaults for that category

#### Scenario: Disallowed legendary category is selected at weapon level one
- **WHEN** the player attempts to classify a feature above the weapon’s unlocked scale
- **THEN** Hero Engine rejects the classification and keeps the selection session available for a valid choice

### Requirement: Target saves use authoritative target data
The target’s saving throw SHALL use the current authoritative actor and the mechanic’s configured DC. The result, natural d20, total, DC, selected ability, and user SHALL be recorded and posted without revealing unrelated target data.

#### Scenario: Target fails the Charisma save
- **WHEN** the authoritative Charisma save total is below the Siphon DC
- **THEN** Hero Engine permits feature selection and proceeds to record creation and suppression

#### Scenario: Target succeeds
- **WHEN** the authoritative save succeeds
- **THEN** no Echo or suppression is created and the opportunity is consumed with a visible failure-to-capture result

### Requirement: Supported target abilities are suppressed reversibly
For supported embedded Items or Activities, Hero Engine SHALL disable only the selected ability without deleting it and SHALL record its previous state. Unsupported traits SHALL receive a visible named suppression effect and GM warning. Cleanup SHALL restore the exact prior supported state.

#### Scenario: Embedded activity is suppressible
- **WHEN** a captured source maps to a supported dnd5e Item or Activity
- **THEN** Hero Engine disables that source for the configured game-time duration and restores its previous state at expiry

#### Scenario: Actor trait is not technically suppressible
- **WHEN** a selected source cannot be disabled safely through the document API
- **THEN** Hero Engine applies a named suppression marker, tells the GM what remains manual, and never deletes source data

### Requirement: One-minute suppression uses game time
A normal surviving-target suppression SHALL last one minute of game time: ten complete combat rounds in combat or 60 seconds of Foundry world-time advancement outside combat. An Ultimate suppression SHALL last until that Ultimate ends. Real time SHALL NOT advance either duration.

#### Scenario: Combat completes ten rounds
- **WHEN** ten complete rounds pass after a normal suppression at its initiative anchor
- **THEN** the target ability is restored and the corresponding temporary record expires

#### Scenario: Ultimate ends after five Thar’gunn turns
- **WHEN** an ability was suppressed by Ultimate Siphon and Thar’gunn’s fifth transformed turn ends
- **THEN** the target ability is restored unless a valid permanent conversion occurred

### Requirement: Death can convert a temporary capture to permanent
If a suppressed target dies before suppression expiry, Hero Engine SHALL allow the temporary capture to become a permanent record only when the plugin’s permanence conditions and capacity workflow succeed. Otherwise it SHALL preserve the temporary record until ordinary expiry and then remove it.

#### Scenario: Target dies with an empty permanent slot
- **WHEN** the target dies before expiry and an unblocked permanent slot is available
- **THEN** Hero Engine offers conversion and stores the record permanently when confirmed

#### Scenario: Target dies with full permanent slots
- **WHEN** the target dies before expiry and no permanent slot is available
- **THEN** Hero Engine starts the plugin’s pending replacement workflow without erasing a record automatically

### Requirement: Suppression recovery is idempotent and GM-repairable
Hero Engine SHALL reconcile suppressions on combat changes, world-time changes, actor/item updates, module ready, and GM recovery. Repeated cleanup SHALL be harmless, and missing targets or changed source documents SHALL produce an actionable GM report.

#### Scenario: World reloads during suppression
- **WHEN** the world reloads before suppression expiry
- **THEN** Hero Engine restores the schedule from persisted state and later performs cleanup once

#### Scenario: Source item was deleted during suppression
- **WHEN** cleanup cannot resolve the original source item
- **THEN** Hero Engine closes the suppression record, removes its marker if present, and reports the unresolved restoration detail to the GM
