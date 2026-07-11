# Changelog

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
