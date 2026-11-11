/**
 * The identifier patterns, kept free of zod so the browser bundle can check an
 * address without carrying the schema library (src/content/schema.ts wraps them).
 */

/** Stable, URL-safe identifier: lowercase words joined by single hyphens. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Language-neutral concept ID: dot-separated slugs, e.g. `concurrency.isolation`. */
export const CONCEPT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
