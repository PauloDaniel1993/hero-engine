# Hero Engine

A Foundry VTT module (v13/v14, dnd5e) that runs bespoke epic character and
weapon mechanics as **plugins**: trackers, charge economies, triggered saves,
stances, timed transformations, curses, consequence tables and GM-adjudicated
rituals — all driven by a typed plugin API, with every value, DC formula,
delay and recharge rule configurable from the UI.

Ships with reference mechanics:

- **Presa da Tempestade Vingativa** — sentient storm spear (item-bound):
  Storm Charges, four stances, the Heroic Oath, the Storm's Weight curse.
- **Deimos — O Limiar do Confessor** — the Book of Vile Darkness: Influence
  Points, the Berserker, and the two-outcome Ultimate with its debts.
- **Thar’gunn — Ladrão da Décima Vida** — a complete character addon with
  weapon milestones, Hollow Echo capture/storage, Hunger and Essence Debt,
  Recorded Legends and rite, Skeldr, the moving Tenth March field, and a
  native level-20 Ultimate form.
- **Flaming Sword (example)** — the commented template for your own plugins.

## Requirements

- Foundry VTT v13 or v14
- dnd5e system 4.0+
- Node 20+ (build only)

## Build & install

```bash
npm install
npm run build     # bundle + statics into dist/ + publish types/ + API guard
npm run deploy    # symlink/copy dist/ into <FoundryData>/Data/modules/hero-engine
```

`npm run deploy` asks for your Foundry data folder on first run and stores it
in an untracked `.env`. Enable **Hero Engine** in your world afterwards.

## Using it at the table

1. **Attach**: Settings → Hero Engine → *GM Control Panel* → pick an actor and
   a mechanic (item mechanics then ask which item to bind — e.g. bind Presa to
   the Fang of the Vengeful Storm spear).
2. **Play**: the actor's sheet gains a *Mechanics* panel (trackers, charges,
   stances, actions, manual triggers). Crits, kills, rests and time advance
   drive the automation; dialogs prompt saves at the right moments; outcomes
   log to chat.
3. **Adjudicate**: DM judgment calls (valid sacrifice? oath progress?) queue
   in the GM panel.
4. **Tune**: world defaults per mechanic in the GM panel's *World
   configuration*; per-actor overrides via each attachment's *Overrides*
   button. Formula fields accept things like `12 + @pi` with live preview.

## Installing Thar’gunn

The release ships reproducible Actor, Item, and Macro compendia, but the
managed installer deliberately requires proof of a backup before touching a
world actor.

1. Back up the world and the two actors.
2. As GM, set **Settings → Configure Settings → Hero Engine → Verified backup
   evidence** to the backup path, snapshot ID, or checksum record.
3. Inspect the non-mutating plan with
   `await game.modules.get("hero-engine").api.previewThargunnInstall()`.
4. Apply it with
   `await game.modules.get("hero-engine").api.installThargunn()`.

The installer adopts the recorded Thar’gunn actors and Nine Lives Stealer,
creates/repairs Skeldr, managed activities and macros, attaches fresh mechanic
state, and reports DDB subclass collisions without deleting unrelated content.
Running it again repairs managed fields while preserving biography, inventory,
ownership, attunement, current HP percentage, and canonical state.

Rollback is actor/world restore from the recorded backup. Removing the module
alone does not delete managed world documents.

## Writing your own mechanics

See **PLUGIN-GUIDE.md** and copy `src/plugins/example-flaming-sword/`.
Typed contract: `types/types.d.ts`.

## Development

```bash
npm test          # vitest — pure engine core (formulas, trackers, config, timing, validation)
npm run check     # typecheck + plugin import guard
npm run build     # compendia + production bundle + declarations + bundle audit
```

Verification in a live world: `docs/SMOKE-TEST.md`.
