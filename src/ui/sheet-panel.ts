/**
 * Character-sheet Mechanics panel. Injected on actor-sheet render (both sheet
 * generations via compat); re-renders automatically because flag updates
 * re-render open sheets. Owners get live controls, everyone else read-only.
 */
import type { MechanicPlugin } from "../api/types";
import { getCompat } from "../compat";
import { localize } from "../engine/i18n";
import { resolveNumeric } from "../engine/formulas";
import { getPlugin } from "../engine/registry";
import { cooldownStatus, buildEvalData, executeAction, makeContext } from "../engine/runtime";
import { setStance } from "../engine/stances";
import { canOperate } from "../engine/sockets";
import { readState, resolveAttachments, type Attachment, type InstanceState } from "../engine/state";
import { activeThresholds } from "../engine/trackers";
import { escapeHtml } from "./chat-cards";

export function registerSheetPanel(): void {
  const inject = (app: any, element: HTMLElement | any) => {
    const root: HTMLElement | null = element instanceof HTMLElement ? element : element?.[0] ?? null;
    const actor = app?.actor ?? app?.document;
    if (!root || !actor || actor.documentName !== "Actor") return;
    const attachments = resolveAttachments(actor);
    if (!attachments.length) return;
    const html = renderPanel(actor, attachments);
    if (getCompat().injectIntoActorSheet(app, root, html)) {
      bindPanel(root, actor);
    }
  };
  Hooks.on("renderActorSheetV2", inject);
  Hooks.on("renderActorSheet", inject);
}

function renderPanel(actor: any, attachments: Attachment[]): string {
  const sections = attachments
    .map((att) => {
      const plugin = getPlugin(att.pluginId);
      const state = plugin ? readState(att.stateDoc, att.pluginId) : null;
      if (!plugin || !state) return "";
      return renderMechanic(att, plugin, state, canOperate(actor));
    })
    .join("");
  return `<section class="hero-engine-panel"><h2>${localize("HEROENGINE.Panel.Title")}</h2>${sections}</section>`;
}

function renderMechanic(att: Attachment, plugin: MechanicPlugin, state: InstanceState, editable: boolean): string {
  const data = safeEvalData(att, plugin, state);
  const dis = editable ? "" : "disabled";
  const parts: string[] = [];

  parts.push(`<h3>${escapeHtml(localize(plugin.nameKey))}</h3>`);

  // Trackers with threshold badges and GM +/- controls.
  for (const t of plugin.trackers ?? []) {
    const value = state.values[t.id] ?? 0;
    const max = t.max !== undefined ? safeNum(t.max, data) : null;
    const badges = activeThresholds(value, t.thresholds ?? [])
      .map((th) => `<span class="he-badge" title="${escapeHtml(localize(th.descriptionKey ?? th.labelKey))}">${escapeHtml(localize(th.labelKey))}</span>`)
      .join("");
    const gmButtons = game.user.isGM
      ? `<button type="button" data-he="adjust" data-plugin="${plugin.id}" data-id="${t.id}" data-delta="-${t.step ?? 1}">-</button>
         <button type="button" data-he="adjust" data-plugin="${plugin.id}" data-id="${t.id}" data-delta="${t.step ?? 1}">+</button>`
      : "";
    parts.push(
      `<div class="he-row he-tracker"><label>${escapeHtml(localize(t.labelKey))}</label>
        <span class="he-value">${value}${max !== null ? ` / ${max}` : ""}</span>${gmButtons}${badges}</div>`
    );
  }

  // Resources.
  for (const r of plugin.resources ?? []) {
    const value = state.values[r.id] ?? 0;
    const max = safeNum(r.max, data);
    const gmButtons = game.user.isGM
      ? `<button type="button" data-he="adjust" data-plugin="${plugin.id}" data-id="${r.id}" data-delta="-1">-</button>
         <button type="button" data-he="adjust" data-plugin="${plugin.id}" data-id="${r.id}" data-delta="1">+</button>`
      : "";
    parts.push(
      `<div class="he-row he-resource"><label>${escapeHtml(localize(r.labelKey))}</label>
        <span class="he-value">${value} / ${max}</span>${gmButtons}</div>`
    );
  }

  // Active transformation countdown.
  if (state.transform) {
    const def = plugin.transformations?.find((t) => t.id === state.transform!.id);
    parts.push(
      `<div class="he-row he-transform"><label>${escapeHtml(localize("HEROENGINE.Panel.Transform"))}</label>
        <span class="he-value">${escapeHtml(def ? localize(def.labelKey) : state.transform.id)} — ${localize(
          "HEROENGINE.Panel.RoundsLeft",
          { rounds: state.transform.roundsLeft }
        )}</span></div>`
    );
  }

  // Stance groups.
  for (const g of plugin.stances ?? []) {
    const current = state.stances[g.id] ?? "";
    const options = [
      g.allowNone !== false ? `<option value="">${localize("HEROENGINE.Stance.None")}</option>` : "",
      ...g.stances.map(
        (s) =>
          `<option value="${s.id}" ${s.id === current ? "selected" : ""}>${escapeHtml(localize(s.labelKey))}</option>`
      ),
    ].join("");
    parts.push(
      `<div class="he-row he-stance"><label>${escapeHtml(localize(g.labelKey))}</label>
        <select data-he="stance" data-plugin="${plugin.id}" data-id="${g.id}" ${dis}>${options}</select></div>`
    );
  }

  // Actions with evaluated costs/cooldowns.
  const actionButtons = (plugin.actions ?? [])
    .filter((a) => !a.gmOnly || game.user.isGM)
    .map((a) => {
      const cd = cooldownStatus(att, plugin, a);
      const costText = (a.costs ?? [])
        .map((c) => `${safeNum(c.amount, data)} ${escapeHtml(localize(plugin.resources?.find((r) => r.id === c.resource)?.labelKey ?? c.resource))}`)
        .join(", ");
      const disabled = !editable || !cd.ready ? "disabled" : "";
      const cdText = cd.ready ? "" : ` (${escapeHtml(cd.remainingText ?? "")})`;
      const title = a.descriptionKey ? ` title="${escapeHtml(localize(a.descriptionKey))}"` : "";
      return `<button type="button" data-he="action" data-plugin="${plugin.id}" data-id="${a.id}" ${disabled}${title}>
        ${escapeHtml(localize(a.labelKey))}${costText ? ` [${costText}]` : ""}${cdText}</button>`;
    })
    .join("");
  if (actionButtons) parts.push(`<div class="he-actions">${actionButtons}</div>`);

  // Manual trigger fallbacks.
  const triggerButtons = (plugin.triggers ?? [])
    .filter((t) => t.manualFallback !== false)
    .map(
      (t) =>
        `<button type="button" class="he-trigger" data-he="trigger" data-plugin="${plugin.id}" data-id="${t.id}" ${dis}>
          ${escapeHtml(localize(t.labelKey))}</button>`
    )
    .join("");
  if (triggerButtons) {
    parts.push(
      `<details class="he-triggers"><summary>${localize("HEROENGINE.Panel.ManualTriggers")}</summary>${triggerButtons}</details>`
    );
  }

  return `<div class="he-mechanic" data-plugin="${plugin.id}">${parts.join("")}</div>`;
}

function bindPanel(root: HTMLElement, actor: any): void {
  const panel = root.querySelector<HTMLElement>(".hero-engine-panel");
  if (!panel || panel.dataset["heBound"]) return;
  panel.dataset["heBound"] = "1";

  panel.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-he]");
    if (!button || button.dataset["he"] === "stance") return;
    const pluginId = button.dataset["plugin"]!;
    const att = resolveAttachments(actor).find((a) => a.pluginId === pluginId);
    if (!att) return;
    const kind = button.dataset["he"];
    const id = button.dataset["id"]!;
    try {
      if (kind === "action") {
        await executeAction(att, id);
      } else if (kind === "trigger") {
        const ctx = makeContext(att);
        await ctx?.fireTrigger(id, { event: "manual" });
      } else if (kind === "adjust" && game.user.isGM) {
        const ctx = makeContext(att);
        await ctx?.state.adjust(id, Number(button.dataset["delta"] ?? 0));
      }
    } catch (e) {
      console.error("hero-engine | panel", e);
      ui.notifications?.error(String(e));
    }
  });

  panel.addEventListener("change", async (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-he='stance']");
    if (!select) return;
    const att = resolveAttachments(actor).find((a) => a.pluginId === select.dataset["plugin"]);
    if (!att) return;
    await setStance(att, select.dataset["id"]!, select.value === "" ? null : select.value);
  });
}

function safeEvalData(att: Attachment, plugin: MechanicPlugin, state: InstanceState): Record<string, unknown> {
  try {
    return buildEvalData(att, plugin, state);
  } catch {
    return { ...state.values, cfg: {} };
  }
}

function safeNum(value: number | string, data: Record<string, unknown>): number | string {
  try {
    return resolveNumeric(value, data);
  } catch {
    return "?";
  }
}
