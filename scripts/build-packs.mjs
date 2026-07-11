import { readFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { ClassicLevel } from "classic-level";

const root = resolve(import.meta.dirname, "..");
const definitions = [
  { source: "packs-src/actors.json", output: "packs/thargunn-actors", prefix: "actors" },
  { source: "packs-src/items.json", output: "packs/thargunn-items", prefix: "items" },
  { source: "packs-src/macros.json", output: "packs/thargunn-macros", prefix: "macros" },
];

for (const definition of definitions) {
  const source = JSON.parse(readFileSync(resolve(root, definition.source), "utf8"));
  if (!Array.isArray(source)) throw new Error(`${definition.source} must contain an array`);
  const out = resolve(root, definition.output);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const db = new ClassicLevel(out, { keyEncoding: "utf8", valueEncoding: "utf8" });
  await db.open();
  const batch = db.batch();
  for (const document of source) {
    if (!/^[A-Za-z0-9]{16}$/.test(document._id)) throw new Error(`${definition.source}: ${document._id} is not a stable 16-character Foundry id`);
    batch.put(`!${definition.prefix}!${document._id}`, JSON.stringify(document));
  }
  await batch.write();
  await db.close();
  console.log(`built ${definition.output} (${source.length} documents)`);
}
