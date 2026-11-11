/**
 * Gatsby adapter, build side: every published catalog under `content/` becomes
 * one page at its declared route, rendered by the same template. A new language
 * is a new content folder; nothing here changes.
 *
 * CHEATSHEETS_FIXTURES=1 also builds the test fixture catalogs (status `fixture`)
 * from `test/fixtures/content/`, to prove that path end to end.
 */
import path from "node:path";
import type { GatsbyNode } from "gatsby";
import { loadCatalogs } from "./src/content/load";

export const createPages: GatsbyNode["createPages"] = async ({ actions, reporter }) => {
  const catalogs = [...loadCatalogs(path.resolve("content"))];
  if (process.env.CHEATSHEETS_FIXTURES === "1") {
    catalogs.push(...loadCatalogs(path.resolve("test/fixtures/content"), ["fixture"]));
  }
  const template = path.resolve("src/adapters/gatsby/CatalogTemplate.tsx");
  for (const catalog of catalogs) {
    actions.createPage({ path: catalog.language.route, component: template, context: { catalog } });
    reporter.info(
      `catalog ${catalog.language.id} → ${catalog.language.route} (${catalog.sheets.length} sheets, ${catalog.sheets.reduce((n, s) => n + s.cards.length, 0)} cards)`,
    );
  }
};
