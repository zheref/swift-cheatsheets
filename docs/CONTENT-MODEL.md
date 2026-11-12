# The content model

Reference material is **data**. A catalog is one folder per language under
`content/languages/<id>/`; the schema in [`src/content/schema.ts`](../src/content/schema.ts)
is the single definition, and every field below is validated at build time with the failing
file and field named.

```
content/registry.yaml    the languages the selector offers, in order
content/languages/<id>/
├── language.yaml        the language definition
├── sheets/<sheet>.yaml  one file per sheet, named by its id
└── diagrams/<name>.svg  trusted SVG named by diagram cards
```

## Registry — `registry.yaml`

The top-navigation language selector lists exactly these languages, in this order:

```yaml
languages:
  - { id: swift, name: Swift }
  - { id: typescript, name: TypeScript }
  - { id: kotlin, name: Kotlin }
  - { id: csharp, name: C# }
```

Each `id` names a catalog folder; `name` must equal that catalog's own `name`, and every
built catalog must be listed, so the selector can never omit or mislabel a page. A listed
language whose catalog is missing, `draft` or otherwise not built is shown as **not yet
published** — never linked, never an empty page.

## Switching languages

Concepts carry the reader across. Opening the selector reads the sheet the reader is on
(the sheet the address names while it is on screen, else the one at the top) and points each
language at its own sheet with the same `concept`:

| The target… | The link | What the reader gets |
| --- | --- | --- |
| has the concept | `<route>#<its sheet>` | the equivalent sheet |
| lacks the concept | `<route>?from=<language>&concept=<concept>` | the target's top, with a notice naming the missing topic and offering its related topics (same top-level concept) or every topic |
| has no catalog in this build | — | listed as not yet published |

These are plain addresses, so a shared link, a reload, and back/forward all restore the
same language, topic and notice; dismissing the notice drops the query. Search, the hit
count, the empty state and snippet highlighting all work on the page's one catalog, so they
are scoped to the active language by construction.

## Language — `language.yaml`

| Field | Meaning |
| --- | --- |
| `id` | kebab-case; must equal the folder name |
| `name`, `title`, `description` | display name, page title / sidebar heading, meta description |
| `route` | where the catalog is published: `/` for the default language, `/<id>/` otherwise |
| `status` | `published` (built), `draft` (validated, not built), `fixture` (tests and previews only) |
| `locale` | the prose's BCP-47 tag (`<html lang>`) |
| `codeLanguage` | the code blocks' language name (`data-lang`) |
| `highlight` | the tokenizer's data: `keywords`, `lineComment`, `blockComment`, `attributePrefix`, `directivePrefix`, `capitalisedTypes`, `members` |
| `applies` | catalog-wide applicability (see below) |
| `sheets` | sheet ids in reading order — sidebar and scroll order |

## Sheet — `sheets/<id>.yaml`

| Field | Meaning |
| --- | --- |
| `id` | **the page anchor**, stable forever (`#<id>`); must equal the file name |
| `concept` | language-neutral concept ID shared by equivalent sheets across languages, e.g. `concurrency.isolation` |
| `scope` | `shared` (a concept other languages also have), `language` (a feature of this language), `platform` (tied to a framework or OS) |
| `title`, `group`, `subtitle` | heading, sidebar group (sheets sharing a group must be adjacent), one-line summary |
| `applies`, `sources` | optional applicability and citations for the whole sheet |
| `cards` | at least one card |

## Card

Common fields: `id` (stable, unique in its sheet; the card's global id and DOM anchor is
`<sheet>--<card>`), `kind`, `title`, `note`, and optional `concept`, `applies`, `sources`.

| `kind` | Fields | Purpose |
| --- | --- | --- |
| `code` | `code`, optional `expected` | a practical example and the result it produces |
| `compare` | `columns: [{label, tone, code}]`, optional `expected` | before/after, legacy/modern, wrong/right |
| `rules` | `items: [{tone, text}]` | colour-coded guidance; text supports `` `code` `` and `**bold**` |
| `table` | `headers`, `rows` (one cell per header) | comparisons; cells support the same inline markup |
| `diagram` | `svg`: a file in `diagrams/` | an infographic, 940 units wide, coloured by theme variables; checked against an element/attribute allowlist, referencing only `url(#id)` inside itself |

`tone` is one of `good`, `bad`, `modern`, `legacy`, `neutral`.

## Applicability and sources

`applies` may sit on the language, a sheet or a card; absent means *not stated*, never
*everywhere*.

```yaml
applies:
  platforms: [ios, macos]          # hosts: ios, macos, browser, node, jvm, android, dotnet…
  runtime: Swift toolchain         # in words
  requires: [SwiftUI, Combine]     # frameworks or libraries
  versions: { swift: ">=6.0" }     # ranges keyed by language, platform or library
sources:
  - title: Concurrency — The Swift Programming Language
    url: https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/
```

Sources must be `https` URLs. They render as ordinary links: following one is the reader's
choice, and the page itself never requests anything external.

## Adding a language

1. Create `content/languages/<id>/language.yaml` with a unique `route` (`/<id>/`) and the
   language's `highlight` keywords. Start at `status: draft` until the catalog is real. If
   the language is not in `content/registry.yaml` yet, add it there with the same `name`.
2. Add sheets. Reuse the Swift catalog's `concept` IDs where the topic is genuinely
   equivalent, so a reader switching languages can land on the same concept; give
   language- or platform-specific material its own concept and the right `scope`.
3. Flip to `status: published` and `npm run build`: `gatsby-node.ts` creates the page at
   its route from the same template, the offline export writes `offline/<id>.html`, and
   every page's selector starts linking to it.

No component, template or route code changes. The fixture site in `test/fixtures/content/`
is the working example: its own `registry.yaml` lists four fixture catalogs
(`swift-fixture`, `typescript-fixture`, `kotlin-fixture`, `csharp-fixture`) standing in for
the four configured languages. The test suite renders, hydrates and switches between them
through the same page, and `CHEATSHEETS_FIXTURES=1 npx gatsby build` publishes them at
`/<id>-fixture/` beside the real site. Each content root is its own site: fixture pages
link only to fixtures, and say on the page that they are test data, not reference material.

## Layers and their boundaries

| Layer | Path | May import | Must not import |
| --- | --- | --- | --- |
| Content | `src/content/` | `zod`, `yaml`, Node `fs` (loader only) | React, Chakra, Gatsby |
| UI | `src/ui/` | React, Chakra, `src/content` types and pure functions (never the zod schema values, which would ship zod to the browser) | Gatsby, the loader, any catalog data |
| Gatsby adapter | `gatsby-*.ts[x]`, `src/adapters/gatsby/`, `src/pages/` | everything above, Gatsby | — |
| Offline adapter | `src/adapters/offline/`, `scripts/build-offline.mts` | everything above, `react-dom/server`, esbuild | Gatsby |

The UI receives a validated `Catalog` and the registry's languages with their addresses
already resolved by the adapter (a route on the site, a relative file path offline), and
renders them; it holds no Swift-specific data and no routing. That keeps the reusable pieces — page shell and navigation, search bar, code block,
comparison/table/rule cards, language selector, theme tokens — extractable to a shared
Bankai package (zheref/swift-cheatsheets#4) without dragging content or Gatsby along.
Further catalogs (zheref/swift-cheatsheets#3) build on `route`, `concept`, `scope` and
`applies` as defined here, and on the registry above.
