/**
 * Module settings registration (world scope) and typed accessors.
 */
import { MODULE_ID, SETTINGS } from "../constants";

export interface QueuedAdjudication {
  id: string; // unique queue entry id
  actorUuid: string;
  pluginId: string;
  adjudicationId: string;
  note?: string;
  queuedAt: number;
}

export interface QueuedOp {
  id: string;
  actorUuid: string;
  pluginId: string;
  kind: string;
  payload: Record<string, unknown>;
  userId: string;
}

export function registerCoreSettings(): void {
  game.settings.register(MODULE_ID, SETTINGS.dawnHour, {
    name: "HEROENGINE.Settings.DawnHour.Name",
    hint: "HEROENGINE.Settings.DawnHour.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 6,
    range: { min: 0, max: 23, step: 1 },
  });
  game.settings.register(MODULE_ID, SETTINGS.adjudicationQueue, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });
  game.settings.register(MODULE_ID, SETTINGS.pendingOps, {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });
  game.settings.register(MODULE_ID, SETTINGS.backupEvidence, {
    scope: "world",
    config: false,
    type: String,
    default: "",
  });
  game.settings.register(MODULE_ID, SETTINGS.theme, {
    name: "HEROENGINE.Settings.Theme.Name",
    hint: "HEROENGINE.Settings.Theme.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: { basalt: "HEROENGINE.Settings.Theme.Basalt", storm: "HEROENGINE.Settings.Theme.Storm", gold: "HEROENGINE.Settings.Theme.Gold" },
    default: "basalt",
  });
  game.settings.register(MODULE_ID, SETTINGS.clientTheme, {
    name: "HEROENGINE.Settings.Theme.ClientName",
    hint: "HEROENGINE.Settings.Theme.ClientHint",
    scope: "client",
    config: true,
    type: String,
    choices: { "": "HEROENGINE.Settings.Theme.WorldDefault", basalt: "HEROENGINE.Settings.Theme.Basalt", storm: "HEROENGINE.Settings.Theme.Storm", gold: "HEROENGINE.Settings.Theme.Gold" },
    default: "",
    onChange: () => applyTheme(),
  });
}

export function applyTheme(): void {
  const client = String(game.settings.get(MODULE_ID, SETTINGS.clientTheme) ?? "");
  const world = String(game.settings.get(MODULE_ID, SETTINGS.theme) ?? "basalt");
  document.documentElement.dataset["heroEngineTheme"] = client || world || "basalt";
}

export function getDawnHour(): number {
  return Number(game.settings.get(MODULE_ID, SETTINGS.dawnHour) ?? 6);
}

export function getWorldConfig(pluginId: string): Record<string, unknown> {
  try {
    return (game.settings.get(MODULE_ID, `${SETTINGS.worldConfigPrefix}${pluginId}`) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function setWorldConfig(pluginId: string, value: Record<string, unknown>): Promise<void> {
  await game.settings.set(MODULE_ID, `${SETTINGS.worldConfigPrefix}${pluginId}`, value);
}

export function getAdjudicationQueue(): QueuedAdjudication[] {
  return (game.settings.get(MODULE_ID, SETTINGS.adjudicationQueue) ?? []) as QueuedAdjudication[];
}

export async function setAdjudicationQueue(queue: QueuedAdjudication[]): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.adjudicationQueue, queue);
}

export function getPendingOps(): QueuedOp[] {
  return (game.settings.get(MODULE_ID, SETTINGS.pendingOps) ?? []) as QueuedOp[];
}

export async function setPendingOps(ops: QueuedOp[]): Promise<void> {
  await game.settings.set(MODULE_ID, SETTINGS.pendingOps, ops);
}
