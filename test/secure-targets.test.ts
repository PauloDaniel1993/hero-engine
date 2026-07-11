import { describe, expect, it } from "vitest";
import { secureRequestRemovalUpdate, secureRequestUpdate } from "../src/engine/runtime";

describe("secure target request update envelopes", () => {
  it("uses a Foundry nested dot path instead of a literal dotted flag key", () => {
    expect(secureRequestUpdate("request01", "thargunn-mythic", {
      kind: "siphon",
      eventId: "workflow01",
      targetUuid: "Actor.target",
      weaponUuid: "Actor.owner.Item.weapon",
      category: "reaction",
    }, 1234)).toEqual({
      "flags.hero-engine.secureRequests.request01": {
        kind: "siphon",
        eventId: "workflow01",
        targetUuid: "Actor.target",
        weaponUuid: "Actor.owner.Item.weapon",
        category: "reaction",
        createdAt: 1234,
        pluginId: "thargunn-mythic",
      },
    });
  });

  it("uses Foundry's nested deletion operator for single-use settlement", () => {
    expect(secureRequestRemovalUpdate("request01")).toEqual({
      "flags.hero-engine.secureRequests.-=request01": null,
    });
  });

  it("carries only opaque player selection data, never private labels or descriptions", () => {
    const update = secureRequestUpdate("request02", "thargunn-mythic", {
      kind: "siphon", eventId: "event02", targetUuid: "Actor.private", category: "spell", featureOpaqueId: "item:opaque123", opportunityId: "opportunity02",
    }, 2000);
    const serialized = JSON.stringify(update);
    expect(serialized).toContain("item:opaque123");
    expect(serialized).not.toContain("Meteor Swarm");
    expect(serialized).not.toContain("Fire from heaven");
  });
});
