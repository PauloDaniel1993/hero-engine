import { MODULE_ID, SETTINGS } from "../constants";
import { attachMechanic } from "../engine/attach";
import { contextFor, executeAction } from "../engine/runtime";
import { resolveAttachment } from "../engine/state";
import { skeldrStats } from "../plugins/thargunn/rules";

const CONTENT_VERSION = 1;
const TEMPLATE_VERSION = 2;
const DEFAULT_BASE_ID = "Owx9HA0KRtcB8xWe";
const DEFAULT_ULTIMATE_ID = "VJ2nFvMjvYiHIO7w";
const SOURCE_WEAPON_ID = "m2guptM3HxmWjIsH";

export interface ManagedMetadata { key: string; contentVersion: number; templateVersion: number; sourceHash: string; recordId?: string; }
export interface InstallChange { kind: "Actor" | "Item" | "Macro" | "Attachment" | "Collision"; key: string; action: "create" | "update" | "adopt" | "noop" | "report"; documentUuid?: string; details: string[]; }
export interface InstallReport { dryRun: boolean; baseActorId?: string; ultimateActorId?: string; changes: InstallChange[]; warnings: string[]; }

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function stableHash(value: unknown): string {
  const text = stableSerialize(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function metadata(key: string, source: unknown, extra: Partial<ManagedMetadata> = {}): ManagedMetadata {
  return { key, contentVersion: CONTENT_VERSION, templateVersion: TEMPLATE_VERSION, sourceHash: stableHash(source), ...extra };
}

export const ULTIMATE_WEAPON_REACH = 10;

/** dnd5e 5.x stores melee reach separately from ranged distance. */
export function ultimateWeaponRangeUpdate(): Record<string, unknown> {
  return {
    "system.range.value": null,
    "system.range.long": null,
    "system.range.reach": ULTIMATE_WEAPON_REACH,
    "system.range.units": "ft",
  };
}

/**
 * The base character has already spent Rage to satisfy the Ultimate
 * prerequisite. This form effect carries that state into the dnd5e actor swap
 * without consuming a second use of the Rage Item.
 */
export function ultimateRageEffectSource(): Record<string, unknown> {
  const key = "thargunn.effect.ultimate-rage";
  const changes = [
    { key: "system.bonuses.mwak.damage", mode: 2, value: "@scale.barbarian.rage-damage", priority: 20 },
    { key: "system.traits.dr.value", mode: 2, value: "bludgeoning", priority: 20 },
    { key: "system.traits.dr.value", mode: 2, value: "piercing", priority: 20 },
    { key: "system.traits.dr.value", mode: 2, value: "slashing", priority: 20 },
    { key: "system.abilities.str.save.roll.mode", mode: 2, value: 1, priority: 20 },
    { key: "system.abilities.str.check.roll.mode", mode: 2, value: 1, priority: 20 },
  ];
  return {
    name: "Fúria da Décima Marcha",
    img: "icons/creatures/abilities/mouth-teeth-human.webp",
    transfer: false,
    statuses: ["rage"],
    changes,
    flags: { [MODULE_ID]: { managed: metadata(key, { statuses: ["rage"], changes }) } },
  };
}

function keyOf(doc: any): string | undefined { return doc?.getFlag?.(MODULE_ID, "managed")?.key ?? doc?.flags?.[MODULE_ID]?.managed?.key; }
function findActor(key: string): any | null { return game.actors?.find((actor: any) => keyOf(actor) === key) ?? null; }
function findItem(actor: any, key: string): any | null { return actor.items?.find((item: any) => keyOf(item) === key) ?? null; }
function findMacro(key: string): any | null { return game.macros?.find((macro: any) => keyOf(macro) === key) ?? null; }

const featureTemplates = [
  ["thargunn.item.siphon", "Sifão de Essência", "Attempt to steal one eligible feature and store it as a Hollow Echo.", "siphon-manual"],
  ["thargunn.item.field", "Campo da Décima Marcha", "Spend every remaining charge to create the moving 165-foot mythic field.", "field"],
  ["thargunn.item.ultimate", "A Marcha da Décima Lenda", "Enter the native level-20 Ultimate form for five of Thar’gunn’s turns.", "ultimate"],
  ["thargunn.item.rite", "Rito da Décima Lenda", "Resolve the three DC 25 checks that can break the Sovereign’s bond.", "rite"],
] as const;

const macroTemplates = [
  ["thargunn.macro.open", "Thar’gunn — Mecânicas", `const a = canvas.tokens.controlled[0]?.actor ?? game.user.character; game.modules.get("hero-engine").api.openMechanics(a);`],
  ["thargunn.macro.siphon", "Thar’gunn — Sifão", `const a = canvas.tokens.controlled[0]?.actor ?? game.user.character; await game.modules.get("hero-engine").api.runAction(a,"thargunn-mythic","siphon-manual");`],
  ["thargunn.macro.ultimate", "Thar’gunn — Ultimate", `const a = canvas.tokens.controlled[0]?.actor ?? game.user.character; await game.modules.get("hero-engine").api.runAction(a,"thargunn-mythic","ultimate");`],
  ["thargunn.macro.field", "Thar’gunn — Campo", `const a = canvas.tokens.controlled[0]?.actor ?? game.user.character; await game.modules.get("hero-engine").api.runAction(a,"thargunn-mythic","field");`],
] as const;

function locate(options: { baseActorId?: string; ultimateActorId?: string }) {
  const base = game.actors?.get(options.baseActorId ?? DEFAULT_BASE_ID) ?? findActor("thargunn.actor.base") ?? game.actors?.getName?.("Thar’gunn");
  const ultimate = game.actors?.get(options.ultimateActorId ?? DEFAULT_ULTIMATE_ID) ?? findActor("thargunn.actor.ultimate") ?? game.actors?.getName?.("Thar’gunn - Ultimate");
  return { base, ultimate };
}

export async function previewThargunnInstall(options: { baseActorId?: string; ultimateActorId?: string } = {}): Promise<InstallReport> {
  const { base, ultimate } = locate(options);
  const report: InstallReport = { dryRun: true, baseActorId: base?.id, ultimateActorId: ultimate?.id, changes: [], warnings: [] };
  if (!base) report.warnings.push("Thar’gunn base actor was not found.");
  if (!ultimate) report.warnings.push("Thar’gunn - Ultimate actor was not found.");
  if (!base || !ultimate) return report;
  report.changes.push({ kind: "Actor", key: "thargunn.actor.base", action: keyOf(base) ? "update" : "adopt", documentUuid: base.uuid, details: ["managed metadata", "preserve biography, inventory, ownership and token identity"] });
  report.changes.push({ kind: "Actor", key: "thargunn.actor.ultimate", action: keyOf(ultimate) ? "update" : "adopt", documentUuid: ultimate.uuid, details: ["native level-20 form", "automatic Rage", "Huge 3×3 prototype", "preserve unrelated character fields"] });
  const existingSkeldr = findActor("thargunn.actor.skeldr");
  report.changes.push({ kind: "Actor", key: "thargunn.actor.skeldr", action: existingSkeldr ? "update" : "create", documentUuid: existingSkeldr?.uuid, details: ["Huge guardian", "mirror Thar’gunn owners", "scaled combat statistics"] });
  const managedWeapon = findItem(base, "thargunn.item.weapon");
  const sourceWeapon = base.items?.get?.(SOURCE_WEAPON_ID) ?? base.items?.find((item: any) => item.name === "Nine Lives Stealer Halberd");
  if (!managedWeapon && !sourceWeapon) report.warnings.push("The recorded Nine Lives Stealer Halberd source item is missing; DDB repair cannot adopt it automatically.");
  else report.changes.push({ kind: "Item", key: "thargunn.item.weapon", action: managedWeapon ? "update" : "adopt", documentUuid: (managedWeapon ?? sourceWeapon)?.uuid, details: ["name/art/description", "three weapon-form activities", "preserve attunement and unrelated DDB fields"] });
  const ultimateWeapon = findItem(ultimate, "thargunn.item.weapon") ?? ultimate.items?.find((item: any) => item.name === "Nine Lives Stealer Halberd" || item.name === "Ladrão da Décima Vida");
  if (ultimateWeapon) report.changes.push({ kind: "Item", key: "thargunn.item.weapon", action: findItem(ultimate, "thargunn.item.weapon") ? "update" : "adopt", documentUuid: ultimateWeapon.uuid, details: ["Ultimate copy", "10-foot melee reach", "same three managed weapon forms"] });
  for (const [key] of featureTemplates) report.changes.push({ kind: "Item", key, action: findItem(base, key) ? "update" : "create", details: ["managed feature", "stable workflow key"] });
  for (const [key] of macroTemplates) report.changes.push({ kind: "Macro", key, action: findMacro(key) ? "update" : "create", details: ["stable Hero Engine API command"] });
  if (!resolveAttachment(base, "thargunn-mythic")) report.changes.push({ kind: "Attachment", key: "thargunn-mythic", action: "create", documentUuid: base.uuid, details: ["fresh level-1 state", "5 charges", "3 empty Echo slots"] });
  const subclasses = base.items?.filter((item: any) => item.type === "subclass" && /giant/i.test(`${item.name} ${item.system?.identifier}`)) ?? [];
  if (subclasses.length > 1) report.changes.push({ kind: "Collision", key: "thargunn.subclass.giant", action: "report", details: subclasses.map((item: any) => `${item.id}: ${item.name}`) });
  return report;
}

async function setManaged(doc: any, key: string, source: unknown, extra: Partial<ManagedMetadata> = {}): Promise<void> {
  await doc.setFlag(MODULE_ID, "managed", metadata(key, source, extra));
}

function clonedActivities(source: any): Record<string, unknown> {
  const current = foundry.utils.deepClone(source.toObject?.().system?.activities ?? source.system?.activities ?? {});
  const base = foundry.utils.deepClone(Object.values(current)[0] ?? null) as any;
  if (!base) return current;
  const activities: Record<string, unknown> = {};
  const forms = [
    ["TgHalberdAtk0001", "Forma de Alabarda"],
    ["TgGreatAxeAtk001", "Forma de Machado Grande"],
    ["TgGiantThrow0000", "Arremesso Gigantesco"],
  ] as const;
  for (const [id, name] of forms) activities[id] = { ...foundry.utils.deepClone(base), _id: id, name };
  return activities;
}

async function reconcileWeapon(base: any, ultimate = false): Promise<any | null> {
  const managed = findItem(base, "thargunn.item.weapon");
  const source = managed ?? base.items?.get?.(SOURCE_WEAPON_ID) ?? base.items?.find((item: any) => item.name === "Nine Lives Stealer Halberd");
  if (!source) return null;
  const description = `<h2>Ladrão da Décima Vida</h2><p>Arma mítica senciente que rouba aquilo que torna uma criatura única. Requer sintonização.</p><p>As formas de alabarda, machado grande e arremesso gigantesco compartilham a mesma arma e o mesmo estado.</p>`;
  const activities = clonedActivities(source);
  for (const id of Object.keys(source.toObject?.().system?.activities ?? {})) {
    if (!(id in activities)) activities[`-=${id}`] = null;
  }
  await source.update({
    name: "Ladrão da Décima Vida",
    img: "modules/hero-engine/assets/thargunn/tenth-life-thief.webp",
    "system.identifier": "ladrao-da-decima-vida",
    "system.description.value": description,
    ...(ultimate ? ultimateWeaponRangeUpdate() : {}),
    "system.activities": activities,
    [`flags.${MODULE_ID}.managed`]: metadata("thargunn.item.weapon", { description, activities: 3 }),
  });
  return source;
}

function utilityActivity(id: string, name: string): Record<string, unknown> {
  return {
    _id: id, type: "utility", name, sort: 0,
    activation: { type: "action", value: 1, condition: "", override: true },
    consumption: { targets: [], scaling: { allowed: false, max: "" }, spellSlot: false },
    duration: { value: "", units: "inst", special: "", concentration: false, override: true },
    range: { units: "self", special: "", override: true },
    target: { prompt: false, affects: { type: "self", choice: false }, template: { contiguous: false, units: "ft", stationary: false }, override: true },
    uses: { spent: 0, recovery: [] }, visibility: { level: {}, requireAttunement: false, requireIdentification: false, requireMagic: false },
    roll: { prompt: false, visible: false }, effects: [], flags: { [MODULE_ID]: { managed: true } },
  };
}

export function managedActivityId(key: string): string {
  return `Tg${stableHash(key)}${stableHash(`${key}:activity`).slice(0, 6)}`;
}

async function reconcileFeature(actor: any, [key, name, description, actionId]: typeof featureTemplates[number]): Promise<any> {
  const current = findItem(actor, key);
  const activityId = managedActivityId(key);
  const data = {
    name, type: "feat", img: "modules/hero-engine/assets/thargunn/icons/echo-trait.webp",
    system: { description: { value: `<p>${description}</p>` }, identifier: key.replaceAll(".", "-"), activities: { [activityId]: utilityActivity(activityId, name) } },
    flags: { [MODULE_ID]: { managed: metadata(key, { name, description, actionId }), actionId } },
  };
  if (current) { await current.update({ name: data.name, img: data.img, "system.description.value": data.system.description.value, "system.activities": data.system.activities, [`flags.${MODULE_ID}.managed`]: data.flags[MODULE_ID].managed, [`flags.${MODULE_ID}.actionId`]: actionId }); return current; }
  return (await actor.createEmbeddedDocuments("Item", [data]))[0];
}

async function reconcileSkeldr(base: any): Promise<any> {
  const level = Number(base.system?.details?.level ?? base.classes?.barbarian?.system?.levels ?? 20);
  const prof = Number(base.system?.attributes?.prof ?? 6);
  const weaponLevel = contextFor(base, "thargunn-mythic")?.state.get("weaponLevel") ?? 1;
  const stats = skeldrStats(level, prof, weaponLevel);
  let skeldr = findActor("thargunn.actor.skeldr");
  if (!skeldr) {
    skeldr = await Actor.create({
      name: "Skeldr, Guardião Trovejante", type: "npc", img: "modules/hero-engine/assets/thargunn/skeldr-portrait.webp",
      ownership: { ...base.ownership },
      prototypeToken: { name: "Skeldr", actorLink: true, width: 3, height: 3, texture: { src: "modules/hero-engine/assets/thargunn/skeldr-token.webp", scaleX: 1, scaleY: 1 } },
      system: { details: { type: { value: "celestial" }, cr: Math.max(1, Math.floor(level / 3)) }, abilities: { str: { value: 24 }, dex: { value: 12 }, con: { value: 22 }, int: { value: 8 }, wis: { value: 18 }, cha: { value: 16 } }, attributes: { hp: { value: stats.hp, max: stats.hp }, ac: { calc: "natural", flat: stats.ac }, movement: { walk: 80 } } },
      flags: { [MODULE_ID]: { managed: metadata("thargunn.actor.skeldr", stats), ownerActorUuid: base.uuid } },
    });
  }
  const oldHp = skeldr.system?.attributes?.hp;
  const pct = oldHp ? oldHp.value / Math.max(1, oldHp.max) : 1;
  await skeldr.update({
    ownership: { ...skeldr.ownership, ...base.ownership }, img: "modules/hero-engine/assets/thargunn/skeldr-portrait.webp",
    "prototypeToken.width": 3, "prototypeToken.height": 3, "prototypeToken.texture.src": "modules/hero-engine/assets/thargunn/skeldr-token.webp",
    "system.attributes.hp.max": stats.hp, "system.attributes.hp.value": Math.max(1, Math.floor(stats.hp * pct)),
    "system.attributes.ac.calc": "natural", "system.attributes.ac.flat": stats.ac,
    "system.traits.size": "huge",
    [`flags.${MODULE_ID}.managed`]: metadata("thargunn.actor.skeldr", stats), [`flags.${MODULE_ID}.ownerActorUuid`]: base.uuid,
  });
  const skeldrFeatures = [
    ["thargunn.skeldr.horn", "Chifres da Marcha", `Melee attack +${stats.attack}; ${stats.damageDice} piercing plus thunder.`],
    ["thargunn.skeldr.charge", "Carga Trovejante", `Trample and Strength save DC ${stats.saveDc}; prone on failure.`],
    ["thargunn.skeldr.earthshaking", "Pisada Estremecedora", `Earthshaking control; Strength save DC ${stats.saveDc}.`],
    ["thargunn.skeldr.guard", "Guardião do Passo Justo", "Protective reaction and once-per-short-rest Hunger prevention."],
  ] as const;
  for (const [key, name, description] of skeldrFeatures) {
    const current = findItem(skeldr, key);
    const activityId = managedActivityId(key);
    const activity = utilityActivity(activityId, name) as any;
    if (key.endsWith(".guard")) activity.activation.type = "reaction";
    const data = { name, type: "feat", img: "modules/hero-engine/assets/thargunn/skeldr-token.webp", system: { description: { value: `<p>${description}</p>` }, identifier: key.replaceAll(".", "-"), activities: { [activityId]: activity } }, flags: { [MODULE_ID]: { managed: metadata(key, { name, description }) } } };
    if (current) await current.update({ name, "system.description.value": data.system.description.value, "system.activities": data.system.activities, [`flags.${MODULE_ID}.managed`]: data.flags[MODULE_ID].managed });
    else await skeldr.createEmbeddedDocuments("Item", [data]);
  }
  return skeldr;
}

async function reconcileUltimate(ultimate: any): Promise<void> {
  const barbarian = ultimate.items?.find?.((item: any) => item.type === "class" && /barbar/i.test(item.name));
  if (barbarian && Number(barbarian.system?.levels ?? 0) !== 20) await barbarian.update({ "system.levels": 20 });
  await ultimate.update({
    img: "modules/hero-engine/assets/thargunn/thargunn-ultimate-portrait.webp",
    "prototypeToken.width": 3, "prototypeToken.height": 3, "prototypeToken.texture.src": "modules/hero-engine/assets/thargunn/thargunn-ultimate-token.webp",
    "system.traits.size": "huge",
    [`flags.${MODULE_ID}.managed`]: metadata("thargunn.actor.ultimate", { level: 20, size: "huge", chassis: "native-dnd5e" }),
    [`flags.${MODULE_ID}.chassis`]: { provider: "hero-engine-native", version: 1, provisionalStrike: true },
  });
  const resistanceKey = "thargunn.effect.ultimate-resistances";
  const resistance = ultimate.effects?.find?.((effect: any) => effect.getFlag?.(MODULE_ID, "managed")?.key === resistanceKey);
  const resistanceSource = {
    name: "Marcha Mítica — Forma da Décima Lenda", img: "modules/hero-engine/assets/thargunn/thargunn-ultimate-token.webp",
    changes: ["acid", "bludgeoning", "cold", "fire", "lightning", "necrotic", "piercing", "poison", "slashing", "thunder"].map((damage) => ({ key: "system.traits.dr.value", mode: 2, value: damage, priority: 20 })),
    flags: { [MODULE_ID]: { managed: metadata(resistanceKey, { except: ["psychic", "force", "radiant"], reachBonus: 10 }) } },
  };
  if (resistance) await resistance.update(resistanceSource);
  else await ultimate.createEmbeddedDocuments?.("ActiveEffect", [resistanceSource]);
  const rageKey = "thargunn.effect.ultimate-rage";
  const rage = ultimate.effects?.find?.((effect: any) => effect.getFlag?.(MODULE_ID, "managed")?.key === rageKey);
  const rageSource = ultimateRageEffectSource();
  if (rage) await rage.update(rageSource);
  else await ultimate.createEmbeddedDocuments?.("ActiveEffect", [rageSource]);
  const features = [
    ["thargunn.ultimate.legendary-points", "Pontos Lendários", "Three points refresh at the start of each Thar’gunn turn and expire at the next.", "mighty-impel"],
    ["thargunn.ultimate.thunderous-step", "Passo Trovejante de Skeldr", "After 20 feet of Skeldr movement, the next weapon hit gains 8d12 thunder and 8d12 force.", "skeldr-move"],
    ["thargunn.ultimate.siphon", "Sifão da Décima Vida", "Once each turn, attempt Siphon on any weapon hit; a second use costs three Legendary Points.", "second-siphon"],
    ["thargunn.ultimate.devastating-strike", "Golpe Devastador (provisório)", "Costs two Legendary Points; defaults to 4d12 force plus 4d12 thunder.", "devastating-strike"],
  ] as const;
  for (const feature of features) await reconcileFeature(ultimate, feature as any);
}

/** Repair projections on a dnd5e-created Ultimate actor, including forms that
 * were already active when Hero Engine was updated or reloaded. */
export async function reconcileUltimateRuntimeActor(actor: any): Promise<boolean> {
  if (keyOf(actor) !== "thargunn.actor.ultimate") return false;
  const originalId = actor.getFlag?.("dnd5e", "originalActor");
  const original = originalId ? game.actors?.get?.(originalId) : null;
  if (!original || !resolveAttachment(original, "thargunn-mythic")) return false;

  const weapon = findItem(actor, "thargunn.item.weapon");
  if (weapon) await weapon.update(ultimateWeaponRangeUpdate());

  const rageKey = "thargunn.effect.ultimate-rage";
  const rage = actor.effects?.find?.((effect: any) => effect.getFlag?.(MODULE_ID, "managed")?.key === rageKey);
  const rageSource = ultimateRageEffectSource();
  if (rage) await rage.update(rageSource);
  else await actor.createEmbeddedDocuments?.("ActiveEffect", [rageSource]);
  return true;
}

async function reconcileMacro([key, name, command]: typeof macroTemplates[number]): Promise<any> {
  const current = findMacro(key);
  const data = { name, type: "script", command, img: "modules/hero-engine/assets/thargunn/icons/echo-trait.webp", ownership: { default: 2 }, flags: { [MODULE_ID]: { managed: metadata(key, { name, command }) } } };
  if (current) { await current.update({ name, command, img: data.img, [`flags.${MODULE_ID}.managed`]: data.flags[MODULE_ID].managed }); return current; }
  return Macro.create(data);
}

export async function installThargunn(options: { baseActorId?: string; ultimateActorId?: string; dryRun?: boolean } = {}): Promise<InstallReport> {
  if (!game.user?.isGM) throw new Error("hero-engine: only the GM can install managed content");
  const report = await previewThargunnInstall(options);
  if (options.dryRun) return report;
  const evidence = String(game.settings.get(MODULE_ID, SETTINGS.backupEvidence) ?? "");
  if (!evidence) throw new Error("hero-engine: verified backup evidence is required before managed installation");
  const { base, ultimate } = locate(options);
  if (!base || !ultimate) throw new Error(report.warnings.join(" "));
  await setManaged(base, "thargunn.actor.base", { adopted: base.id });
  await reconcileUltimate(ultimate);
  const weapon = await reconcileWeapon(base);
  await reconcileWeapon(ultimate, true);
  if (!weapon) throw new Error("hero-engine: managed weapon source missing");
  for (const feature of featureTemplates) await reconcileFeature(base, feature);
  const skeldr = await reconcileSkeldr(base);
  for (const macro of macroTemplates) await reconcileMacro(macro);
  if (!resolveAttachment(base, "thargunn-mythic")) await attachMechanic(base, "thargunn-mythic");
  const ctx = contextFor(base, "thargunn-mythic");
  if (ctx) {
    await ctx.state.setFlag("weaponUuid", weapon.uuid);
    await ctx.state.setFlag("skeldrUuid", skeldr.uuid);
    await ctx.state.setFlag("ultimateActorUuid", ultimate.uuid);
    await ctx.state.setFlag("backupEvidence", evidence);
  }
  report.dryRun = false;
  return report;
}

let hooksRegistered = false;
export function initThargunnManagedHooks(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;
  for (const actor of game.actors ?? []) {
    void reconcileUltimateRuntimeActor(actor).catch((error) => console.error("hero-engine | Ultimate runtime reconciliation", error));
  }
  Hooks.on("createActor", (actor: any) => {
    void reconcileUltimateRuntimeActor(actor).catch((error) => console.error("hero-engine | Ultimate runtime reconciliation", error));
  });
  Hooks.on("dnd5e.useActivity", async (activity: any) => {
    const item = activity?.item;
    const actor = item?.actor;
    const isRage = /^(rage|fúria)$/i.test(String(item?.system?.identifier ?? item?.name ?? ""));
    if (actor && isRage) {
      const rageCtx = contextFor(actor, "thargunn-mythic");
      if (rageCtx) {
        await rageCtx.state.setFlag("rageExpiresAtRealTime", Date.now() + 600_000);
        await rageCtx.state.setFlag("rageExpiresAtWorldTime", Number(game.time?.worldTime ?? 0) + 600);
      }
    }
    const actionId = item?.getFlag?.(MODULE_ID, "actionId");
    const recordId = item?.getFlag?.(MODULE_ID, "managed")?.recordId;
    const collectionId = item?.getFlag?.(MODULE_ID, "collectionId");
    if (!actor || !actor.testUserPermission?.(game.user, "OWNER")) return;
    const attachment = resolveAttachment(actor, "thargunn-mythic");
    if (attachment && actionId) await executeAction(attachment, actionId);
    else if (attachment && recordId && collectionId) await contextFor(actor, "thargunn-mythic")?.records.runAction(collectionId, recordId, "use");
  });
  Hooks.on("updateActor", async (actor: any, changes: any) => {
    if (!game.user?.isGM) return;
    if (keyOf(actor) === "thargunn.actor.skeldr") {
      const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
      if (hp !== undefined && Number(hp) <= 0) {
        const ownerUuid = actor.getFlag(MODULE_ID, "ownerActorUuid");
        const base = ownerUuid ? await (globalThis as any).fromUuid?.(ownerUuid) : findActor("thargunn.actor.base");
        const ctx = base ? contextFor(base, "thargunn-mythic") : null;
        if (ctx && ctx.state.getFlag<boolean>("skeldrPresent") !== false) {
          const roll = new Roll(String(ctx.config<string>("skeldrReturnDays") ?? "1d4"));
          await roll.evaluate();
          await ctx.state.setFlag("skeldrPresent", false);
          await ctx.state.setFlag("skeldrReturnAt", Number(game.time?.worldTime ?? 0) + Number(roll.total ?? 1) * 86400);
          await ctx.postChat("HEROENGINE.Thargunn.Skeldr.Defeated", { days: roll.total ?? 1 });
        }
      }
      return;
    }
    if (keyOf(actor) === "thargunn.actor.base" && (foundry.utils.hasProperty(changes, "system.details.level") || foundry.utils.hasProperty(changes, "system.attributes.prof"))) {
      await reconcileSkeldr(actor);
    }
  });
  Hooks.on("updateWorldTime", async (worldTime: number) => {
    if (!game.user?.isGM) return;
    const base = findActor("thargunn.actor.base");
    const ctx = base ? contextFor(base, "thargunn-mythic") : null;
    const returnAt = Number(ctx?.state.getFlag<number>("skeldrReturnAt") ?? 0);
    if (ctx && ctx.state.getFlag<boolean>("skeldrPresent") === false && returnAt > 0 && worldTime >= returnAt) {
      await ctx.state.setFlag("skeldrPresent", true);
      await ctx.state.setFlag("skeldrReturnAt", 0);
      const skeldr = findActor("thargunn.actor.skeldr");
      if (skeldr) await skeldr.update({ "system.attributes.hp.value": skeldr.system?.attributes?.hp?.max ?? 1 });
      await ctx.postChat("HEROENGINE.Thargunn.Skeldr.Returned");
    }
  });
}
