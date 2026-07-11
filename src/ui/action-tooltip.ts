import type { ActionDef } from "../api/types";
import type { CooldownStatus } from "../engine/runtime";
import type { InstanceState } from "../engine/state";
import { localize } from "../engine/i18n";
import { escapeHtml } from "./chat-cards";

export const ACTION_TOOLTIP_DELAY_MS = 500;

export interface ResolvedActionCost {
  resource: string;
  label: string;
  amount: number;
}

export interface ActionGateReason {
  kind: "permission" | "cooldown" | "requires" | "forbids" | "resource";
  key: string;
  data?: Record<string, unknown>;
}

/** One source of truth for button disabled state and its player-facing cause. */
export function actionGateReasons(
  action: ActionDef,
  state: Pick<InstanceState, "flags" | "values">,
  editable: boolean,
  cooldown: CooldownStatus,
  costs: ResolvedActionCost[]
): ActionGateReason[] {
  const reasons: ActionGateReason[] = [];
  if (!editable) reasons.push({ kind: "permission", key: "HEROENGINE.Errors.NotOwner" });
  if (!cooldown.ready) {
    reasons.push({ kind: "cooldown", key: "HEROENGINE.Errors.OnCooldown", data: { remaining: cooldown.remainingText ?? "" } });
  }
  if (action.requiresFlag && !state.flags[action.requiresFlag]) {
    reasons.push({ kind: "requires", key: action.requiresFlagReasonKey ?? "HEROENGINE.Errors.RequiresState" });
  }
  if (action.forbidsFlag && state.flags[action.forbidsFlag]) {
    reasons.push({ kind: "forbids", key: action.forbidsFlagReasonKey ?? "HEROENGINE.Errors.ForbiddenState" });
  }
  for (const cost of costs) {
    if (Number.isFinite(cost.amount) && Number(state.values[cost.resource] ?? 0) < cost.amount) {
      reasons.push({ kind: "resource", key: "HEROENGINE.Errors.NotEnough", data: { resource: cost.label } });
    }
  }
  return reasons;
}

export function formatActionGateReason(reason: ActionGateReason): string {
  return localize(reason.key, reason.data);
}

let tooltipTimer: ReturnType<typeof setTimeout> | null = null;
let tooltipElement: HTMLElement | null = null;
let tooltipAnchor: HTMLElement | null = null;

export function hideActionTooltip(): void {
  if (tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = null;
  tooltipElement?.remove();
  tooltipElement = null;
  if (tooltipAnchor) {
    tooltipAnchor.removeAttribute("aria-describedby");
    tooltipAnchor.querySelector("button")?.removeAttribute("aria-describedby");
  }
  tooltipAnchor = null;
}

function positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const gap = 12;
  const edge = 8;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = rect.left - width - gap;
  if (left < edge) left = rect.right + gap;
  if (left + width > window.innerWidth - edge) left = Math.max(edge, window.innerWidth - width - edge);
  let top = rect.top + Math.min(0, (rect.height - height) / 2);
  top = Math.max(edge, Math.min(top, window.innerHeight - height - edge));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function showActionTooltip(anchor: HTMLElement): void {
  hideActionTooltip();
  if (!anchor.isConnected) return;
  const reasons = (() => {
    try { return JSON.parse(anchor.dataset["heTooltipReasons"] ?? "[]") as string[]; }
    catch { return []; }
  })();
  const available = anchor.dataset["heTooltipAvailable"] === "true";
  const tooltip = document.createElement("section");
  const id = `he-action-tooltip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  tooltip.id = id;
  tooltip.className = `he-action-tooltip-card ${available ? "is-available" : "is-unavailable"}`;
  tooltip.setAttribute("role", "tooltip");
  tooltip.innerHTML = `<header><span><i class="fa-solid fa-bolt"></i></span><div><small>${escapeHtml(localize("HEROENGINE.ActionTooltip.Action"))}</small>
      <h3>${escapeHtml(anchor.dataset["heTooltipTitle"] ?? "")}</h3></div><b>${escapeHtml(localize(available ? "HEROENGINE.ActionTooltip.Available" : "HEROENGINE.ActionTooltip.Unavailable"))}</b></header>
    <div class="he-action-tooltip-body"><p>${escapeHtml(anchor.dataset["heTooltipDescription"] ?? "")}</p>
      <dl><div><dt><i class="fa-solid fa-bolt-lightning"></i>${escapeHtml(localize("HEROENGINE.ActionTooltip.Cost"))}</dt><dd>${escapeHtml(anchor.dataset["heTooltipCost"] ?? "")}</dd></div></dl>
      ${reasons.length ? `<aside><strong><i class="fa-solid fa-circle-exclamation"></i>${escapeHtml(localize("HEROENGINE.ActionTooltip.WhyUnavailable"))}</strong><ul>${reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></aside>` : `<aside class="is-ready"><strong><i class="fa-solid fa-circle-check"></i>${escapeHtml(localize("HEROENGINE.ActionTooltip.Ready"))}</strong></aside>`}
    </div><footer><i class="fa-regular fa-clock"></i>${escapeHtml(localize("HEROENGINE.ActionTooltip.HoverHint"))}</footer>`;
  document.body.appendChild(tooltip);
  tooltipElement = tooltip;
  tooltipAnchor = anchor;
  anchor.setAttribute("aria-describedby", id);
  anchor.querySelector("button")?.setAttribute("aria-describedby", id);
  positionTooltip(tooltip, anchor);
  const reveal = () => { if (tooltip.isConnected) tooltip.classList.add("is-visible"); };
  requestAnimationFrame(reveal);
  // Backgrounded collaborative/browser tabs may throttle animation frames.
  setTimeout(reveal, 32);
}

function scheduleActionTooltip(anchor: HTMLElement): void {
  if (tooltipAnchor === anchor && tooltipElement) return;
  hideActionTooltip();
  tooltipAnchor = anchor;
  tooltipTimer = setTimeout(() => showActionTooltip(anchor), ACTION_TOOLTIP_DELAY_MS);
}

/** Bind one delegated tooltip controller to an Actions region. */
export function bindActionTooltips(panel: HTMLElement): void {
  hideActionTooltip();
  const anchorFrom = (target: EventTarget | null) => target instanceof HTMLElement
    ? target.closest<HTMLElement>("[data-he-action-help]") : null;
  panel.addEventListener("pointerover", (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    scheduleActionTooltip(anchor);
  });
  panel.addEventListener("pointerout", (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    hideActionTooltip();
  });
  panel.addEventListener("focusin", (event) => {
    const anchor = anchorFrom(event.target);
    if (anchor) scheduleActionTooltip(anchor);
  });
  panel.addEventListener("focusout", (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget))) return;
    hideActionTooltip();
  });
  panel.addEventListener("wheel", hideActionTooltip, { passive: true });
  panel.addEventListener("click", hideActionTooltip);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") hideActionTooltip(); });
}
