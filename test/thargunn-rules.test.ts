import { describe, expect, it } from "vitest";
import { thargunnMythic } from "../src/plugins/thargunn";
import { canUseUltimate, echoCost, echoTier, erasureDc, fractureConsequences, hungerConsequences, riteOutcome, siphonDc, skeldrStats, soulDamageDice, thunderousStep, ultimateAccessDc, ultimateExpiryDamage, weaponProgression } from "../src/plugins/thargunn/rules";
import { validatePlugin } from "../src/engine/validation";

describe("Thar’gunn mythic rules", () => {
  it("registers as a valid public-API-only plugin", () => {
    expect(validatePlugin(thargunnMythic)).toEqual([]);
  });

  it("matches every weapon progression level", () => {
    expect([1,2,3,4,5].map(weaponProgression)).toEqual([
      { level: 1, slots: 3, charges: 5, maxTier: "minor" },
      { level: 2, slots: 4, charges: 6, maxTier: "strong" },
      { level: 3, slots: 5, charges: 7, maxTier: "strong" },
      { level: 4, slots: 6, charges: 8, maxTier: "legendary" },
      { level: 5, slots: 7, charges: 10, maxTier: "mythic" },
    ]);
  });

  it("prices and tiers representative Echo categories", () => {
    expect([echoCost("action"), echoCost("multiattack"), echoCost("legendary-action"), echoCost("lair-action"), echoCost("spell", 7), echoCost("divine")]).toEqual([1,2,3,4,7,5]);
    expect(echoTier("action")).toBe("minor");
    expect(echoTier("recharge")).toBe("strong");
    expect(echoTier("legendary-resistance")).toBe("legendary");
    expect(echoTier("artifact")).toBe("mythic");
    expect(["minor","strong","legendary","mythic"].map((tier) => soulDamageDice(tier as any))).toEqual(["2d10","4d10","6d10","8d10"]);
  });

  it("calculates saves, drawbacks, and rite outcomes", () => {
    expect(siphonDc(8, 7)).toBe(23);
    expect(ultimateAccessDc(3, 7)).toBe(20);
    expect(["minor","strong","legendary","mythic"].map((tier) => erasureDc(tier as any))).toEqual([18,20,22,24]);
    expect(hungerConsequences(10)).toEqual(["wisdom-disadvantage","cruel-demand","control-save","name-fragment"]);
    expect(fractureConsequences(10)).toEqual(["max-hp-10","skeldr-absent","block-echo-slot","identity-ruling"]);
    expect(riteOutcome([25,24,30], 0)).toEqual({ success: true, passed: 2, debt: 0, blockedSlots: 0, escalation: false });
    expect(riteOutcome([1,1,30], 2)).toEqual({ success: false, passed: 1, debt: 2, blockedSlots: 1, escalation: true });
  });

  it("calculates Ultimate expiry, prerequisites, Skeldr scaling, and Thunderous Step", () => {
    expect(ultimateExpiryDamage(4)).toBe("12d12 + 8d12");
    expect(canUseUltimate({ raging:false, skeldrPresent:false, attuned:false, ultimateReady:false })).toEqual(["rage","skeldr","attunement","long-rest"]);
    expect(skeldrStats(20, 6, 1)).toEqual({ hp: 210, ac: 17, attack: 13, saveDc: 20, damageDice: "2d10 + 7" });
    expect(thunderousStep(19, "med").armed).toBe(false);
    expect(thunderousStep(20, "med")).toMatchObject({ armed:true, push:60, prone:true, reactions:true });
    expect(thunderousStep(20, "grg")).toMatchObject({ armed:true, push:0, prone:false, extraDamage:"12d12 thunder + 8d12 force" });
  });
});
