/**
 * Roll services. Saves/checks go through the actor's dnd5e roll pipeline (via
 * compat) so proficiency, bonuses, advantage dialogs and dice modules apply.
 * Damage/recharge dice use plain Foundry Roll with resolved formulas.
 */
import { getCompat } from "../compat";
import { localize } from "./i18n";

/** Roll a dice formula chat-visibly for an actor; returns the total. */
export async function rollDice(
  actor: any,
  formula: string,
  data: Record<string, unknown>,
  flavorKey?: string
): Promise<number> {
  const roll = new Roll(formula, data);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: flavorKey ? localize(flavorKey) : undefined,
  });
  return roll.total ?? 0;
}

/** Roll dice silently (e.g. table die); returns the total. */
export async function rollSilent(formula: string, data: Record<string, unknown> = {}): Promise<number> {
  const roll = new Roll(formula, data);
  await roll.evaluate();
  return roll.total ?? 0;
}

export interface SaveResult {
  total: number;
  natural: number;
  success: boolean;
}

/** Roll a dnd5e save vs a DC. */
export async function rollSaveVsDc(actor: any, ability: string, dc: number): Promise<SaveResult | null> {
  const result = await getCompat().rollSave(actor, ability);
  if (!result) return null;
  return { ...result, success: result.total >= dc };
}

/** Post a plain localized chat message attributed to the actor. */
export async function postChat(actor: any, key: string, data?: Record<string, unknown>): Promise<void> {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="hero-engine-chat"><span class="he-chat-mark"><i class="fa-solid fa-bolt"></i></span><div class="he-chat-copy">
      <strong>${escapeHtml(localize("HEROENGINE.Panel.EngineName"))}</strong><span>${escapeHtml(localize(key, data))}</span>
    </div></div>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
