## ADDED Requirements

### Requirement: The addon initializes a fresh character-owned mechanic
The Thar’gunn addon SHALL be a built-in character mechanic whose canonical state is stored on Thar’gunn. First attachment SHALL initialize weapon level 1, five charges, three empty permanent Echo slots, no temporary Echoes, zero temporary/permanent Hunger, zero Essence Debt, zero Recorded Legends, zero Name Fractures, an unbroken bond, Skeldr present, and the Ultimate ready.

#### Scenario: Fresh attachment
- **WHEN** the GM attaches the addon to Thar’gunn for the first time
- **THEN** Hero Engine creates the selected fresh state once and links the managed weapon, level-20 form, and Skeldr without storing canonical state on those documents

### Requirement: Weapon advancement is a GM milestone
The weapon SHALL have five GM-controlled levels with default capacity and maximum charges `(1: 3/5, 2: 4/6, 3: 5/7, 4: 6/8, 5: 7/10)`. Level changes SHALL be audited and SHALL immediately recalculate capacity and eligible Echo categories without deleting records.

#### Scenario: GM advances to level two
- **WHEN** the GM changes the weapon from level 1 to level 2
- **THEN** maximum charges become six, capacity becomes four, and level-2 categories become available while existing state remains intact

### Requirement: Ladrão da Décima Vida is one attuned multi-form item
The installer SHALL replace the standard Nine Lives Stealer presentation with one managed mythic weapon named `Ladrão da Décima Vida` in pt-BR and `Thief of the Tenth Life` in English. It SHALL require attunement and provide selectable halberd, greataxe, and giant-throw attack activities without moving mechanic state between items.

#### Scenario: Player changes weapon form
- **WHEN** the owner selects a different weapon form
- **THEN** the active attack presentation and activity change while attunement, charges, Echoes, cooldowns, and audit history remain unchanged

### Requirement: Dawn recharge requires living blood
The weapon SHALL set `blood since dawn` only when an attuned managed weapon activity deals damage to a qualifying living creature. At dawn it SHALL refill charges to the current maximum only when that flag is set, then clear the flag. Constructs, incorporeal creatures, and creatures without meaningful living blood SHALL not qualify by default.

#### Scenario: Weapon tasted qualifying blood
- **WHEN** the weapon damaged a qualifying living creature since the prior dawn and the next configured dawn occurs
- **THEN** charges refill to maximum and the blood flag resets

#### Scenario: No qualifying blood
- **WHEN** the next dawn occurs without a qualifying damage event
- **THEN** charges do not refill and the reason is posted or logged

### Requirement: Normal Essence Siphon creates weapon-specific opportunities
On a natural 20 hit or when the managed weapon reduces a creature to 0 HP, the owner SHALL be offered Essence Siphon. Its default Charisma save DC SHALL be `8 + Thar’gunn proficiency bonus + Thar’gunn Strength modifier`. Using Siphon SHALL require an attuned weapon, an eligible target, an unlocked Siphon state, and an unconsumed qualifying opportunity.

#### Scenario: Qualifying natural 20
- **WHEN** Thar’gunn rolls a natural 20 and hits with a managed mythic-weapon activity
- **THEN** Hero Engine creates one Siphon opportunity for the actual target

#### Scenario: Unrelated attack is critical
- **WHEN** Thar’gunn critically hits with an unarmed strike or another weapon
- **THEN** no mythic-weapon Siphon opportunity is created

### Requirement: The player directly selects and classifies a captured ability
After a failed target save, the player SHALL select one redacted eligible source and one category validated against weapon level. Default categories and costs SHALL include: common trait/special attack/movement `1`; powerful reaction/special resistance/special sense `2`; Multiattack `2`; recharge ability `2–3`; Legendary Resistance `3`; Legendary Action `3`; Lair Action `4`; stolen spell `1 per spell level`; divine/artifact/central ability `5` plus Essence Debt. All mappings SHALL be GM-configurable.

#### Scenario: Level-one common capture
- **WHEN** a level-1 weapon captures a common movement or special attack and the player selects its allowed category
- **THEN** the created Echo defaults to a one-charge cost and minor soul-damage tier

#### Scenario: Level-one legendary capture is attempted
- **WHEN** the player selects a legendary category while the weapon is level 1
- **THEN** the category is rejected and the player must choose an unlocked category

### Requirement: Surviving-target Echoes are temporary
A normal captured Echo from a surviving target SHALL expire after one minute of game time; an Ultimate capture SHALL expire when the Ultimate ends. It SHALL become permanent only if the target dies before expiry and a permanent-slot workflow succeeds.

#### Scenario: Surviving normal target
- **WHEN** a target survives the failed normal Siphon save
- **THEN** the Echo appears in the temporary collection and both Echo and suppression expire after ten combat rounds or 60 seconds of world time

#### Scenario: Target dies before expiry
- **WHEN** the suppressed target dies before the temporary Echo expires
- **THEN** Hero Engine offers permanent conversion and applies the permanent capacity/replacement rules

### Requirement: Echo use pays all configured prices atomically
Using an Echo SHALL validate its blocked/expiry state and available charges, spend its configured charges, add one temporary Hunger, apply category soul damage that ignores resistance and immunity, and add one Essence Debt for legendary-divine/artifact/central categories configured to incur Debt. A high-tier use SHALL let the GM decide whether the gained Hunger becomes permanent.

Default soul damage SHALL be `2d10` minor, `4d10` strong, `6d10` legendary, and `8d10` mythic/divine/artifact/central. The activity result, costs, Hunger, Debt, and damage SHALL settle once or not at all except where the launched dnd5e workflow was explicitly cancelled before settlement.

#### Scenario: Minor Echo is used
- **WHEN** an owner uses an available one-charge minor Echo
- **THEN** one charge is spent, temporary Hunger increases by one, `2d10` resistance-ignoring soul damage is rolled and applied, and the linked activity runs

#### Scenario: Echo lacks charges
- **WHEN** an owner attempts an Echo whose cost exceeds current charges
- **THEN** no activity, damage, Hunger, Debt, or charge mutation occurs

### Requirement: Full permanent slots use chosen erasure and replacement
When a new permanent Echo qualifies and no unblocked slot is empty, Hero Engine SHALL hold it pending and let the player select an existing Echo to erase. Erasure SHALL add one Hunger and require a Wisdom save with default DC `18 + scale`, where scale is minor `0`, strong `2`, legendary `4`, and mythic/divine/central `6`. Cancellation SHALL preserve existing records.

#### Scenario: Player confirms replacement
- **WHEN** the player selects an occupied Echo and confirms erasure
- **THEN** Hero Engine resolves the erasure save/consequence and transactionally replaces exactly that Echo with the pending capture

### Requirement: Failed erasure rolls the documented consequence table
On a failed erasure save, Hero Engine SHALL roll or allow the configured table result: `1` take `6d10` psychic damage; `2` lose one Hit Die until Greater Restoration; `3` disadvantage on death saves until next long rest; `4` the erased ability manifests once against Thar’gunn; `5` Siphon remains locked until a powerful creature is killed; `6` gain one Essence Debt.

#### Scenario: Erasure consequence six
- **WHEN** an erasure save fails and the consequence roll is 6
- **THEN** Essence Debt increases by one before the pending Echo is stored

#### Scenario: Narrative manifestation result
- **WHEN** consequence 4 is rolled
- **THEN** Hero Engine queues a GM ruling that names and snapshots the erased Echo without inventing an automatic target effect

### Requirement: Field of the Tenth March spends all remaining charges
As a bonus action with at least one charge, Thar’gunn SHALL be able to activate a one-minute, 165-foot-radius moving field by spending every remaining charge. Activation SHALL add one Hunger, prevent all charge recovery until the next long rest, and disable Siphon until that rest.

Chosen creatures SHALL treat the field as magical difficult terrain; Thar’gunn and Skeldr SHALL ignore it; airborne creatures SHALL be unaffected while airborne; teleport SHALL remain functional. During the Ultimate, enemies SHALL not benefit from magical speed increases and the guided attempt-to-leave Strength save SHALL reduce speed to zero until turn end on failure.

#### Scenario: Field activates with three charges
- **WHEN** Thar’gunn activates the field with three charges remaining
- **THEN** all three charges are spent, the aura and locks begin, and the locks persist even after the one-minute aura expires until a long rest

#### Scenario: Field is attempted at zero charges
- **WHEN** the owner attempts activation with no charges
- **THEN** the action is unavailable and no Hunger or lock is applied

### Requirement: Hunger uses temporary and permanent pools
Hero Engine SHALL track temporary and permanent Hunger separately and evaluate thresholds against their sum. A long rest SHALL clear temporary Hunger but not permanent Hunger. On eligible high-tier use, the GM SHALL decide whether one gained mark becomes permanent until purification.

Default unbroken-bond thresholds SHALL be: at `3`, disadvantage on Wisdom tests against the weapon; at `5`, a GM weapon demand; at `7`, a Wisdom resistance and possible one-turn loss of control; at `10`, a GM name-fragment attempt. Thresholds and formulas SHALL be configurable.

#### Scenario: Long rest with mixed Hunger
- **WHEN** Thar’gunn completes a long rest with four temporary and one permanent Hunger
- **THEN** temporary Hunger becomes zero, permanent Hunger remains one, and the combined threshold value becomes one

### Requirement: Legend’s Weight replaces Hunger after liberation
On successful liberation, existing combined Hunger SHALL convert to Legend’s Weight and future equivalent gains SHALL use that name. The same `3/5/7/10` ladder SHALL remain mechanically significant, but direct control by the Nameless Sovereign SHALL be replaced by configurable self-imposed legendary compulsions, burdens, and memory effects.

#### Scenario: Bond breaks with five Hunger
- **WHEN** the rite succeeds while combined Hunger is five
- **THEN** the state becomes five Legend’s Weight, the level-three and level-five post-liberation thresholds are active, and direct Sovereign control outcomes are disabled

### Requirement: Essence Debt reduces maximum HP and warns at thresholds
Each Essence Debt SHALL reduce Thar’gunn’s maximum HP by 10 through a reversible managed effect. Hero Engine SHALL display narrative alerts for planar direction/resurrection risk and SHALL queue the Sovereign-speaking warning at three Debt and soul-replacement warning at five Debt without attempting to automate metaphysical outcomes.

#### Scenario: Debt increases from one to two
- **WHEN** Essence Debt becomes two
- **THEN** the managed maximum-HP penalty becomes 20 and current HP is clamped only as required by dnd5e

### Requirement: Recorded Legends are GM-awarded log entries
Only the GM SHALL award a Recorded Legend. Each award SHALL include a title, optional notes, game timestamp, and awarding GM in an immutable log entry, and SHALL update the counter derived from accepted entries.

#### Scenario: GM awards the tenth Legend
- **WHEN** the GM records the tenth qualifying deed
- **THEN** the counter becomes ten and the Rite of the Tenth Legend becomes available

### Requirement: The Rite of the Tenth Legend resolves three checks
With ten Legends, Skeldr present or validly represented, a witness requirement confirmed, and the declared ritual prerequisites satisfied, Thar’gunn SHALL roll Strength, Wisdom, and Charisma checks against configurable default DC 25. Passing at least two SHALL break the bond. Failure SHALL add two Essence Debt, block one GM-selected slot until purification, and record the failed rite. Two or more natural 1s SHALL queue the immediate true-name attempt.

#### Scenario: Two checks pass
- **WHEN** at least two of the three rite checks meet DC 25
- **THEN** the bond breaks, resurrection no longer depends on the weapon, direct weapon control is disabled, and Hunger converts to Legend’s Weight

#### Scenario: Rite fails
- **WHEN** fewer than two checks pass
- **THEN** two Essence Debt is added, a GM slot-blocking ruling is queued, and the bond remains unbroken

### Requirement: Skeldr is a scalable Huge linked combatant
The addon SHALL install and link a Huge 3×3 Skeldr companion actor with mirrored player ownership. His configurable statistics SHALL scale from Thar’gunn level/proficiency and weapon level. His normal kit SHALL include a horn attack, movement-gated thunder charge/trample, earthshaking control action, and protective reaction.

#### Scenario: Weapon level advances
- **WHEN** the weapon level changes and Skeldr is reconciled
- **THEN** derived Skeldr statistics and activity formulas update without replacing his actor, token, current HP percentage, or history

### Requirement: Skeldr anchors identity and protective use
While present, Skeldr SHALL grant advantage on weapon-control resistance when Thar’gunn is protecting someone, share immunity to the weapon’s difficult terrain, and once per short rest allow prevention of one Hunger gain when an Echo was used to protect an ally or innocent.

#### Scenario: Protective Echo use is confirmed
- **WHEN** an Echo use would add Hunger and the once-per-short-rest Skeldr protection is ready
- **THEN** the owner may invoke it, the GM or configured deterministic condition confirms protective use, and that one Hunger gain is prevented

### Requirement: Skeldr becomes thunder-absent at zero HP
At 0 HP, Skeldr SHALL not die normally. He SHALL become absent, roll a persisted `1d4` game-day return time, disable presence-dependent actions, and return when world time reaches the deadline or the GM approves an early protective legendary deed.

#### Scenario: Skeldr reaches zero HP
- **WHEN** Skeldr’s HP crosses from above zero to zero
- **THEN** Hero Engine records thunder absence and a game-time return deadline exactly once

### Requirement: Ultimate activation uses a hard checklist and cooldown
The Ultimate SHALL be a bonus-action workflow usable once per long rest. It SHALL require detected Rage, Skeldr presence, attunement to the managed weapon, and a ready cooldown. Missing prerequisites SHALL disable activation and identify each failure. A GM MAY override with a required audit reason.

#### Scenario: One prerequisite is missing
- **WHEN** the weapon is not attuned but every other prerequisite is satisfied
- **THEN** activation remains disabled and identifies weapon attunement as missing

### Requirement: Access save uses player-selected Wisdom or Charisma
If the bond is unbroken, the player SHALL choose Wisdom or Charisma for the access save against default DC `24 + Essence Debt - Recorded Legends`. A successfully completed liberation rite SHALL skip this save.

On failure, the Ultimate SHALL still activate as Marcha Usurpada with two starting Name Fractures and the first Echo chosen by the GM. If the failed roll is a natural 1, Hero Engine SHALL lock player addon actions for Thar’gunn’s first Ultimate turn, expose a GM takeover panel, and unlock automatically at turn end without changing actor ownership.

#### Scenario: Access save succeeds
- **WHEN** the selected saving throw meets the calculated DC
- **THEN** the normal Ultimate form activates without Usurped penalties

#### Scenario: Natural-one failure
- **WHEN** the selected save fails with a natural 1
- **THEN** Marcha Usurpada starts with two Fractures, GM first-Echo choice, and first-turn addon lock

### Requirement: The prepared form is a native level-20 hybrid swap
The addon SHALL rebuild and use `Thar’gunn - Ultimate` as a native level-20 barbarian form. It SHALL retain native level-20 proficiency, Rage, mastery, HP, and class features while adding the custom Ultimate rules. The swap SHALL preserve canonical Hero Engine state and revert safely after the end of Thar’gunn’s fifth transformed turn.

#### Scenario: Fifth transformed turn ends
- **WHEN** Thar’gunn ends his fifth turn after activation
- **THEN** the Ultimate expires, the original form returns, target suppressions settle, unspent points disappear, and Fracture consequences begin

### Requirement: Ultimate form applies its custom statistics
While transformed, Thar’gunn SHALL be Huge, gain 10 feet of reach, resist all damage except psychic, force, and radiant, and treat the managed weapon as a mythic artifact. Skeldr SHALL have 120-foot movement, ignore difficult terrain, and not provoke opportunity attacks.

#### Scenario: Ultimate custom effect is active
- **WHEN** the transformed state begins
- **THEN** the form and Skeldr receive exactly the managed custom effects and those effects are removed on revert

### Requirement: Legendary Points refresh and expire each turn
At the start of each Thar’gunn Ultimate turn, Legendary Points SHALL become three. Unspent points SHALL disappear when the next Thar’gunn turn begins and when the Ultimate ends. Spend buttons SHALL exist only while eligible and SHALL validate costs atomically.

#### Scenario: One point remained
- **WHEN** the next Thar’gunn Ultimate turn begins with one point unspent
- **THEN** the prior point is discarded and the pool becomes three

### Requirement: Legendary Point actions match the temporary level-20 menu
The default menu SHALL provide: `1` point for Skeldr to move up to 60 feet; `1` for Mighty Impel against Huge or smaller; `2` for the provisional configurable Devastating Strike; `2` to use a stored Echo; `3` for a second Ultimate Siphon that round; and `3` for Skeldr to leave an ally within 120 feet at 1 HP instead of 0.

The provisional strike SHALL be a mythic-weapon attack plus configurable bonus damage defaulting to `4d12 force + 4d12 thunder` and no default condition.

#### Scenario: Two-point provisional strike
- **WHEN** the player has at least two Legendary Points and activates the provisional strike
- **THEN** two points are spent and the managed weapon attack adds the resolved configured bonus damage on a hit

### Requirement: Thunderous Step tracks Skeldr movement
Once per turn during the Ultimate, when Skeldr has moved at least 20 feet before Thar’gunn’s next managed weapon attack, Hero Engine SHALL arm Thunderous Step and prompt on the next hit. The hit SHALL add `8d12 thunder + 8d12 force` and require a Strength save against `8 + proficiency + Strength modifier`.

On failure, a target smaller than Gargantuan SHALL be pushed 60 feet, knocked prone, and lose reactions until the start of Thar’gunn’s next turn. A Gargantuan-or-larger target SHALL not be pushed and SHALL instead take an additional `4d12 thunder`.

#### Scenario: Skeldr moved twenty feet and attack hits
- **WHEN** measured Skeldr movement reaches 20 feet before the next qualifying hit in the same turn
- **THEN** the rider is offered once, resolves its damage/save, and cannot trigger again that turn

### Requirement: Ultimate Siphon works once per turn without critical or kill
Once per Ultimate turn, any managed weapon hit SHALL allow Siphon against the target’s Charisma save using `8 + proficiency + Strength modifier`. On failure, the selected ability SHALL be suppressed until the Ultimate ends and its Echo SHALL be temporary unless the target dies and permanent capacity succeeds. The three-point action MAY enable one second Siphon in the same round.

#### Scenario: Ordinary Ultimate hit
- **WHEN** Thar’gunn hits with the managed weapon and has not used Ultimate Siphon that turn
- **THEN** Hero Engine offers Siphon without requiring a natural 20 or reducing the target to 0 HP

### Requirement: Name Fractures accumulate from documented triggers
During the Ultimate, Name Fractures SHALL increase by one when Thar’gunn uses an Echo, steals a legendary/divine/artifact/central ability, uses Siphon twice in one round, uses Skeldr’s ally-at-1-HP action, kills a creature whose ability was stolen, or activates the Field of the Tenth March. Duplicate event delivery SHALL not add duplicate Fractures.

#### Scenario: Second Siphon is used in one round
- **WHEN** the three-point second-Siphon action resolves after an earlier Siphon that round
- **THEN** exactly one Fracture is added for the second-use trigger

### Requirement: Ultimate expiry automatically settles deterministic Fracture consequences
At expiry, Hero Engine SHALL roll and directly apply resistance-ignoring psychic damage `12d12 + 2d12 per Fracture`. At `3+` Fractures it SHALL apply a reversible `-10` maximum-HP penalty; at `5+` it SHALL roll and schedule Skeldr’s `1d4` game-day absence; at `7+` it SHALL queue a GM choice of one blocked Echo slot; at `10+` it SHALL queue the true-name consequence, or a memory distortion if the bond was broken.

#### Scenario: Ultimate ends with seven Fractures
- **WHEN** expiry settlement begins with seven Fractures
- **THEN** damage is applied once, the maximum-HP penalty is applied, Skeldr absence is scheduled, and a GM slot-choice ruling is queued

### Requirement: Purification is a selective GM workflow
Hero Engine SHALL provide a GM recovery dialog listing permanent Hunger/Weight, Essence Debt, Fracture HP penalties, blocked Echo slots, lost Hit Dice, Siphon locks, death-save disadvantage, and other removable states. The GM SHALL record the spell or ritual and select exactly what is cleared; recovery SHALL be audited and reverse managed effects.

#### Scenario: Greater Restoration clears selected penalties
- **WHEN** the GM records Greater Restoration and selects a blocked slot plus one removable HP penalty
- **THEN** only those selected states are cleared and their managed effects are reversed

### Requirement: The player experience uses the selected surfaces and themes
The addon SHALL expose its complete Mechanics window, real dnd5e sheet activities, and installable hotbar macros. It SHALL not require Argon or token-HUD integration. The default theme SHALL use basalt, thunder-blue light, stolen gold, runes, and escalating void accents. The GM SHALL choose a world default and each client SHALL be able to override it locally.

#### Scenario: Client chooses a different theme
- **WHEN** one player selects a client theme override
- **THEN** only that client’s Thar’gunn UI changes and the GM world default remains unchanged

### Requirement: The addon is fully bilingual and locally illustrated
Every control, prompt, rule, item, activity, chat card, adjudication, installer report, and recovery workflow SHALL exist in pt-BR and English. Packaged custom artwork SHALL cover Skeldr, the mythic weapon, Ultimate Thar’gunn, March aura, Hollow Echo categories, and the Nameless Sovereign.

#### Scenario: Localization validation runs
- **WHEN** the build validates Thar’gunn locale keys
- **THEN** pt-BR and English contain matching required keys and no addon UI renders a raw localization identifier
