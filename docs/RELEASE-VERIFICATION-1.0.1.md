# Hero Engine 1.0.1 release verification

Date: 2026-07-11 (Europe/Lisbon)

## Safety evidence

- Verified world/module backup and both actor exports:
  `/home/paulo/Documents/rpg/backups/hero-engine-thargunn-20260711-050111`.
- Backup inventory and hashes: `SHA256SUMS` in that directory.
- Base actor: `Thar’gunn` (`Owx9HA0KRtcB8xWe`).
- Prepared form: `Thar’gunn - Ultimate` (`VJ2nFvMjvYiHIO7w`).
- The real-actor mutation ran only after the installer accepted the recorded
  backup evidence.

## Disposable-clone verification

- Installer preview reported no unrelated deletions or warnings. The two
  unmanaged same-name Giant subclass items were reported as a collision and
  left untouched.
- First install and a second reconciliation preserved ownership, biography,
  inventory, IDs, HP percentage, and fresh mechanic state without duplicates.
- The managed weapon retained its embedded Item ID and ended with exactly the
  three dnd5e activities `Forma de Alabarda`, `Forma de Machado Grande`, and
  `Arremesso Gigantesco`.
- All four base feature Items and all four Skeldr feature Items contained one
  valid 16-character dnd5e activity ID. Skeldr was Huge with a 3×3 token.
- A temporary Echo use spent one charge, added one Hunger, dealt soul damage,
  expired its record, and removed its linked Item. Field activation spent all
  charges, added Hunger, set both long-rest locks, and created the managed
  165-foot/60-second effect.
- Normal Ultimate activation created the runtime actor swap, retained the
  canonical character-owned state, initialized five remaining turns and three
  Legendary Points, then manual end reverted safely and applied expiry damage.
- Disposable actors, Skeldr, effects, and runtime transform documents were
  removed after verification.

## Real-actor curation

- `Thar’gunn` preserved all 57 original embedded Item IDs, ownership, biography,
  and prototype-token data, then gained four managed feature Items.
- The original weapon Item ID `m2guptM3HxmWjIsH` was preserved and reconciled
  in place. Equipped state remained true and the prior unattuned state remained
  false; Hero Engine did not silently decide attunement for the player.
- Fresh canonical state is weapon level 1, five charges, zero Hunger/Debt/
  Legends/Fractures/Legendary Points, three empty permanent Echo slots, ten
  temporary slots, ten Legend slots, and one character attachment.
- `Thar’gunn - Ultimate` preserved all 65 original embedded Item IDs, ownership,
  and native level-20 Barbarian chassis, then gained four managed features. It
  is Huge with a 3×3 token and the managed resistance presentation.
- Skeldr (`cEuy7AkEFr4VVyd4`) was created once, linked to the real base actor,
  mirrored its ownership, and has Huge size, a 3×3 token, and four activity-
  backed features.
- Four stable-key macros were installed. A second real installation produced
  the same actor/item counts and canonical values without duplicates.

## T3 browser proof

- T3 rendered the real actor sheet with the Mechanics launcher present and no
  inline `.hero-engine-panel`; only the launcher remains on the sheet.
- The standalone `Thar’gunn — Mechanics` window rendered the themed panel, all
  action sections, and three searchable/filterable record collections with
  `3`, `10`, and `10` slot rows.
- Managed Items and activities and the stable-key macros were inspected in the
  live Foundry document model after rendering.
- T3 DOM evaluation was available, but snapshot and recording transport were
  unavailable during this pass. OpenSpec task 14.7 therefore remains open.

## 1.0.1 correction

- Managed activity IDs are now deterministic and exactly 16 characters.
- Activity cloning reads serialized Item source data rather than a dnd5e
  `ActivityCollection` wrapper.
- Weapon reconciliation explicitly removes obsolete activities and retains
  exactly the three managed forms.
- Skeldr reconciliation writes both Huge system size and 3×3 token dimensions.

## Automated and deployment gates

- `npm run check`: pass; TypeScript, plugin import guard, and 286-key
  English/pt-BR parity.
- `npm test -- --run`: pass; 78 tests across 12 files.
- `npm run build`: pass; reproducible Actor/Item/Macro packs, Vite bundle,
  public declarations, import guard, and bundle audit.
- Bundle audit: 36 files, 3.38 MB, no remote runtime artwork.
- `openspec validate add-thargunn-mythic-addon --strict --json`: pass.
- Foundry 14.361 restarted after controlled world deactivation. The live world
  loaded Hero Engine 1.0.1 with dnd5e 5.3.3 and retained the curated state.

## Published readback

- Draft PR: `https://github.com/PauloDaniel1993/hero-engine/pull/1`.
- Release workflow:
  `https://github.com/PauloDaniel1993/hero-engine/actions/runs/29151349432`
  completed successfully.
- Release: `https://github.com/PauloDaniel1993/hero-engine/releases/tag/v1.0.1`.
- Published manifest SHA-256:
  `b0c2f61faf94fe97d835c072109a24960905437abfe9d4e5770eed989f3258ba`.
- Published archive SHA-256:
  `f6f7fb26363f2938319170716036f45840e0812c5cce0876a258b11fc784b1af`.
- The downloaded manifest exactly matches repository `module.json`, reports
  Hero Engine 1.0.1 and Foundry 13–14 compatibility, and points Foundry at the
  latest immutable release assets.
- The archive contains 36 files excluding directory entries, including all
  three LevelDB packs, local artwork, declarations, and runtime bundle. Bundle
  inspection found all three managed weapon activity IDs and the Huge-size
  reconciliation code.

## Remaining non-blocking scope evidence

OpenSpec intentionally remains incomplete for the exhaustive private-target,
every-category, every-threshold, Skeldr defeat/return, Usurped Ultimate,
all-point-action, screenshot/recording, and rollback-rehearsal matrices. Those
unchecked tasks are not represented as covered by this patch release.
