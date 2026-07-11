import type { MechanicContext, MechanicPlugin, MechanicRecord, PromptResult, RecordActionDef, RecordCollectionDef, TriggerDef, TriggerPayload } from "../../api";
import { ECHO_CATEGORIES, canUseUltimate, echoCost, echoTier, erasureDc, fractureConsequences, riteOutcome, soulDamageDice, ultimateExpiryDamage, weaponProgression } from "./rules";

const P = "HEROENGINE.Thargunn";
const MANAGED_FLAG = "managed";
const WEAPON_KEY = "thargunn.item.weapon";

function actorOf(ctx: MechanicContext): any { return ctx.actor as any; }
function managedKey(doc: any): string | undefined { return doc?.getFlag?.("hero-engine", MANAGED_FLAG)?.key ?? doc?.flags?.["hero-engine"]?.managed?.key; }
function weapon(ctx: MechanicContext): any | null { return actorOf(ctx).items?.find((item: any) => managedKey(item) === WEAPON_KEY) ?? null; }
function actorLevel(actor: any): number { return Number(actor.system?.details?.level ?? actor.classes?.barbarian?.system?.levels ?? 0); }
function echoIcon(category: string): string {
  const direct = ["action", "divine", "reaction", "sense", "spell", "trait"].includes(category) ? category
    : ["legendary-resistance", "legendary-action", "lair-action", "artifact", "core"].includes(category) ? "legendary"
      : "trait";
  return `modules/hero-engine/assets/thargunn/icons/echo-${direct}.webp`;
}
function isRaging(actor: any): boolean {
  return actor.statuses?.has?.("rage") || actor.effects?.some?.((effect: any) => effect.statuses?.has?.("rage") || /rage|fúria/i.test(effect.name));
}

async function silentSave(actor: any, ability: string, dc: number): Promise<{ success: boolean; total: number; natural: number } | null> {
  const rolls = await actor.rollSavingThrow?.({ ability }, {}, { create: false });
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return null;
  const d20 = roll.dice?.find((die: any) => die.faces === 20);
  const natural = d20?.total ?? d20?.results?.[0]?.result ?? 0;
  return { success: (roll.total ?? 0) >= dc, total: roll.total ?? 0, natural };
}

interface EligibleFeature { opaqueId: string; label: string; category: string; description: string; spellLevel: number; }

function eligibleFeatures(target: any): EligibleFeature[] {
  const out: EligibleFeature[] = [];
  for (const item of target.items ?? []) {
    const itemCategory = item.type === "spell" ? "spell" : item.type === "feat" ? "trait" : item.type === "class" || item.type === "subclass" ? "class-feature" : null;
    if (itemCategory) out.push({ opaqueId: `item:${item.id}`, label: item.name, category: itemCategory, description: String(item.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").slice(0, 500), spellLevel: Number(item.system?.level ?? 0) });
    for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
      const type = activity.type;
      const category = type === "spell" ? "spell" : type === "attack" ? "action" : type === "save" || type === "utility" ? "trait" : null;
      if (category) out.push({ opaqueId: `activity:${item.id}:${activity._id ?? activity.id}`, label: `${item.name}: ${activity.name ?? item.name}`, category, description: String(activity.description?.value ?? item.system?.description?.value ?? "").replace(/<[^>]+>/g, " ").slice(0, 500), spellLevel: Number(item.system?.level ?? 0) });
    }
  }
  const legendary = Number(target.system?.resources?.legact?.max ?? target.system?.resources?.legres?.max ?? 0);
  if (legendary > 0) out.push({ opaqueId: "trait:legendary-resistance", label: "Legendary Resistance", category: "legendary-resistance", description: "The creature can turn a failed saving throw into a success.", spellLevel: 0 });
  return out.slice(0, 80);
}

async function chooseFeature(features: EligibleFeature[]): Promise<EligibleFeature | null> {
  if (!features.length) return null;
  const DialogV2 = (globalThis as any).foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return features[0]!;
  const chosen = await DialogV2.wait({
    window: { title: game.i18n.localize(`${P}.Siphon.PickTitle`) },
    content: `<div class="hero-engine-thargunn-picker"><p>${game.i18n.localize(`${P}.Siphon.PickHint`)}</p></div>`,
    buttons: features.map((feature, index) => ({ action: feature.opaqueId, label: `${feature.label} · ${feature.category}`, default: index === 0 })),
    rejectClose: false,
  });
  return features.find((feature) => feature.opaqueId === chosen) ?? null;
}

async function chooseCategory(): Promise<string | null> {
  const DialogV2 = (globalThis as any).foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return "trait";
  const result = await DialogV2.wait({
    window: { title: game.i18n.localize(`${P}.Siphon.CategoryTitle`) }, content: `<p>${game.i18n.localize(`${P}.Siphon.CategoryHint`)}</p>`,
    buttons: ECHO_CATEGORIES.map((category, index) => ({ action: category, label: game.i18n.localize(`${P}.Categories.${category}`), default: index === 0 })), rejectClose: false,
  });
  return typeof result === "string" ? result : null;
}

async function offerSiphon(ctx: MechanicContext, target: any, eventId: string, temporaryOverride?: boolean, chosenCategory?: string): Promise<void> {
  if (!game.user?.isGM) {
    const category = chosenCategory ?? await chooseCategory();
    if (!category) return;
    await ctx.requestSecureTarget({ kind: "siphon", eventId, targetUuid: target.uuid, weaponUuid: weapon(ctx)?.uuid, category });
    await ctx.postChat(`${P}.Siphon.SentToGm`);
    return;
  }
  const settled = ctx.state.getFlag<string[]>("settledSiphonEvents") ?? [];
  if (settled.includes(eventId)) return;
  await ctx.state.setFlag("settledSiphonEvents", [...settled.slice(-99), eventId]);
  const available = eligibleFeatures(target);
  const matching = chosenCategory ? available.filter((feature) => feature.category === chosenCategory) : available;
  const feature = await chooseFeature(matching.length ? matching : available);
  if (!feature) {
    await ctx.postChat(`${P}.Siphon.NoFeature`);
    return;
  }
  const actor = actorOf(ctx);
  const dc = Number(ctx.config<number>("siphonBaseDc") ?? 8) + Number(actor.system?.attributes?.prof ?? 0) + Number(actor.system?.abilities?.str?.mod ?? 0);
  const save = await silentSave(target, "cha", dc);
  if (!save || save.success) {
    await ctx.postChat(`${P}.Siphon.Resisted`, { target: target.name, total: save?.total ?? "—", dc });
    return;
  }
  const category = ECHO_CATEGORIES.includes(feature.category as any) ? feature.category as any : "trait";
  const tier = echoTier(category, feature.spellLevel);
  const maxTier = weaponProgression(ctx.state.get("weaponLevel")).maxTier;
  const tierRank = ["minor", "strong", "legendary", "mythic"];
  if (tierRank.indexOf(tier) > tierRank.indexOf(maxTier)) {
    await ctx.postChat(`${P}.Siphon.TooStrong`, { echo: feature.label, tier, maxTier });
    return;
  }
  const temporary = temporaryOverride ?? Number(target.system?.attributes?.hp?.value ?? 1) > 0;
  const collectionId = temporary ? "temporary-echoes" : "echoes";
  const temporarySeconds = Number(ctx.config<number>("temporaryEchoSeconds") ?? 60);
  const record = await ctx.records.create(collectionId, {
    name: feature.label, category, tier, cost: echoCost(category, feature.spellLevel), soulDamage: soulDamageDice(tier),
    description: feature.description, sourceOpaqueId: feature.opaqueId, sourceLabel: target.name,
  }, {
    temporary,
    pendingWhenFull: !temporary,
    lifecycle: temporary ? { type: "world-time", worldTime: Number(game.time?.worldTime ?? 0) + temporarySeconds } : { type: "permanent" },
    idempotencyKey: `siphon:${eventId}:${feature.opaqueId}`,
  });
  await createEchoItem(ctx, collectionId, record);
  await ctx.state.adjust("hungerTemporary", 1);
  if (ctx.state.transform()?.id === "tenth-march") await ctx.state.adjust("fractures", 1);
  await ctx.postChat(`${P}.Siphon.Captured`, { echo: record.data.name, target: target.name });
  if (temporary) {
    await target.createEmbeddedDocuments?.("ActiveEffect", [{
      name: game.i18n.localize(`${P}.Siphon.Suppressed`), img: "modules/hero-engine/assets/thargunn/icons/echo-trait.webp",
      duration: { rounds: Math.max(1, Math.ceil(temporarySeconds / 6)), seconds: temporarySeconds }, flags: { "hero-engine": { suppressionId: record.id, sourceOpaqueId: feature.opaqueId } },
    }]);
  }
}

async function createEchoItem(ctx: MechanicContext, collectionId: string, record: MechanicRecord): Promise<void> {
  const actor = actorOf(ctx);
  if (actor.items?.some?.((item: any) => item.getFlag?.("hero-engine", MANAGED_FLAG)?.recordId === record.id)) return;
  const activityId = foundry.utils.randomID();
  await actor.createEmbeddedDocuments?.("Item", [{
    name: `Eco Oco — ${String(record.data["name"] ?? "Unknown")}`,
    type: "feat",
    img: echoIcon(String(record.data["category"] ?? "trait")),
    system: {
      identifier: `hollow-echo-${record.id}`,
      description: { value: `<p>${String(record.data["description"] ?? "")}</p><p><strong>${game.i18n.localize(`${P}.Echo.Cost`)}:</strong> ${record.data["cost"]} · <strong>${game.i18n.localize(`${P}.Echo.SoulDamage`)}:</strong> ${record.data["soulDamage"]}</p>` },
      activities: { [activityId]: {
        _id: activityId, type: "utility", name: String(record.data["name"] ?? "Hollow Echo"), sort: 0,
        activation: { type: "action", value: 1, condition: "", override: true },
        consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: false },
        duration: { value: "", units: "inst", special: "", concentration: false, override: true },
        range: { units: "self", special: "", override: true },
        target: { prompt: false, affects: { type: "self", choice: false }, template: { contiguous: false, units: "ft", stationary: false }, override: true },
        uses: { spent: 0, recovery: [] }, visibility: { level: {}, requireAttunement: false, requireIdentification: false, requireMagic: false },
        roll: { prompt: false, visible: false }, effects: [], flags: { "hero-engine": { managed: true } },
      } },
    },
    flags: { "hero-engine": { managed: { key: "thargunn.item.echo", contentVersion: 1, templateVersion: 1, sourceHash: record.id, recordId: record.id }, collectionId } },
  }]);
}

async function useEcho(ctx: MechanicContext, collection: RecordCollectionDef, record: MechanicRecord): Promise<void> {
  const cost = Number(record.data["cost"] ?? 1);
  if (ctx.state.get("charges") < cost) throw new Error(game.i18n.localize(`${P}.Errors.NotEnoughCharges`));
  const actor = actorOf(ctx);
  const managedFeature = actor.items?.find((item: any) => item.getFlag?.("hero-engine", MANAGED_FLAG)?.recordId === record.id);
  const activity = managedFeature ? Object.values(managedFeature.system?.activities ?? {})[0] as any : null;
  if (activity?.use && activity.getFlag?.("hero-engine", "managed") !== true && activity.flags?.["hero-engine"]?.managed !== true) {
    const result = await activity.use();
    if (!result) return;
  } else {
    await ctx.postChat(`${P}.Echo.Used`, { echo: record.data["name"] });
  }
  await ctx.state.adjust("charges", -cost);
  await ctx.state.adjust("hungerTemporary", 1);
  const tier = String(record.data["tier"] ?? "minor");
  if (tier === "mythic") {
    await ctx.state.adjust("essenceDebt", 1);
    await reconcilePenaltyEffects(ctx);
  }
  if (ctx.state.transform()?.id === "tenth-march") await ctx.state.adjust("fractures", 1);
  const damage = await ctx.rollDice(String(record.data["soulDamage"] ?? "2d10"), `${P}.Echo.SoulDamageFlavor`);
  await actor.applyDamage?.(damage, { ignore: true });
  if (record.temporary && collection.id === "temporary-echoes") await ctx.records.expire(collection.id, record.id);
}

async function reconcilePenaltyEffects(ctx: MechanicContext): Promise<void> {
  const actor = actorOf(ctx);
  const families = [
    { key: "thargunn.effect.essence-debt", name: "Dívida de Essência", value: -10 * ctx.state.get("essenceDebt") },
    { key: "thargunn.effect.name-fracture", name: "Fratura de Nome", value: -Number(ctx.state.getFlag<number>("fractureMaxHpPenalty") ?? 0) },
  ];
  for (const family of families) {
    const effect = actor.effects?.find?.((candidate: any) => candidate.getFlag?.("hero-engine", "managed")?.key === family.key);
    if (!family.value) {
      if (effect) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      continue;
    }
    const source = {
      name: family.name, img: "modules/hero-engine/assets/thargunn/icons/echo-divine.webp",
      changes: [{ key: "system.attributes.hp.max", mode: 2, value: String(family.value), priority: 20 }],
      flags: { "hero-engine": { managed: { key: family.key, contentVersion: 1, templateVersion: 1, sourceHash: String(family.value) } } },
    };
    if (effect) await effect.update(source);
    else await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  }
  const max = Number(actor.system?.attributes?.hp?.max ?? 0);
  const current = Number(actor.system?.attributes?.hp?.value ?? 0);
  if (current > max) await actor.update({ "system.attributes.hp.value": max });
}

async function eraseEcho(ctx: MechanicContext, collection: RecordCollectionDef, record: MechanicRecord): Promise<void> {
  const tier = String(record.data["tier"] ?? "minor") as "minor" | "strong" | "legendary" | "mythic";
  const dc = erasureDc(tier);
  const save = await silentSave(actorOf(ctx), "wis", dc);
  await ctx.records.remove(collection.id, record.id, `erase:${record.id}`);
  await ctx.state.adjust("hungerTemporary", 1);
  if (save?.success) return;
  const result = await ctx.rollTable("erasure-price");
  await ctx.postChat(`${P}.Echo.ErasureFailed`, { result: game.i18n.localize(result.textKey), dc });
}

async function activateUltimate(ctx: MechanicContext): Promise<void> {
  const actor = actorOf(ctx);
  const item = weapon(ctx);
  const failures = canUseUltimate({
    raging: isRaging(actor) || ctx.state.getFlag<boolean>("overrideRage") === true,
    skeldrPresent: ctx.state.getFlag<boolean>("skeldrPresent") !== false,
    attuned: item?.system?.attuned === true || ctx.state.getFlag<boolean>("overrideAttunement") === true,
    ultimateReady: ctx.state.getFlag<boolean>("ultimateReady") !== false,
  });
  if (failures.length && !ctx.state.getFlag<boolean>("ultimateOverride")) throw new Error(`${game.i18n.localize(`${P}.Ultimate.Blocked`)}: ${failures.join(", ")}`);
  let access: PromptResult | null = { promptId: "ultimate-access", success: true };
  if (!ctx.state.getFlag<boolean>("bondBroken")) access = await ctx.openPrompt("ultimate-access");
  const usurped = access?.success === false;
  await ctx.state.setFlag("ultimateUsurped", usurped);
  await ctx.state.setFlag("ultimateTurns", 0);
  await ctx.state.setFlag("ultimateReady", false);
  await ctx.state.set("fractures", usurped ? 2 : 0);
  await ctx.state.set("legendaryPoints", 3);
  await ctx.state.setFlag("ultimateActive", true);
  await ctx.state.setFlag("skeldrMovement", 0);
  await ctx.activateTransform("tenth-march");
}

async function finishUltimate(ctx: MechanicContext): Promise<void> {
  const fractures = ctx.state.get("fractures");
  const damage = await ctx.rollDice(ultimateExpiryDamage(fractures), `${P}.Ultimate.ExpiryDamage`);
  await actorOf(ctx).applyDamage?.(damage, { ignore: true });
  for (const consequence of fractureConsequences(fractures)) {
    if (consequence === "max-hp-10") await ctx.state.setFlag("fractureMaxHpPenalty", 10);
    if (consequence === "skeldr-absent") await ctx.state.setFlag("skeldrPresent", false);
    if (consequence === "block-echo-slot") await ctx.queueAdjudication("fracture-block-slot");
    if (consequence === "identity-ruling") await ctx.queueAdjudication("fracture-identity");
  }
  await reconcilePenaltyEffects(ctx);
  await ctx.state.set("legendaryPoints", 0);
  await ctx.state.setFlag("ultimateActive", false);
}

async function runRite(ctx: MechanicContext): Promise<void> {
  if (ctx.state.get("legends") < 10) throw new Error(game.i18n.localize(`${P}.Rite.NeedsLegends`));
  const actor = actorOf(ctx);
  const rolls: number[] = [];
  let naturalOnes = 0;
  const riteDc = Number(ctx.config<number>("riteDc") ?? 25);
  for (const ability of ["str", "wis", "cha"]) {
    const result = await silentSave(actor, ability, riteDc);
    rolls.push(result?.total ?? 0);
    if (result?.natural === 1) naturalOnes += 1;
  }
  const outcome = riteOutcome(rolls, naturalOnes);
  if (outcome.success) {
    await ctx.state.setFlag("bondBroken", true);
    await ctx.postChat(`${P}.Rite.Success`);
  } else {
    await ctx.state.adjust("essenceDebt", outcome.debt);
    await ctx.queueAdjudication("rite-block-slot");
    if (outcome.escalation) await ctx.queueAdjudication("rite-name-escalation");
    await ctx.postChat(`${P}.Rite.Failure`);
  }
}

async function addRecordedLegend(ctx: MechanicContext, name?: string, description = ""): Promise<void> {
  let legendName = name;
  if (!legendName) {
    const DialogV2 = (globalThis as any).foundry?.applications?.api?.DialogV2;
    legendName = DialogV2 ? await DialogV2.prompt({
      window: { title: game.i18n.localize(`${P}.Legends.Add`) },
      content: `<input type="text" name="legend" placeholder="${game.i18n.localize(`${P}.Legends.Name`)}" />`,
      ok: { callback: (_event: unknown, button: any) => button.form?.elements?.legend?.value }, rejectClose: false,
    }) : `Legend ${ctx.state.get("legends") + 1}`;
  }
  if (!legendName) return;
  await ctx.records.create("recorded-legends", { name: legendName, description }, { lifecycle: { type: "permanent" } });
  await ctx.state.set("legends", ctx.records.list("recorded-legends").slots.filter((slot) => slot.record).length);
}

async function createMarchField(ctx: MechanicContext): Promise<void> {
  const actor = actorOf(ctx);
  const existing = actor.effects?.find?.((effect: any) => effect.getFlag?.("hero-engine", "managed")?.key === "thargunn.effect.tenth-march-field");
  const source = {
    name: "Campo da Décima Marcha", img: "modules/hero-engine/assets/thargunn/tenth-march-aura.webp",
    duration: { seconds: Number(ctx.config<number>("fieldSeconds") ?? 60) },
    flags: { "hero-engine": { managed: { key: "thargunn.effect.tenth-march-field", contentVersion: 1, templateVersion: 1, sourceHash: "field-v1" }, radius: Number(ctx.config<number>("fieldRadius") ?? 165) } },
  };
  if (existing) await existing.update(source);
  else await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  const token = actor.getActiveTokens?.()[0];
  const Sequence = (globalThis as any).Sequence;
  if (token && Sequence) {
    try {
      await new Sequence().effect().file("modules/hero-engine/assets/thargunn/tenth-march-aura.webp").attachTo(token).scale(7).opacity(0.62).belowTokens().persist().name(`hero-engine-field-${actor.id}`).play();
    } catch { /* Sequencer is an optional enhancement; the managed effect remains authoritative. */ }
  }
}

const hooks = {
  async onAttach(ctx: MechanicContext) {
    const defaults: Record<string, unknown> = {
      ultimateReady: true, skeldrPresent: true, fieldActive: false, fieldLocked: false,
      bondBroken: false, bloodSinceDawn: false, ultimateUsurped: false,
    };
    for (const [key, value] of Object.entries(defaults)) if (ctx.state.getFlag(key) === undefined) await ctx.state.setFlag(key, value);
  },
  async onTrigger(ctx: MechanicContext, trigger: TriggerDef, payload: TriggerPayload) {
    if (trigger.id === "long-rest") {
      await ctx.state.set("hungerTemporary", 0);
      await ctx.state.setFlag("ultimateReady", true);
      await ctx.state.setFlag("fieldLocked", false);
      return;
    }
    if (trigger.id === "short-rest") {
      await ctx.state.setFlag("skeldrHungerGuardUsed", false);
      return;
    }
    if (trigger.id === "field-expiry" && ctx.state.getFlag<boolean>("fieldActive")) {
      const expires = Number(ctx.state.getFlag<number>("fieldExpires") ?? 0);
      if (expires > 0 && Number(payload.data?.["worldTime"] ?? game.time?.worldTime ?? 0) >= expires) {
        await ctx.state.setFlag("fieldActive", false);
        const actor = actorOf(ctx);
        const effect = actor.effects?.find?.((candidate: any) => candidate.getFlag?.("hero-engine", "managed")?.key === "thargunn.effect.tenth-march-field");
        if (effect) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
        await (globalThis as any).Sequencer?.EffectManager?.endEffects?.({ name: `hero-engine-field-${actor.id}` });
      }
      return;
    }
    if (trigger.id === "turn-start" && ctx.state.transform()?.id === "tenth-march") {
      const turn = Number(ctx.state.getFlag<number>("ultimateTurns") ?? 0) + 1;
      await ctx.state.setFlag("ultimateTurns", turn);
      await ctx.state.set("legendaryPoints", 3);
      await ctx.state.setFlag("ultimateSiphonsThisTurn", 0);
      if (turn > 5) await ctx.endTransform();
      return;
    }
    if (trigger.id === "turn-end" && ctx.state.transform()?.id === "tenth-march") {
      await ctx.state.set("legendaryPoints", 0);
      return;
    }
    if (trigger.id === "siphon-normal" || trigger.id === "siphon-kill") {
      const item = weapon(ctx);
      if (!item || payload.data?.["itemUuid"] !== item.uuid) return;
      const targetUuid = String(payload.data?.["targetUuid"] ?? "");
      const targetDoc = targetUuid ? await (globalThis as any).fromUuid?.(targetUuid) : null;
      const target = targetDoc?.actor ?? targetDoc;
      if (target) await offerSiphon(ctx, target, String(payload.data?.["eventId"] ?? foundry.utils.randomID()));
      return;
    }
    if (trigger.id === "blood-hit") {
      const item = weapon(ctx);
      if (!item || payload.data?.["itemUuid"] !== item.uuid) return;
      const targetDoc = payload.data?.["targetUuid"] ? await (globalThis as any).fromUuid?.(payload.data["targetUuid"]) : null;
      const target = targetDoc?.actor ?? targetDoc;
      const creatureType = String(target?.system?.details?.type?.value ?? "").toLowerCase();
      if (target && !["undead", "construct"].includes(creatureType) && Number(target.system?.attributes?.hp?.max ?? 0) > 0) await ctx.state.setFlag("bloodSinceDawn", true);
      return;
    }
    if (trigger.id === "ultimate-hit" && ctx.state.transform()?.id === "tenth-march") {
      const item = weapon(ctx);
      if (!item || payload.data?.["itemUuid"] !== item.uuid) return;
      const targetUuid = String(payload.data?.["targetUuid"] ?? "");
      const targetDoc = targetUuid ? await (globalThis as any).fromUuid?.(targetUuid) : null;
      const target = targetDoc?.actor ?? targetDoc;
      if (!target) return;
      if (ctx.state.getFlag<boolean>("thunderousStepArmed")) {
        const gargantuan = ["grg", "gargantuan"].includes(String(target.system?.traits?.size ?? target.system?.details?.type?.value));
        const damage = await ctx.rollDice(gargantuan ? "12d12 + 8d12" : "8d12 + 8d12", `${P}.Ultimate.ThunderousDamage`);
        await target.applyDamage?.(damage);
        if (!gargantuan) {
          const dc = 8 + Number(actorOf(ctx).system?.attributes?.prof ?? 0) + Number(actorOf(ctx).system?.abilities?.str?.mod ?? 0);
          const save = await silentSave(target, "str", dc);
          if (save && !save.success) await ctx.postChat(`${P}.Ultimate.ThunderousFailed`, { target: target.name });
        }
        await ctx.state.setFlag("thunderousStepArmed", false);
      }
      const count = Number(ctx.state.getFlag<number>("ultimateSiphonsThisTurn") ?? 0);
      if (count < 1) {
        await offerSiphon(ctx, target, `ultimate:${payload.data?.["eventId"] ?? foundry.utils.randomID()}`, true);
        await ctx.state.setFlag("ultimateSiphonsThisTurn", 1);
      }
    }
  },
  async onActionUse(ctx: MechanicContext, action: any) {
    if (action.id === "siphon-manual") {
      const target = [...(game.user?.targets ?? [])][0]?.actor;
      if (!target) throw new Error(game.i18n.localize(`${P}.Errors.SelectTarget`));
      await offerSiphon(ctx, target, `manual:${foundry.utils.randomID()}`);
    } else if (action.id === "field") {
      const charges = ctx.state.get("charges");
      if (charges < 1 || ctx.state.getFlag("fieldLocked")) throw new Error(game.i18n.localize(`${P}.Field.Unavailable`));
      await ctx.state.set("charges", 0);
      await ctx.state.adjust("hungerTemporary", 1);
      if (ctx.state.transform()?.id === "tenth-march") await ctx.state.adjust("fractures", 1);
      await ctx.state.setFlag("fieldActive", true);
      await ctx.state.setFlag("fieldLocked", true);
      await ctx.state.setFlag("fieldExpires", Number(game.time?.worldTime ?? 0) + Number(ctx.config<number>("fieldSeconds") ?? 60));
      await createMarchField(ctx);
      await ctx.postChat(`${P}.Field.Activated`, { charges });
    } else if (action.id === "ultimate") await activateUltimate(ctx);
    else if (action.id === "skeldr-move") {
      const distance = Number(ctx.state.getFlag<number>("skeldrMovement") ?? 0) + 60;
      await ctx.state.setFlag("skeldrMovement", distance);
      if (distance >= 20) await ctx.state.setFlag("thunderousStepArmed", true);
      await ctx.postChat(`${P}.Ultimate.SkeldrMoves`, { distance: 60 });
    } else if (action.id === "mighty-impel") await ctx.postChat(`${P}.Ultimate.MightyImpel`);
    else if (action.id === "devastating-strike") {
      const target = [...(game.user?.targets ?? [])][0]?.actor;
      if (!target) throw new Error(game.i18n.localize(`${P}.Errors.SelectTarget`));
      const damage = await ctx.rollDice(String(ctx.config<string>("provisionalStrikeDamage") ?? "4d12 + 4d12"), `${P}.Ultimate.DevastatingDamage`);
      await target.applyDamage?.(damage);
    } else if (action.id === "legendary-echo") {
      const record = ctx.records.list("echoes").slots.find((slot) => slot.record)?.record;
      if (!record) throw new Error(game.i18n.localize(`${P}.Echo.None`));
      await useEcho(ctx, thargunnMythic.recordCollections!.find((collection) => collection.id === "echoes")!, record);
    } else if (action.id === "second-siphon") {
      const target = [...(game.user?.targets ?? [])][0]?.actor;
      if (!target) throw new Error(game.i18n.localize(`${P}.Errors.SelectTarget`));
      await offerSiphon(ctx, target, `ultimate-second:${foundry.utils.randomID()}`, true);
      await ctx.state.adjust("fractures", 1);
    } else if (action.id === "skeldr-rescue") {
      const target = [...(game.user?.targets ?? [])][0]?.actor;
      if (!target) throw new Error(game.i18n.localize(`${P}.Errors.SelectTarget`));
      if (Number(target.system?.attributes?.hp?.value ?? 1) <= 0) await target.update({ "system.attributes.hp.value": 1 });
      await ctx.state.adjust("fractures", 1);
    }
    else if (action.id === "skeldr-hunger-guard") {
      if (ctx.state.getFlag<boolean>("skeldrPresent") === false || ctx.state.getFlag<boolean>("skeldrHungerGuardUsed")) throw new Error(game.i18n.localize(`${P}.Skeldr.GuardUnavailable`));
      await ctx.state.adjust("hungerTemporary", -1);
      await ctx.state.setFlag("skeldrHungerGuardUsed", true);
      await ctx.postChat(`${P}.Skeldr.Guarded`);
    } else if (action.id === "skeldr-early-return") {
      await ctx.state.setFlag("skeldrPresent", true);
      await ctx.state.setFlag("skeldrReturnAt", 0);
      await addRecordedLegend(ctx, game.i18n.localize(`${P}.Skeldr.EarlyLegend`), game.i18n.localize(`${P}.Skeldr.EarlyLegendHint`));
    } else if (action.id === "record-legend") await addRecordedLegend(ctx);
    else if (action.id === "rite") await runRite(ctx);
    else if (action.id === "purify") await ctx.queueAdjudication("purification");
  },
  async onRecordAction(ctx: MechanicContext, collection: RecordCollectionDef, record: MechanicRecord, action: RecordActionDef) {
    if (action.id === "use") await useEcho(ctx, collection, record);
    if (action.id === "erase") await eraseEcho(ctx, collection, record);
  },
  async onAdjudicated(ctx: MechanicContext, adjudication: any, resultId: string) {
    if (adjudication.id === "purification") {
      if (resultId === "hunger") await ctx.state.set("hungerPermanent", 0);
      if (resultId === "debt") await ctx.state.set("essenceDebt", 0);
      if (resultId === "skeldr") await ctx.state.setFlag("skeldrPresent", true);
      if (resultId === "fracture") await ctx.state.setFlag("fractureMaxHpPenalty", 0);
      if (resultId === "slot") {
        const slot = ctx.records.list("echoes").slots.find((candidate) => candidate.blocked);
        if (slot) await ctx.records.unblock("echoes", slot.id);
      }
      await reconcilePenaltyEffects(ctx);
    }
    if (["fracture-block-slot", "rite-block-slot"].includes(adjudication.id) && resultId === "confirm") {
      const slot = ctx.records.list("echoes").slots.find((candidate) => !candidate.blocked);
      if (slot) await ctx.records.block("echoes", slot.id, adjudication.id);
    }
  },
  async onSecureTargetRequest(ctx: MechanicContext, request: any, target: any) {
    if (request.kind === "siphon") await offerSiphon(ctx, target, request.eventId, undefined, request.category);
  },
  async onTransformExpire(ctx: MechanicContext) { await finishUltimate(ctx); },
};

export const thargunnMythic: MechanicPlugin = {
  id: "thargunn-mythic", version: "1.0.0", archetype: "character",
  nameKey: `${P}.Name`, descriptionKey: `${P}.Description`,
  trackers: [
    { id: "weaponLevel", labelKey: `${P}.Trackers.WeaponLevel`, min: 1, max: 5, initial: 1 },
    { id: "hungerTemporary", labelKey: `${P}.Trackers.HungerTemporary`, min: 0, max: 10, initial: 0, thresholds: [3,5,7,10].map((at) => ({ at, labelKey: `${P}.Hunger.T${at}` })) },
    { id: "hungerPermanent", labelKey: `${P}.Trackers.HungerPermanent`, min: 0, max: 10, initial: 0 },
    { id: "essenceDebt", labelKey: `${P}.Trackers.EssenceDebt`, min: 0, max: 5, initial: 0, thresholds: [{ at: 3, labelKey: `${P}.Debt.T3` }, { at: 5, labelKey: `${P}.Debt.T5` }] },
    { id: "legends", labelKey: `${P}.Trackers.Legends`, min: 0, max: 10, initial: 0 },
    { id: "fractures", labelKey: `${P}.Trackers.Fractures`, min: 0, max: 10, initial: 0 },
  ],
  resources: [
    { id: "charges", labelKey: `${P}.Resources.Charges`, max: "5 + min(@weaponLevel - 1, 3) + max(0, @weaponLevel - 4)", initial: 5, recharge: [{ on: "dawn", amount: "full", conditionFlag: "bloodSinceDawn", fallbackAmount: "none" }] },
    { id: "legendaryPoints", labelKey: `${P}.Resources.LegendaryPoints`, max: 3, initial: 0 },
  ],
  recordCollections: [
    { id: "echoes", labelKey: `${P}.Echo.Permanent`, descriptionKey: `${P}.Echo.PermanentHint`, schemaVersion: 1, capacity: "2 + @weaponLevel", visibility: "owner", lifecycle: { type: "permanent" },
      fields: [
        { key: "name", type: "string", labelKey: `${P}.Echo.Name`, required: true }, { key: "category", type: "choice", labelKey: `${P}.Echo.Category`, choices: ECHO_CATEGORIES, required: true },
        { key: "tier", type: "choice", labelKey: `${P}.Echo.Tier`, choices: ["minor","strong","legendary","mythic"], required: true }, { key: "cost", type: "number", labelKey: `${P}.Echo.Cost`, min: 1, required: true },
        { key: "soulDamage", type: "string", labelKey: `${P}.Echo.SoulDamage`, required: true }, { key: "description", type: "string", labelKey: `${P}.Echo.Description` },
        { key: "sourceOpaqueId", type: "string", labelKey: `${P}.Echo.Source` }, { key: "sourceLabel", type: "string", labelKey: `${P}.Echo.Source` },
      ], actions: [{ id: "use", labelKey: `${P}.Echo.Use`, ownerOnly: true }, { id: "erase", labelKey: `${P}.Echo.Erase`, ownerOnly: true, destructive: true }] },
    { id: "temporary-echoes", labelKey: `${P}.Echo.Temporary`, descriptionKey: `${P}.Echo.TemporaryHint`, schemaVersion: 1, capacity: 10, visibility: "owner", lifecycle: { type: "world-time", duration: 60 },
      fields: [
        { key: "name", type: "string", labelKey: `${P}.Echo.Name`, required: true }, { key: "category", type: "choice", labelKey: `${P}.Echo.Category`, choices: ECHO_CATEGORIES, required: true },
        { key: "tier", type: "choice", labelKey: `${P}.Echo.Tier`, choices: ["minor","strong","legendary","mythic"], required: true }, { key: "cost", type: "number", labelKey: `${P}.Echo.Cost`, min: 1, required: true },
        { key: "soulDamage", type: "string", labelKey: `${P}.Echo.SoulDamage`, required: true }, { key: "description", type: "string", labelKey: `${P}.Echo.Description` },
        { key: "sourceOpaqueId", type: "string", labelKey: `${P}.Echo.Source` }, { key: "sourceLabel", type: "string", labelKey: `${P}.Echo.Source` },
      ], actions: [{ id: "use", labelKey: `${P}.Echo.Use`, ownerOnly: true }] },
    { id: "recorded-legends", labelKey: `${P}.Legends.Collection`, schemaVersion: 1, capacity: 10, visibility: "gm", lifecycle: { type: "permanent" },
      fields: [{ key: "name", type: "string", labelKey: `${P}.Legends.Name`, required: true }, { key: "description", type: "string", labelKey: `${P}.Legends.Description` }], actions: [] },
  ],
  prompts: [{ id: "ultimate-access", titleKey: `${P}.Ultimate.AccessTitle`, bodyKey: `${P}.Ultimate.AccessBody`, optional: false,
    save: { abilities: ["wis", "cha"], dcFormula: "24 + @essenceDebt - @legends", nat20AutoSuccess: true, nat1AutoFailure: true } }],
  triggers: [
    { id: "siphon-normal", labelKey: `${P}.Siphon.Action`, event: "crit-dealt", runHook: true, manualFallback: false },
    { id: "siphon-kill", labelKey: `${P}.Siphon.Action`, event: "reduced-to-zero", runHook: true, manualFallback: false },
    { id: "blood-hit", labelKey: `${P}.Recharge.BloodHit`, event: "attack-hit", runHook: true, manualFallback: false },
    { id: "long-rest", labelKey: `${P}.Triggers.LongRest`, event: "rest-long", runHook: true, manualFallback: false },
    { id: "short-rest", labelKey: `${P}.Triggers.ShortRest`, event: "rest-short", runHook: true, manualFallback: false },
    { id: "field-expiry", labelKey: `${P}.Field.Expiry`, event: "world-time-advanced", runHook: true, manualFallback: false },
    { id: "turn-start", labelKey: `${P}.Triggers.TurnStart`, event: "turn-start", runHook: true, manualFallback: false },
    { id: "turn-end", labelKey: `${P}.Triggers.TurnEnd`, event: "turn-end", runHook: true, manualFallback: false },
    { id: "ultimate-hit", labelKey: `${P}.Ultimate.ThunderousStep`, event: "attack-hit", runHook: true, manualFallback: false },
  ],
  actions: [
    { id: "siphon-manual", labelKey: `${P}.Siphon.Action`, runHook: true },
    { id: "field", labelKey: `${P}.Field.Action`, runHook: true, cooldown: { type: "longRest" } },
    { id: "ultimate", labelKey: `${P}.Ultimate.Action`, runHook: true, cooldown: { type: "longRest" } },
    { id: "rite", labelKey: `${P}.Rite.Action`, gmOnly: true, runHook: true },
    { id: "purify", labelKey: `${P}.Purification.Action`, gmOnly: true, runHook: true },
    { id: "skeldr-move", labelKey: `${P}.Ultimate.SkeldrMove`, costs: [{ resource: "legendaryPoints", amount: 1 }], requiresFlag: "ultimateActive", runHook: true },
    { id: "mighty-impel", labelKey: `${P}.Ultimate.MightyImpelAction`, costs: [{ resource: "legendaryPoints", amount: 1 }], requiresFlag: "ultimateActive", runHook: true },
    { id: "devastating-strike", labelKey: `${P}.Ultimate.DevastatingStrike`, costs: [{ resource: "legendaryPoints", amount: 2 }], requiresFlag: "ultimateActive", runHook: true },
    { id: "legendary-echo", labelKey: `${P}.Ultimate.LegendaryEcho`, costs: [{ resource: "legendaryPoints", amount: 2 }], requiresFlag: "ultimateActive", runHook: true },
    { id: "second-siphon", labelKey: `${P}.Ultimate.SecondSiphon`, costs: [{ resource: "legendaryPoints", amount: 3 }], requiresFlag: "ultimateActive", runHook: true },
    { id: "skeldr-rescue", labelKey: `${P}.Ultimate.SkeldrRescue`, costs: [{ resource: "legendaryPoints", amount: 3 }], requiresFlag: "ultimateActive", runHook: true },
    { id: "skeldr-hunger-guard", labelKey: `${P}.Skeldr.GuardAction`, runHook: true },
    { id: "skeldr-early-return", labelKey: `${P}.Skeldr.EarlyReturn`, gmOnly: true, runHook: true },
    { id: "record-legend", labelKey: `${P}.Legends.Add`, gmOnly: true, runHook: true },
  ],
  transformations: [{ id: "tenth-march", labelKey: `${P}.Ultimate.Name`, strategy: "actor-swap", durationRounds: "@cfg.ultimateRounds",
    swap: { formActorName: "Thar’gunn - Ultimate", hpCarry: "keep-percent" }, onExpire: { runHook: true, chatKey: `${P}.Ultimate.Ended` } }],
  tables: [{ id: "erasure-price", labelKey: `${P}.Echo.ErasureTable`, die: "1d6", entries: [1,2,3,4,5,6].map((roll) => ({ min: roll, max: roll, textKey: `${P}.Echo.Erasure${roll}` })) }],
  adjudications: [
    { id: "secure-siphon", titleKey: `${P}.Siphon.GmTitle`, descriptionKey: `${P}.Siphon.GmHint`, kind: "confirm" },
    { id: "fracture-block-slot", titleKey: `${P}.Ultimate.BlockSlot`, kind: "confirm" }, { id: "fracture-identity", titleKey: `${P}.Ultimate.IdentityRuling`, kind: "confirm" },
    { id: "rite-block-slot", titleKey: `${P}.Rite.BlockSlot`, kind: "confirm" }, { id: "rite-name-escalation", titleKey: `${P}.Rite.NameEscalation`, kind: "confirm" },
    { id: "purification", titleKey: `${P}.Purification.Title`, descriptionKey: `${P}.Purification.Hint`, kind: "choice", choices: ["hunger","debt","slot","skeldr","fracture"].map((id) => ({ id, labelKey: `${P}.Purification.${id}` })) },
  ],
  configSchema: [
    { key: "siphonBaseDc", type: "number", labelKey: `${P}.Config.SiphonBaseDc`, default: 8, min: 1, groupKey: `${P}.Config.Siphon` },
    { key: "temporaryEchoSeconds", type: "number", labelKey: `${P}.Config.TemporarySeconds`, default: 60, min: 6, groupKey: `${P}.Config.Siphon` },
    { key: "fieldRadius", type: "number", labelKey: `${P}.Config.FieldRadius`, default: 165, min: 5, groupKey: `${P}.Config.Field` },
    { key: "fieldSeconds", type: "number", labelKey: `${P}.Config.FieldSeconds`, default: 60, min: 6, groupKey: `${P}.Config.Field` },
    { key: "ultimateRounds", type: "number", labelKey: `${P}.Config.UltimateRounds`, default: 5, min: 1, groupKey: `${P}.Config.Ultimate` },
    { key: "provisionalStrikeDamage", type: "dice", labelKey: `${P}.Config.StrikeDamage`, default: "4d12 + 4d12", groupKey: `${P}.Config.Ultimate` },
    { key: "skeldrReturnDays", type: "dice", labelKey: `${P}.Config.SkeldrReturn`, default: "1d4", groupKey: `${P}.Config.Skeldr` },
    { key: "riteDc", type: "number", labelKey: `${P}.Config.RiteDc`, default: 25, min: 1, groupKey: `${P}.Config.Rite` },
  ],
  hooks,
};
