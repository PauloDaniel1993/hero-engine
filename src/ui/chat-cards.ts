/**
 * Interactive chat cards. Buttons execute a mechanic's declared actions;
 * clicks are permission-gated (owner or GM) and idempotent — each button
 * resolves at most once, tracked in message flags.
 */
import { MODULE_ID } from "../constants";
import { localize } from "../engine/i18n";
import { executeAction } from "../engine/runtime";
import { canOperate } from "../engine/sockets";
import { resolveAttachment } from "../engine/state";
import { getCompat } from "../compat";

export interface CardButton {
  labelKey: string;
  actionId: string;
}

export async function postCard(
  actor: any,
  pluginId: string,
  opts: { titleKey: string; bodyKey?: string; bodyData?: Record<string, unknown>; buttons: CardButton[] }
): Promise<void> {
  const buttonsHtml = opts.buttons
    .map(
      (b) =>
        `<button type="button" data-he-card-action="${b.actionId}">${escapeHtml(localize(b.labelKey))}</button>`
    )
    .join("");
  const content = `
    <div class="hero-engine-card">
      <header><strong>${escapeHtml(localize(opts.titleKey))}</strong></header>
      ${opts.bodyKey ? `<div class="he-card-body">${escapeHtml(localize(opts.bodyKey, opts.bodyData))}</div>` : ""}
      <div class="he-card-buttons">${buttonsHtml}</div>
    </div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [MODULE_ID]: { card: { actorUuid: actor.uuid, pluginId, resolved: {} } } },
  });
}

export function registerChatCardListeners(): void {
  getCompat().onRenderChatMessage((message: any, html: HTMLElement) => {
    const card = message.getFlag?.(MODULE_ID, "card");
    if (!card) return;
    const resolved: Record<string, boolean> = card.resolved ?? {};

    html.querySelectorAll<HTMLButtonElement>("[data-he-card-action]").forEach((button) => {
      const actionId = button.dataset["heCardAction"]!;
      if (resolved[actionId]) {
        button.disabled = true;
        return;
      }
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true; // immediate local guard against double clicks
        try {
          const actor = await (globalThis as any).fromUuid(card.actorUuid);
          if (!actor) return;
          if (!canOperate(actor)) {
            ui.notifications?.warn(localize("HEROENGINE.Errors.NotOwner"));
            button.disabled = false;
            return;
          }
          // Persistent idempotence: re-read the message flag before executing.
          const latest = game.messages?.get(message.id)?.getFlag?.(MODULE_ID, "card");
          if (latest?.resolved?.[actionId]) return;

          const att = resolveAttachment(actor, card.pluginId);
          if (!att) return;
          await executeAction(att, actionId);

          if (game.user.isGM || message.isAuthor) {
            await message.setFlag(MODULE_ID, `card.resolved.${actionId}`, true);
          }
        } catch (e) {
          console.error("hero-engine | chat card", e);
          button.disabled = false;
        }
      });
    });
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
