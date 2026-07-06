/**
 * Hero Engine public API — the ONLY entry point plugins may import from.
 * Also exposed at runtime as `game.modules.get("hero-engine").api` and passed
 * to the `heroEngine.registerMechanics` hook.
 */
import type { HeroEngineAPI, MechanicPlugin } from "./types";
import { API_VERSION } from "../constants";
import { attachMechanic, detachMechanic } from "../engine/attach";
import { getPlugin, listPlugins, registerPlugin } from "../engine/registry";
import { contextFor } from "../engine/runtime";

export type * from "./types";

export function createApi(): HeroEngineAPI {
  return {
    apiVersion: API_VERSION,
    register(plugin: MechanicPlugin): void {
      registerPlugin(plugin);
    },
    get(pluginId: string) {
      return getPlugin(pluginId);
    },
    list() {
      return listPlugins();
    },
    attach(actor, pluginId, options) {
      return attachMechanic(actor, pluginId, options ?? {});
    },
    detach(actor, pluginId) {
      return detachMechanic(actor, pluginId);
    },
    contextFor(actor, pluginId) {
      return contextFor(actor, pluginId);
    },
  };
}
