/**
 * Offline adapter, browser side: hydrates the server-rendered page from the
 * catalog embedded in the same file. No fetch, no chunks, no network.
 */
import { hydrateRoot } from "react-dom/client";
import type { Catalog, SiteLanguage } from "../../content/schema";
import { CatalogPage } from "../../ui/CatalogPage";
import { UiProvider } from "../../ui/Provider";
import { CATALOG_ELEMENT_ID, LANGUAGES_ELEMENT_ID, ROOT_ELEMENT_ID } from "./ids";

const data = document.getElementById(CATALOG_ELEMENT_ID);
const registry = document.getElementById(LANGUAGES_ELEMENT_ID);
const root = document.getElementById(ROOT_ELEMENT_ID);
if (data?.textContent && root) {
  const catalog = JSON.parse(data.textContent) as Catalog;
  const languages = registry?.textContent ? (JSON.parse(registry.textContent) as SiteLanguage[]) : undefined;
  hydrateRoot(
    root,
    <UiProvider>
      <CatalogPage catalog={catalog} languages={languages} />
    </UiProvider>,
  );
}
