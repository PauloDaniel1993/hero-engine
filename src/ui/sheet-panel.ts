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
import { buildRecordRenderModel } from "./record-model";
import { ensureAttachmentReady } from "../engine/records";
import { MECHANIC_SETTLED_HOOK, type MechanicSettlement } from "../engine/events";
import { canonicalActor } from "../engine/state";

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
  let closed = false;
  const hookRegistrations: { event: string; id: number }[] = [];
  const scrollState: { window: number; collections: Record<string, number> } = { window: 0, collections: {} };
  const captureScroll = () => {
    const element = document.getElementById(`hero-engine-actor-mechanics-${actor.id}`);
    const content = element?.querySelector<HTMLElement>(".hero-engine-actor-window");
    if (content) scrollState.window = content.scrollTop;
    element?.querySelectorAll<HTMLElement>("[data-he-collection]").forEach((collection) => {
      const id = collection.dataset["heCollection"];
      const list = collection.querySelector<HTMLElement>(".he-record-list");
      if (id && list) scrollState.collections[id] = list.scrollTop;
    });
  };
  const restoreScroll = (root: HTMLElement) => requestAnimationFrame(() => {
    const element = root.closest<HTMLElement>(".application") ?? root;
    const content = element.querySelector<HTMLElement>(".hero-engine-actor-window") ?? root;
    content.scrollTop = scrollState.window;
    element.querySelectorAll<HTMLElement>("[data-he-collection]").forEach((collection) => {
      const id = collection.dataset["heCollection"];
      const list = collection.querySelector<HTMLElement>(".he-record-list");
      if (id && list && scrollState.collections[id] !== undefined) list.scrollTop = scrollState.collections[id]!;
    });
  });
  const scheduleRefresh = (delay = 90) => {
    if (closed) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      captureScroll();
      void app.render();
    }, delay);
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
      bindPanel(root, actor, () => scheduleRefresh(0));
      restoreScroll(root);
    },
    onClose: () => {
      closed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const registration of hookRegistrations) Hooks.off(registration.event, registration.id);
      actorMechanicsApps.delete(actor.id);
    },
  });
  actorMechanicsApps.set(actor.id, app);
  const watch = (event: string) => {
    const id = Hooks.on(event, (document: any) => {
      const related = new Set<string>([actor.id]);
      related.add(canonicalActor(actor)?.id);
      for (const attachment of resolveAttachments(actor)) {
        related.add((attachment.actor as any)?.id);
        related.add((attachment.canonicalActor as any)?.id);
        related.add((attachment.stateDoc as any)?.id);
      }
      const documentActorId = mechanicsDocumentActorId(document);
      if (documentActorId && related.has(documentActorId)) scheduleRefresh();
    });
    hookRegistrations.push({ event, id });
  };
  for (const event of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) watch(event);
  const settledHookId = Hooks.on(MECHANIC_SETTLED_HOOK, (settlement: MechanicSettlement) => {
    const related = new Set<string>([actor.id, canonicalActor(actor)?.id]);
    for (const attachment of resolveAttachments(actor)) {
      related.add((attachment.actor as any)?.id);
      related.add((attachment.canonicalActor as any)?.id);
      related.add((attachment.stateDoc as any)?.id);
    }
    if (settlement.pluginId && settlement.actorIds.some((id) => related.has(id))) scheduleRefresh(0);
  });
  hookRegistrations.push({ event: MECHANIC_SETTLED_HOOK, id: settledHookId });
  app.render(true);
  return app;
}

export function mechanicsDocumentActorId(document: any): string | undefined {
  if (document?.documentName === "Actor") return document.id;
  if (document?.actor?.id) return document.actor.id;
  if (document?.parent?.documentName === "Actor") return document.parent.id;
  return document?.parent?.actor?.id;
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
  const characterRows: string[] = [];
  const stateRows: string[] = [];
  const regionKey = (regionId: string) => regionStorageKey(att.canonicalActor.id, plugin.id, regionId);

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
    characterRows.push(
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
    characterRows.push(
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
    const linkedIds = new Set<string>([...(att.canonicalActor.items ?? [])].flatMap((item: any) => item.getFlag?.("hero-engine", "managed")?.recordId ? [item.getFlag("hero-engine", "managed").recordId] : []));
    const renderModel = buildRecordRenderModel(snapshot, ["echoes", "temporary-echoes"].includes(collection.id) ? linkedIds : undefined).filter((row) => row.kind === "slot");
    const rows = allSlots.map((slot, index) => {
      const overflow = index >= snapshot.slots.length;
      const status = renderModel[index]!.status;
      const missingLink = renderModel[index]!.missingLink;
      const title = slot.record ? String(slot.record.data["name"] ?? slot.record.data["label"] ?? slot.record.id) : localize("HEROENGINE.Records.Empty");
      const details = slot.record ? Object.entries(slot.record.data).filter(([key]) => !["name", "label", "sourceOpaqueId", "sourceActorUuid"].includes(key)).map(([key, value]) => {
        const field = collection.fields.find((candidate) => candidate.key === key);
        const label = field ? localize(field.labelKey) : key;
        return `<span><b>${escapeHtml(label)}</b>${escapeHtml(typeof value === "string" ? value : JSON.stringify(value))}</span>`;
      }).join("") : "";
      const actions = slot.record ? (collection.actions ?? []).filter((action) => !action.gmOnly || game.user.isGM).map((action) => `<button type="button" data-he="record-action" data-plugin="${plugin.id}" data-collection="${collection.id}" data-record="${slot.record!.id}" data-action="${action.id}">${escapeHtml(localize(action.labelKey))}</button>`).join("") : "";
      return `<article class="he-record-slot is-${status}${overflow ? " is-overflow" : ""}" data-he-record data-status="${status}" data-search="${escapeHtml(`${title} ${JSON.stringify(slot.record?.data ?? {})}`.toLocaleLowerCase())}">
        <header><span class="he-record-index">${index + 1}</span><strong>${escapeHtml(title)}</strong>
          <span class="he-record-badges">${overflow ? `<i>${localize("HEROENGINE.Records.Overflow")}</i>` : ""}${missingLink ? `<i class="is-warning">${localize("HEROENGINE.Records.MissingLink")}</i>` : ""}<i>${localize(`HEROENGINE.Records.${status[0]!.toUpperCase()}${status.slice(1)}`)}</i></span></header>
        ${slot.blocked ? `<p>${escapeHtml(slot.blocked.reason)}</p>` : ""}${missingLink ? `<p class="he-record-link-warning">${escapeHtml(localize("HEROENGINE.Records.MissingLinkHint"))}</p>` : ""}${details ? `<div class="he-record-details">${details}</div>` : ""}
        ${actions ? `<footer>${actions}</footer>` : ""}</article>`;
    }).join("");
    const eraseOptions = allSlots.filter((slot) => slot.record && !slot.blocked).map((slot) => `<option value="${slot.record!.id}">${escapeHtml(String(slot.record!.data["name"] ?? slot.record!.id))}</option>`).join("");
    const pendingRows = snapshot.pending.map((entry) => {
      const title = String(entry.record.data["name"] ?? entry.record.id);
      return `<article class="he-record-slot is-pending" data-he-record data-status="pending" data-search="${escapeHtml(`${title} ${JSON.stringify(entry.record.data)}`.toLocaleLowerCase())}">
        <header><span class="he-record-index"><i class="fa-solid fa-hourglass-half"></i></span><strong>${escapeHtml(title)}</strong><span class="he-record-badges"><i>${localize("HEROENGINE.Records.Pending")}</i></span></header>
        <p>${escapeHtml(localize("HEROENGINE.Records.PendingHint"))}</p>
        <footer><select data-he-pending-erase aria-label="${escapeHtml(localize("HEROENGINE.Records.Replace"))}">${eraseOptions}</select>
          <button type="button" data-he="pending-replace" data-plugin="${plugin.id}" data-collection="${collection.id}" data-pending="${entry.id}">${escapeHtml(localize("HEROENGINE.Records.Replace"))}</button>
          <button type="button" data-he="pending-cancel" data-plugin="${plugin.id}" data-collection="${collection.id}" data-pending="${entry.id}">${escapeHtml(localize("HEROENGINE.Records.Cancel"))}</button></footer></article>`;
    }).join("");
    parts.push(`<details class="he-region he-record-collection" data-he-collection="${collection.id}" data-presentation-key="${escapeHtml(presentationKey)}" ${regionAttributes(regionKey(`collection:${collection.id}`), true)}>
      <summary class="he-region-summary he-record-heading"><div><i class="fa-solid fa-layer-group"></i><span><strong>${escapeHtml(localize(collection.labelKey))}</strong>
        <small>${collection.descriptionKey ? escapeHtml(localize(collection.descriptionKey)) : ""}</small></span></div><span class="he-region-meta"><b>${snapshot.slots.filter((slot) => slot.record).length}/${snapshot.capacity}</b><i class="fa-solid fa-chevron-down he-region-chevron"></i></span></summary>
      <div class="he-region-content"><div class="he-record-tools"><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-he-record-search value="${escapeHtml(presentation.search ?? "")}" placeholder="${escapeHtml(localize("HEROENGINE.Records.Search"))}" /></label>
        <select data-he-record-filter><option value="all" ${!presentation.filter || presentation.filter === "all" ? "selected" : ""}>${localize("HEROENGINE.Records.All")}</option><option value="permanent" ${presentation.filter === "permanent" ? "selected" : ""}>${localize("HEROENGINE.Records.Permanent")}</option><option value="temporary" ${presentation.filter === "temporary" ? "selected" : ""}>${localize("HEROENGINE.Records.Temporary")}</option><option value="blocked" ${presentation.filter === "blocked" ? "selected" : ""}>${localize("HEROENGINE.Records.Blocked")}</option><option value="pending" ${presentation.filter === "pending" ? "selected" : ""}>${localize("HEROENGINE.Records.Pending")}</option><option value="empty" ${presentation.filter === "empty" ? "selected" : ""}>${localize("HEROENGINE.Records.Empty")}</option></select></div>
      ${snapshot.recovery ? `<p class="he-record-recovery"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(snapshot.recovery)}</p>` : ""}
      <div class="he-record-list">${pendingRows}${rows}</div></div></details>`);
  }

  // Active transformation countdown.
  if (state.transform) {
    const def = plugin.transformations?.find((t) => t.id === state.transform!.id);
    stateRows.push(
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
    stateRows.push(
      `<div class="he-row he-stance"><div class="he-row-main"><label><i class="fa-solid fa-person-rays"></i>${escapeHtml(localize(g.labelKey))}</label>
        <select data-he="stance" data-plugin="${plugin.id}" data-id="${g.id}" ${dis}>${options}</select></div></div>`
    );
  }

  // Actions with evaluated costs/cooldowns.
  const actionButtons = (plugin.actions ?? [])
    .filter((a) => !a.gmOnly || game.user.isGM)
    .map((a) => {
      const cd = cooldownStatus(att, plugin, a);
      const meetsFlags = (!a.requiresFlag || Boolean(state.flags[a.requiresFlag]))
        && (!a.forbidsFlag || !state.flags[a.forbidsFlag]);
      const costText = (a.costs ?? [])
        .map((c) => `${safeNum(c.amount, data)} ${escapeHtml(localize(plugin.resources?.find((r) => r.id === c.resource)?.labelKey ?? c.resource))}`)
        .join(", ");
      const disabled = !editable || !cd.ready || !meetsFlags ? "disabled" : "";
      const cdText = cd.ready ? "" : ` (${escapeHtml(cd.remainingText ?? "")})`;
      const titleText = !meetsFlags ? localize("HEROENGINE.Errors.Unavailable")
        : a.descriptionKey ? localize(a.descriptionKey) : "";
      const title = titleText ? ` title="${escapeHtml(titleText)}"` : "";
      return `<button type="button" data-he="action" data-plugin="${plugin.id}" data-id="${a.id}" ${disabled}${title}>
        ${escapeHtml(localize(a.labelKey))}${costText ? ` [${costText}]` : ""}${cdText}</button>`;
    })
    .join("");
  if (actionButtons) parts.push(`<details class="he-region he-action-block" ${regionAttributes(regionKey("actions"), true)}><summary class="he-region-summary"><i class="fa-solid fa-bolt"></i><span>${escapeHtml(localize("HEROENGINE.Panel.Actions"))}</span><i class="fa-solid fa-chevron-down he-region-chevron"></i></summary><div class="he-region-content he-actions">${actionButtons}</div></details>`);

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
      `<details class="he-region he-triggers" ${regionAttributes(regionKey("manual-triggers"), false)}><summary class="he-region-summary"><i class="fa-solid fa-hand"></i><span>${localize("HEROENGINE.Panel.ManualTriggers")}</span><i class="fa-solid fa-chevron-down he-region-chevron"></i></summary><div class="he-region-content he-trigger-grid">${triggerButtons}</div></details>`
    );
  }

  if (stateRows.length) parts.unshift(`<details class="he-region he-state-region" ${regionAttributes(regionKey("active-state"), true)}><summary class="he-region-summary"><i class="fa-solid fa-wand-sparkles"></i><span>${escapeHtml(localize("HEROENGINE.Panel.ActiveState"))}</span><i class="fa-solid fa-chevron-down he-region-chevron"></i></summary><div class="he-region-content">${stateRows.join("")}</div></details>`);
  if (characterRows.length) parts.unshift(`<details class="he-region he-character-region" ${regionAttributes(regionKey("character"), true)}><summary class="he-region-summary"><i class="fa-solid fa-chart-simple"></i><span>${escapeHtml(localize("HEROENGINE.Panel.Character"))}</span><i class="fa-solid fa-chevron-down he-region-chevron"></i></summary><div class="he-region-content">${characterRows.join("")}</div></details>`);

  return `<details class="he-mechanic" data-plugin="${plugin.id}" ${regionAttributes(regionKey("mechanic"), true)}><summary class="he-mechanic-header"><div><h3>${escapeHtml(localize(plugin.nameKey))}</h3>
    <p>${escapeHtml(plugin.descriptionKey ? localize(plugin.descriptionKey) : "")}</p></div><span>${escapeHtml(plugin.archetype)}</span><i class="fa-solid fa-chevron-down he-region-chevron"></i></summary><div class="he-mechanic-content">${parts.join("")}</div></details>`;
}

export function regionStorageKey(actorId: string, pluginId: string, regionId: string): string {
  return `hero-engine:region-ui:${actorId}:${pluginId}:${regionId}`;
}

export function storedRegionOpen(stored: string | null, defaultOpen: boolean): boolean {
  return stored === null ? defaultOpen : stored === "open";
}

function regionAttributes(key: string, defaultOpen: boolean): string {
  let open = defaultOpen;
  try {
    open = storedRegionOpen(localStorage.getItem(key), defaultOpen);
  } catch { /* localStorage can be unavailable in isolated render fixtures. */ }
  return `data-he-region-key="${escapeHtml(key)}"${open ? " open" : ""}`;
}

function bindPanel(root: HTMLElement, actor: any, onMutation: () => void): void {
  const panel = root.querySelector<HTMLElement>(".hero-engine-panel");
  if (!panel || panel.dataset["heBound"]) return;
  panel.dataset["heBound"] = "1";

  panel.querySelectorAll<HTMLDetailsElement>("details[data-he-region-key]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const key = details.dataset["heRegionKey"];
      if (!key) return;
      try { localStorage.setItem(key, details.open ? "open" : "closed"); } catch { /* client presentation remains best-effort. */ }
    });
  });

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
      } else if (kind === "pending-replace") {
        const ctx = makeContext(att);
        const eraseId = button.closest<HTMLElement>("[data-he-record]")?.querySelector<HTMLSelectElement>("[data-he-pending-erase]")?.value;
        if (eraseId) await ctx?.records.replacePending(button.dataset["collection"]!, button.dataset["pending"]!, eraseId);
      } else if (kind === "pending-cancel") {
        const ctx = makeContext(att);
        await ctx?.records.cancelPending(button.dataset["collection"]!, button.dataset["pending"]!);
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
    } finally {
      onMutation();
    }
  });

  panel.addEventListener("change", async (event) => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-he='stance']");
    if (!select) return;
    const att = resolveAttachments(actor).find((a) => a.pluginId === select.dataset["plugin"]);
    if (!att) return;
    try {
      await setStance(att, select.dataset["id"]!, select.value === "" ? null : select.value);
    } finally {
      onMutation();
    }
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
