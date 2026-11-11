/**
 * Gatsby adapter, build side: every published catalog under `content/` becomes
 * one page at its declared route, rendered by the same template. A new language
 * is a new content folder; nothing here changes.
 *
 * CHEATSHEETS_FIXTURES=1 also builds the test fixture catalogs (status `fixture`)
 * from `test/fixtures/content/`, to prove that path end to end.
 *
 * Under `gatsby develop` the content folders are watched: an edited YAML or SVG
 * re-creates the affected pages with fresh context, so the browser picks it up
 * without restarting Gatsby.
 */
import type { GatsbyNode } from "gatsby";
import { publishCatalogs, watchContent } from "./src/adapters/gatsby/content";

export const createPages: GatsbyNode["createPages"] = async ({ actions, reporter }) => {
  publishCatalogs(actions, reporter);
};

export const createPagesStatefully: GatsbyNode["createPagesStatefully"] = async ({ actions, reporter }) => {
  if (process.env.NODE_ENV === "development") watchContent(actions, reporter);
};
