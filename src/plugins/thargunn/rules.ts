export type EchoTier = "minor" | "strong" | "legendary" | "mythic";
export type EchoCategory = "trait" | "action" | "reaction" | "resistance" | "sense" | "multiattack" | "recharge" | "legendary-resistance" | "legendary-action" | "lair-action" | "spell" | "class-feature" | "divine" | "artifact" | "core";

export const ECHO_CATEGORIES: EchoCategory[] = [
  "trait", "action", "reaction", "resistance", "sense", "multiattack", "recharge",
  "legendary-resistance", "legendary-action", "lair-action", "spell", "class-feature", "divine", "artifact", "core",
];

export function weaponProgression(level: number): { level: number; slots: number; charges: number; maxTier: EchoTier } {
  const normalized = Math.min(5, Math.max(1, Math.floor(level)));
  return {
    level: normalized,
    slots: normalized + 2,
    charges: [0, 5, 6, 7, 8, 10][normalized]!,
    maxTier: normalized >= 5 ? "mythic" : normalized >= 4 ? "legendary" : normalized >= 2 ? "strong" : "minor",
  };
}

export function echoTier(category: EchoCategory, spellLevel = 0): EchoTier {
  if (["divine", "artifact", "core"].includes(category)) return "mythic";
  if (["legendary-resistance", "legendary-action", "lair-action"].includes(category) || spellLevel >= 7) return "legendary";
  if (["reaction", "resistance", "multiattack", "recharge", "class-feature"].includes(category) || spellLevel >= 3) return "strong";
  return "minor";
}

export function echoCost(category: EchoCategory, spellLevel = 0, rechargeCost = 2): number {
  if (category === "spell") return Math.max(1, spellLevel);
  if (["divine", "artifact", "core"].includes(category)) return 5;
  if (category === "lair-action") return 4;
  if (["legendary-resistance", "legendary-action"].includes(category)) return 3;
  if (category === "recharge") return Math.min(3, Math.max(2, rechargeCost));
  if (["reaction", "resistance", "sense", "multiattack", "class-feature"].includes(category)) return 2;
  return 1;
}

export function soulDamageDice(tier: EchoTier): string {
  return ({ minor: "2d10", strong: "4d10", legendary: "6d10", mythic: "8d10" })[tier];
}

export function siphonDc(proficiency: number, strengthModifier: number): number {
  return 8 + proficiency + strengthModifier;
}

export function erasureDc(tier: EchoTier): number {
  return 18 + ({ minor: 0, strong: 2, legendary: 4, mythic: 6 })[tier];
}

export function ultimateAccessDc(debt: number, legends: number): number {
  return Math.max(1, 24 + Math.max(0, debt) - Math.max(0, legends));
}

export function ultimateExpiryDamage(fractures: number): string {
  return `12d12 + ${Math.max(0, Math.floor(fractures)) * 2}d12`;
}

export function fractureConsequences(fractures: number): string[] {
  const out: string[] = [];
  if (fractures >= 3) out.push("max-hp-10");
  if (fractures >= 5) out.push("skeldr-absent");
  if (fractures >= 7) out.push("block-echo-slot");
  if (fractures >= 10) out.push("identity-ruling");
  return out;
}

export function hungerConsequences(total: number): string[] {
  const out: string[] = [];
  if (total >= 3) out.push("wisdom-disadvantage");
  if (total >= 5) out.push("cruel-demand");
  if (total >= 7) out.push("control-save");
  if (total >= 10) out.push("name-fragment");
  return out;
}

export function riteOutcome(results: number[], naturalOnes: number): { success: boolean; passed: number; debt: number; blockedSlots: number; escalation: boolean } {
  const passed = results.filter((total) => total >= 25).length;
  return { success: passed >= 2, passed, debt: passed >= 2 ? 0 : 2, blockedSlots: passed >= 2 ? 0 : 1, escalation: naturalOnes >= 2 };
}

export function skeldrStats(level: number, proficiency: number, weaponLevel: number): { hp: number; ac: number; attack: number; saveDc: number; damageDice: string } {
  const l = Math.max(1, Math.floor(level));
  const p = Math.max(2, Math.floor(proficiency));
  const w = Math.min(5, Math.max(1, Math.floor(weaponLevel)));
  return { hp: 60 + l * 7 + w * 10, ac: 14 + Math.floor(p / 2), attack: p + 6 + w, saveDc: 8 + p + 6, damageDice: `${2 + Math.floor(w / 2)}d10 + ${6 + w}` };
}

export function canUseUltimate(input: { raging: boolean; skeldrPresent: boolean; attuned: boolean; ultimateReady: boolean }): string[] {
  const failures: string[] = [];
  if (!input.raging) failures.push("rage");
  if (!input.skeldrPresent) failures.push("skeldr");
  if (!input.attuned) failures.push("attunement");
  if (!input.ultimateReady) failures.push("long-rest");
  return failures;
}

export function thunderousStep(distance: number, targetSize: string): { armed: boolean; extraDamage: string; push: number; prone: boolean; reactions: boolean } {
  const armed = distance >= 20;
  const gargantuan = targetSize === "grg" || targetSize === "gargantuan";
  return { armed, extraDamage: armed ? (gargantuan ? "12d12 thunder + 8d12 force" : "8d12 thunder + 8d12 force") : "0", push: armed && !gargantuan ? 60 : 0, prone: armed && !gargantuan, reactions: armed && !gargantuan };
}
