/**
 * Version compatibility layer. Every touchpoint with APIs that drift between
 * Foundry v13/v14 or dnd5e majors lives here — nothing outside src/compat/
 * may branch on version.
 */
import { localize } from "../engine/i18n";
import { createApp } from "../ui/app-base";

export interface RestEvent {
  actor: any;
  kind: "rest-short" | "rest-long";
}

export interface AttackResultEvent {
  attacker: any;
  target: any | null;
  isCrit: boolean;
  isHit: boolean;
}

export interface Compat {
  generation: number;
  /** DialogV2-style prompt helpers. */
  dialog: {
    confirm(opts: { title: string; content: string }): Promise<boolean>;
    /** Returns the id of the picked button, or null on dismiss. */
    buttons(opts: {
      title: string;
      content: string;
      buttons: { id: string; label: string }[];
      dismissable?: boolean;
    }): Promise<string | null>;
    /** Single text input; null on dismiss. */
    input(opts: { title: string; label: string; initial?: string }): Promise<string | null>;
  };
  /** Roll a dnd5e saving throw; returns total + natural die. */
  rollSave(actor: any, ability: string): Promise<{ total: number; natural: number } | null>;
  /** Subscribe to dnd5e rest completion. */
  onRestCompleted(cb: (ev: RestEvent) => void): void;
  /** Subscribe to attack outcomes (hit/crit) from dnd5e roll hooks. */
  onAttackResult(cb: (ev: AttackResultEvent) => void): void;
  /** Subscribe to post-render of chat messages (hook name differs by version). */
  onRenderChatMessage(cb: (message: any, html: HTMLElement) => void): void;
  /** Inject a rendered block into an actor sheet; returns true when injected. */
  injectIntoActorSheet(app: any, root: HTMLElement, panelHtml: string): boolean;
  /** dnd5e polymorph-style transform / revert. */
  transformInto(actor: any, formActor: any, options: { keepHpPercent: boolean }): Promise<void>;
  revertOriginalForm(actor: any): Promise<void>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function confirmDialog(opts: { title: string; content: string }): Promise<boolean> {
  if (!foundry.applications?.api?.ApplicationV2) {
    return new Promise((resolve) =>
      Dialog.confirm({ title: opts.title, content: opts.content, yes: () => resolve(true), no: () => resolve(false) })
    );
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const app = createApp({
      id: `hero-engine-confirm-${foundry.utils.randomID()}`,
      title: opts.title,
      width: 500,
      render: () => `<form class="hero-engine-dialog he-dialog-confirm">
        <header class="he-dialog-hero"><span class="he-dialog-icon"><i class="fa-solid fa-shield-halved"></i></span><div>
          <h2>${escapeHtml(opts.title)}</h2><p>${escapeHtml(localize("HEROENGINE.Dialog.ConfirmSubtitle"))}</p>
        </div></header>
        <div class="he-dialog-content"><div class="he-dialog-message">${escapeHtml(opts.content)}</div></div>
        <footer class="he-dialog-footer"><button type="button" class="he-dialog-secondary" data-he-dialog-cancel><i class="fa-solid fa-xmark"></i>${escapeHtml(localize("HEROENGINE.Dialog.Cancel"))}</button>
          <button type="submit" class="he-dialog-primary"><i class="fa-solid fa-check"></i>${escapeHtml(localize("HEROENGINE.Dialog.Confirm"))}</button></footer>
      </form>`,
      onClose: () => finish(false),
      bind: (root) => {
        root.querySelector<HTMLElement>("[data-he-dialog-cancel]")?.addEventListener("click", async () => {
          finish(false);
          await app.close();
        });
        root.querySelector("form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          finish(true);
          await app.close();
        });
      },
    });
    app.render(true);
  });
}

async function buttonsDialog(opts: {
  title: string;
  content: string;
  buttons: { id: string; label: string }[];
  dismissable?: boolean;
}): Promise<string | null> {
  if (!foundry.applications?.api?.ApplicationV2) {
    return new Promise((resolve) => {
      const buttons: Record<string, unknown> = {};
      for (const b of opts.buttons) buttons[b.id] = { label: b.label, callback: () => resolve(b.id) };
      new Dialog({ title: opts.title, content: opts.content, buttons, close: () => resolve(null) }).render(true);
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const choices = opts.buttons.map((button, index) => `<button type="button" class="he-dialog-choice" data-he-dialog-choice="${escapeHtml(button.id)}">
      <span class="he-choice-number">${index + 1}</span><span>${escapeHtml(button.label)}</span><i class="fa-solid fa-chevron-right"></i>
    </button>`).join("");
    const app = createApp({
      id: `hero-engine-choice-${foundry.utils.randomID()}`,
      title: opts.title,
      width: 560,
      render: () => `<div class="hero-engine-dialog he-dialog-choices">
        <header class="he-dialog-hero"><span class="he-dialog-icon"><i class="fa-solid fa-diamond"></i></span><div>
          <h2>${escapeHtml(opts.title)}</h2><p>${escapeHtml(localize("HEROENGINE.Dialog.ChooseSubtitle"))}</p>
        </div></header>
        <div class="he-dialog-content">${opts.content ? `<div class="he-dialog-richtext">${opts.content}</div>` : ""}<div class="he-choice-grid">${choices}</div></div>
        <footer class="he-dialog-footer"><span class="he-dialog-hint"><i class="fa-regular fa-hand-pointer"></i>${escapeHtml(localize("HEROENGINE.Dialog.ChooseHint"))}</span>
          <button type="button" class="he-dialog-secondary" data-he-dialog-cancel><i class="fa-solid fa-xmark"></i>${escapeHtml(localize("HEROENGINE.Dialog.Cancel"))}</button></footer>
      </div>`,
      onClose: () => finish(null),
      bind: (root) => {
        root.querySelectorAll<HTMLElement>("[data-he-dialog-choice]").forEach((button) => button.addEventListener("click", async () => {
          finish(button.dataset["heDialogChoice"] ?? null);
          await app.close();
        }));
        root.querySelector<HTMLElement>("[data-he-dialog-cancel]")?.addEventListener("click", async () => {
          finish(null);
          await app.close();
        });
      },
    });
    app.render(true);
  });
}

async function inputDialog(opts: { title: string; label: string; initial?: string }): Promise<string | null> {
  if (!foundry.applications?.api?.ApplicationV2) {
    const content = `<form><div class="form-group"><label>${escapeHtml(opts.label)}</label><input type="text" name="he-input" value="${escapeHtml(opts.initial)}" autofocus /></div></form>`;
    return new Promise((resolve) => {
      new Dialog({ title: opts.title, content, buttons: { ok: { label: "OK", callback: (html: any) => resolve(html.find?.("[name=he-input]")?.val() ?? null) } }, close: () => resolve(null) }).render(true);
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const app = createApp({
      id: `hero-engine-input-${foundry.utils.randomID()}`,
      title: opts.title,
      width: 520,
      render: () => `<form class="hero-engine-dialog he-dialog-input">
        <header class="he-dialog-hero"><span class="he-dialog-icon"><i class="fa-solid fa-pen-to-square"></i></span><div>
          <h2>${escapeHtml(opts.title)}</h2><p>${escapeHtml(localize("HEROENGINE.Dialog.InputSubtitle"))}</p>
        </div></header>
        <div class="he-dialog-content"><label class="he-dialog-field"><span>${escapeHtml(opts.label)}</span>
          <div><i class="fa-solid fa-arrow-right-arrow-left"></i><input type="text" name="he-input" value="${escapeHtml(opts.initial)}" autocomplete="off" /></div>
        </label></div>
        <footer class="he-dialog-footer"><button type="button" class="he-dialog-secondary" data-he-dialog-cancel><i class="fa-solid fa-xmark"></i>${escapeHtml(localize("HEROENGINE.Dialog.Cancel"))}</button>
          <button type="submit" class="he-dialog-primary"><i class="fa-solid fa-check"></i>${escapeHtml(localize("HEROENGINE.Dialog.Apply"))}</button></footer>
      </form>`,
      onClose: () => finish(null),
      bind: (root) => {
        const input = root.querySelector<HTMLInputElement>("[name='he-input']")!;
        root.querySelector<HTMLElement>("[data-he-dialog-cancel]")?.addEventListener("click", async () => {
          finish(null);
          await app.close();
        });
        root.querySelector("form")?.addEventListener("submit", async (event) => {
          event.preventDefault();
          finish(input.value);
          await app.close();
        });
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      },
    });
    app.render(true);
  });
}

async function rollSave(actor: any, ability: string): Promise<{ total: number; natural: number } | null> {
  // dnd5e 4.1+: rollSavingThrow({ability}); older: rollAbilitySave(ability).
  let rolls: any;
  if (typeof actor.rollSavingThrow === "function") {
    rolls = await actor.rollSavingThrow({ ability });
  } else if (typeof actor.rollAbilitySave === "function") {
    rolls = await actor.rollAbilitySave(ability);
  } else {
    ui.notifications?.error("hero-engine: actor has no saving throw API");
    return null;
  }
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return null;
  const d20 = roll.dice?.find((d: any) => d.faces === 20);
  const natural = d20?.total ?? d20?.results?.[0]?.result ?? 0;
  return { total: roll.total ?? 0, natural };
}

function onRestCompleted(cb: (ev: RestEvent) => void): void {
  // dnd5e 4/5: dnd5e.restCompleted(actor, result). Older split hooks kept as fallback.
  Hooks.on("dnd5e.restCompleted", (actor: any, result: any) => {
    cb({ actor, kind: result?.longRest ? "rest-long" : "rest-short" });
  });
  Hooks.on("dnd5e.longRest", (actor: any) => cb({ actor, kind: "rest-long" }));
  Hooks.on("dnd5e.shortRest", (actor: any) => cb({ actor, kind: "rest-short" }));
}

function onAttackResult(cb: (ev: AttackResultEvent) => void): void {
  const handle = (rolls: any, data: any) => {
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll) return;
    const attacker =
      data?.subject?.actor ?? data?.actor ?? (data?.activity ? data.activity.actor : null) ?? null;
    if (!attacker) return;
    const target =
      [...(game.user?.targets ?? [])][0]?.actor ?? data?.target?.actor ?? null;
    const isCrit = roll.isCritical === true;
    // Hit detection: compare vs first target's AC when available; otherwise assume hit.
    let isHit = true;
    const ac = target?.system?.attributes?.ac?.value;
    if (typeof ac === "number" && typeof roll.total === "number") isHit = roll.total >= ac || isCrit;
    cb({ attacker, target, isCrit, isHit });
  };
  // dnd5e 4.x+ activities pipeline:
  Hooks.on("dnd5e.rollAttackV2", (rolls: any, data: any) => handle(rolls, data));
  // dnd5e legacy:
  Hooks.on("dnd5e.rollAttack", (itemOrRolls: any, rollOrData: any) => {
    if (Array.isArray(itemOrRolls)) handle(itemOrRolls, rollOrData);
    else handle(rollOrData, { actor: itemOrRolls?.actor });
  });
}

function onRenderChatMessage(cb: (message: any, html: HTMLElement) => void): void {
  // v13+: renderChatMessageHTML passes HTMLElement; legacy renderChatMessage passes jQuery.
  Hooks.on("renderChatMessageHTML", (message: any, html: HTMLElement) => cb(message, html));
  Hooks.on("renderChatMessage", (message: any, html: any) => {
    if (html instanceof HTMLElement) return; // already handled above
    const el = html?.[0];
    if (el) cb(message, el);
  });
}

function injectIntoActorSheet(_app: any, root: HTMLElement, panelHtml: string): boolean {
  if (root.querySelector(".hero-engine-panel")) return true; // already injected
  const container = document.createElement("div");
  container.innerHTML = panelHtml;
  const panel = container.firstElementChild as HTMLElement | null;
  if (!panel) return false;
  // Preferred anchors across dnd5e sheet generations, most specific first.
  const modernDetails = root.querySelector<HTMLElement>('.tab[data-tab="details"]');
  const modernColumn = modernDetails?.querySelector<HTMLElement>(".right");
  const anchor =
    modernColumn ??
    modernDetails ??
    root.querySelector(".tab.details") ??
    root.querySelector(".sheet-body") ??
    root.querySelector(".window-content") ??
    root;
  if (modernColumn) anchor.prepend(panel);
  else anchor.appendChild(panel);
  return true;
}

async function transformInto(actor: any, formActor: any, options: { keepHpPercent: boolean }): Promise<void> {
  const settings = {
    keepPhysical: false,
    keepMental: false,
    keepSaves: false,
    keepSkills: false,
    mergeSaves: false,
    mergeSkills: false,
    keepClass: false,
    keepFeats: false,
    keepSpells: false,
    keepItems: false,
    keepBio: true,
    keepVision: true,
    transformTokens: true,
  };
  if (typeof actor.transformInto === "function") {
    await actor.transformInto(formActor, settings);
    if (options.keepHpPercent) {
      const pct = actor.system?.attributes?.hp
        ? actor.system.attributes.hp.value / Math.max(1, actor.system.attributes.hp.max)
        : 1;
      const transformed = game.actors?.get(actor.id) ?? actor;
      const max = transformed.system?.attributes?.hp?.max ?? 0;
      await transformed.update({ "system.attributes.hp.value": Math.max(1, Math.floor(max * pct)) });
    }
  } else {
    throw new Error("hero-engine: dnd5e transformInto API unavailable; use overlay strategy");
  }
}

async function revertOriginalForm(actor: any): Promise<void> {
  if (typeof actor.revertOriginalForm === "function") {
    await actor.revertOriginalForm();
  }
}

let cached: Compat | null = null;

export function getCompat(): Compat {
  if (cached) return cached;
  cached = {
    generation: Number(game.release?.generation ?? 13),
    dialog: { confirm: confirmDialog, buttons: buttonsDialog, input: inputDialog },
    rollSave,
    onRestCompleted,
    onAttackResult,
    onRenderChatMessage,
    injectIntoActorSheet,
    transformInto,
    revertOriginalForm,
  };
  return cached;
}
