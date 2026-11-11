# The content model

Reference material is **data**. A catalog is one folder per language under
`content/languages/<id>/`; the schema in [`src/content/schema.ts`](../src/content/schema.ts)
is the single definition, and every field below is validated at build time with the failing
file and field named.

```
content/languages/<id>/
├── language.yaml        the language definition
├── sheets/<sheet>.yaml  one file per sheet, named by its id
└── diagrams/<name>.svg  trusted SVG named by diagram cards
```

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
   language's `highlight` keywords. Start at `status: draft` until the catalog is real.
2. Add sheets. Reuse the Swift catalog's `concept` IDs where the topic is genuinely
   equivalent, so a reader switching languages can land on the same concept; give
   language- or platform-specific material its own concept and the right `scope`.
3. Flip to `status: published` and `npm run build`: `gatsby-node.ts` creates the page at
   its route from the same template, and the offline export writes `offline/<id>.html`.

No component, template or route code changes. The fixture catalog in
`test/fixtures/content/languages/kotlin-fixture/` is the working example: the test suite
renders and hydrates it through the same page, and
`CHEATSHEETS_FIXTURES=1 npx gatsby build` publishes it at `/kotlin-fixture/`.

## Layers and their boundaries

| Layer | Path | May import | Must not import |
| --- | --- | --- | --- |
| Content | `src/content/` | `zod`, `yaml`, Node `fs` (loader only) | React, Chakra, Gatsby |
| UI | `src/ui/` | React, Chakra, `src/content` types and pure functions | Gatsby, the loader, any catalog data |
| Gatsby adapter | `gatsby-*.ts[x]`, `src/adapters/gatsby/`, `src/pages/` | everything above, Gatsby | — |
| Offline adapter | `src/adapters/offline/`, `scripts/build-offline.mts` | everything above, `react-dom/server`, esbuild | Gatsby |

The UI receives a validated `Catalog` and renders it; it holds no Swift-specific data and no
routing. That keeps the reusable pieces — page shell and navigation, search bar, code block,
comparison/table/rule cards, theme tokens — extractable to a shared Bankai package
(zheref/swift-cheatsheets#4) without dragging content or Gatsby along. The language
selector and language-scoped search (zheref/swift-cheatsheets#2) and further catalogs
(zheref/swift-cheatsheets#3) build on `route`, `concept`, `scope` and `applies` as defined
here.
