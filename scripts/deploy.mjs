/**
 * Deploys the built module into a local Foundry VTT install.
 *
 * Reads FOUNDRY_DATA_PATH from hero-engine/.env (untracked). On first run,
 * prompts for the path and writes .env. Tries a directory junction/symlink
 * first (fast iteration); falls back to a full copy when linking is not
 * permitted (non-admin Windows).
 *
 * Usage: npm run deploy
 */
import { existsSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync, lstatSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline/promises";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const envFile = join(root, ".env");

function readEnvPath() {
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, "utf8").match(/^FOUNDRY_DATA_PATH=(.+)$/m);
  return match ? match[1].trim() : null;
}

async function promptForPath() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "Path to your Foundry data folder (the one containing Data/modules), e.g. C:\\Users\\you\\AppData\\Local\\FoundryVTT: "
  );
  rl.close();
  return answer.trim();
}

let dataPath = process.env.FOUNDRY_DATA_PATH ?? readEnvPath();
if (!dataPath) {
  dataPath = await promptForPath();
  writeFileSync(envFile, `FOUNDRY_DATA_PATH=${dataPath}\n`);
  console.log(`Saved to ${envFile}`);
}

const modulesDir = join(dataPath, "Data", "modules");
if (!existsSync(modulesDir)) {
  console.error(`Not a Foundry data folder (missing ${modulesDir}). Fix FOUNDRY_DATA_PATH in .env.`);
  process.exit(1);
}
if (!existsSync(join(dist, "module.json"))) {
  console.error("dist/ is not built. Run: npm run build");
  process.exit(1);
}

const target = join(modulesDir, "hero-engine");
if (existsSync(target)) {
  const isLink = lstatSync(target).isSymbolicLink();
  rmSync(target, { recursive: !isLink, force: true });
}

try {
  symlinkSync(dist, target, "junction");
  console.log(`Linked ${target} -> ${dist}`);
} catch {
  cpSync(dist, target, { recursive: true });
  console.log(`Copied dist/ -> ${target} (symlink not permitted; re-run deploy after each build)`);
}
