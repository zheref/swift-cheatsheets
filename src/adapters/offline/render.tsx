/**
 * Offline adapter, build side: one catalog → one self-contained HTML file.
 *
 * The page is server-rendered with the same `CatalogPage` the Gatsby site uses
 * (so it reads fully even with scripts off), and carries its own catalog JSON
 * and client bundle inline, so it works opened from disk, AirDropped, or from a
 * Files app — no server, no network.
 */
import { renderToString } from "react-dom/server";
import type { Catalog, SiteLanguage } from "../../content/schema";
import { CatalogPage } from "../../ui/CatalogPage";
import { UiProvider } from "../../ui/Provider";
import { DEFAULT_THEME, themeInitScript } from "../../ui/theme";
import { escapeHtml, scriptSafeJs, scriptSafeJson } from "./escape";
import { CATALOG_ELEMENT_ID, LANGUAGES_ELEMENT_ID, ROOT_ELEMENT_ID } from "./ids";

export function renderOffline(catalog: Catalog, clientJs: string, languages?: SiteLanguage[]): string {
  const { language } = catalog;
  const markup = renderToString(
    <UiProvider>
      <CatalogPage catalog={catalog} languages={languages} />
    </UiProvider>,
  );
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(language.locale)}" data-theme="${DEFAULT_THEME}" class="${DEFAULT_THEME}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    `<meta name="description" content="${escapeHtml(language.description)}">`,
    `<title>${escapeHtml(language.title)}</title>`,
    `<script>${themeInitScript}</script>`,
    "</head>",
    "<body>",
    `<div id="${ROOT_ELEMENT_ID}">${markup}</div>`,
    `<script type="application/json" id="${CATALOG_ELEMENT_ID}">${scriptSafeJson(catalog)}</script>`,
    ...(languages ? [`<script type="application/json" id="${LANGUAGES_ELEMENT_ID}">${scriptSafeJson(languages)}</script>`] : []),
    `<script>${scriptSafeJs(clientJs)}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
