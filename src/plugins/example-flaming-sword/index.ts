/**
 * EXAMPLE PLUGIN — Flaming Sword
 * ==============================
 * The smallest useful mechanic: one resource, one recharge rule, one trigger,
 * one action. Copy this folder as the starting point for your own mechanics.
 *
 * A plugin is a plain object implementing `MechanicPlugin` (see the published
 * types or PLUGIN-GUIDE.md). You can register it three ways:
 *   1. Built-in (like this one): imported by the module itself.
 *   2. From another Foundry module or a world script:
 *        Hooks.on("heroEngine.registerMechanics", (api) => api.register(myPlugin));
 *   3. Any time after startup:
 *        game.modules.get("hero-engine").api.register(myPlugin);
 *
 * IMPORTANT: plugins may import ONLY from the public API entry ("../../api").
 * A build check fails if you reach into engine internals.
 */
import type { MechanicPlugin } from "../../api";

export const exampleFlamingSword: MechanicPlugin = {
  // Unique kebab-case id. Also the settings key and the flag namespace.
  id: "example-flaming-sword",
  version: "1.0.0",

  // "item" mechanics bind to a specific Item and their state follows it when
  // it changes hands. "character" mechanics live on the actor.
  archetype: "item",

  // All user-facing text goes through i18n keys...
  nameKey: "FLAMINGSWORD.Name",
  descriptionKey: "FLAMINGSWORD.Description",

  // ...and the translations ship inline with the plugin. English is the
  // fallback locale; add any others you play in.
  i18n: {
    en: {
      FLAMINGSWORD: {
        Name: "Flaming Sword (example)",
        Description: "A simple demonstration mechanic.",
        Embers: "Embers",
        GainEmber: "Gain an Ember (hit)",
        Burst: "Flame Burst",
        BurstHint: "Spend 3 Embers to erupt in flame.",
        BurstFlavor: "The blade erupts in flame!",
        CfgMaxEmbers: "Maximum Embers",
        CfgBurstCost: "Flame Burst cost",
        CfgBurstDice: "Flame Burst damage",
      },
    },
    "pt-BR": {
      FLAMINGSWORD: {
        Name: "Espada Flamejante (exemplo)",
        Description: "Uma mecânica simples de demonstração.",
        Embers: "Brasas",
        GainEmber: "Ganhar Brasa (acerto)",
        Burst: "Explosão de Chamas",
        BurstHint: "Gaste 3 Brasas para irromper em chamas.",
        BurstFlavor: "A lâmina irrompe em chamas!",
        CfgMaxEmbers: "Máximo de Brasas",
        CfgBurstCost: "Custo da Explosão de Chamas",
        CfgBurstDice: "Dano da Explosão de Chamas",
      },
    },
  },

  // --- One resource: a pool of Embers -------------------------------------
  // `max` is a formula referencing config ("@cfg.maxEmbers"), so the GM can
  // retune it in the auto-generated settings form without touching code.
  resources: [
    {
      id: "embers",
      labelKey: "FLAMINGSWORD.Embers",
      max: "@cfg.maxEmbers",
      initial: 0,
      // One recharge rule: everything resets to zero on a long rest.
      recharge: [{ on: "longRest", setTo: 0, amount: "none" }],
    },
  ],

  // --- One trigger: +1 Ember whenever the wielder hits with an attack ------
  // The engine detects hits from dnd5e attack rolls; `manualFallback` (the
  // default) also puts a button on the sheet panel in case a hit happens
  // outside Foundry's dice.
  triggers: [
    {
      id: "gain-ember",
      labelKey: "FLAMINGSWORD.GainEmber",
      event: "attack-hit",
      apply: [{ op: "adjust", target: "embers", amount: 1 }],
    },
  ],

  // --- One action: spend Embers for a damage roll ---------------------------
  // Costs are checked before anything happens; the roll formula references a
  // dice config field via @cfg so the GM can retune the damage.
  actions: [
    {
      id: "flame-burst",
      labelKey: "FLAMINGSWORD.Burst",
      descriptionKey: "FLAMINGSWORD.BurstHint",
      costs: [{ resource: "embers", amount: "@cfg.burstCost" }],
      roll: { formula: "@cfg.burstDice", flavorKey: "FLAMINGSWORD.BurstFlavor" },
    },
  ],

  // --- Config schema: every knob above, GM-tunable --------------------------
  configSchema: [
    { key: "maxEmbers", type: "number", labelKey: "FLAMINGSWORD.CfgMaxEmbers", default: 5, min: 1 },
    { key: "burstCost", type: "number", labelKey: "FLAMINGSWORD.CfgBurstCost", default: 3, min: 1 },
    { key: "burstDice", type: "dice", labelKey: "FLAMINGSWORD.CfgBurstDice", default: "3d6" },
  ],
};
