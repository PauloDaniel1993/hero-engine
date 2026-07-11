import { describe, expect, it } from "vitest";
import { regionStorageKey, storedRegionOpen } from "../src/ui/sheet-panel";

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
});
