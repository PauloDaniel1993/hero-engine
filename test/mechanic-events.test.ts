import { describe, expect, it } from "vitest";
import { mechanicSettlement } from "../src/engine/events";

describe("mechanic settlement events", () => {
  it("includes runtime, canonical, and item-owner actor identities", () => {
    const settlement = mechanicSettlement({
      actor: { id: "runtime" },
      canonicalActor: { id: "canonical" },
      stateDoc: { id: "item", actor: { id: "owner" } },
      pluginId: "thargunn-mythic",
    } as any, "record-action", "temporary-echoes:echo-1:use");
    expect(settlement).toEqual({
      actorIds: ["runtime", "canonical", "owner", "item"],
      pluginId: "thargunn-mythic",
      kind: "record-action",
      id: "temporary-echoes:echo-1:use",
    });
  });

  it("deduplicates character-owned actor and state document IDs", () => {
    const actor = { id: "base" };
    expect(mechanicSettlement({ actor, canonicalActor: actor, stateDoc: actor, pluginId: "x" } as any, "action", "go").actorIds).toEqual(["base"]);
  });
});
