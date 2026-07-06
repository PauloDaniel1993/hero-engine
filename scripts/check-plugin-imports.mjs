/**
 * Build rule: files under src/plugins/ may import ONLY from the public API
 * entry ("../../api" or "../../api/types"). Reaching into engine internals
 * would make the built-in plugins a lie about the API's sufficiency.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const pluginsDir = resolve(import.meta.dirname, "..", "src", "plugins");
// Match real module specifiers only: `... from "x"`, `import "x"`, `import("x")`.
const IMPORT_RES = [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /\bimport\s+["']([^"']+)["']/g];
const ALLOWED = /^\.\.\/\.\.\/api(\/types)?$|^\.\/|^\.\.\/(?!\.\.\/)/;

let failures = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|js|mjs)$/.test(name)) check(path);
  }
}

function check(path) {
  const source = readFileSync(path, "utf8");
  for (const re of IMPORT_RES) {
    for (const match of source.matchAll(re)) {
      const spec = match[1];
      if (!spec.startsWith(".")) {
        console.error(`FAIL ${path}: external import "${spec}" not allowed in plugins`);
        failures++;
      } else if (!ALLOWED.test(spec)) {
        console.error(`FAIL ${path}: "${spec}" — plugins may only import from ../../api`);
        failures++;
      } else if (/^\.\.\/\.\.\//.test(spec) && !/^\.\.\/\.\.\/api(\/types)?$/.test(spec)) {
        console.error(`FAIL ${path}: "${spec}" reaches outside the public API`);
        failures++;
      }
    }
  }
}

walk(pluginsDir);
if (failures) {
  console.error(`check-plugin-imports: ${failures} violation(s).`);
  process.exit(1);
}
console.log("check-plugin-imports: OK — built-in plugins use only the public API.");
