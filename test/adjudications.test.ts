import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueDirect } from "../src/engine/adjudications";

describe("GM adjudication queue recovery", () => {
  afterEach(() => {
    delete (globalThis as any).game;
    delete (globalThis as any).ui;
    delete (globalThis as any).Hooks;
    vi.restoreAllMocks();
  });

  it("deduplicates reconnect delivery of the same pending ruling", async () => {
    let queue: any[] = [];
    (globalThis as any).game = {
      settings: {
        get: () => queue,
        set: vi.fn(async (_module: string, _key: string, value: any[]) => { queue = value; }),
      },
      i18n: { has: () => false },
    };
    (globalThis as any).ui = { notifications: { info: vi.fn() } };
    (globalThis as any).Hooks = { callAll: vi.fn() };

    const request = {
      id: "first-delivery",
      actorUuid: "Actor.thargunn",
      pluginId: "thargunn-mythic",
      adjudicationId: "ultimate-transformation",
      queuedAt: 1,
    };
    await enqueueDirect(request);
    await enqueueDirect({ ...request, id: "reconnect-delivery", queuedAt: 2 });

    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("first-delivery");
  });
});
