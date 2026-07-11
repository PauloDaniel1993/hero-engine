import { describe, expect, it } from "vitest";
import { mechanicsDocumentActorId, regionStorageKey, storedRegionOpen } from "../src/ui/sheet-panel";
import { ACTION_TOOLTIP_DELAY_MS, actionGateReasons } from "../src/ui/action-tooltip";

describe("Mechanics window collapsible regions", () => {
  it("uses actor-, plugin-, and region-scoped client storage keys", () => {
    expect(regionStorageKey("actor-1", "thargunn-mythic", "actions"))
      .toBe("hero-engine:region-ui:actor-1:thargunn-mythic:actions");
    expect(regionStorageKey("actor-2", "thargunn-mythic", "actions"))
      .not.toBe(regionStorageKey("actor-1", "thargunn-mythic", "actions"));
  });

  it("restores explicit open and closed state while honoring first-open defaults", () => {
    expect(storedRegionOpen(null, true)).toBe(true);
    expect(storedRegionOpen(null, false)).toBe(false);
    expect(storedRegionOpen("open", false)).toBe(true);
    expect(storedRegionOpen("closed", true)).toBe(false);
  });

  it("resolves the owning actor for actor, item, and effect hook documents", () => {
    expect(mechanicsDocumentActorId({ documentName: "Actor", id: "actor-1" })).toBe("actor-1");
    expect(mechanicsDocumentActorId({ actor: { id: "actor-2" } })).toBe("actor-2");
    expect(mechanicsDocumentActorId({ parent: { documentName: "Actor", id: "actor-3" } })).toBe("actor-3");
    expect(mechanicsDocumentActorId({ parent: { actor: { id: "actor-4" } } })).toBe("actor-4");
  });
});

describe("Mechanics action help cards", () => {
  it("waits 500 ms before opening", () => {
    expect(ACTION_TOOLTIP_DELAY_MS).toBe(500);
  });

  it("reports every exact reason a declared action is disabled", () => {
    const reasons = actionGateReasons(
      {
        id: "storm",
        labelKey: "Storm",
        requiresFlag: "ultimateActive",
        requiresFlagReasonKey: "Test.RequiresUltimate",
        forbidsFlag: "takeoverLocked",
        forbidsFlagReasonKey: "Test.TakeoverLocked",
      },
      { flags: { ultimateActive: false, takeoverLocked: true }, values: { points: 0 } },
      false,
      { ready: false, remainingText: "until a long rest" },
      [{ resource: "points", label: "Legendary Points", amount: 2 }]
    );

    expect(reasons.map((reason) => [reason.kind, reason.key])).toEqual([
      ["permission", "HEROENGINE.Errors.NotOwner"],
      ["cooldown", "HEROENGINE.Errors.OnCooldown"],
      ["requires", "Test.RequiresUltimate"],
      ["forbids", "Test.TakeoverLocked"],
      ["resource", "HEROENGINE.Errors.NotEnough"],
    ]);
  });

  it("does not invent a blocker for an available action", () => {
    expect(actionGateReasons(
      { id: "ready", labelKey: "Ready" },
      { flags: {}, values: {} },
      true,
      { ready: true },
      []
    )).toEqual([]);
  });
});
