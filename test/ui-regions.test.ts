import { describe, expect, it } from "vitest";
import { mechanicsDocumentActorId, regionStorageKey, storedRegionOpen } from "../src/ui/sheet-panel";

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
