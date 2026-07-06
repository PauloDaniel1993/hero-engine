import { defineConfig, type Plugin } from "vite";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Copies the module's static assets next to the built bundle so `dist/` is a
 *  complete, deployable Foundry module directory. */
function copyFoundryStatics(): Plugin {
  return {
    name: "copy-foundry-statics",
    closeBundle() {
      const out = resolve(__dirname, "dist");
      mkdirSync(out, { recursive: true });
      cpSync(resolve(__dirname, "module.json"), resolve(out, "module.json"));
      for (const dir of ["lang", "styles"]) {
        cpSync(resolve(__dirname, dir), resolve(out, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/main.ts"),
      formats: ["es"],
      fileName: () => "scripts/hero-engine.mjs",
    },
    rollupOptions: {
      output: { assetFileNames: "assets/[name][extname]" },
    },
    target: "es2022",
    minify: false,
  },
  plugins: [copyFoundryStatics()],
});
