/** Gatsby adapter helpers for gatsby-node.ts, which may export only Gatsby APIs. */
import fs from "node:fs";
import path from "node:path";
import type { Actions, Reporter } from "gatsby";
import { loadCatalogs } from "../../content/load";

const contentRoots = () => {
  const roots: [string, string[]][] = [[path.resolve("content"), ["published"]]];
  if (process.env.CHEATSHEETS_FIXTURES === "1") roots.push([path.resolve("test/fixtures/content"), ["fixture"]]);
  return roots;
};

/** (Re)creates one page per catalog; calling it again with the same paths replaces their context. */
export function publishCatalogs(actions: Pick<Actions, "createPage">, reporter: Pick<Reporter, "info">) {
  const template = path.resolve("src/adapters/gatsby/CatalogTemplate.tsx");
  for (const [root, statuses] of contentRoots()) {
    for (const catalog of loadCatalogs(root, statuses)) {
      actions.createPage({ path: catalog.language.route, component: template, context: { catalog } });
      reporter.info(
        `catalog ${catalog.language.id} → ${catalog.language.route} (${catalog.sheets.length} sheets, ${catalog.sheets.reduce((n, s) => n + s.cards.length, 0)} cards)`,
      );
    }
  }
}

let watchers: fs.FSWatcher[] = [];

/** Stops the development content watchers (tests, and a clean exit). */
export function stopContentWatch() {
  for (const w of watchers) w.close();
  watchers = [];
}

/** Watches the content folders and re-publishes on change (gatsby develop only). */
export function watchContent(actions: Pick<Actions, "createPage">, reporter: Pick<Reporter, "info" | "error">) {
  stopContentWatch();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        publishCatalogs(actions, reporter);
      } catch (err) {
        // A half-saved or invalid file must not take the dev server down; the next save retries.
        reporter.error(err instanceof Error ? err.message : String(err));
      }
    }, 150);
  };
  for (const [root] of contentRoots()) watchers.push(fs.watch(root, { recursive: true }, refresh));
}
