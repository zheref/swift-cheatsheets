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
| `requireExampleMetadata` | `true` makes every example carry the metadata below or the build fails |
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
| `code` | `code`, optional `expected`, `prerequisites`, `validation` | a practical example and the result it produces |
| `compare` | `columns: [{label, tone, code}]`, optional `expected`, `prerequisites`, `validation` | before/after, legacy/modern, wrong/right |
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

## Example metadata

An **example** is a `code` or `compare` card. Two optional fields say how a reader
reproduces it, and the page shows both under the code:

```yaml
prerequisites:                    # the setup, in order; inline markup allowed
  - Node.js 22.18 or later (it runs `.mts` files directly by stripping the types)
  - "Save as `main.mts` and run `node main.mts`"
validation:
  status: ran                     # ran | compiled | excerpt
  toolchain: Node 24.16.0, TypeScript 5.9.3
  date: "2026-11-11"
```

| `status` | Means | Needs |
| --- | --- | --- |
| `ran` | compiled and executed with `toolchain` on `date`; the output equalled `expected` | `toolchain`, `date`, `expected` — or `check: exit-code` for a test runner whose output carries timings |
| `compiled` | compiled or type-checked only | `toolchain`, `date`; `host` says what running it needs |
| `excerpt` | a fragment that needs an application host; neither compiled nor run here | `host` (e.g. `an Android app with Jetpack Compose`); no toolchain or date |

A `ran` example's `expected` is its printed output and renders as code. Otherwise —
`check: exit-code`, `compiled`, `excerpt` — `expected` describes the effect in words and
renders as text (inline markup allowed). The schema refuses a status that claims more than
it records. A language with
`requireExampleMetadata: true` (the TypeScript, Kotlin and C# catalogs) also has every
example state `applies.platforms`, `applies.runtime` and `applies.versions`, `sources`,
`prerequisites`, `expected` and `validation`; applicability and sources count where the
page shows them — on the card or on its sheet — so a value set only on the language does
not. The Swift catalog does not set it and is unchanged.

`npm run examples` (`scripts/run-examples.mts`) re-proves the claims: it compiles every
`ran` and `compiled` example with the real toolchain — the snippet on the page is the whole
program, nothing is wrapped around it — runs the `ran` ones, and compares their output
with `expected`. A missing toolchain skips its language and says so; it never counts as a
pass. It therefore **executes every `ran` card** on the machine that runs it — a diff adding
or editing one is a code change and is reviewed as one; the runner gives snippets a scratch
`HOME`/`TMPDIR` and none of the caller's environment beyond `PATH` and `LANG`. The README's
*Running the examples* lists the toolchains and how they are found.

## Coverage against Swift

Each non-Swift catalog ends with a coverage sheet (`concept: meta.coverage`) whose `matrix`
table gives every Swift sheet, in the Swift catalog's order, one disposition:

| Disposition | Means | `Here` column |
| --- | --- | --- |
| `equivalent` | a sheet here covers the same concept **and shares its concept id**, so the selector lands on it | that sheet's title |
| `partial` | a sheet here covers part of it, under a different concept id; the reason says what is missing | that sheet's title |
| `no counterpart` | nothing here; the reason says whether the topic does not exist in this language or is not written yet | `—` |

`test/catalogs.test.tsx` holds the matrix to that: every Swift topic exactly once, an
equivalent sharing the concept id, a partial not, and no sheet reusing a Swift concept id
without being that topic's equivalent. A gap is stated, never filled with a translation.

## Adding a language

1. Create `content/languages/<id>/language.yaml` with a unique `route` (`/<id>/`) and the
   language's `highlight` keywords. Start at `status: draft` until the catalog is real. If
   the language is not in `content/registry.yaml` yet, add it there with the same `name`.
2. Add sheets. Reuse the Swift catalog's `concept` IDs where the topic is genuinely
   equivalent, so a reader switching languages can land on the same concept; give
   language- or platform-specific material its own concept and the right `scope`.
3. Add the coverage sheet (above), set `requireExampleMetadata: true`, and run
   `npm run examples` with the language's toolchain installed. The runner knows TypeScript,
   Kotlin and C#; a new language needs its own `Runner` in `scripts/run-examples.mts`, and
   until it has one the runner refuses a catalog that sets `requireExampleMetadata` in it.
4. Flip to `status: published` and `npm run build`: `gatsby-node.ts` creates the page at
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
