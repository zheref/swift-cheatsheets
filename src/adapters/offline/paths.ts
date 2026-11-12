/**
 * Where each catalog's offline file is written, and the selector's links between
 * those files. The default catalog (route `/`) is the repository's `index.html`;
 * any other is `offline/<id>.html`. Links are relative, so the set works opened
 * from disk, from a Files app, or copied anywhere together.
 */
import path from "node:path";
import type { Catalog, SiteLanguage } from "../../content/schema";

/** The output path of a catalog's offline file, relative to the repository root. */
export const offlineFile = (language: Pick<Catalog["language"], "id" | "route">) =>
  language.route === "/" ? "index.html" : `offline/${language.id}.html`;

/** The registry's languages as one offline file sees them: every route rewritten to a relative file path. */
export function offlineLanguages(languages: SiteLanguage[], catalogs: Catalog[], from: Catalog): SiteLanguage[] {
  const here = path.posix.dirname(offlineFile(from.language));
  return languages.map((l) => {
    const target = catalogs.find((c) => c.language.id === l.id);
    return { ...l, href: target ? path.posix.relative(here, offlineFile(target.language)) : null };
  });
}
