# Hero Engine 1.0.0 release verification

Date: 2026-07-11 (Europe/Lisbon)

## Safety evidence

- Cold world/module backup and actor exports:
  `/home/paulo/Documents/rpg/backups/hero-engine-thargunn-20260711-050111`
- Backup inventory/checksums: `SHA256SUMS` inside that directory.
- Baseline details and actor IDs: `docs/thargunn-baseline.md`.
- Installed module is a symlink to this repository's ignored `dist/` folder.

## Automated gates

- `npm run check`: pass; TypeScript, plugin import guard, 286-key en/pt-BR parity.
- `npm test -- --run`: pass; 73 tests across 10 files.
- `npm run build`: pass; reproducible Actor/Item/Macro packs, Vite bundle,
  public declarations, import guard, and bundle audit.
- Bundle audit: 36 files, 3.36 MB, no remote runtime artwork.
- `openspec validate add-thargunn-mythic-addon --strict --json`: pass.

## Release artifact

- Archive: `/tmp/hero-engine-1.0.0.zip`
- SHA-256: `c4322556f004717170b698cffb68ac56d07e3294da790efec63d6845a317fec1`
- Inspected archive manifest: `hero-engine` 1.0.0, Foundry 13–14,
  verified 14, all three Thar’gunn packs, canonical GitHub URLs.

## Foundry deployment

- Foundry 14.361 restarted cleanly after a controlled world deactivation.
- dnd5e 5.3.3 connected and migrated all three Hero Engine pack databases.
- The T3 collaborative browser transport returned `Auth required` during the
  final live pass. Earlier baseline T3 proof is retained; real-actor installer
  execution and destructive clone scenarios remain unchecked in OpenSpec and
  must not be represented as completed until the shared browser is re-paired.
