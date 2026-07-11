/**
 * Character-sheet Mechanics panel. Injected on actor-sheet render (both sheet
 * generations via compat); re-renders automatically because flag updates
 * re-render open sheets. Owners get live controls, everyone else read-only.
 */
import type { MechanicPlugin } from "../api/types";
import { localize } from "../engine/i18n";
import { resolveNumeric } from "../engine/formulas";
import { getPlugin } from "../engine/registry";
import { cooldownStatus, buildEvalData, executeAction, makeContext } from "../engine/runtime";
import { setStance } from "../engine/stances";
import { canOperate } from "../engine/sockets";
import { readState, resolveAttachments, type Attachment, type InstanceState } from "../engine/state";
import { activeThresholds } from "../engine/trackers";
import { escapeHtml } from "./chat-cards";
import { createApp } from "./app-base";
import { ensureAttachmentReady } from "../engine/records";

export function registerSheetPanel(): void {
  const inject = (app: any, element: HTMLElement | any) => {
    const root: HTMLElement | null = element instanceof HTMLElement ? element : element?.[0] ?? null;
    const actor = app?.actor ?? app?.document;
    if (!root || !actor || actor.documentName !== "Actor") return;
    const attachments = resolveAttachments(actor);
    if (!attachments.length) return;
    root.querySelector(".hero-engine-panel")?.remove();
    injectMechanicsLauncher(root, actor);
  };
  Hooks.on("renderActorSheetV2", inject);
  Hooks.on("renderActorSheet", inject);
}

const actorMechanicsApps = new Map<string, any>();

function injectMechanicsLauncher(root: HTMLElement, actor: any): void {
  if (root.querySelector("[data-he-open-mechanics]")) return;
  const sheetControls = root.querySelector<HTMLElement>(".sheet-header-buttons");
  const windowControls = root.querySelector<HTMLElement>(".window-header");
  const anchor = sheetControls ?? windowControls;
  if (!anchor) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = sheetControls
    ? "gold-button he-sheet-launch"
    : "header-control icon fa-solid fa-bolt he-sheet-launch";
  button.dataset["heOpenMechanics"] = "1";
  button.setAttribute("aria-label", localize("HEROENGINE.Panel.Open"));
  button.title = localize("HEROENGINE.Panel.Open");
  if (sheetControls) button.innerHTML = '<i class="fa-solid fa-bolt"></i>';
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openActorMechanics(actor);
  });
  if (sheetControls) anchor.appendChild(button);
  else {
    const close = anchor.querySelector("[data-action='close'], .close");
    anchor.insertBefore(button, close ?? null);
  }
}

export function openActorMechanics(actor: any): any {
  for (const att of resolveAttachments(actor)) {
    const plugin = getPlugin(att.pluginId);
    const ctx = plugin ? makeContext(att) : null;
    if (plugin && ctx) void ensureAttachmentReady(att, plugin, () => ctx).then(() => actorMechanicsApps.get(actor.id)?.render());
  }
  const current = actorMechanicsApps.get(actor.id);
  if (current) {
    current.render(true);
    return current;
  }
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const openTriggerPlugins = new Set<string>();
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => app.render(), 650);
  };
  const estimatedHeight = Math.min(760, Math.max(480, 120 + resolveAttachments(actor).reduce((sum, attachment) => {
    const plugin = getPlugin(attachment.pluginId);
    if (!plugin) return sum;
    const rows = (plugin.trackers?.length ?? 0) + (plugin.resources?.length ?? 0) + (plugin.stances?.length ?? 0);
    const actionRows = Math.ceil((plugin.actions?.length ?? 0) / 2);
    return sum + 150 + rows * 52 + actionRows * 45 + ((plugin.triggers?.length ?? 0) ? 45 : 0);
  }, 0)));
  const app = createApp({
    id: `hero-engine-actor-mechanics-${actor.id}`,
    title: `${actor.name} — ${localize("HEROENGINE.Panel.Title")}`,
    width: 640,
    height: estimatedHeight,
    render: () => `<div class="hero-engine-actor-window">${renderPanel(actor, resolveAttachments(actor))}</div>`,
    bind: (root) => {
      bindPanel(root, actor);
      root.querySelectorAll<HTMLDetailsElement>("details.he-triggers").forEach((details) => {
        const pluginId = details.closest<HTMLElement>(".he-mechanic")?.dataset["plugin"];
        if (pluginId && openTriggerPlugins.has(pluginId)) details.open = true;
        details.addEventListener("toggle", () => {
          if (!pluginId) return;
          if (details.open) openTriggerPlugins.add(pluginId);
          else openTriggerPlugins.delete(pluginId);
        });
      });
      root.addEventListener("click", (event) => {
        if ((event.target as HTMLElement).closest("button[data-he]")) scheduleRefresh();
      });
      root.addEventListener("change", (event) => {
        if ((event.target as HTMLElement).closest("select[data-he]")) scheduleRefresh();
      });
    },
    onClose: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      actorMechanicsApps.delete(actor.id);
    },
  });
  actorMechanicsApps.set(actor.id, app);
  app.render(true);
  return app;
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
  return `<section class="hero-engine-panel">
    <header class="he-panel-header"><span><i class="fa-solid fa-bolt"></i></span><div>
      <h2>${localize("HEROENGINE.Panel.Title")}</h2><p>${localize("HEROENGINE.Panel.Subtitle")}</p>
    </div></header>${sections}</section>`;
}

function renderMechanic(att: Attachment, plugin: MechanicPlugin, state: InstanceState, editable: boolean): string {
  const data = safeEvalData(att, plugin, state);
  const dis = editable ? "" : "disabled";
  const parts: string[] = [];

  parts.push(`<header class="he-mechanic-header"><div><h3>${escapeHtml(localize(plugin.nameKey))}</h3>
    <p>${escapeHtml(plugin.descriptionKey ? localize(plugin.descriptionKey) : "")}</p></div><span>${escapeHtml(plugin.archetype)}</span></header>`);

  // Trackers with threshold badges and GM +/- controls.
  for (const t of plugin.trackers ?? []) {
    const value = state.values[t.id] ?? 0;
    const max = t.max !== undefined ? safeNum(t.max, data) : null;
    const badges = activeThresholds(value, t.thresholds ?? [])
      .map((th) => `<span class="he-badge" title="${escapeHtml(localize(th.descriptionKey ?? th.labelKey))}">${escapeHtml(localize(th.labelKey))}</span>`)
      .join("");
    const pct = typeof max === "number" && max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : null;
    const gmButtons = game.user.isGM
      ? `<button type="button" class="he-step" data-he="adjust" data-plugin="${plugin.id}" data-id="${t.id}" data-delta="-${t.step ?? 1}"><i class="fa-solid fa-minus"></i></button>
         <button type="button" class="he-step" data-he="adjust" data-plugin="${plugin.id}" data-id="${t.id}" data-delta="${t.step ?? 1}"><i class="fa-solid fa-plus"></i></button>`
      : "";
    parts.push(
      `<div class="he-row he-tracker"><div class="he-row-main"><label>${escapeHtml(localize(t.labelKey))}${badges}</label>
        <span class="he-value">${value}${max !== null ? ` / ${max}` : ""}</span>${gmButtons}</div>
        ${pct !== null ? `<span class="he-meter"><i style="width:${pct}%"></i></span>` : ""}</div>`
    );
  }

  // Resources.
  for (const r of plugin.resources ?? []) {
    const value = state.values[r.id] ?? 0;
    const max = safeNum(r.max, data);
    const pct = typeof max === "number" && max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : null;
    const gmButtons = game.user.isGM
      ? `<button type="button" class="he-step" data-he="adjust" data-plugin="${plugin.id}" data-id="${r.id}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
         <button type="button" class="he-step" data-he="adjust" data-plugin="${plugin.id}" data-id="${r.id}" data-delta="1"><i class="fa-solid fa-plus"></i></button>`
      : "";
    parts.push(
      `<div class="he-row he-resource"><div class="he-row-main"><label>${escapeHtml(localize(r.labelKey))}</label>
        <span class="he-value">${value} / ${max}</span>${gmButtons}</div>
        ${pct !== null ? `<span class="he-meter"><i style="width:${pct}%"></i></span>` : ""}</div>`
    );
  }

  for (const collection of plugin.recordCollections ?? []) {
    const ctx = makeContext(att);
    if (!ctx) continue;
    const snapshot = ctx.records.list(collection.id);
    const presentationKey = `hero-engine:collection-ui:${att.canonicalActor.id}:${plugin.id}:${collection.id}`;
    let presentation: { search?: string; filter?: string } = {};
    try { presentation = JSON.parse(localStorage.getItem(presentationKey) ?? "{}"); } catch { /* ignore stale client data */ }
    const allSlots = [...snapshot.slots, ...snapshot.overflow];
    const rows = allSlots.map((slot, index) => {
      const overflow = index >= snapshot.slots.length;
      const status = slot.blocked ? "blocked" : slot.record ? (slot.record.temporary ? "temporary" : "permanent") : "empty";
      const title = slot.record ? String(slot.record.data["name"] ?? slot.record.data["label"] ?? slot.record.id) : localize("HEROENGINE.Records.Empty");
      const details = slot.record ? Object.entries(slot.record.data).filter(([key]) => key !== "name" && key !== "label").map(([key, value]) => `<span><b>${escapeHtml(key)}</b>${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</span>`).join("") : "";
      const actions = slot.record ? (collection.actions ?? []).filter((action) => !action.gmOnly || game.user.isGM).map((action) => `<button type="button" data-he="record-action" data-plugin="${plugin.id}" data-collection="${collection.id}" data-record="${slot.record!.id}" data-action="${action.id}">${escapeHtml(localize(action.labelKey))}</button>`).join("") : "";
      return `<article class="he-record-slot is-${status}${overflow ? " is-overflow" : ""}" data-he-record data-status="${status}" data-search="${escapeHtml(`${title} ${JSON.stringify(slot.record?.data ?? {})}`.toLocaleLowerCase())}">
        <header><span class="he-record-index">${index + 1}</span><strong>${escapeHtml(title)}</strong>
          <span class="he-record-badges">${overflow ? `<i>${localize("HEROENGINE.Records.Overflow")}</i>` : ""}<i>${localize(`HEROENGINE.Records.${status[0]!.toUpperCase()}${status.slice(1)}`)}</i></span></header>
        ${slot.blocked ? `<p>${escapeHtml(slot.blocked.reason)}</p>` : ""}${details ? `<div class="he-record-details">${details}</div>` : ""}
        ${actions ? `<footer>${actions}</footer>` : ""}</article>`;
    }).join("");
    parts.push(`<section class="he-record-collection" data-he-collection="${collection.id}" data-presentation-key="${escapeHtml(presentationKey)}">
      <header class="he-record-heading"><div><i class="fa-solid fa-layer-group"></i><span><strong>${escapeHtml(localize(collection.labelKey))}</strong>
        <small>${collection.descriptionKey ? escapeHtml(localize(collection.descriptionKey)) : ""}</small></span></div><b>${snapshot.slots.filter((slot) => slot.record).length}/${snapshot.capacity}</b></header>
      <div class="he-record-tools"><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-he-record-search value="${escapeHtml(presentation.search ?? "")}" placeholder="${escapeHtml(localize("HEROENGINE.Records.Search"))}" /></label>
        <select data-he-record-filter><option value="all" ${!presentation.filter || presentation.filter === "all" ? "selected" : ""}>${localize("HEROENGINE.Records.All")}</option><option value="permanent" ${presentation.filter === "permanent" ? "selected" : ""}>${localize("HEROENGINE.Records.Permanent")}</option><option value="temporary" ${presentation.filter === "temporary" ? "selected" : ""}>${localize("HEROENGINE.Records.Temporary")}</option><option value="blocked" ${presentation.filter === "blocked" ? "selected" : ""}>${localize("HEROENGINE.Records.Blocked")}</option><option value="empty" ${presentation.filter === "empty" ? "selected" : ""}>${localize("HEROENGINE.Records.Empty")}</option></select></div>
      ${snapshot.recovery ? `<p class="he-record-recovery"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(snapshot.recovery)}</p>` : ""}
      <div class="he-record-list">${rows}</div></section>`);
  }

  // Active transformation countdown.
  if (state.transform) {
    const def = plugin.transformations?.find((t) => t.id === state.transform!.id);
    parts.push(
      `<div class="he-row he-transform"><div class="he-row-main"><label><i class="fa-solid fa-wand-sparkles"></i>${escapeHtml(localize("HEROENGINE.Panel.Transform"))}</label>
        <span class="he-value">${escapeHtml(def ? localize(def.labelKey) : state.transform.id)} — ${localize(
          "HEROENGINE.Panel.RoundsLeft",
          { rounds: state.transform.roundsLeft }
        )}</span></div></div>`
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
      `<div class="he-row he-stance"><div class="he-row-main"><label><i class="fa-solid fa-person-rays"></i>${escapeHtml(localize(g.labelKey))}</label>
        <select data-he="stance" data-plugin="${plugin.id}" data-id="${g.id}" ${dis}>${options}</select></div></div>`
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
  if (actionButtons) parts.push(`<section class="he-action-block"><header><i class="fa-solid fa-bolt"></i><span>${escapeHtml(localize("HEROENGINE.Panel.Actions"))}</span></header><div class="he-actions">${actionButtons}</div></section>`);

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
      `<details class="he-triggers"><summary><i class="fa-solid fa-hand"></i>${localize("HEROENGINE.Panel.ManualTriggers")}<i class="fa-solid fa-chevron-down"></i></summary><div class="he-trigger-grid">${triggerButtons}</div></details>`
    );
  }

  return `<div class="he-mechanic" data-plugin="${plugin.id}">${parts.join("")}</div>`;
}

function bindPanel(root: HTMLElement, actor: any): void {
  const panel = root.querySelector<HTMLElement>(".hero-engine-panel");
  if (!panel || panel.dataset["heBound"]) return;
  panel.dataset["heBound"] = "1";

  const applyCollectionFilter = (collection: HTMLElement) => {
    const query = collection.querySelector<HTMLInputElement>("[data-he-record-search]")?.value.trim().toLocaleLowerCase() ?? "";
    const filter = collection.querySelector<HTMLSelectElement>("[data-he-record-filter]")?.value ?? "all";
    collection.querySelectorAll<HTMLElement>("[data-he-record]").forEach((row) => {
      const statusMatches = filter === "all" || row.dataset["status"] === filter;
      const queryMatches = !query || (row.dataset["search"] ?? "").includes(query);
      row.hidden = !(statusMatches && queryMatches);
    });
    const key = collection.dataset["presentationKey"];
    if (key) localStorage.setItem(key, JSON.stringify({ search: query, filter }));
  };
  panel.querySelectorAll<HTMLElement>("[data-he-collection]").forEach((collection) => {
    const stored = collection.dataset["presentationKey"] ? localStorage.getItem(collection.dataset["presentationKey"]!) : null;
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const filter = collection.querySelector<HTMLSelectElement>("[data-he-record-filter]");
        if (filter) filter.value = data.filter ?? "all";
      } catch { /* ignore stale client data */ }
    }
    collection.addEventListener("input", () => applyCollectionFilter(collection));
    collection.addEventListener("change", () => applyCollectionFilter(collection));
    applyCollectionFilter(collection);
  });

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
      } else if (kind === "record-action") {
        const ctx = makeContext(att);
        await ctx?.records.runAction(button.dataset["collection"]!, button.dataset["record"]!, button.dataset["action"]!);
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
