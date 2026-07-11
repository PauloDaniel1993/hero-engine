/**
 * GM control panel: every attached mechanic in the world, attachment
 * management (with item binding), tracker adjustments with reason logging,
 * forced recharges, early transformation end, config/override access, and the
 * adjudication queue with a pending badge.
 */
import { MODULE_ID } from "../constants";
import { getCompat } from "../compat";
import { resolveAdjudication } from "../engine/adjudication-resolve";
import { attachMechanic, detachMechanic } from "../engine/attach";
import { localize } from "../engine/i18n";
import { forceRecharge, resetCooldown } from "../engine/recharge";
import { getPlugin, listPlugins } from "../engine/registry";
import { applyOpsTo, makeContext } from "../engine/runtime";
import { getAdjudicationQueue } from "../engine/settings";
import { readState, resolveAttachments, type Attachment } from "../engine/state";
import { endTransform } from "../engine/transforms";
import { createApp } from "./app-base";
import { escapeHtml } from "./chat-cards";
import { openConfigForm } from "./config-form";

let panelApp: any = null;

export function registerGmPanel(): void {
  // Settings-menu entry point (version-stable) + auto-refresh on queue changes.
  try {
    game.settings.registerMenu(MODULE_ID, "gmPanel", {
      name: "HEROENGINE.GMPanel.MenuName",
      label: "HEROENGINE.GMPanel.MenuLabel",
      hint: "HEROENGINE.GMPanel.MenuHint",
      icon: "fas fa-bolt",
      restricted: true,
      type: makeMenuShim(),
    });
  } catch (e) {
    console.warn("hero-engine | GM panel menu registration", e);
  }
  Hooks.on("heroEngine.adjudicationQueued", () => {
    if (game.user.isGM) {
      ui.notifications?.info(localize("HEROENGINE.Adjudication.Pending", { count: getAdjudicationQueue().length }));
      panelApp?.render();
    }
  });
  Hooks.on("heroEngine.adjudicationResolved", () => panelApp?.render());
  Hooks.on("getSceneControlButtons", (controls: any) => {
    if (!game.user.isGM) return;
    const tokenControls = controls.tokens;
    if (!tokenControls) return;
    tokenControls.tools["hero-engine-gm"] = {
      name: "hero-engine-gm",
      title: localize("HEROENGINE.GMPanel.ToolbarTitle"),
      icon: "fa-solid fa-bolt",
      button: true,
      order: 0,
      visible: true,
      onChange: () => openGmPanel(),
    };
  });
}

/** registerMenu expects a constructible that renders; shim onto our AppV2 panel. */
function makeMenuShim(): any {
  const ApplicationV2 = foundry.applications.api.ApplicationV2;
  return class extends ApplicationV2 {
    render(): this {
      openGmPanel();
      return this;
    }
  };
}

function worldAttachments(): Attachment[] {
  const out: Attachment[] = [];
  for (const actor of game.actors ?? []) out.push(...resolveAttachments(actor));
  return out;
}

export function openGmPanel(): void {
  if (!game.user.isGM) return;
  if (panelApp) {
    panelApp.render(true);
    return;
  }
  panelApp = createApp({
    id: "hero-engine-gm-panel",
    title: localize("HEROENGINE.GMPanel.Title"),
    width: 780,
    render: renderDashboardPanel,
    bind: bindPanel,
  });
  panelApp.render(true);
}

function renderPanel(): string {
  const queue = getAdjudicationQueue();
  const plugins = listPlugins();

  const queueHtml = queue.length
    ? queue
        .map((entry) => {
          const plugin = getPlugin(entry.pluginId);
          const def = plugin?.adjudications?.find((a) => a.id === entry.adjudicationId);
          const actorName = fromUuidSyncName(entry.actorUuid);
          const buttons =
            def?.kind === "choice"
              ? (def.choices ?? [])
                  .map(
                    (c) =>
                      `<button type="button" data-he="resolve" data-entry="${entry.id}" data-result="${c.id}">
                        ${escapeHtml(localize(c.labelKey))}</button>`
                  )
                  .join("")
              : `<button type="button" data-he="resolve" data-entry="${entry.id}" data-result="confirm">✔</button>
                 <button type="button" data-he="resolve" data-entry="${entry.id}" data-result="deny">✘</button>`;
          return `<li class="he-adj">
            <strong>${escapeHtml(actorName)}</strong> — ${escapeHtml(def ? localize(def.titleKey) : entry.adjudicationId)}
            ${entry.note ? `<em>(${escapeHtml(entry.note)})</em>` : ""}
            ${def?.descriptionKey ? `<p class="he-hint">${escapeHtml(localize(def.descriptionKey))}</p>` : ""}
            <span class="he-adj-buttons">${buttons}</span></li>`;
        })
        .join("")
    : `<li class="he-hint">${localize("HEROENGINE.GMPanel.NoAdjudications")}</li>`;

  const attachRows = worldAttachments()
    .map((att) => {
      const plugin = getPlugin(att.pluginId);
      const state = plugin ? readState(att.stateDoc, att.pluginId) : null;
      if (!plugin || !state) return "";
      const values = [...(plugin.trackers ?? []), ...(plugin.resources ?? [])]
        .map(
          (v) =>
            `<button type="button" data-he="adjust" data-actor="${(att.actor as any).id}" data-plugin="${plugin.id}"
              data-id="${v.id}" title="${localize("HEROENGINE.GMPanel.AdjustHint")}">
              ${escapeHtml(localize(v.labelKey))}: ${state.values[v.id] ?? 0}</button>`
        )
        .join(" ");
      const rechargeButtons = (plugin.resources ?? [])
        .map(
          (r) =>
            `<button type="button" data-he="recharge" data-actor="${(att.actor as any).id}" data-plugin="${plugin.id}"
              data-id="${r.id}">⟳ ${escapeHtml(localize(r.labelKey))}</button>`
        )
        .join("");
      const transformButton = state.transform
        ? `<button type="button" data-he="end-transform" data-actor="${(att.actor as any).id}" data-plugin="${plugin.id}">
            ${localize("HEROENGINE.GMPanel.EndTransform")} (${state.transform.roundsLeft})</button>`
        : "";
      const cooldownButtons = (plugin.actions ?? [])
        .filter((a) => a.cooldown)
        .map(
          (a) =>
            `<button type="button" data-he="reset-cd" data-actor="${(att.actor as any).id}" data-plugin="${plugin.id}"
              data-id="${a.id}">CD: ${escapeHtml(localize(a.labelKey))}</button>`
        )
        .join("");
      return `<li class="he-attachment">
        <strong>${escapeHtml((att.actor as any).name)}</strong> — ${escapeHtml(localize(plugin.nameKey))}
        ${att.item ? `<em>(${escapeHtml((att.item as any).name)})</em>` : ""}
        <div class="he-att-values">${values}</div>
        <div class="he-att-controls">${rechargeButtons}${cooldownButtons}${transformButton}
          <button type="button" data-he="overrides" data-actor="${(att.actor as any).id}" data-plugin="${plugin.id}">
            ${localize("HEROENGINE.GMPanel.Overrides")}</button>
          <button type="button" data-he="detach" data-actor="${(att.actor as any).id}" data-plugin="${plugin.id}">
            ${localize("HEROENGINE.GMPanel.Detach")}</button>
        </div></li>`;
    })
    .join("");

  const actorOptions = (game.actors ?? [])
    .filter((a: any) => a.type === "character" || a.type === "npc")
    .map((a: any) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)
    .join("");
  const pluginOptions = plugins
    .map((p) => `<option value="${p.id}">${escapeHtml(localize(p.nameKey))} (${p.archetype})</option>`)
    .join("");
  const configButtons = plugins
    .map(
      (p) =>
        `<button type="button" data-he="config" data-plugin="${p.id}">${escapeHtml(localize(p.nameKey))}</button>`
    )
    .join("");

  return `<div class="hero-engine-gm">
    <h3>${localize("HEROENGINE.GMPanel.Adjudications")} (${queue.length})</h3>
    <ul class="he-adj-list">${queueHtml}</ul>
    <h3>${localize("HEROENGINE.GMPanel.Attach")}</h3>
    <div class="he-attach-form">
      <select data-he-attach-actor>${actorOptions}</select>
      <select data-he-attach-plugin>${pluginOptions}</select>
      <button type="button" data-he="attach">${localize("HEROENGINE.GMPanel.AttachButton")}</button>
    </div>
    <h3>${localize("HEROENGINE.GMPanel.Attachments")}</h3>
    <ul class="he-att-list">${attachRows || `<li class="he-hint">${localize("HEROENGINE.GMPanel.None")}</li>`}</ul>
    <h3>${localize("HEROENGINE.GMPanel.WorldConfig")}</h3>
    <div class="he-config-buttons">${configButtons}</div>
  </div>`;
}

function renderDashboardPanel(): string {
  const queue = getAdjudicationQueue();
  const plugins = listPlugins();
  const attachments = worldAttachments();
  const queueHtml = queue.length
    ? queue.map((entry) => {
        const plugin = getPlugin(entry.pluginId);
        const def = plugin?.adjudications?.find((a) => a.id === entry.adjudicationId);
        const buttons = def?.kind === "choice"
          ? (def.choices ?? []).map((choice) => `<button type="button" class="he-btn he-btn-primary" data-he="resolve" data-entry="${entry.id}" data-result="${choice.id}">${escapeHtml(localize(choice.labelKey))}</button>`).join("")
          : `<button type="button" class="he-btn he-btn-confirm" data-he="resolve" data-entry="${entry.id}" data-result="confirm"><i class="fa-solid fa-check"></i></button>
             <button type="button" class="he-btn he-btn-danger" data-he="resolve" data-entry="${entry.id}" data-result="deny"><i class="fa-solid fa-xmark"></i></button>`;
        return `<li class="he-adj"><div class="he-adj-copy"><strong>${escapeHtml(fromUuidSyncName(entry.actorUuid))}</strong>
          <span>${escapeHtml(def ? localize(def.titleKey) : entry.adjudicationId)}</span>
          ${entry.note ? `<em>${escapeHtml(entry.note)}</em>` : ""}
          ${def?.descriptionKey ? `<p class="he-hint">${escapeHtml(localize(def.descriptionKey))}</p>` : ""}</div>
          <div class="he-adj-buttons">${buttons}</div></li>`;
      }).join("")
    : `<li class="he-empty"><i class="fa-regular fa-circle-check"></i><span>${localize("HEROENGINE.GMPanel.NoAdjudications")}</span></li>`;

  const attachRows = attachments.map((att) => {
    const plugin = getPlugin(att.pluginId);
    const state = plugin ? readState(att.stateDoc, att.pluginId) : null;
    if (!plugin || !state) return "";
    const values = [...(plugin.trackers ?? []), ...(plugin.resources ?? [])].map((value) =>
      `<button type="button" class="he-value-chip" data-he="adjust" data-actor="${att.actor.id}" data-plugin="${plugin.id}" data-id="${value.id}" title="${localize("HEROENGINE.GMPanel.AdjustHint")}">
        <span>${escapeHtml(localize(value.labelKey))}</span><strong>${state.values[value.id] ?? 0}</strong></button>`).join(" ");
    const rechargeButtons = (plugin.resources ?? []).map((resource) =>
      `<button type="button" class="he-btn" data-he="recharge" data-actor="${att.actor.id}" data-plugin="${plugin.id}" data-id="${resource.id}"><i class="fa-solid fa-arrows-rotate"></i>${escapeHtml(localize(resource.labelKey))}</button>`).join("");
    const transformButton = state.transform
      ? `<button type="button" class="he-btn he-btn-warn" data-he="end-transform" data-actor="${att.actor.id}" data-plugin="${plugin.id}"><i class="fa-solid fa-hourglass-end"></i>${localize("HEROENGINE.GMPanel.EndTransform")} (${state.transform.roundsLeft})</button>`
      : "";
    const cooldownButtons = (plugin.actions ?? []).filter((action) => action.cooldown).map((action) =>
      `<button type="button" class="he-btn" data-he="reset-cd" data-actor="${att.actor.id}" data-plugin="${plugin.id}" data-id="${action.id}"><i class="fa-regular fa-clock"></i>${escapeHtml(localize(action.labelKey))}</button>`).join("");
    return `<li class="he-attachment"><div class="he-att-head">
      <img src="${escapeHtml(att.actor.img || "icons/svg/mystery-man.svg")}" alt="" />
      <div><strong>${escapeHtml(att.actor.name)}</strong><span>${escapeHtml(localize(plugin.nameKey))}</span>
      ${att.item ? `<em><i class="fa-solid fa-link"></i>${escapeHtml(att.item.name)}</em>` : ""}</div></div>
      <div class="he-att-values">${values}</div><div class="he-att-controls">${rechargeButtons}${cooldownButtons}${transformButton}
      <button type="button" class="he-btn" data-he="overrides" data-actor="${att.actor.id}" data-plugin="${plugin.id}"><i class="fa-solid fa-sliders"></i>${localize("HEROENGINE.GMPanel.Overrides")}</button>
      <button type="button" class="he-btn he-btn-danger" data-he="detach" data-actor="${att.actor.id}" data-plugin="${plugin.id}"><i class="fa-solid fa-trash-can"></i>${localize("HEROENGINE.GMPanel.Detach")}</button>
      </div></li>`;
  }).join("");

  const actors = [...(game.actors ?? [])]
    .filter((actor: any) => actor.type === "character" || actor.type === "npc")
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
  const actorOptions = actors.map((actor: any) => `<option value="${actor.id}">${escapeHtml(actor.name)}</option>`).join("");
  const pluginOptions = plugins.map((plugin) => `<option value="${plugin.id}">${escapeHtml(localize(plugin.nameKey))} (${plugin.archetype})</option>`).join("");
  const configButtons = plugins.map((plugin) => `<button type="button" class="he-config-tile" data-he="config" data-plugin="${plugin.id}">
    <span class="he-config-icon"><i class="fa-solid ${plugin.archetype === "item" ? "fa-wand-sparkles" : "fa-user-shield"}"></i></span>
    <span class="he-config-copy"><strong>${escapeHtml(localize(plugin.nameKey))}</strong><small>${escapeHtml(plugin.descriptionKey ? localize(plugin.descriptionKey) : "")}</small></span>
    <span class="he-type-badge">${escapeHtml(plugin.archetype)}</span><i class="fa-solid fa-chevron-right"></i></button>`).join("");

  return `<div class="hero-engine-gm"><header class="he-hero">
    <div class="he-brand"><span class="he-brand-mark"><i class="fa-solid fa-bolt"></i></span><div><h2>Hero Engine</h2><p>${localize("HEROENGINE.GMPanel.MenuHint")}</p></div></div>
    <div class="he-stats"><div><strong>${queue.length}</strong><span>${localize("HEROENGINE.GMPanel.Adjudications")}</span></div>
      <div><strong>${attachments.length}</strong><span>${localize("HEROENGINE.GMPanel.Attachments")}</span></div>
      <div><strong>${plugins.length}</strong><span>${localize("HEROENGINE.GMPanel.Registered")}</span></div></div>
    </header><div class="he-dashboard">
      <section class="he-card"><header><span class="he-section-icon"><i class="fa-solid fa-scale-balanced"></i></span><div><h3>${localize("HEROENGINE.GMPanel.Adjudications")}</h3><p>${localize("HEROENGINE.GMPanel.RulingsHint")}</p></div><b>${queue.length}</b></header><ul class="he-adj-list">${queueHtml}</ul></section>
      <section class="he-card he-attach-card"><header><span class="he-section-icon"><i class="fa-solid fa-link"></i></span><div><h3>${localize("HEROENGINE.GMPanel.Attach")}</h3><p>${localize("HEROENGINE.GMPanel.AttachHint")}</p></div></header>
        <div class="he-attach-form"><label class="he-search-field"><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-he-attach-search placeholder="${escapeHtml(localize("HEROENGINE.GMPanel.SearchActors"))}" /></label>
          <span class="he-search-meta" data-he-search-count>${localize("HEROENGINE.GMPanel.Available", { count: actors.length })}</span>
          <label><span>${localize("HEROENGINE.GMPanel.Actor")}</span><select data-he-attach-actor>${actorOptions}</select></label>
          <label><span>${localize("HEROENGINE.GMPanel.Mechanic")}</span><select data-he-attach-plugin>${pluginOptions}</select></label>
          <p class="he-no-results" data-he-search-empty hidden>${localize("HEROENGINE.GMPanel.NoActorsFound")}</p>
          <button type="button" class="he-btn he-btn-primary he-attach-button" data-he="attach"><i class="fa-solid fa-plus"></i>${localize("HEROENGINE.GMPanel.AttachButton")}</button></div></section>
      <section class="he-card he-wide"><header><span class="he-section-icon"><i class="fa-solid fa-shield-halved"></i></span><div><h3>${localize("HEROENGINE.GMPanel.Attachments")}</h3><p>${localize("HEROENGINE.GMPanel.AttachmentsHint")}</p></div><b>${attachments.length}</b></header>
        <ul class="he-att-list">${attachRows || `<li class="he-empty"><i class="fa-solid fa-link-slash"></i><span>${localize("HEROENGINE.GMPanel.None")}</span></li>`}</ul></section>
      <section class="he-card he-wide"><header><span class="he-section-icon"><i class="fa-solid fa-gears"></i></span><div><h3>${localize("HEROENGINE.GMPanel.WorldConfig")}</h3><p>${localize("HEROENGINE.GMPanel.ConfigHint")}</p></div></header><div class="he-config-buttons">${configButtons}</div></section>
    </div></div>`;
}

interface PickerItem {
  id: string;
  label: string;
  type: string;
  img?: string;
}

function pickItemDialog(actor: any, items: PickerItem[]): Promise<string | null> {
  return new Promise((resolve) => {
    let selectedId: string | null = null;
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const gearTypes = new Set(["weapon", "equipment", "consumable", "loot", "container", "tool"]);
    const featureTypes = new Set(["feat", "class", "subclass", "background", "race", "species"]);
    const categoryFor = (item: PickerItem) => gearTypes.has(item.type) ? "gear" : item.type === "spell" ? "spells" : featureTypes.has(item.type) ? "features" : "other";
    const sortedItems = items.map((item) => ({ ...item, category: categoryFor(item) }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n?.lang, { sensitivity: "base" }));
    const categoryCounts = sortedItems.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, { all: sortedItems.length });
    let activeCategory = categoryCounts["gear"] ? "gear" : "all";
    const categories = [
      { id: "gear", label: "HEROENGINE.ItemPicker.Gear", icon: "fa-shield-halved" },
      { id: "all", label: "HEROENGINE.ItemPicker.All", icon: "fa-layer-group" },
      { id: "spells", label: "HEROENGINE.ItemPicker.Spells", icon: "fa-wand-sparkles" },
      { id: "features", label: "HEROENGINE.ItemPicker.Features", icon: "fa-star" },
      { id: "other", label: "HEROENGINE.ItemPicker.Other", icon: "fa-box-archive" },
    ].filter((category) => category.id === "all" || categoryCounts[category.id]);

    const render = () => {
      const cards = sortedItems.map((item) => `<button type="button" class="he-item-option" data-he-item="${escapeHtml(item.id)}" data-he-category="${item.category}" data-he-search="${escapeHtml(item.label.toLocaleLowerCase())}" aria-pressed="false">
        <span class="he-item-art"><img src="${escapeHtml(item.img || "icons/svg/item-bag.svg")}" alt="" /></span>
        <span class="he-item-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.type || localize("HEROENGINE.ItemPicker.Item"))}</small></span>
        <span class="he-item-check"><i class="fa-solid fa-check"></i></span></button>`).join("");
      const filters = categories.map((category) => `<button type="button" class="he-filter-chip${category.id === activeCategory ? " is-active" : ""}" data-he-item-filter="${category.id}" aria-pressed="${category.id === activeCategory}">
        <i class="fa-solid ${category.icon}"></i><span>${escapeHtml(localize(category.label))}</span><b>${categoryCounts[category.id] ?? 0}</b></button>`).join("");
      const initialCount = activeCategory === "all" ? sortedItems.length : categoryCounts[activeCategory] ?? 0;
      return `<form class="hero-engine-item-picker"><header class="he-picker-hero">
        <span class="he-picker-icon"><i class="fa-solid fa-link"></i></span><div><h2>${escapeHtml(localize("HEROENGINE.ItemPicker.Title"))}</h2>
        <p>${escapeHtml(localize("HEROENGINE.ItemPicker.Subtitle", { actor: actor.name }))}</p></div></header>
        <div class="he-picker-tools"><div class="he-picker-search-row"><label class="he-picker-search"><i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" data-he-item-search placeholder="${escapeHtml(localize("HEROENGINE.ItemPicker.SearchPlaceholder"))}" autocomplete="off" /><kbd>Esc</kbd></label>
          <span class="he-picker-count" data-he-item-count>${escapeHtml(localize("HEROENGINE.ItemPicker.ItemsFound", { count: initialCount }))}</span></div>
          <nav class="he-picker-filters" aria-label="${escapeHtml(localize("HEROENGINE.ItemPicker.FilterBy"))}">${filters}</nav></div>
        <div class="he-item-grid" data-he-item-grid>${cards}<div class="he-picker-empty" data-he-item-empty hidden><i class="fa-solid fa-magnifying-glass"></i>
          <strong>${escapeHtml(localize("HEROENGINE.ItemPicker.NoResults"))}</strong><span>${escapeHtml(localize("HEROENGINE.ItemPicker.TryAnother"))}</span></div></div>
        <footer class="he-picker-footer"><span class="he-picker-selection" data-he-item-selection><i class="fa-regular fa-circle"></i>${escapeHtml(localize("HEROENGINE.ItemPicker.SelectPrompt"))}</span>
          <div class="he-picker-actions"><button type="button" class="he-picker-cancel" data-he-item-cancel><i class="fa-solid fa-xmark"></i>${escapeHtml(localize("HEROENGINE.ItemPicker.Cancel"))}</button>
          <button type="submit" class="he-picker-save" data-he-item-save disabled><i class="fa-solid fa-floppy-disk"></i>${escapeHtml(localize("HEROENGINE.ItemPicker.Save"))}</button></div></footer></form>`;
    };

    const app = createApp({
      id: "hero-engine-item-picker",
      title: localize("HEROENGINE.GMPanel.PickItem"),
      width: 760,
      height: 680,
      render,
      onClose: () => finish(null),
      bind: (root) => {
        const form = root.querySelector<HTMLFormElement>(".hero-engine-item-picker")!;
        const search = root.querySelector<HTMLInputElement>("[data-he-item-search]")!;
        const cards = [...root.querySelectorAll<HTMLElement>("[data-he-item]")];
        const count = root.querySelector<HTMLElement>("[data-he-item-count]")!;
        const empty = root.querySelector<HTMLElement>("[data-he-item-empty]")!;
        const save = root.querySelector<HTMLButtonElement>("[data-he-item-save]")!;
        const selection = root.querySelector<HTMLElement>("[data-he-item-selection]")!;
        const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
        const filter = () => {
          const query = normalize(search.value).trim();
          let visible = 0;
          for (const card of cards) {
            const inCategory = activeCategory === "all" || card.dataset["heCategory"] === activeCategory;
            const matches = inCategory && (!query || normalize(card.dataset["heSearch"]).includes(query));
            card.hidden = !matches;
            if (matches) visible += 1;
          }
          count.textContent = localize("HEROENGINE.ItemPicker.ItemsFound", { count: visible });
          empty.hidden = visible > 0;
        };
        root.querySelectorAll<HTMLElement>("[data-he-item-filter]").forEach((button) => button.addEventListener("click", () => {
          activeCategory = button.dataset["heItemFilter"] ?? "all";
          root.querySelectorAll<HTMLElement>("[data-he-item-filter]").forEach((chip) => {
            const active = chip === button;
            chip.classList.toggle("is-active", active);
            chip.setAttribute("aria-pressed", String(active));
          });
          const grid = root.querySelector<HTMLElement>("[data-he-item-grid]");
          if (grid) grid.scrollTop = 0;
          filter();
        }));
        const choose = (card: HTMLElement) => {
          selectedId = card.dataset["heItem"] ?? null;
          for (const option of cards) {
            const active = option === card;
            option.classList.toggle("is-selected", active);
            option.setAttribute("aria-pressed", String(active));
          }
          save.disabled = false;
          const label = card.querySelector("strong")?.textContent ?? "";
          selection.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${escapeHtml(localize("HEROENGINE.ItemPicker.Selected"))}<strong>${escapeHtml(label)}</strong></span>`;
        };
        search.addEventListener("input", filter);
        search.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && search.value) {
            event.stopPropagation();
            search.value = "";
            filter();
          }
        });
        for (const card of cards) card.addEventListener("click", () => choose(card));
        root.querySelector<HTMLElement>("[data-he-item-cancel]")?.addEventListener("click", async () => {
          finish(null);
          await app.close();
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!selectedId) return;
          finish(selectedId);
          await app.close();
        });
        filter();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          search.focus({ preventScroll: true });
          const grid = root.querySelector<HTMLElement>("[data-he-item-grid]");
          if (grid) grid.scrollTop = 0;
        }));
      },
    });
    app.render(true);
  });
}

function bindPanel(root: HTMLElement, app: any): void {
  root.querySelector<HTMLInputElement>("[data-he-attach-search]")?.addEventListener("input", (event) => {
    const query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase();
    const select = root.querySelector<HTMLSelectElement>("[data-he-attach-actor]");
    const count = root.querySelector<HTMLElement>("[data-he-search-count]");
    const empty = root.querySelector<HTMLElement>("[data-he-search-empty]");
    const attach = root.querySelector<HTMLButtonElement>("[data-he='attach']");
    if (!select) return;
    let firstMatch: HTMLOptionElement | null = null;
    let matchesCount = 0;
    for (const option of select.options) {
      const matches = !query || (option.textContent ?? "").toLocaleLowerCase().includes(query);
      option.hidden = !matches;
      if (matches) {
        matchesCount += 1;
        firstMatch ??= option;
      }
    }
    if (firstMatch) select.value = firstMatch.value;
    else select.selectedIndex = -1;
    if (count) count.textContent = localize("HEROENGINE.GMPanel.Available", { count: matchesCount });
    if (empty) empty.hidden = matchesCount > 0;
    if (attach) attach.disabled = matchesCount === 0;
  });
  root.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-he]");
    if (!button) return;
    const kind = button.dataset["he"];
    const compat = getCompat();
    try {
      if (kind === "resolve") {
        await resolveAdjudication(button.dataset["entry"]!, button.dataset["result"]!);
      } else if (kind === "attach") {
        const actorId = root.querySelector<HTMLSelectElement>("[data-he-attach-actor]")!.value;
        const pluginId = root.querySelector<HTMLSelectElement>("[data-he-attach-plugin]")!.value;
        const actor = game.actors.get(actorId);
        const plugin = getPlugin(pluginId);
        if (!actor || !plugin) return;
        if (plugin.archetype === "item") {
          const items = actor.items.map((i: any) => ({ id: i.id, label: i.name, type: i.type, img: i.img }));
          if (!items.length) {
            ui.notifications?.warn(localize("HEROENGINE.GMPanel.NoItems"));
            return;
          }
          const itemId = await pickItemDialog(actor, items);
          if (!itemId) return;
          await attachMechanic(actor, pluginId, { item: actor.items.get(itemId) });
        } else {
          await attachMechanic(actor, pluginId);
        }
      } else if (kind === "detach") {
        const actor = game.actors.get(button.dataset["actor"]!);
        if (actor && (await compat.dialog.confirm({ title: localize("HEROENGINE.GMPanel.Detach"), content: actor.name }))) {
          await detachMechanic(actor, button.dataset["plugin"]!);
        }
      } else if (kind === "adjust") {
        const att = findAttachment(button);
        if (!att) return;
        const raw = await compat.dialog.input({
          title: localize("HEROENGINE.GMPanel.AdjustTitle"),
          label: localize("HEROENGINE.GMPanel.AdjustLabel", { id: button.dataset["id"]! }),
        });
        if (raw === null || raw.trim() === "") return;
        const [deltaStr, ...reasonParts] = raw.split(" ");
        const delta = Number(deltaStr);
        if (!Number.isFinite(delta)) return;
        const plugin = getPlugin(att.pluginId)!;
        await applyOpsTo(att, plugin, [{ op: "adjust", target: button.dataset["id"]!, amount: delta }],
          `GM: ${reasonParts.join(" ") || "manual"}`);
      } else if (kind === "recharge") {
        const att = findAttachment(button);
        if (att) await forceRecharge(att, button.dataset["id"]!, "full");
      } else if (kind === "reset-cd") {
        const att = findAttachment(button);
        if (att) await resetCooldown(att, button.dataset["id"]!);
      } else if (kind === "end-transform") {
        const att = findAttachment(button);
        const plugin = att ? getPlugin(att.pluginId) : null;
        const ctx = att ? makeContext(att) : null;
        if (att && plugin && ctx) await endTransform(ctx, plugin, att, "manual");
      } else if (kind === "overrides") {
        const att = findAttachment(button);
        const plugin = att ? getPlugin(att.pluginId) : null;
        if (att && plugin) openConfigForm(plugin, { kind: "override", attachment: att });
        return; // separate window; skip re-render
      } else if (kind === "config") {
        const plugin = getPlugin(button.dataset["plugin"]!);
        if (plugin) openConfigForm(plugin, { kind: "world" });
        return;
      }
      app.render();
    } catch (e) {
      console.error("hero-engine | gm panel", e);
      ui.notifications?.error(String(e));
    }
  });
}

function findAttachment(button: HTMLElement): Attachment | null {
  const actor = game.actors.get(button.dataset["actor"]!);
  if (!actor) return null;
  return resolveAttachments(actor).find((a) => a.pluginId === button.dataset["plugin"]) ?? null;
}

function fromUuidSyncName(uuid: string): string {
  try {
    return (globalThis as any).fromUuidSync?.(uuid)?.name ?? uuid;
  } catch {
    return uuid;
  }
}
