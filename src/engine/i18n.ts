/**
 * Plugin i18n bundle merge. Bundles are nested objects per locale; they merge
 * into game.i18n.translations at registration. Lookup order for a key:
 * current locale -> en -> plugin's first declared locale.
 */
import type { MechanicPlugin } from "../api/types";

function flatten(obj: Record<string, unknown>, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v as Record<string, unknown>, key, out);
    else out[key] = String(v);
  }
  return out;
}

const bundles = new Map<string, Record<string, Record<string, string>>>(); // pluginId -> locale -> flat keys

export function mergePluginI18n(plugin: MechanicPlugin): void {
  if (!plugin.i18n) return;
  const flat: Record<string, Record<string, string>> = {};
  for (const [locale, bundle] of Object.entries(plugin.i18n)) {
    flat[locale] = flatten(bundle);
  }
  bundles.set(plugin.id, flat);

  // Merge the active locale (and en as fallback) into Foundry's dictionary so
  // templates using {{localize}} work naturally.
  const lang = game?.i18n?.lang ?? "en";
  const merged = { ...(flat["en"] ?? {}), ...(flat[lang] ?? {}) };
  const target = game?.i18n?.translations;
  if (target) {
    for (const [key, value] of Object.entries(merged)) {
      if (foundry?.utils?.setProperty) foundry.utils.setProperty(target, key, value);
    }
  }
}

/** Localize with plugin-aware fallback chain; falls back to the key itself. */
export function localize(key: string, data?: Record<string, unknown>): string {
  const i18n = game?.i18n;
  if (i18n?.has?.(key)) {
    return data ? i18n.format(key, data) : i18n.localize(key);
  }
  for (const flat of bundles.values()) {
    const lang = i18n?.lang ?? "en";
    const locales = [lang, "en", Object.keys(flat)[0] ?? "en"];
    for (const locale of locales) {
      const value = flat[locale]?.[key];
      if (value !== undefined) return interpolate(value, data);
    }
  }
  return key;
}

function interpolate(text: string, data?: Record<string, unknown>): string {
  if (!data) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(data[name] ?? `{${name}}`));
}
