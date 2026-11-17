# Adding a language or stack

A catalog is data ([CONTENT-MODEL.md](CONTENT-MODEL.md)), and every published catalog covers
the same required aspects. This page is the path from nothing to a published catalog that
covers them.

## The required aspects

[`content/aspects.yaml`](../content/aspects.yaml) is the list. Each aspect has one or more
**parts**; each part names the concept id a sheet uses to cover it and a checklist of the
least that sheet answers.

| Aspect | Parts (concept id) |
| --- | --- |
| Main UI layers | declarative (`ui.views-layout-animation`), programmatic (`ui.programmatic`) |
| Styling | `ui.styling` |
| State management | unidirectional (`architecture.unidirectional-core`), view models (`ui.mvvm-state`) |
| Structured concurrency | `concurrency.async-await` |
| Async flows | `reactive.streams-core` |
| Timers and scheduling | `reactive.timers-and-async` |
| Networking | REST (`networking.rest`); SOAP, gRPC, GraphQL (`networking.protocols`) |
| Video streaming | `media.video-streaming` |
| Security, authentication, privacy | `security.auth-and-data` |
| Accessibility | `accessibility.practices` |
| Localization | `localization.practices` |
| Serialization | `serialization.codecs` |
| Collections and strings | `collections.types`, `collections.operations`, `strings.operations` |
| Unit and integration testing | `testing.approaches` |
| UI and end-to-end testing | `testing.ui-e2e` |
| Architecture | `architecture.approaches` |
| Clean code | `practice.clean-code` |
| SOLID | `principles.solid` |
| Functional programming | `principles.functional` |
| Modularization | `architecture.modularization` |

`test/aspects.test.ts` fails a published catalog that has a part with neither a sheet nor a
waiver. The list is a floor, not a ceiling: a catalog adds whatever else its stack deserves
(a second UI library, a platform API, a language feature), under its own concept ids.

## 1. Scaffold it

```bash
node scripts/new-language.mts rust Rust --prefix rs
```

This writes `content/languages/rust/`: a draft `language.yaml`, one stub sheet per required
part (`rs-networking-rest.yaml`, `rs-styling.yaml`…), a language-essentials stub and a
coverage sheet against the Swift catalog. Each stub already has the right `concept`, a
`must-cover` card holding its checklist, and an example card showing every field a published
example states. It refuses a folder that exists.

[`templates/new-language/`](../templates/new-language/) is that command's output, committed
so the shape can be read without running anything. A test keeps it identical to what the
script generates; after changing `content/aspects.yaml` or the Swift sheet list, run
`npm run template`.

## 2. Make it the language's own

1. In `language.yaml`: the description, the `highlight` keywords, the runtime. Add the
   language to `content/registry.yaml` with the same `name`.
2. Rename sheets where the stack has a better name (`rs-ui-declarative` → `rs-leptos`), in
   the file name, the sheet's `id` and `language.yaml`'s `sheets`. Keep each `concept`: it
   is what lands a reader on the equivalent sheet when they switch languages. Sheet ids are
   page anchors — choose them once.
3. Regroup. Sheets sharing a `group` must be adjacent, and a group holds one `scope`
   (`shared`, `language` or `platform`). Platform sheets state `applies.platforms`.
4. Add sheets beyond the floor, each with its own concept id.

## 3. Write each sheet against its checklist

Replace the `must-cover` card with real cards that answer every point on it. What makes a
card worth having:

- **A real use.** The example solves something a developer meets at work — debouncing a
  search field, refreshing an expired token — not `foo` and `bar`.
- **Small enough to hold in the head.** One idea per card; a `note` that says when to reach
  for it; comments only where the code cannot say it.
- **Accurate, and proved.** An example is the whole program: what is on the page is what
  runs. Mark it `ran` (with the output it printed), `compiled`, or `excerpt` (naming the
  application host it needs) — never further than it was actually proved.
- **Sourced.** A sheet or card links the primary documentation it rests on.

For a topic that truly does not exist on the stack, add a waiver to `content/aspects.yaml`
instead of a sheet, with the reason. "Not written yet" is not a reason.

## 4. Prove the examples

In this order:

1. **Give the language a runner.** `scripts/run-examples.mts` knows TypeScript, Kotlin and
   C#. Any other language needs its own `Runner` there and an entry in `EXAMPLE_LANGUAGES`.
2. **Then set `requireExampleMetadata: true`**, so the loader refuses an example missing its
   setup, applicability, sources, result or validation status. Setting it before step 1
   breaks the example run for every catalog, CI's included: the runner refuses a catalog
   that promises validated examples in a language it cannot run.
3. **Run them:**

```bash
npm run examples:install          # the example-only libraries and the Kotlin jars
npm run examples -- --lang <id>   # compile and run them, once step 1 added <id>
```

Libraries the examples import are pinned and example-only:

| Language | Where a library is added |
| --- | --- |
| TypeScript | `examples/package.json` (its own lockfile; the site does not depend on it) |
| Kotlin | `examples/kotlin/jars.txt` — Maven coordinates and the jar's SHA-256 |
| C# | `examples/csharp/packages.json` — package id, exact version, and the `using` that asks for it |

## 5. Fill in the coverage matrix and publish

The coverage sheet gives every Swift sheet, in Swift's order, a disposition and a reason
([CONTENT-MODEL.md](CONTENT-MODEL.md#coverage-against-swift)). Replace each `TODO`.

When no `TODO` is left: `status: published`, then `npm run build` and `npm run check`. The
page appears at its route, the offline export writes `offline/<id>.html`, and every page's
selector links to it. No component, template or route code changes.
