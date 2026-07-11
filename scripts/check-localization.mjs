import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const en = JSON.parse(readFileSync(resolve(root, "lang/en.json"), "utf8"));
const pt = JSON.parse(readFileSync(resolve(root, "lang/pt-BR.json"), "utf8"));

function flatten(value, prefix = "", out = new Set()) {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) flatten(entry, path, out);
    else out.add(path);
  }
  return out;
}

const enKeys = flatten(en);
const ptKeys = flatten(pt);
const missingPt = [...enKeys].filter((key) => !ptKeys.has(key));
const missingEn = [...ptKeys].filter((key) => !enKeys.has(key));
if (missingPt.length || missingEn.length) {
  console.error("Localization parity failed", { missingPt, missingEn });
  process.exit(1);
}
console.log(`localization: OK — ${enKeys.size} matching English/pt-BR keys`);
