# Bankai primitives: inventory, proof and extraction proposal

zheref/swift-cheatsheets#4. This page decides which parts of this reference's UI are
general enough for Bankai, proves the first ones here, and says how they would move
upstream. It **creates no library and publishes nothing**: the primitives live in this
repository, under [`src/bankai/`](../src/bankai/), until the follow-up in
[§ 6](#66-the-focused-upstream-follow-up) moves them.

- [1. The existing Bankai owner](#1-the-existing-bankai-owner)
- [2. The layers](#2-the-layers)
- [3. Inventory and ownership](#3-inventory-and-ownership)
- [4. Tokens](#4-tokens)
- [5. The proof](#5-the-proof)
- [6. Extraction proposal](#6-extraction-proposal)

## 1. The existing Bankai owner

Read on 2026-11-11, before anything was proposed:

| Repository | What it holds for web UI |
| --- | --- |
| **[zheref/bankai-site](https://github.com/zheref/bankai-site)** at `a30ee77` | **The owner.** A Gatsby 5 + React 18 + Tailwind 4 site whose `src/design/` holds Bankai's domain-less components (handbook rule `RC-14`): `Button`, `Card`, `Badge`, `Section`, `Tabs`, `Snippet`/`SnippetBlock` (code with copy feedback), `ThemeToggle`, `Terminal`, `InlineMd`, `Mark`, `Wordmark`. Tokens are `src/brand/tokens.json`, generated into CSS variables. The scheme is `src/library/AppTheme.ts` + `useAppTheme.ts`. A docs search (`features/docs/Search.tsx`) and a header with a mobile menu (`features/shell/Header.tsx`) are feature code, not `design/`. **No package, no workspace, no Storybook**: its architecture note says the site "has no design-system consumers yet". |
| [zheref/bankai-handbooks](https://github.com/zheref/bankai-handbooks) | The canon: `react-uzf-v1` (`RC-14`: reusable components under `design/`, importing no state layer), and the `UX-1`…`UX-13` baseline these primitives are held to. A rulebook, with no components. |
| zheref/Bankai, BankaiCore, BankaiApple, BankaiAndroid | Swift, Kotlin and C# modules. No web UI. |

So there is **an owner and no package**. Nothing upstream offers a reference layout, a
topic rail, a disclosure selector or a search field. `bankai-site` has a code block with
copy feedback (`SnippetBlock`), a theme toggle, a scheme hook and a token file, and those
are the overlaps § 3 resolves. Two of its components are coupled to Gatsby where they
need not be: `Snippet` calls `useStaticQuery`, and `Button` imports Gatsby's `Link`. Its
`SnippetBlock`, `Tabs` and `Card` are already framework-neutral.

## 2. The layers

Every primitive is assigned to exactly one layer, and dependencies point down only:

```
 product           src/ui/ (CatalogPage, cards, languages, theme, hooks)   ← knows the content model
   │ composes
 Chakra layer      src/bankai/*.tsx, system.ts, controls.ts               ← @chakra-ui/react + React
   │ composes
 behaviour         src/bankai/behaviour.ts, scheme.ts                     ← React only
   │ reads
 tokens            src/bankai/tokens.ts                                   ← no imports at all

 adapters          src/adapters/gatsby, src/adapters/offline              ← routing, pages, <head>, mount
```

- **Tokens** are plain data. Any styling engine can read them.
- **Behaviour** is framework-neutral React: hooks with no markup and no styling engine,
  covering focus, keyboard, dismissal and copy feedback. A Tailwind consumer such as
  `bankai-site` composes the same hooks around its own markup.
- **The Chakra layer** is markup and styles composed from Chakra UI 3. It is what this
  reference renders.
- **Adapters stay in the product.** Routing, page creation, `<head>` and the pre-paint
  script's placement are Gatsby's or the offline file's, never a primitive's. Every
  primitive takes resolved `href`s and renders plain anchors, so it works under any router
  and from `file://`.

[`test/bankai.test.tsx`](../test/bankai.test.tsx) enforces the arrows. `src/bankai/`
imports only `react`, `@chakra-ui/react` and itself. It never imports `gatsby`, a router,
`src/content/` or `src/ui/`. `tokens.ts` imports nothing, and `behaviour.ts` and
`scheme.ts` import only `react`.

## 3. Inventory and ownership

Each of the issue's eight candidates, plus two found while doing it. **Decision**: *extract*
means it is proven here and moves in § 6, *product* means it stays in this repository, and
*defer* means it is general, but not yet.

### 3.1 App shell and top navigation → `AppShell` · **extract** · Chakra layer (+ `useDrawer`, behaviour)

- **Props.** `nav` (the rail's content), `navLabel`, `menuLabel`, `bar` (the top bar's
  controls), `children`, `open` / `onOpenChange` (controlled), optional `ids` and
  `rootProps` (`data-*` hooks).
- **State.** None of its own. The consumer owns `open`. The shell owns the effects: focus
  moves into the drawer on open and back to the menu button on close, Escape and the scrim
  close it, and widening past the breakpoint closes it.
- **Accessibility.** The rail is a labelled `nav` landmark. The menu button carries
  `aria-controls` and `aria-expanded`. While the drawer is open the main column is `inert`,
  and when it is closed its links leave the tab order (`visibility: hidden`) (UX-2, UX-11).
  Reduced motion drops the slide (UX-9).
- **Responsive.** A 236px sticky rail on wide screens. At ≤900px it becomes an off-canvas
  drawer behind a 44px menu button (UX-3), with no horizontal scroll (UX-7).
- **Bankai equivalent.** `bankai-site`'s `Header` has a mobile menu but no rail and no focus
  handling. This primitive is new.

### 3.2 Language selector → `DisclosureSelector` · **extract** · Chakra layer (+ `useDisclosure`, behaviour)

- **Props.** `label`, `value`, `options` (`{id, label, href | null, current?, hint?,
  itemProps?}`), `onOpen` (recompute addresses as the list opens), optional `ids`.
  "Language" is only a label. The same primitive selects a version, a platform or a
  framework.
- **State.** `open`. Pointer or focus outside closes the list. Escape closes it back onto the
  toggle and stops there, so the page's own Escape does not also fire.
- **Accessibility.** A `nav` landmark around `<details>`/`<summary>` that opens from the
  keyboard and **works with scripts off**. Options are links, not a navigating `<select>`
  (WCAG 3.2.2). The current option carries `aria-current`. An unlinkable option is plain
  text whose hint says why (`aria-disabled` is not allowed on a generic span). The visible
  value is part of the accessible name (WCAG 2.5.3).
- **Responsive.** A long value is clipped at ≤900px so the bar keeps its search. Every option
  and the toggle are 44px on narrow screens and on any coarse pointer (UX-3).
- **Product part, which stays.** `src/ui/languages.tsx` turns the registry and the reader's
  concept into options (`switchLink`) and holds the absence notice.

### 3.3 Topic navigation → `TopicNav` · **extract** · Chakra layer

- **Props.** `title`, `meta`, `titleAs`, `items` (`{id, label, href, group?}`), `active`,
  `onNavigate`.
- **State.** None. The consumer says which item is active. Here that is
  `useActiveSection`, an IntersectionObserver over the sheets, which stays in the product
  because it knows the page's section ids.
- **Accessibility.** Plain anchors in reading order. The current item is marked for sight
  (`.active`) and for assistive technology (`aria-current="location"`). Group labels are
  text, not links.
- **Responsive.** Links grow to 44px inside the narrow drawer (UX-3).

### 3.4 Search and filter controls → `SearchField` · **extract** · Chakra layer (+ `useSearchKeys`, behaviour)

- **Props.** `id`, `value`, `onValueChange`, `label` (its accessible name), `placeholder`,
  `shortcut` (default `/`).
- **State.** None. The consumer owns the query and the filtering (`src/content/search.ts`,
  which stays in the product). The field owns its keys: `/` focuses and selects it from
  anywhere but another field, and Escape clears it and lets go of focus.
- **Accessibility.** Its own `search` landmark, kept out of the selector's. The hit count and
  the empty state are the product's live region (`#hits`).
- **Responsive.** 38px tall, 44px at ≤900px.
- **Bankai equivalent.** `bankai-site`'s `DocsSearch` is feature code, coupled to FlexSearch,
  `fetch` and Gatsby's `Link`. Its input could adopt `useSearchKeys`. Its results list stays
  its own.

### 3.5 Code block with copy feedback → `CodeBlock` · **extract** · Chakra layer (+ `useCopy`, behaviour)

- **Props.** `code`, `language` (a label, `data-lang`), `tokens` (`{text, kind?}`, where
  `kind` is a syntax role), `tone`, `copy` (`true` or custom labels), `resetAfterMs`.
- **State.** The copy result: `idle` → `copied` | `failed` → `idle` after 2s.
- **Accessibility.** React escapes every token. The copy button appears **only once scripts
  run and the clipboard API exists**, so it is never a dead control. The result is announced
  by a polite live region (UX-4), and failure says what to do instead ("select the text").
  The button is 44px on touch (UX-3).
- **Responsive.** The code scrolls horizontally inside its own box, never the page (UX-7).
  The button sits above the code, never over it.
- **Highlighting stays the consumer's.** The primitive runs no highlighter.
  `src/content/highlight.ts` tokenizes for this reference, and `bankai-site` would pass
  shiki's output.
- **Product use today.** Every snippet renders through it **without** `copy`, exactly as
  before. Turning copy on for the reference is a product decision, not this issue's.
- **Bankai equivalent.** `bankai-site`'s `SnippetBlock` takes pre-rendered HTML and leaves its
  "Copy" button in the static page. § 6 merges the two around `useCopy`.

### 3.6 Comparison and table cards → **product, for now** · Chakra layer

`CardView` with its `compare`, `rules`, `table` and `diagram` bodies is general in shape but
not yet in contract. Its props are this reference's card schema (`src/content/schema.ts`),
its styles live in the product's global CSS (`.cols`, `.collabel`, `ul.rules`,
`.tablewrap`), and its tone vocabulary (`good`/`bad`/`modern`/`legacy`) is this reference's.
Extracting it now would freeze a schema that #3 is still exercising with three new languages.
**Revisit after #3 lands**: the general piece is a `Comparison` (labelled, toned columns)
and a `DataTable` (inline markup in cells, horizontal scroll), both taking already-parsed
content.

### 3.7 Callouts → **defer** · Chakra layer

Two exist: the fixture note and the absence notice. Both are a left-ruled box in the
caution tone, but their contents differ: one is a note, the other a focusable section
with a heading, links and an action. One `Callout` (`tone`, `title?`, `children`,
`focusOnMount?`) would serve both. It moves after #5, which reworks their sizes and touch
targets, so the primitive is cut from the settled styles rather than re-cut.

### 3.8 Theme tokens → `tokens.ts`, `definePrimitivesConfig` · **extract** · tokens + Chakra layer

See [§ 4](#4-tokens).

### 3.9 Theme toggle and colour scheme → `ThemeToggle`, `useColorScheme`, `schemeInitScript` · **extract** · Chakra layer + behaviour

- **Contract.** `<html data-theme="dark|light" class="dark|light">`, remembered under a key
  the consumer names. The pre-paint script applies it before first paint. The hook starts at
  the default on the server and on the first client render, so hydration always matches,
  then reads the real scheme after mount.
- **Bankai equivalent.** `bankai-site`'s `AppTheme` and `useAppTheme` have the same shape (an
  explicit choice wins, then the default), plus an OS-preference fallback and a cross-instance
  event. § 6 merges them: the OS fallback and the event are worth taking, and the `class`
  half is needed by Chakra.

### 3.10 Inline text (`code` and **bold** in prose) → **product**

`InlineText` renders the content model's inline grammar (`src/content/inline.ts`). It is
general only together with that grammar. `bankai-site`'s `InlineMd` injects collector HTML
instead, and the two should not be merged.

### Summary (SC-1)

| Candidate | Decision | Layer | Proven here |
| --- | --- | --- | --- |
| App shell / top navigation | extract | Chakra + behaviour | ✓ |
| Language selector | extract (as `DisclosureSelector`) | Chakra + behaviour | ✓ |
| Topic navigation | extract | Chakra | ✓ |
| Search / filter controls | extract (field and keys; filtering stays) | Chakra + behaviour | ✓ |
| Code block with copy feedback | extract | Chakra + behaviour | ✓ |
| Comparison / table cards | product, revisit after #3 | Chakra | — |
| Callouts | defer until after #5 | Chakra | — |
| Theme tokens | extract | tokens + Chakra | ✓ |
| Theme toggle / scheme | extract | Chakra + behaviour | ✓ |
| Inline text | product | Chakra | — |

Ten candidates, ten decisions. Seven primitives are proven, with two languages each.

## 4. Tokens

[`src/bankai/tokens.ts`](../src/bankai/tokens.ts) is the one place a primitive reads a
size, a colour role, a layer or an overlay from. **Its values are the page's current ones,
moved unchanged**, which is why the rendered page is byte-identical (§ 5).

| Group | Shape | What #5 does with it |
| --- | --- | --- |
| `color` | role → Chakra semantic path (`fg: "cs.fg"`); the palette behind it is the consumer's (`Palette`, 19 roles: surfaces, tones, syntax) | contrast fixes are palette edits in `src/ui/theme.ts`; no primitive changes |
| `fontSize`, `lineHeight` | **semantic roles**: `body`, `control`, `input`, `hint`, `meta`, `groupLabel`, `navTitle`, `code`, `icon` | settles the scale *under* the roles (role → step) and adds the narrow floors (OQ-1: dense on desktop, 12px / 16px floors on narrow screens only) as a per-role narrow value; primitives keep asking for roles |
| `space` | roles: `barGap`, `barPadding`, `mainPadding(Narrow)`, `railPadding`, `navItemPadding`, `optionPadding`, `menuPadding`, … | moves values onto a spacing step scale |
| `radius` | `option`, `code`, `control`, `menu`, `pill` | same |
| `size` | `control` (38px), `option` (40px), `touch` (44px), `rail`, `menuMin`, `clipNarrow` | `touch` is already the UX-3 floor |
| `layer` | one z-index ladder: `topbar` 20 < `menu` 30 < `scrim` 50 < `drawer` 60 | overlays never fight |
| `overlay` | `scrim`, `menuShadow`, `drawerShadow`, `hover`, `selected` | state washes and elevations |
| `media`, `wideQuery` | `narrow`, `touch`, `reducedMotion`, `print`; the same breakpoint as a `matchMedia` query | one breakpoint, named once |
| `motion`, `focusRing` | the drawer's slide; `outside` / `inside` focus outlines | UX-9, UX-1 |

Roles rather than steps are a deliberate choice. A primitive asks *what a value is for*
(`fontSize.control`), and the theme decides *which step of its scale* that is. That
indirection lets #5 replace the dense one-off sizes with a real scale, and lets
`bankai-site` map the same roles onto its own `tokens.json`, without touching a component.
The values `src/ui/` still writes inline (cards, the absence notice, the fixture note) are
#5's to move onto these roles.

## 5. The proof

**The page.** The reference itself now renders through the primitives:
`CatalogPage` composes `AppShell`, `TopicNav`, `SearchField`, `ThemeToggle` and the
selector, and every snippet is a `CodeBlock`. **The server-rendered markup and its CSS are
byte-identical to `main` (`a6f14a1`)** for the Swift catalog and all four fixture
catalogs, with and without the registry: ten renders, compared with `cmp`. All 139 tests
that existed before this change pass unchanged.

**The primitives on their own.** [`test/bankai.test.tsx`](../test/bankai.test.tsx) renders
them for the **TypeScript and Kotlin fixtures**, through a consumer adapter written in the
test with **its own palette, fonts and storage key**. It never touches the product's
`src/ui/`. For each language it covers:

| Criterion | What the test proves |
| --- | --- |
| AC-2: no Swift-specific data in a public interface | the adapter passes only strings, `href`s, `ReactNode`s and pre-made tokens; no primitive file imports the content model (enforced) |
| AC-3: static rendering | the rail, the bar, every link and the coloured code are in the server markup; the copy button is not (no dead control) |
| AC-3: hydration | `hydrateRoot` over that markup: no recoverable error, no `console.error`, in dark and in a light scheme applied by the pre-paint script |
| AC-3: keyboard | `/` focuses the search and Escape clears it; the selector opens, recomputes on open, closes on Escape back onto its toggle without clearing the search, and closes on an outside press; the drawer takes focus, makes the page inert, gives focus back on Escape, and closes on a link or the scrim |
| AC-3: both themes | both palettes are emitted; the toggle switches `data-theme`, the class and storage, and names the action it will take |
| copy feedback | copies the code, says "Copied" in the button and the live region, resets after 2s; says how to recover on failure; hidden without a clipboard |

**Gatsby compatibility.** The primitives import nothing from Gatsby. They are rendered by
the Gatsby page template (`src/adapters/gatsby/CatalogTemplate.tsx`) at build time and by
the offline adapter, and they hydrate under both. `npm run build` and `npm run verify` pass,
and the offline `index.html` still opens from disk with no request.

## 6. Extraction proposal

### 6.1 Destination

**`zheref/bankai-site`, as its first workspace packages.** It is the existing owner of
Bankai's domain-less components (`src/design/`, `RC-14`). Starting a new repository would
split ownership before there is a second consumer that needs it. The packages:

| Package (proposed name) | Contents | Depends on |
| --- | --- | --- |
| `@bankai/tokens` | `tokens.ts`'s role shape, plus a JSON/CSS-variable export generated from `bankai-site`'s `tokens.json` | nothing |
| `@bankai/react` | behaviour: `useCopy`, `useDisclosure`, `useDrawer`, `useSearchKeys`, `useColorScheme`, `schemeInitScript` | `react` (peer) |
| `@bankai/chakra` | the Chakra layer: `AppShell`, `TopicNav`, `SearchField`, `DisclosureSelector`, `CodeBlock`, `ThemeToggle`, `definePrimitivesConfig`, `syntaxCss`, `codeBlockCss` | `@bankai/react`, `@bankai/tokens`; `react` and `@chakra-ui/react` (peers) |

`bankai-site` consumes `@bankai/tokens` and `@bankai/react` under Tailwind. It does not
take on Chakra. This reference consumes all three. The npm scope and the names are the
maintainer's call.

### 6.2 Public contracts

What `src/bankai/index.ts` exports today is the contract: the component props in § 3, the
hook signatures in `behaviour.ts` and `scheme.ts`, the `Palette`/`PrimitivesTheme` types
and the token object. It also includes these **DOM contracts**, which consumers rely on:

- `<html data-theme class>` for the scheme, and `--<role>` custom properties for the palette;
- `.t-<role>` on syntax tokens and `tone-<tone>` on a code block;
- `data-state` on a copy button; `data-nav-open` on the shell; `.active` and
  `aria-current="location"` on the current topic.

Consumer hooks (`itemProps`, `rootProps`, `ids`) are passed through unchanged. A primitive
adds no test attribute of its own.

### 6.3 Dependency direction

`tokens` ← `react` ← `chakra` ← consumers. Never the reverse, and never sideways into a
consumer's content model, router or framework adapter. The import rule in
`test/bankai.test.tsx` moves with the packages, as each package's lint rule.

### 6.4 Compatibility and semver

- **Starts at `0.1.0`.** While `0.x`, a minor bump may break, and the changelog names the
  break and the migration.
- **Breaking (major after 1.0):** removing or renaming an export, a prop, a token role or a
  palette role; changing a DOM contract in § 6.2; raising a peer floor.
- **Not breaking:** a token's *value* (it is theme data, so changing it is a minor bump with
  before/after in the changelog); a new optional prop; a new role.
- **Peers.** `react` `>=18.3 <20` and `@chakra-ui/react` `^3.38`. One gap is known: the
  shell passes `inert` as a boolean, which React 19 supports. Under React 18 it must become
  `inert=""` before `bankai-site` can use `AppShell`. The hooks are already React-18-safe.
- **Runtimes.** Server rendering and hydration under Gatsby 5 and plain `react-dom`. Safari
  16.4+ and Chrome 111+ (`color-mix()`, cascade layers), as the README says.
- **One Gatsby constraint, found while proving this.** A Gatsby consumer must not set
  `<html>` attributes through the Head API. When this reference's page template renders
  `<html lang>` in `Head`, Gatsby replaces the `<html>` attributes on hydration, which drops
  the `data-theme` and `class` the pre-paint script applied. A reader who chose light then
  gets dark after a reload, with the toggle's label inverted. This was measured in a
  browser on `main` (`a6f14a1`) and on this branch alike; the offline file is not affected.
  The fix belongs to the Gatsby adapter (set `lang` in `onRenderBody`), not to the
  primitives, and is tracked separately.

### 6.5 Consumer migration

**This repository**, once the packages exist:

1. Add `@bankai/chakra` and its peers at an exact version.
2. Replace `../bankai` imports in `src/ui/` with the packages. There are five files, and the
   names do not change.
3. Delete `src/bankai/` and move `test/bankai.test.tsx`'s proof upstream, keeping only the
   test that the page composes the package.
4. Rerun the byte-identity check (§ 5), `npm run check` and the offline-from-disk test.

**`bankai-site`:**

1. Replace `useAppTheme` with `useColorScheme` (taking over its OS fallback and the
   cross-instance event, § 3.9), and `themeBootScript` with `schemeInitScript`.
2. Rebuild `SnippetBlock`'s copy button on `useCopy`, so the static page no longer carries a
   dead "Copy".
3. Move `Snippet`'s `useStaticQuery` and `Button`'s `Link` out of `src/design/` into a thin
   Gatsby adapter.
4. Map `tokens.json` onto the role names in `@bankai/tokens`.

### 6.6 The focused upstream follow-up

**One issue on `zheref/bankai-site`:** *"Workspace packages for the shared reference
primitives: tokens, behaviour hooks, Chakra layer."*

- **In scope.** Add the pnpm workspace and the three packages from § 6.1, seeded from this
  repository's `src/bankai/` and its proof tests. Migrate the site's own scheme and copy
  button onto `@bankai/react` (bankai-site steps 1–2 above). Fix the React-18 `inert` gap.
- **Out of scope.** Publishing to a registry (a later release decision), Storybook, the
  deferred callout, and the card primitives (§ 3.6).
- **Done when.** `bankai-site` builds on its own packages, this repository's byte-identity
  check passes against them, and each package carries the import rule.

This repository's shipping never waits on it: until the packages exist, `src/bankai/` is
the source.
