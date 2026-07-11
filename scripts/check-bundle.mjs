import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(dist);
const total = files.reduce((sum, file) => sum + statSync(file).size, 0);
if (total > 20 * 1024 * 1024) throw new Error(`bundle exceeds 20 MB (${total} bytes)`);
const textFiles = files.filter((file) => /\.(?:mjs|js|json|css|md)$/i.test(file));
const remoteAssets = [];
for (const file of textFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/https?:\/\/[^"'\s)]+\.(?:png|jpe?g|webp|gif|svg)/gi)) remoteAssets.push(`${relative(dist, file)}: ${match[0]}`);
}
if (remoteAssets.length) throw new Error(`remote runtime assets found:\n${remoteAssets.join("\n")}`);
for (const required of [
  "assets/thargunn/skeldr-token.webp", "assets/thargunn/tenth-life-thief.webp",
  "assets/thargunn/thargunn-ultimate-token.webp", "packs/thargunn-actors/CURRENT",
  "packs/thargunn-items/CURRENT", "packs/thargunn-macros/CURRENT",
]) {
  if (!files.includes(resolve(dist, required))) throw new Error(`missing built artifact ${required}`);
}
console.log(`bundle: OK — ${files.length} files, ${(total / 1024 / 1024).toFixed(2)} MB, no remote runtime artwork`);
