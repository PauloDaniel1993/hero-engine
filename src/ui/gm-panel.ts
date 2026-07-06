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
}

/** registerMenu expects a constructible that renders; shim onto our AppV2 panel. */
function makeMenuShim(): any {
  return class {
    constructor() {
      openGmPanel();
    }
    render(): void {
      /* opened in constructor */
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
    width: 640,
    render: renderPanel,
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

function bindPanel(root: HTMLElement, app: any): void {
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
          const items = actor.items.map((i: any) => ({ id: i.id, label: i.name }));
          if (!items.length) {
            ui.notifications?.warn(localize("HEROENGINE.GMPanel.NoItems"));
            return;
          }
          const itemId = await compat.dialog.buttons({
            title: localize("HEROENGINE.GMPanel.PickItem"),
            content: "",
            buttons: items,
            dismissable: true,
          });
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
