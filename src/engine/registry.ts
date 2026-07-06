/**
 * Plugin registry: validation, duplicate rejection, error isolation, i18n merge.
 */
import type { MechanicPlugin } from "../api/types";
import { MODULE_ID, SETTINGS } from "../constants";
import { mergePluginI18n } from "./i18n";
import { validatePlugin } from "./validation";

const plugins = new Map<string, MechanicPlugin>();

export class PluginRegistrationError extends Error {
  constructor(pluginId: string, public readonly issues: { path: string; message: string }[]) {
    super(
      `hero-engine: plugin "${pluginId}" rejected:\n` +
        issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n")
    );
    this.name = "PluginRegistrationError";
  }
}

export function registerPlugin(plugin: MechanicPlugin): void {
  if (plugins.has(plugin.id)) {
    const err = new PluginRegistrationError(plugin.id, [
      { path: "id", message: `duplicate id — already registered (earlier registration kept)` },
    ]);
    console.error(err.message);
    throw err;
  }
  const issues = validatePlugin(plugin);
  if (issues.length) {
    const err = new PluginRegistrationError(plugin.id ?? "<missing id>", issues);
    console.error(err.message);
    throw err;
  }
  plugins.set(plugin.id, plugin);
  mergePluginI18n(plugin);
  registerWorldConfigSetting(plugin);
  console.log(`hero-engine | registered mechanic "${plugin.id}" v${plugin.version}`);
}

export function getPlugin(id: string): MechanicPlugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): MechanicPlugin[] {
  return [...plugins.values()];
}

function registerWorldConfigSetting(plugin: MechanicPlugin): void {
  try {
    game.settings.register(MODULE_ID, `${SETTINGS.worldConfigPrefix}${plugin.id}`, {
      scope: "world",
      config: false,
      type: Object,
      default: {},
    });
  } catch (e) {
    // Registered before init settings are available (world scripts run late) —
    // main.ts re-registers settings for all plugins at ready.
    console.warn(`hero-engine | deferred settings registration for ${plugin.id}`, e);
  }
}

/**
 * Fire the registration hook so external modules/world scripts can register.
 * Errors in one listener's registration must not break others — Foundry's
 * Hooks.callAll already isolates listener exceptions per listener.
 */
export function fireRegistrationHook(api: unknown): void {
  Hooks.callAll("heroEngine.registerMechanics", api);
}
