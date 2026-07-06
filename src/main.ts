/**
 * Hero Engine — module entry point and hook wiring.
 */
import { createApi } from "./api";
import { MODULE_ID } from "./constants";
import { watchItemTransfers } from "./engine/attach";
import { fireRegistrationHook, listPlugins, registerPlugin } from "./engine/registry";
import { registerCoreSettings } from "./engine/settings";
import { initSockets, registerGmConfirmResponder } from "./engine/sockets";
import { initTriggerBus } from "./engine/trigger-bus";
import { registerChatCardListeners } from "./ui/chat-cards";
import { registerSheetPanel } from "./ui/sheet-panel";
import { registerGmPanel } from "./ui/gm-panel";
import { presaTempestade } from "./plugins/presa-tempestade";
import { deimosConfessor } from "./plugins/deimos-confessor";
import { exampleFlamingSword } from "./plugins/example-flaming-sword";

const api = createApi();

Hooks.once("init", () => {
  registerCoreSettings();
  registerGmPanel(); // settings-menu registration must happen at init
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
});

Hooks.once("setup", () => {
  // Built-in reference plugins register through the same public API as
  // external ones (enforced by scripts/check-plugin-imports.mjs).
  for (const plugin of [presaTempestade, deimosConfessor, exampleFlamingSword]) {
    try {
      registerPlugin(plugin);
    } catch (e) {
      console.error(e);
    }
  }
  fireRegistrationHook(api);
});

Hooks.once("ready", () => {
  initSockets();
  registerGmConfirmResponder();
  initTriggerBus();
  watchItemTransfers();
  registerChatCardListeners();
  registerSheetPanel();
  console.log(`hero-engine | ready — ${listPlugins().length} mechanics registered`);
});
