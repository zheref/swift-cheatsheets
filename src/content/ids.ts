/**
 * The identifier patterns, kept free of zod so the browser bundle can check an
 * address without carrying the schema library (src/content/schema.ts wraps them).
 */

/** Stable, URL-safe identifier: lowercase words joined by single hyphens. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Language-neutral concept ID: dot-separated slugs, e.g. `concurrency.isolation`. */
export const CONCEPT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/**
 * The element ids the page itself uses — its shell, bar, drawer, selector and notices,
 * and the offline file's mount and data elements. A sheet id is its page anchor, so a
 * sheet named like one of these would hijack it (or be hijacked: a saved `#<sheet>` link
 * landing on the control instead). The loader refuses such a sheet; a test keeps this
 * list equal to the ids the page renders. Card anchors (`<sheet>--<card>`) cannot collide.
 */
export const PAGE_IDS = [
  "shell", "scrim", "side", "main", "topbar", "menu", "q", "theme", "hits", "empty", "fixture-note",
  "langnav", "langmenu", "lang-toggle", "langlist", "absence", "absence-title", "absence-dismiss",
  "root", "catalog-data", "languages-data",
] as const;
