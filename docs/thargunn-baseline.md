# Thar’gunn implementation baseline

Captured on 2026-07-11 before any Hero Engine deployment or live actor mutation.

## Repository and runtime

- Branch: `feat/thargunn-mythic-addon`
- Baseline repository commit: `55dc7fb` (`docs: plan Thargunn mythic addon`)
- Node: `v22.22.1`; npm: `10.9.4`
- Foundry VTT: `14.361` (Build 361)
- dnd5e: `5.3.3`; world rules generation: `modern`
- Hero Engine: `0.1.0`, compatibility minimum `13`, verified/maximum `14`
- Active integrations: Midi-QOL `14.0.10`, DAE `14.0.12`, Sequencer `4.2.2`, DDB Importer `7.3.15`, Tidy 5e Sheets `13.5.0`
- Clean-source gate: 52 tests passed; TypeScript/plugin-boundary check passed; production and declaration builds passed.

## Rollback evidence

The consistent cold backup is outside the repository and outside Foundry's deployment path:

`/home/paulo/Documents/rpg/backups/hero-engine-thargunn-20260711-050111`

It contains 638 world files (2.5 GB), all six installed module files, both actor JSON exports, and `SHA256SUMS`. Foundry process `foundry3` was stopped cleanly for the world copy and restarted successfully. Important hashes:

- Thar’gunn JSON: `d877e0aa6d0af43ca02f5e1e9ebdda212c414d0189f0a59726fc730ad62b99a1`
- Thar’gunn - Ultimate JSON: `5b7ead5a106fe4a5f9085163a6af25828eb2762aca147def4215684cd4c3dd57`
- Installed `module.json`: `6c7df6a35ed6f15f4a853a7ca72aaa707f4c818943d2dbac0967768d70016352`

## Installed-module inventory and classification

The complete installed hashes are stored in the backup as `INSTALLED_MODULE_SHA256.txt`.

| Path | Installed shape | Repository comparison | Classification |
| --- | ---: | --- | --- |
| `module.json` | 31 lines | byte-identical | authoritative/current |
| `lang/en.json` | 137 lines | differs from 89-line source | intentional live UI additions; port required |
| `lang/pt-BR.json` | 137 lines | differs from 89-line source | intentional live UI additions; port required |
| `styles/hero-engine.css` | 1,393 lines | differs from 128-line source | intentional live redesign; port and rationalize |
| `scripts/hero-engine.mjs` | 4,026 lines | 879 unified-diff lines from a fresh build | intentional runtime/UI patches compiled outside source; reverse-port required |
| `scripts/hero-engine.mjs.map` | 298,013 bytes | byte-identical to fresh source build | stale with respect to patched bundle; generated, do not use as proof of parity |

No manifest or compatibility drift exists at this baseline. Future version changes must be made in the repository manifest/package metadata first and deployed from a reproducible build.

## Browser behavior evidence

T3 recording artifact `browser-recording-mrfuafw7` captured the current live behavior before rebuilding. Checklist reproduced during the recording:

- GM-only scene-control launcher opens the redesigned GM control panel.
- GM actor search reduces the available actor count and exposes both Thar’gunn actors.
- Item binding has Gear/All/Spells/Features categories, name search, bounded scrolling, and explicit Save/Cancel.
- Searching `halberd` leaves only `Nine Lives Stealer Halberd` visible.
- The bound actor sheet contains only the Hero Engine Mechanics launcher, with no embedded mechanics panel.
- The launcher opens the standalone Mechanics window.
- Manual Triggers expands as a native `details` section and remains open across its current render cycle.
- The current panel reports one attached mechanic and three registered plugins.

## Actor inventory

### Thar’gunn

- Actor ID: `Owx9HA0KRtcB8xWe`; type `character`; 57 items; 0 active effects; level 12.
- OWNER: Gamemaster `OXKW17vB2seLYrPF`, Ruzinha `WBKLefTuluPmoWdD`.
- Linked 1×1 prototype token; current token art is preserved in the actor export.
- No `flags.hero-engine` state or attachments.
- No Skeldr actor exists in the world.

### Thar’gunn - Ultimate

- Actor ID: `VJ2nFvMjvYiHIO7w`; type `character`; 65 items; 0 active effects; level 20.
- OWNER: Gamemaster `OXKW17vB2seLYrPF`, Ruzinha `WBKLefTuluPmoWdD`, Ruza `Qf2ahyMfnj4r5MEa`.
- Linked 1×1 prototype token; currently shares Thar’gunn's token art.
- No `flags.hero-engine` state or attachments.

### Curation candidates and source weapon

Both actors contain the same duplicate subclass candidates:

- `9AvdNVz5nhge9KAG`: `Path of the Giant (GotG)`, identifier `giant`, DDB-imported 2024 content.
- `HrosbiNheGd6u0sC`: `Path of the Giant`, identifier `path-of-the-giant`, Plutonium-imported content.

The managed weapon source candidate on both actors is item `m2guptM3HxmWjIsH`, `Nine Lives Stealer Halberd`: equipped, attunement required, currently unattuned, DDB-imported modern content. Same-name or imported documents will not be deleted automatically; adoption/repair is keyed by explicit Hero Engine managed metadata.

## Implementation safety findings

The dnd5e 5.3.3 transform API requires a `TransformationSetting` DataModel and creates a new Actor. The implementation must keep authoritative Hero Engine state on the canonical original actor while resolving the transformed actor for runtime operations. Attack/rest hooks require deduplication, HP transitions require a pre-update snapshot, and owner-to-GM secure workflows must use server-attributed actor updates rather than trusting caller-supplied broadcast socket identities.
