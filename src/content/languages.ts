/**
 * Switching between language catalogs, as pure functions over the registry.
 *
 * Concepts, not sheet ids, carry the reader across: a sheet's `concept` is
 * shared by its equivalents in other languages, so the selector links straight
 * to the equivalent sheet. Where the target has none, the link carries the
 * concept and the language it came from in the query string instead, and the
 * target page explains the absence (zheref/swift-cheatsheets#2, AC-2, AC-3).
 * The same URLs work on the site and in the offline files, and survive reload
 * and history because they are plain addresses, not in-memory state.
 */
import { CONCEPT_ID, SLUG } from "./ids";
import type { Catalog, SiteLanguage, Topic } from "./schema";

/** A catalog's sheets as topics another language's page can land on or name. */
export const topicsOf = (catalog: Catalog): Topic[] => catalog.sheets.map((s) => ({ concept: s.concept, sheet: s.id, title: s.title }));

/** A catalog as the only language there is, for a page rendered without a registry. */
export const soleLanguage = (catalog: Catalog): SiteLanguage => ({
  id: catalog.language.id,
  name: catalog.language.name,
  href: catalog.language.route,
  topics: topicsOf(catalog),
});

export interface SwitchLink {
  /** `null` when the language has no catalog in this build. */
  href: string | null;
  /** The equivalent topic in the target, when there is one. */
  match: Topic | null;
}

/** Where choosing `target` takes a reader who is on `concept` in language `from`. */
export function switchLink(target: SiteLanguage, concept: string | null, from: string): SwitchLink {
  if (target.href === null) return { href: null, match: null };
  if (concept === null || target.id === from) return { href: target.href, match: null };
  const match = target.topics.find((t) => t.concept === concept) ?? null;
  if (match) return { href: `${target.href}#${match.sheet}`, match };
  return { href: `${target.href}?${new URLSearchParams({ from, concept }).toString()}`, match: null };
}

export interface Arrival {
  from: string;
  concept: string;
}

/** The switch a page was opened by, read from its query string; anything malformed reads as none. */
export function readArrival(search: string): Arrival | null {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  const concept = params.get("concept");
  if (!from || !concept || !SLUG.test(from) || !CONCEPT_ID.test(concept)) return null;
  return { from, concept };
}

/**
 * The topics to offer when a concept is absent: those under the same top-level
 * concept first (`concurrency.isolation` → every `concurrency.*`), else all.
 */
export function relatedTopics(topics: Topic[], concept: string): { related: boolean; topics: Topic[] } {
  const root = concept.split(".")[0];
  const near = topics.filter((t) => t.concept.split(".")[0] === root);
  return near.length ? { related: true, topics: near } : { related: false, topics };
}

/** The sheet a location hash points at: `#<sheet>` or a card's `#<sheet>--<card>` (ids are slugs, never encoded). */
export const sheetOfHash = (hash: string) => hash.replace(/^#/, "").split("--")[0] ?? "";
