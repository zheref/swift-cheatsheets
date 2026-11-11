/**
 * Builds the offline artifacts: one self-contained HTML file per published
 * catalog, server-rendered and hydrated by an inline bundle. The default
 * catalog (route `/`) is written to the repository root as `index.html` — the
 * file you open from disk or AirDrop; any other is written to `offline/<id>.html`.
 *
 *   node scripts/build-offline.mts
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".offline-build");
fs.mkdirSync(work, { recursive: true });

const define = { "process.env.NODE_ENV": '"production"' };

const client = await build({
  entryPoints: [path.join(root, "src/adapters/offline/client.tsx")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "safari16"],
  jsx: "automatic",
  define,
  legalComments: "none",
  logLevel: "warning",
});
const clientJs = client.outputFiles[0]!.text;

const serverFile = path.join(work, "render.cjs");
await build({
  entryPoints: [path.join(root, "src/adapters/offline/entry.ts")],
  bundle: true,
  outfile: serverFile,
  format: "cjs",
  platform: "node",
  target: "node22",
  jsx: "automatic",
  define,
  logLevel: "warning",
});

type Entry = typeof import("../src/adapters/offline/entry.ts");
const { loadCatalogs, renderOffline } = createRequire(import.meta.url)(serverFile) as Entry;

for (const catalog of loadCatalogs(path.join(root, "content"))) {
  const html = renderOffline(catalog, clientJs);
  const out =
    catalog.language.route === "/" ? path.join(root, "index.html") : path.join(root, "offline", `${catalog.language.id}.html`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  const cards = catalog.sheets.reduce((n, s) => n + s.cards.length, 0);
  console.log(
    `wrote ${path.relative(root, out)} — ${catalog.language.id}: ${catalog.sheets.length} sheets, ${cards} cards, ` +
      `${Math.round(html.length / 1024)} KB (client bundle ${Math.round(clientJs.length / 1024)} KB)`,
  );
}
