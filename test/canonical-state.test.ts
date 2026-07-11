import { afterEach, describe, expect, it } from "vitest";
import { canonicalActor, isTransformedActor, resolveAttachments } from "../src/engine/state";

describe("canonical actor state", () => {
  afterEach(() => {
    delete (globalThis as any).game;
  });

  it("keeps character mechanic state on the original actor while a dnd5e clone is active", () => {
    const base: any = {
      id: "base",
      uuid: "Actor.base",
      items: [],
      getFlag(scope: string, key: string) {
        if (scope === "hero-engine" && key === "attachments") return { thargunn: {} };
        return undefined;
      },
    };
    const clone: any = {
      id: "clone",
      uuid: "Actor.clone",
      items: [],
      getFlag(scope: string, key: string) {
        if (scope === "dnd5e" && key === "originalActor") return "base";
        if (scope === "dnd5e" && key === "isPolymorphed") return true;
        return undefined;
      },
    };
    (globalThis as any).game = { actors: { get: (id: string) => id === "base" ? base : id === "clone" ? clone : null } };

    expect(canonicalActor(clone)).toBe(base);
    expect(isTransformedActor(clone)).toBe(true);
    expect(isTransformedActor(base)).toBe(false);
    const [attachment] = resolveAttachments(clone);
    expect(attachment?.actor).toBe(clone);
    expect(attachment?.canonicalActor).toBe(base);
    expect(attachment?.stateDoc).toBe(base);
  });
});
