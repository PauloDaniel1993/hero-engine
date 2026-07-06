/**
 * Schema-driven configuration forms (GM-only).
 * - "world" mode edits the plugin's world defaults (settings).
 * - "override" mode edits one attachment's sparse overrides, with per-field
 *   clear-to-default.
 * Formula/dice fields validate on save (invalid input never overwrites the
 * stored value) and show a live evaluation preview against a real attachment
 * when one exists.
 */
import type { ConfigFieldDef, MechanicPlugin } from "../api/types";
import { localize } from "../engine/i18n";
import { schemaDefaults, validateConfigValue } from "../engine/config-resolution";
import { mechanicVariables } from "../engine/validation";
import { evaluateFormula } from "../engine/formulas";
import { getWorldConfig, setWorldConfig } from "../engine/settings";
import { buildEvalData } from "../engine/runtime";
import { readOverrides, readState, resolveAttachments, writeOverrides, type Attachment } from "../engine/state";
import { escapeHtml } from "./chat-cards";
import { createApp } from "./app-base";

type Mode = { kind: "world" } | { kind: "override"; attachment: Attachment };

export function openConfigForm(plugin: MechanicPlugin, mode: Mode): void {
  if (!game.user.isGM) return;
  const schema = plugin.configSchema ?? [];
  const defaults = schemaDefaults(schema);

  const current = (): Record<string, unknown> =>
    mode.kind === "world" ? getWorldConfig(plugin.id) : readOverrides(mode.attachment.stateDoc, plugin.id);

  const previewAttachment = (): Attachment | null => {
    if (mode.kind === "override") return mode.attachment;
    for (const actor of game.actors ?? []) {
      const att = resolveAttachments(actor).find((a) => a.pluginId === plugin.id);
      if (att) return att;
    }
    return null;
  };

  const render = (): string => {
    const values = current();
    const world = getWorldConfig(plugin.id);
    const groups = new Map<string, ConfigFieldDef[]>();
    for (const field of schema) {
      const g = field.groupKey ?? "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(field);
    }
    let html = `<form class="hero-engine-config">`;
    for (const [groupKey, fields] of groups) {
      if (groupKey) html += `<h3>${escapeHtml(localize(groupKey))}</h3>`;
      for (const field of fields) {
        const hasOwn = Object.prototype.hasOwnProperty.call(values, field.key);
        const effective = hasOwn
          ? values[field.key]
          : mode.kind === "override" && Object.prototype.hasOwnProperty.call(world, field.key)
            ? world[field.key]
            : defaults[field.key];
        html += renderField(field, effective, mode.kind === "override", hasOwn);
      }
    }
    html += `<div class="he-form-footer">
      <span class="he-error" data-he-error></span>
      <button type="submit">${localize("HEROENGINE.Config.Save")}</button>
    </div></form>`;
    return html;
  };

  const app = createApp({
    id: `hero-engine-config-${plugin.id}-${mode.kind}`,
    title: `${localize(plugin.nameKey)} — ${localize(
      mode.kind === "world" ? "HEROENGINE.Config.WorldTitle" : "HEROENGINE.Config.OverrideTitle"
    )}`,
    width: 520,
    render,
    bind: (root) => {
      const form = root.querySelector<HTMLFormElement>("form")!;
      const errorEl = root.querySelector<HTMLElement>("[data-he-error]")!;
      const vars = mechanicVariables(plugin);

      // Live preview on formula/dice input.
      form.querySelectorAll<HTMLInputElement>("input[data-he-preview]").forEach((input) => {
        const preview = form.querySelector<HTMLElement>(`[data-he-preview-for="${input.name}"]`);
        const update = () => {
          if (!preview) return;
          const att = previewAttachment();
          try {
            if (!att) {
              preview.textContent = "";
              return;
            }
            const state = readState(att.stateDoc, plugin.id);
            const data = state ? buildEvalData(att, plugin, state) : {};
            preview.textContent = `= ${evaluateFormula(input.value, data)}`;
            preview.classList.remove("he-invalid");
          } catch (e) {
            preview.textContent = e instanceof Error ? e.message : String(e);
            preview.classList.add("he-invalid");
          }
        };
        input.addEventListener("input", update);
        update();
      });

      // Clear-to-default buttons (override mode).
      form.querySelectorAll<HTMLButtonElement>("[data-he-clear]").forEach((button) => {
        button.addEventListener("click", async (ev) => {
          ev.preventDefault();
          if (mode.kind !== "override") return;
          const overrides = { ...current() };
          delete overrides[button.dataset["heClear"]!];
          await writeOverrides(mode.attachment.stateDoc, plugin.id, overrides);
          app.render();
        });
      });

      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const next: Record<string, unknown> = mode.kind === "override" ? { ...current() } : {};
        for (const field of schema) {
          const input = form.elements.namedItem(field.key) as HTMLInputElement | HTMLSelectElement | null;
          if (!input) continue;
          if (mode.kind === "override") {
            const include = (form.elements.namedItem(`${field.key}::override`) as HTMLInputElement | null)?.checked;
            if (!include) {
              delete next[field.key];
              continue;
            }
          }
          let value: unknown = (input as HTMLInputElement).value;
          if (field.type === "boolean") value = (input as HTMLInputElement).checked;
          if (field.type === "number") value = Number(value);
          const problem = validateConfigValue(field, value, vars);
          if (problem) {
            errorEl.textContent = `${localize(field.labelKey)}: ${problem}`;
            return; // nothing saved — previous values stay intact
          }
          next[field.key] = value;
        }
        if (mode.kind === "world") await setWorldConfig(plugin.id, next);
        else await writeOverrides(mode.attachment.stateDoc, plugin.id, next);
        ui.notifications?.info(localize("HEROENGINE.Config.Saved"));
        app.close();
      });
    },
  });
  app.render(true);
}

function renderField(field: ConfigFieldDef, value: unknown, overrideMode: boolean, hasOwn: boolean): string {
  const label = escapeHtml(localize(field.labelKey));
  const hint = field.hintKey ? `<p class="he-hint">${escapeHtml(localize(field.hintKey))}</p>` : "";
  const overrideToggle = overrideMode
    ? `<input type="checkbox" name="${field.key}::override" title="${localize(
        "HEROENGINE.Config.OverrideThis"
      )}" ${hasOwn ? "checked" : ""} />` +
      (hasOwn ? `<button type="button" data-he-clear="${field.key}">${localize("HEROENGINE.Config.Clear")}</button>` : "")
    : "";
  let control: string;
  switch (field.type) {
    case "boolean":
      control = `<input type="checkbox" name="${field.key}" ${value ? "checked" : ""} />`;
      break;
    case "number":
      control = `<input type="number" name="${field.key}" value="${Number(value)}"
        ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.max !== undefined ? `max="${field.max}"` : ""}
        ${field.step !== undefined ? `step="${field.step}"` : ""} />`;
      break;
    case "choice": {
      const options = Object.entries(field.choices ?? {})
        .map(
          ([v, labelKey]) =>
            `<option value="${escapeHtml(v)}" ${String(value) === v ? "selected" : ""}>${escapeHtml(localize(labelKey))}</option>`
        )
        .join("");
      control = `<select name="${field.key}">${options}</select>`;
      break;
    }
    case "formula":
    case "dice":
      control = `<input type="text" name="${field.key}" value="${escapeHtml(String(value ?? ""))}" data-he-preview />
        <span class="he-preview" data-he-preview-for="${field.key}"></span>`;
      break;
    default:
      control = `<input type="text" name="${field.key}" value="${escapeHtml(String(value ?? ""))}" />`;
  }
  return `<div class="form-group he-field"><label>${label}</label>${control}${overrideToggle}${hint}</div>`;
}
