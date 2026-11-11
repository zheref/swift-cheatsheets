/**
 * The content model — renderer-independent and language-neutral.
 *
 * A catalog is DATA: one `language.yaml` plus one YAML file per sheet under
 * `content/languages/<id>/`. Nothing here imports React, Chakra or Gatsby, so the
 * same model feeds the Gatsby site, the offline export and the tests. Adding a
 * language adds files, never a page template (see docs/CONTENT-MODEL.md).
 */
import { z } from "zod";
import { CONCEPT_ID, SLUG } from "./ids";

/** Stable, URL-safe identifier: lowercase words joined by single hyphens. */
export const slug = z.string().regex(SLUG, "must be a lowercase kebab-case slug");

/** Language-neutral concept ID shared by equivalent topics across languages, e.g. `concurrency.isolation`. */
export const conceptId = z.string().regex(CONCEPT_ID, "must be dot-separated kebab-case segments");

export const tone = z.enum(["good", "bad", "modern", "legacy", "neutral"]);

export const source = z
  .object({
    title: z.string().min(1),
    url: z.url({ protocol: /^https$/ }),
  })
  .strict();

/**
 * Where a sheet or card applies. Every field is optional and inherits outward
 * (card → sheet → language); absent means "not stated", never "everywhere".
 */
export const applicability = z
  .object({
    /** Operating systems or hosts, e.g. `ios`, `macos`, `browser`, `node`, `jvm`, `android`, `dotnet`. */
    platforms: z.array(slug).min(1).optional(),
    /** The runtime or toolchain the material assumes, in words, e.g. `Swift toolchain`. */
    runtime: z.string().min(1).optional(),
    /** Frameworks or libraries the material depends on. */
    requires: z.array(z.string().min(1)).min(1).optional(),
    /** Version applicability keyed by language, platform or library, as a range, e.g. `{ swift: ">=6.0" }`. */
    versions: z.record(z.string().min(1), z.string().min(1)).optional(),
  })
  .strict();

/**
 * Who a sheet is for, which is how a reader (and the future language selector)
 * separates portable concepts from language- and platform-specific material.
 *  - `shared`   — a concept with equivalents in other languages (collections, SOLID, algorithms)
 *  - `language` — a feature of this language itself (Swift generics, Swift 6 isolation)
 *  - `platform` — tied to a framework or OS (SwiftUI, Combine, Core Bluetooth)
 */
export const scope = z.enum(["shared", "language", "platform"]);

const cardBase = {
  /** Stable within its sheet; with the sheet id it forms the card's global id `<sheet>/<card>`. */
  id: slug,
  /** Optional cross-language concept this card is the language's take on. */
  concept: conceptId.optional(),
  title: z.string().min(1),
  /** One-line explanation shown under the title. Empty is allowed and renders nothing. */
  note: z.string().default(""),
  applies: applicability.optional(),
  sources: z.array(source).min(1).optional(),
};

/** A practical example: one snippet, optionally with the result it produces. */
export const codeCard = z
  .object({
    ...cardBase,
    kind: z.literal("code"),
    code: z.string().min(1),
    /** What running the example shows — output, a value, or an observable effect. */
    expected: z.string().min(1).optional(),
  })
  .strict();

export const compareColumn = z
  .object({
    label: z.string().min(1),
    tone,
    code: z.string().min(1),
  })
  .strict();

/** Side-by-side snippets: before/after, legacy/modern, wrong/right. */
export const compareCard = z
  .object({
    ...cardBase,
    kind: z.literal("compare"),
    columns: z.array(compareColumn).min(1),
    expected: z.string().min(1).optional(),
  })
  .strict();

/** Inline text in rules and tables supports `code` spans and **bold**. */
export const rule = z.object({ tone, text: z.string().min(1) }).strict();

export const rulesCard = z
  .object({
    ...cardBase,
    kind: z.literal("rules"),
    items: z.array(rule).min(1),
  })
  .strict();

export const tableCard = z
  .object({
    ...cardBase,
    kind: z.literal("table"),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())).min(1),
  })
  .strict()
  .refine((t) => t.rows.every((r) => r.length === t.headers.length), {
    message: "every table row must have one cell per header",
    path: ["rows"],
  });

/**
 * A hand-laid-out infographic. In a YAML file `svg` names a file under the
 * catalog's `diagrams/` folder; the loader replaces it with the markup, which is
 * trusted, repository-owned SVG coloured only through the theme's CSS custom
 * properties so it follows light and dark mode.
 */
export const diagramCard = z
  .object({
    ...cardBase,
    kind: z.literal("diagram"),
    svg: z.string().min(1),
  })
  .strict();

export const card = z.discriminatedUnion("kind", [codeCard, compareCard, rulesCard, tableCard, diagramCard]);

export const sheet = z
  .object({
    /** The page anchor. Stable forever: saved links point at `#<id>`. */
    id: slug,
    concept: conceptId,
    scope,
    title: z.string().min(1),
    /** Sidebar heading; sheets sharing a group must be adjacent in the language's order. */
    group: z.string().min(1),
    subtitle: z.string().default(""),
    applies: applicability.optional(),
    sources: z.array(source).min(1).optional(),
    cards: z.array(card).min(1),
  })
  .strict();

/**
 * The tokenizer for a C-family syntax, configured entirely by data so a new
 * language brings its keyword list rather than a new highlighter.
 */
export const highlight = z
  .object({
    keywords: z.array(z.string().min(1)).min(1),
    lineComment: z.string().min(1).optional(),
    blockComment: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
    /** Prefix characters that start an attribute/annotation token, e.g. `@` in Swift, Kotlin and TS decorators. */
    attributePrefix: z.string().length(1).optional(),
    /** Prefix that starts a compiler directive, e.g. `#` in Swift and C#. */
    directivePrefix: z.string().length(1).optional(),
    /** Capitalised identifiers are highlighted as types. */
    capitalisedTypes: z.boolean().default(true),
    /** `.member` access is highlighted. */
    members: z.boolean().default(true),
  })
  .strict();

export const language = z
  .object({
    id: slug,
    name: z.string().min(1),
    /** The page title and sidebar heading. */
    title: z.string().min(1),
    /** Site path the catalog is published at; `/` for the default language. */
    route: z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/, "must start and end with `/`"),
    /** Only `published` catalogs become pages; `fixture` exists for tests and previews. */
    status: z.enum(["published", "draft", "fixture"]),
    description: z.string().min(1),
    /** The BCP-47 tag for the page's prose. */
    locale: z.string().default("en"),
    /** The code-block language name, used for the `data-lang` hook and future selectors. */
    codeLanguage: slug,
    highlight,
    applies: applicability.optional(),
    /** Sheet ids in reading order: drives both the sidebar and the scroll order. */
    sheets: z.array(slug).min(1),
  })
  .strict();

/**
 * The languages the top-navigation selector offers, in order — one `registry.yaml`
 * per content root. An entry names a catalog folder under `languages/`; when that
 * catalog is missing or not built, the selector shows the language as not yet
 * available instead of an empty page.
 */
export const registry = z
  .object({
    languages: z
      .array(
        z
          .object({
            /** The catalog folder (and language) id. */
            id: slug,
            /** The selector's label; must equal the catalog's own `name` when the catalog exists. */
            name: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type Tone = z.infer<typeof tone>;
export type Source = z.infer<typeof source>;
export type Applicability = z.infer<typeof applicability>;
export type Scope = z.infer<typeof scope>;
export type CodeCard = z.infer<typeof codeCard>;
export type CompareCard = z.infer<typeof compareCard>;
export type RulesCard = z.infer<typeof rulesCard>;
export type TableCard = z.infer<typeof tableCard>;
export type DiagramCard = z.infer<typeof diagramCard>;
export type Card = z.infer<typeof card>;
export type Sheet = z.infer<typeof sheet>;
export type Highlight = z.infer<typeof highlight>;
export type Language = z.infer<typeof language>;
export type Registry = z.infer<typeof registry>;

/** A loaded, validated catalog: the language definition with its sheets resolved in order. */
export interface Catalog {
  language: Omit<Language, "sheets">;
  sheets: Sheet[];
}

/** One sheet as another language's page sees it: enough to land on it, or to name it. */
export interface Topic {
  concept: string;
  sheet: string;
  title: string;
}

/**
 * One registry entry resolved against the catalogs of a build. `href` is where
 * its page lives — the adapter's to fill (a route on the site, a relative file
 * offline); `null` means the language has no catalog in this build.
 */
export interface SiteLanguage {
  id: string;
  name: string;
  href: string | null;
  topics: Topic[];
}
