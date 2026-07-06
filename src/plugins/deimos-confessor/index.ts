/**
 * Deimos, o Confessor — O Limiar do Confessor. Character-archetype reference plugin.
 * Source: Deimos_Complete_Mechanic.md
 *
 * Flow: Book use raises PI -> Book level/DCs derive from PI -> Berserker
 * triggers prompt saves vs (12 + PI) -> on failure Deimos rages (overlay) and
 * may attempt the Ultimate ONCE per entry -> save vs (12 + bookLevel +
 * floor(PI/5)) branches into the Raven Queen or Vecna form for 5 rounds ->
 * expiry applies the matching debt, cleared by a GM-adjudicated ritual.
 */
import type { MechanicPlugin } from "../../api";

export const deimosConfessor: MechanicPlugin = {
  id: "deimos-confessor",
  version: "1.0.0",
  archetype: "character",
  nameKey: "DEIMOS.Name",
  descriptionKey: "DEIMOS.Description",

  trackers: [
    {
      id: "pi",
      labelKey: "DEIMOS.PI",
      min: 0,
      max: "@cfg.piMax",
      thresholds: [
        { at: 10, labelKey: "DEIMOS.Book2", descriptionKey: "DEIMOS.Book2Desc" },
        { at: 20, labelKey: "DEIMOS.Book3", descriptionKey: "DEIMOS.Book3Desc" },
        { at: 30, labelKey: "DEIMOS.Book4", descriptionKey: "DEIMOS.Book4Desc" },
        { at: 40, labelKey: "DEIMOS.Book5", descriptionKey: "DEIMOS.Book5Desc" },
      ],
    },
    { id: "ritualMenorAtivo", labelKey: "DEIMOS.RitualMenorAtivo", min: 0, max: 1 },
  ],

  resources: [
    {
      id: "cargas",
      labelKey: "DEIMOS.Cargas",
      max: "@cfg.chargesMax",
      initial: "@cfg.chargesMax",
      recharge: [], // charges NEVER regenerate naturally — sentient sacrifice only
    },
  ],

  derived: [
    { id: "bookLevel", labelKey: "DEIMOS.BookLevel", formula: "@cfg.bookLevelFormula" },
    { id: "berserkerDc", labelKey: "DEIMOS.BerserkerDc", formula: "@cfg.berserkerDc" },
    { id: "ultimateDc", labelKey: "DEIMOS.UltimateDc", formula: "@cfg.ultimateDc" },
  ],

  prompts: [
    {
      id: "berserker-save",
      titleKey: "DEIMOS.BerserkerSave",
      bodyKey: "DEIMOS.BerserkerSaveBody",
      save: {
        abilities: ["wis", "cha"],
        dcFormula: "@berserkerDc",
        onSuccess: { chatKey: "DEIMOS.BerserkerResisted" },
        onFailure: {
          apply: [
            { op: "set", target: "flag:berserk", value: true },
            { op: "set", target: "flag:ultimateAttempted", value: false },
          ],
          chatKey: "DEIMOS.BerserkerLost",
          transform: "berserker",
          runHook: true, // posts the Ultimate-attempt chat card
        },
      },
    },
    {
      id: "ultimate-save",
      titleKey: "DEIMOS.UltimateSave",
      bodyKey: "DEIMOS.UltimateSaveBody",
      optional: true, // choosing not to attempt is always allowed
      save: {
        abilities: ["wis", "cha"],
        dcFormula: "@ultimateDc",
        nat20AutoSuccess: true,
        nat1AutoFailure: true,
        onSuccess: { chatKey: "DEIMOS.UltimateRaven", transform: "raven-queen" },
        onFailure: { chatKey: "DEIMOS.UltimateVecna", transform: "vecna" },
      },
    },
  ],

  triggers: [
    { id: "crit-received", labelKey: "DEIMOS.TrigCrit", event: "crit-received", prompt: "berserker-save" },
    { id: "enemy-down", labelKey: "DEIMOS.TrigEnemyDown", event: "reduced-to-zero", prompt: "berserker-save" },
    { id: "ally-down", labelKey: "DEIMOS.TrigAllyDown", event: "ally-downed", prompt: "berserker-save" },
    { id: "stress", labelKey: "DEIMOS.TrigStress", event: "manual", prompt: "berserker-save" },
    // Ritual Menor lasts until Book use, sacrifice, or a long rest.
    {
      id: "ritual-expira-rest",
      labelKey: "DEIMOS.RitualExpires",
      event: "rest-long",
      apply: [{ op: "set", target: "ritualMenorAtivo", value: 0 }],
      manualFallback: false,
    },
  ],

  actions: [
    {
      id: "usar-livro",
      labelKey: "DEIMOS.UsarLivro",
      descriptionKey: "DEIMOS.UsarLivroHint",
      forbidsFlag: "bookPowersLost",
      costs: [{ resource: "cargas", amount: "@cfg.useBookCost" }],
      apply: [
        { op: "adjust", target: "pi", amount: "@cfg.piPerUse" },
        { op: "set", target: "ritualMenorAtivo", value: 0 },
      ],
      prompt: "berserker-save", // using the Book is itself a Berserker trigger
    },
    {
      id: "edict",
      labelKey: "DEIMOS.Edict",
      descriptionKey: "DEIMOS.EdictHint",
      forbidsFlag: "bookPowersLost",
      costs: [{ resource: "cargas", amount: "@cfg.edictCost" }],
      apply: [
        { op: "adjust", target: "pi", amount: "@cfg.piEdict" },
        { op: "set", target: "ritualMenorAtivo", value: 0 },
      ],
      prompt: "berserker-save",
    },
    {
      id: "tentar-ultimate",
      labelKey: "DEIMOS.TentarUltimate",
      descriptionKey: "DEIMOS.TentarUltimateHint",
      requiresFlag: "berserk",
      forbidsFlag: "ultimateAttempted",
      apply: [{ op: "set", target: "flag:ultimateAttempted", value: true }],
      runHook: true, // hook ends the Berserker overlay and opens the save
    },
    {
      id: "encerrar-berserker",
      labelKey: "DEIMOS.EncerrarBerserker",
      descriptionKey: "DEIMOS.EncerrarBerserkerHint",
      requiresFlag: "berserk",
      apply: [{ op: "set", target: "flag:berserk", value: false }],
      runHook: true,
    },
    {
      id: "ritual-menor",
      labelKey: "DEIMOS.RitualMenor",
      descriptionKey: "DEIMOS.RitualMenorHint",
      apply: [{ op: "set", target: "ritualMenorAtivo", value: 1 }],
    },
    {
      id: "sacrificio-cargas",
      labelKey: "DEIMOS.Sacrificio",
      descriptionKey: "DEIMOS.SacrificioHint",
      apply: [{ op: "set", target: "ritualMenorAtivo", value: 0 }],
      adjudicate: "sacrificio-valido",
    },
    {
      id: "ritual-reparacao",
      labelKey: "DEIMOS.RitualReparacao",
      descriptionKey: "DEIMOS.RitualReparacaoHint",
      requiresFlag: "paladinPowersLost",
      adjudicate: "ritual-memento",
    },
    {
      id: "sacrificio-reabertura",
      labelKey: "DEIMOS.Reabertura",
      descriptionKey: "DEIMOS.ReaberturaHint",
      requiresFlag: "bookPowersLost",
      adjudicate: "reabertura",
    },
  ],

  transformations: [
    {
      id: "berserker",
      labelKey: "DEIMOS.FormBerserker",
      strategy: "overlay",
      durationRounds: "@cfg.berserkerMaxRounds",
      overlay: {
        effects: [
          {
            name: "Berserker",
            changes: [],
            description:
              "Vantagem em ataques corpo a corpo; resistência a dano físico; imunidade a medo e encantamento; perda de controle. Sai apenas ao matar uma criatura senciente, ser nocauteado ou via Ultimate.",
          },
        ],
      },
    },
    {
      id: "raven-queen",
      labelKey: "DEIMOS.FormRaven",
      strategy: "config",
      durationRounds: "@cfg.ultimateRounds",
      overlay: {
        effects: [
          {
            name: "Avatar da Raven Queen",
            changes: [],
            description:
              "Paladino Lendário nível 24 (chassi Ascended, Ariadne's Book of Legends): proficiência +8, 3 Legendary Points, Channel Divinity 4, magias até 7º círculo; domínio narrativo sobre vida, morte, memória e luto.",
          },
        ],
      },
      swap: { formActorName: "Deimos — Avatar da Raven Queen", hpCarry: "keep-percent" },
      onExpire: {
        apply: [
          { op: "set", target: "flag:paladinPowersLost", value: true },
          { op: "set", target: "flag:berserk", value: false },
        ],
        chatKey: "DEIMOS.RavenDebt",
      },
    },
    {
      id: "vecna",
      labelKey: "DEIMOS.FormVecna",
      strategy: "config",
      durationRounds: "@cfg.ultimateRounds",
      overlay: {
        effects: [
          {
            name: "Berserker de Vecna",
            changes: [],
            description:
              "Bárbaro/Berserker Lendário nível 24 (chassi Ascended) sob controle do Mestre. Prioridades: proteger o Livro, matar sencientes próximos, tomar memórias e segredos.",
          },
        ],
      },
      swap: { formActorName: "Deimos — Berserker de Vecna", hpCarry: "keep-percent" },
      onExpire: {
        apply: [
          { op: "set", target: "flag:bookPowersLost", value: true },
          { op: "set", target: "flag:berserk", value: false },
        ],
        chatKey: "DEIMOS.VecnaDebt",
        runHook: true, // posts the scaled sacrifice count
      },
    },
  ],

  adjudications: [
    {
      id: "sacrificio-valido",
      titleKey: "DEIMOS.AdjSacrificio",
      descriptionKey: "DEIMOS.AdjSacrificioDesc",
      kind: "confirm",
      onConfirm: [{ op: "adjust", target: "cargas", amount: "@cfg.chargesMax - @cargas" }],
    },
    {
      id: "ritual-memento",
      titleKey: "DEIMOS.AdjMemento",
      descriptionKey: "DEIMOS.AdjMementoDesc",
      kind: "confirm",
      onConfirm: [{ op: "set", target: "flag:paladinPowersLost", value: false }],
    },
    {
      id: "reabertura",
      titleKey: "DEIMOS.AdjReabertura",
      descriptionKey: "DEIMOS.AdjReaberturaDesc",
      kind: "confirm",
      onConfirm: [
        { op: "set", target: "flag:bookPowersLost", value: false },
        { op: "adjust", target: "cargas", amount: "@cfg.chargesMax - @cargas" },
      ],
    },
  ],

  configSchema: [
    { key: "piMax", type: "number", labelKey: "DEIMOS.CfgPiMax", default: 50, min: 1, groupKey: "DEIMOS.CfgGroupPI" },
    { key: "piPerUse", type: "formula", labelKey: "DEIMOS.CfgPiPerUse", default: "1", groupKey: "DEIMOS.CfgGroupPI" },
    { key: "piEdict", type: "formula", labelKey: "DEIMOS.CfgPiEdict", default: "2", groupKey: "DEIMOS.CfgGroupPI" },
    {
      key: "bookLevelFormula",
      type: "formula",
      labelKey: "DEIMOS.CfgBookLevel",
      default: "clamp(1 + floor(@pi / 10), 1, 5)",
      groupKey: "DEIMOS.CfgGroupBook",
    },
    {
      key: "chargesMax",
      type: "formula",
      labelKey: "DEIMOS.CfgChargesMax",
      default: "2 + @bookLevel",
      groupKey: "DEIMOS.CfgGroupBook",
    },
    { key: "useBookCost", type: "number", labelKey: "DEIMOS.CfgUseBookCost", default: 1, min: 0, groupKey: "DEIMOS.CfgGroupBook" },
    { key: "edictCost", type: "number", labelKey: "DEIMOS.CfgEdictCost", default: 5, min: 0, groupKey: "DEIMOS.CfgGroupBook" },
    {
      key: "berserkerDc",
      type: "formula",
      labelKey: "DEIMOS.CfgBerserkerDc",
      // Ritual Menor holds the DC at its base until it expires.
      default: "12 + @pi * lt(@ritualMenorAtivo, 1)",
      groupKey: "DEIMOS.CfgGroupDCs",
    },
    {
      key: "ultimateDc",
      type: "formula",
      labelKey: "DEIMOS.CfgUltimateDc",
      default: "12 + @bookLevel + floor(@pi / 5)",
      groupKey: "DEIMOS.CfgGroupDCs",
    },
    { key: "ultimateRounds", type: "number", labelKey: "DEIMOS.CfgUltimateRounds", default: 5, min: 1, groupKey: "DEIMOS.CfgGroupUltimate" },
    { key: "berserkerMaxRounds", type: "number", labelKey: "DEIMOS.CfgBerserkerRounds", default: 99, min: 1, groupKey: "DEIMOS.CfgGroupUltimate" },
    {
      key: "transform.raven-queen.strategy",
      type: "choice",
      labelKey: "DEIMOS.CfgRavenStrategy",
      default: "overlay",
      choices: { overlay: "DEIMOS.CfgStrategyOverlay", "actor-swap": "DEIMOS.CfgStrategySwap" },
      groupKey: "DEIMOS.CfgGroupUltimate",
    },
    {
      key: "transform.vecna.strategy",
      type: "choice",
      labelKey: "DEIMOS.CfgVecnaStrategy",
      default: "overlay",
      choices: { overlay: "DEIMOS.CfgStrategyOverlay", "actor-swap": "DEIMOS.CfgStrategySwap" },
      groupKey: "DEIMOS.CfgGroupUltimate",
    },
  ],

  hooks: {
    // Berserker save failed: offer the once-per-entry Ultimate attempt.
    async onPromptResolved(ctx, prompt, result) {
      if (prompt.id === "berserker-save" && result.success === false) {
        await ctx.postCard({
          titleKey: "DEIMOS.UltimateOffer",
          bodyKey: "DEIMOS.UltimateOfferBody",
          buttons: [{ labelKey: "DEIMOS.TentarUltimate", actionId: "tentar-ultimate" }],
        });
      }
    },
    async onActionUse(ctx, action) {
      // Attempting the Ultimate: the surge decides who takes the body — end
      // the plain Berserker overlay, then roll the access save (its outcomes
      // activate the Raven Queen or Vecna form).
      if (action.id === "tentar-ultimate") {
        if (ctx.state.transform()?.id === "berserker") await ctx.endTransform();
        await ctx.openPrompt("ultimate-save");
      }
      // Leaving Berserker manually (killed a sentient creature / knocked out).
      if (action.id === "encerrar-berserker" && ctx.state.transform()?.id === "berserker") {
        await ctx.endTransform();
      }
    },
    // Vecna's debt scales with the Book level at the moment the form ends.
    async onTransformExpire(ctx, transform) {
      if (transform.id === "vecna") {
        await ctx.postChat("DEIMOS.VecnaDebtCount", { count: ctx.evalFormula("@bookLevel") });
      }
    },
  },

  i18n: {
    en: {
      DEIMOS: {
        Name: "Deimos — The Confessor's Threshold",
        Description: "The Book of Vile Darkness: Influence Points, the Berserker, and the two-faced Ultimate.",
        PI: "Influence Points (PI)",
        Cargas: "Book Charges",
        BookLevel: "Book Level",
        BerserkerDc: "Berserker DC",
        UltimateDc: "Ultimate DC",
        RitualMenorAtivo: "Minor Ritual active",
        Book2: "Book Lv 2", Book2Desc: "Flesh and Obedience: Blight, expanded Bestow Curse.",
        Book3: "Book Lv 3", Book3Desc: "Profane Memory: unlimited Speak with Dead, Summon Shadowspawn.",
        Book4: "Book Lv 4", Book4Desc: "Hand of the Whisper: area Blight, Blasphemy, profane relics.",
        Book5: "Book Lv 5", Book5Desc: "Vecna's Fragmented Will: Dominate Monster, Create Undead.",
        TrigCrit: "Received a critical hit",
        TrigEnemyDown: "Reduced an enemy to 0 HP",
        TrigAllyDown: "Saw an ally fall",
        TrigStress: "Extreme stress / confronted by memories",
        RitualExpires: "Minor Ritual expires (long rest)",
        BerserkerSave: "Berserker save",
        BerserkerSaveBody: "A Berserker trigger occurred. Resist with Wisdom or Charisma.",
        BerserkerResisted: "Deimos contains the whisper. The Book waits.",
        BerserkerLost: "Deimos loses control — the Berserker rises.",
        UltimateOffer: "The Confessor's Threshold",
        UltimateOfferBody: "Before control is fully lost, Deimos may reach for the Ultimate — once per Berserker entry. Success: Avatar of the Raven Queen. Failure: Vecna's Berserker.",
        TentarUltimate: "Attempt the Ultimate",
        TentarUltimateHint: "Once per Berserker entry. WIS/CHA save vs the Ultimate DC; nat 20 auto-succeeds, nat 1 auto-fails.",
        UltimateSave: "The Threshold — access save",
        UltimateSaveBody: "The Ultimate decides which force takes the body.",
        UltimateRaven: "SUCCESS — Deimos rises as the Avatar of the Raven Queen.",
        UltimateVecna: "FAILURE — Vecna's will floods in. The DM controls Deimos.",
        FormBerserker: "Berserker",
        FormRaven: "Avatar of the Raven Queen",
        FormVecna: "Vecna's Berserker",
        RavenDebt: "The Raven Queen collects: Paladin powers are lost until a significant memory or memento is sacrificed.",
        VecnaDebt: "Vecna collects: the Book's powers are lost until sentient creatures are sacrificed.",
        VecnaDebtCount: "Reopening the Book requires {count} conscious, sentient sacrifice(s).",
        UsarLivro: "Use the Book",
        UsarLivroHint: "Spend charges, gain +1 PI, and face a Berserker save. Ends the Minor Ritual.",
        Edict: "Edict of Unmaking",
        EdictHint: "5 charges. Erases the target from existence. +2 PI. Ends the Minor Ritual.",
        EncerrarBerserker: "Leave Berserker",
        EncerrarBerserkerHint: "Only after killing a sentient creature, being knocked out, or via the Ultimate.",
        RitualMenor: "Minor Ritual of Purification",
        RitualMenorHint: "1 hour with mementos of the Raven Queen: Berserker DC returns to its base until Book use, sacrifice or a long rest.",
        Sacrificio: "Sentient sacrifice (recharge)",
        SacrificioHint: "Charges only return through a conscious, sentient sacrifice — GM validates.",
        RitualReparacao: "Reparation ritual (Raven Queen)",
        RitualReparacaoHint: "Sacrifice 1 significant memory or memento to regain Paladin powers.",
        Reabertura: "Reopening sacrifice (Vecna)",
        ReaberturaHint: "Sacrifice sentient creatures equal to the Book level to regain its powers.",
        AdjSacrificio: "Valid sentient sacrifice?",
        AdjSacrificioDesc: "Must have agency, consciousness and real capacity for loss. Dominated creatures, mindless undead, constructs, simulacra and disposable summons do NOT count. Confirming refills the Book's charges.",
        AdjMemento: "Valid memento sacrificed?",
        AdjMementoDesc: "The memento must carry a real memory of life, death, guilt, promise, grief, loss or a victim. Confirming restores Paladin powers.",
        AdjReabertura: "Reopening sacrifice completed?",
        AdjReaberturaDesc: "Sentient sacrifices equal to the Book level. Confirming restores the Book's powers and charges.",
        CfgGroupPI: "Influence", CfgGroupBook: "Book", CfgGroupDCs: "DCs", CfgGroupUltimate: "Forms",
        CfgPiMax: "PI maximum", CfgPiPerUse: "PI per Book use", CfgPiEdict: "PI from Edict",
        CfgBookLevel: "Book level formula", CfgChargesMax: "Max charges formula",
        CfgUseBookCost: "Book use charge cost", CfgEdictCost: "Edict charge cost",
        CfgBerserkerDc: "Berserker DC formula", CfgUltimateDc: "Ultimate DC formula",
        CfgUltimateRounds: "Ultimate duration (rounds)", CfgBerserkerRounds: "Berserker max rounds",
        CfgRavenStrategy: "Raven Queen form strategy", CfgVecnaStrategy: "Vecna form strategy",
        CfgStrategyOverlay: "Active Effects overlay", CfgStrategySwap: "Actor swap (prepared stat block)",
      },
    },
    "pt-BR": {
      DEIMOS: {
        Name: "Deimos — O Limiar do Confessor",
        Description: "O Book of Vile Darkness: Pontos de Influência, o Berserker e a Ultimate de duas faces.",
        PI: "Pontos de Influência (PI)",
        Cargas: "Cargas do Livro",
        BookLevel: "Nível do Livro",
        BerserkerDc: "CD Berserker",
        UltimateDc: "CD Ultimate",
        RitualMenorAtivo: "Ritual Menor ativo",
        Book2: "Livro Nv 2", Book2Desc: "Carne e Obediência: Blight, Bestow Curse ampliada.",
        Book3: "Livro Nv 3", Book3Desc: "Memória Profana: Speak with Dead sem limite, Summon Shadowspawn.",
        Book4: "Livro Nv 4", Book4Desc: "A Mão do Sussurro: Blight em área, Blasphemy, relíquias profanas.",
        Book5: "Livro Nv 5", Book5Desc: "Vontade Fragmentada de Vecna: Dominate Monster, Create Undead.",
        TrigCrit: "Recebeu um acerto crítico",
        TrigEnemyDown: "Reduziu um inimigo a 0 PV",
        TrigAllyDown: "Viu um aliado cair",
        TrigStress: "Stress extremo / confrontado por memórias",
        RitualExpires: "Ritual Menor expira (descanso longo)",
        BerserkerSave: "Teste do Berserker",
        BerserkerSaveBody: "Um gatilho do Berserker ocorreu. Resista com Sabedoria ou Carisma.",
        BerserkerResisted: "Deimos contém o sussurro. O Livro espera.",
        BerserkerLost: "Deimos perde o controle — o Berserker desperta.",
        UltimateOffer: "O Limiar do Confessor",
        UltimateOfferBody: "Antes de perder totalmente o controle, Deimos pode tentar a Ultimate — 1 vez por entrada em Berserker. Sucesso: Avatar da Raven Queen. Falha: Berserker de Vecna.",
        TentarUltimate: "Tentar a Ultimate",
        TentarUltimateHint: "1 vez por entrada em Berserker. Teste de SAB/CAR contra a CD Ultimate; 20 natural passa, 1 natural falha.",
        UltimateSave: "O Limiar — teste de acesso",
        UltimateSaveBody: "A Ultimate decide qual força assume o corpo.",
        UltimateRaven: "SUCESSO — Deimos ergue-se como Avatar da Raven Queen.",
        UltimateVecna: "FALHA — a vontade de Vecna inunda. O Mestre controla Deimos.",
        FormBerserker: "Berserker",
        FormRaven: "Avatar da Raven Queen",
        FormVecna: "Berserker de Vecna",
        RavenDebt: "A Raven Queen cobra: os poderes de Paladino se perdem até o sacrifício de uma memória ou memento significativo.",
        VecnaDebt: "Vecna cobra: os poderes do Livro se perdem até o sacrifício de criaturas sencientes.",
        VecnaDebtCount: "Reabrir o Livro exige {count} sacrifício(s) senciente(s) consciente(s).",
        UsarLivro: "Usar o Livro",
        UsarLivroHint: "Gasta cargas, concede +1 PI e exige teste do Berserker. Encerra o Ritual Menor.",
        Edict: "Edict of Unmaking",
        EdictHint: "5 cargas. Apaga o alvo da existência. +2 PI. Encerra o Ritual Menor.",
        EncerrarBerserker: "Sair do Berserker",
        EncerrarBerserkerHint: "Apenas ao matar uma criatura senciente, ser nocauteado ou via Ultimate.",
        RitualMenor: "Ritual Menor de Purificação",
        RitualMenorHint: "1 hora com mementos da Raven Queen: a CD Berserker volta à base até novo uso do Livro, sacrifício ou descanso longo.",
        Sacrificio: "Sacrifício senciente (recarga)",
        SacrificioHint: "As cargas só retornam com sacrifício senciente consciente — o Mestre valida.",
        RitualReparacao: "Ritual de reparação (Raven Queen)",
        RitualReparacaoHint: "Sacrifique 1 memória ou memento significativo para recuperar os poderes de Paladino.",
        Reabertura: "Sacrifício de reabertura (Vecna)",
        ReaberturaHint: "Sacrifique criaturas sencientes em número igual ao nível do Livro para reabrir o vínculo.",
        AdjSacrificio: "Sacrifício senciente válido?",
        AdjSacrificioDesc: "Precisa ter agência, consciência e capacidade real de perda. Dominados, mortos-vivos sem vontade, construtos, simulacros e invocações descartáveis NÃO contam. Confirmar recarrega as cargas do Livro.",
        AdjMemento: "Memento válido sacrificado?",
        AdjMementoDesc: "O memento precisa carregar lembrança real de vida, morte, culpa, promessa, luto, perda ou uma vítima. Confirmar restaura os poderes de Paladino.",
        AdjReabertura: "Sacrifício de reabertura completo?",
        AdjReaberturaDesc: "Sacrifícios sencientes iguais ao nível do Livro. Confirmar restaura os poderes e as cargas do Livro.",
        CfgGroupPI: "Influência", CfgGroupBook: "Livro", CfgGroupDCs: "CDs", CfgGroupUltimate: "Formas",
        CfgPiMax: "PI máximo", CfgPiPerUse: "PI por uso do Livro", CfgPiEdict: "PI do Edict",
        CfgBookLevel: "Fórmula do nível do Livro", CfgChargesMax: "Fórmula de cargas máximas",
        CfgUseBookCost: "Custo em cargas do uso", CfgEdictCost: "Custo em cargas do Edict",
        CfgBerserkerDc: "Fórmula da CD Berserker", CfgUltimateDc: "Fórmula da CD Ultimate",
        CfgUltimateRounds: "Duração da Ultimate (rodadas)", CfgBerserkerRounds: "Rodadas máximas do Berserker",
        CfgRavenStrategy: "Estratégia da forma Raven Queen", CfgVecnaStrategy: "Estratégia da forma Vecna",
        CfgStrategyOverlay: "Overlay de Active Effects", CfgStrategySwap: "Troca de ator (ficha preparada)",
      },
    },
  },
};
