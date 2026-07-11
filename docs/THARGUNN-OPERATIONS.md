# Thar’gunn operations and recovery

## Install or repair

1. Verify a current world/actor backup.
2. Record its path, snapshot ID, or checksum under the Hero Engine
   `backupEvidence` world setting.
3. Run `previewThargunnInstall()` and retain the report.
4. Run `installThargunn()` as the active GM.
5. Run the preview again; remaining entries should be managed reconciliations,
   not new unmanaged duplicates.

Optional IDs may be supplied for disposable clones:

```js
await game.modules.get("hero-engine").api.previewThargunnInstall({
  baseActorId: "CLONE_BASE_ID",
  ultimateActorId: "CLONE_ULTIMATE_ID"
});
```

## DDB refresh

After a DDB import, run the preview and installer again. Hero Engine restores
its stable managed weapon, feature, activity, actor, link, and macro keys. It
does not delete same-name DDB items, subclasses, biography, inventory, or
unrelated effects. Resolve reported subclass collisions manually after
comparing their sources.

## Recovery

- The GM panel exposes pending rulings, blocked slots, and selective
  purification for Hunger, Debt, Skeldr absence, Fracture penalty, and slots.
- Temporary Echoes reconcile against world/combat time after reload; a target
  dying before expiry converts the record to permanent.
- Ultimate state is stored on the canonical base actor. Manual end, combat
  removal, expiry, and reload all resolve back through that state.
- Skeldr absence uses world time and returns after the persisted `1d4` days;
  the GM can return Skeldr early by recording the required Legend.

## Rollback

Stop Foundry cleanly, restore the backed-up world (or both actor exports), then
restore the previous module directory/release. Never mix a live LevelDB copy
with a running Foundry process. The baseline evidence for this development
world is recorded in `docs/thargunn-baseline.md`.
