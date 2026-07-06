# Hero Engine — Live-world smoke test

Run the full list once in a **v13** world and once in a **v14** world
(dnd5e 4.0+). Needs one GM client and, ideally, one player client.

## Setup

- [ ] Module enables without console errors; `hero-engine | ready — 3 mechanics registered` logged
- [ ] Settings show *Dawn hour* and the *GM Control Panel* menu (GM only)

## Registration & validation

- [ ] World script registering a copy of the example plugin with a new id works (`Hooks.on("heroEngine.registerMechanics", ...)`)
- [ ] Registering it twice logs a duplicate-id error and keeps the first
- [ ] Registering a plugin with a bad formula (`12 + @nope`) is rejected with the field path, other plugins unaffected

## Attachment

- [ ] GM panel attaches Deimos' mechanic to an actor → sheet gains the Mechanics panel
- [ ] GM panel attaches Presa to a spear item on actor A
- [ ] Moving the spear to actor B keeps its charges; the panel appears on B's sheet (check chat notice)
- [ ] Detach removes the panel and leaves no stray Active Effects

## Presa loop (player client where possible)

- [ ] Attack hit with dnd5e roll → +1 Storm Charge (audit shows `trigger:hit`)
- [ ] Critical hit → +2
- [ ] Manual trigger button ("Protected someone") → +1
- [ ] Stance select applies/removes its Active Effect and logs to chat
- [ ] Spend action deducts (with `vsJurada = 1`, cost is 1 less, min 1)
- [ ] Declare Sworn Threat → GM sees "Validate Sworn Threat"; denying resets the tracker
- [ ] Long rest → charges reset to 0; with an oath active, "Oath progress" queues; picking "No advance" raises Peso and crossing a threshold posts chat
- [ ] Set Peso to 4 via GM panel → max charges displays 8; pool clamps
- [ ] Per-actor override maxCargas=10 → panel shows /10; clear override → back to 12

## Deimos loop

- [ ] "Use the Book" at PI 9 → PI 10, Book level 2, charges max 4, Berserker save DC 22 prompt
- [ ] Failing the Berserker save applies the Berserker overlay + posts the Ultimate offer card
- [ ] Ultimate card button (once only — second click blocked) rolls WIS/CHA vs the computed DC
- [ ] Success activates Raven Queen (overlay strategy) for 5 rounds; advancing 5 combat turns expires it, sets "Paladin powers lost" and posts the debt
- [ ] With `transform.raven-queen.strategy = actor-swap` and a prepared actor named "Deimos — Avatar da Raven Queen": swap in, expiry reverts cleanly (no orphan tokens)
- [ ] Reparation ritual action queues the memento adjudication; confirming clears the debt flag
- [ ] Sentient-sacrifice action: confirm refills Book charges

## Config & formulas

- [ ] World config form renders every field, grouped, localized
- [ ] Entering `12 + @pii` shows the unknown-variable error and does NOT overwrite the stored formula
- [ ] Live preview updates while typing against the attached actor
- [ ] Changing Ultimate duration world default to 6 affects the next activation without reload

## Time & recharge

- [ ] Long rest with the example sword: Embers reset to 0
- [ ] Advance world time past 06:00 → dawn-based recharges fire (attach a test plugin with a dawn rule)
- [ ] Ultimate long-rest cooldown blocks reuse until rest; GM panel CD reset unblocks
- [ ] Conditional recharge asks the GM yes/no; "no" applies the fallback dice roll (visible in chat)

## Permissions & sockets

- [ ] Player (owner, non-GM) spends charges → state updates for all clients
- [ ] Player action that queues an adjudication reaches the GM panel badge
- [ ] With the GM logged out, a player adjudication action shows "waiting for GM" and delivers when the GM reconnects
- [ ] Non-owner sees the panel read-only

## Localization

- [ ] Client in Português (Brasil): panels, dialogs, chat and GM panel fully in pt-BR
- [ ] Client in English: fully in English

Record Foundry build, dnd5e version, and any deviations below:

| Date | Foundry | dnd5e | Result | Notes |
|---|---|---|---|---|
|  |  |  |  |  |
