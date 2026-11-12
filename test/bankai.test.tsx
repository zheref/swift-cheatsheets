// @vitest-environment jsdom
/**
 * The Bankai candidate primitives, proven outside the product
 * (zheref/swift-cheatsheets#4): the code block, the disclosure selector and the
 * catalog layout (shell, topic rail, search field, theme toggle) rendered for two
 * non-Swift fixture languages under a theme that is not the product's, through a
 * consumer adapter written here — static render, hydration, keyboard, both
 * schemes (AC-2, AC-3, SC-1) — and the dependency rule that keeps them
 * extractable (AC-1).
 */
import fs from "node:fs";
import path from "node:path";
import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import { act, useState } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppShell,
  CodeBlock,
  type CodeToken,
  definePrimitivesConfig,
  DisclosureSelector,
  type Palette,
  schemeInitScript,
  SearchField,
  type SelectorOption,
  syntaxCss,
  ThemeToggle,
  TopicNav,
  useColorScheme,
} from "../src/bankai";
import { tokenize } from "../src/content/highlight";
import { loadSite } from "../src/content/load";
import type { Catalog, SiteLanguage } from "../src/content/schema";
import { FIXTURE_ROOT, ROOT } from "./helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

/** jsdom has no clipboard; a test that needs another one installs it before loading. */
const clipboard = (writeText: ((s: string) => Promise<void>) | undefined) =>
  Object.defineProperty(navigator, "clipboard", { value: writeText ? { writeText } : undefined, configurable: true });
beforeEach(() => clipboard(async () => {}));

// ---------- a consumer that is not the product: its own palette, fonts and storage key ----------

const palette = (base: string): Palette => ({
  bg: base, bg2: "#202020", card: "#2a2a2a", line: "#3a3a3a", fg: "#fafafa", dim: "#c8c8c8", faint: "#a8a8a8", accent: "#ffcc00",
  good: "#00aa55", bad: "#ee3344", modern: "#3399ff", legacy: "#cc8800",
  kw: "#ff66cc", str: "#66dd88", typ: "#66ccff", num: "#ffaa66", com: "#a8a8a8", attr: "#cc99ff", mem: "#ffdd77",
});
const DARK = palette("#101010");
const LIGHT = { ...palette("#fefefe"), fg: "#111111", dim: "#333333", faint: "#555555" };
const system = createSystem(
  defaultConfig,
  definePrimitivesConfig({ palettes: { dark: DARK, light: LIGHT }, fonts: { sans: "system-ui, sans-serif", mono: "monospace" }, globalCss: { ...syntaxCss } }),
);
const STORAGE_KEY = "proof-scheme";

const fixtures = loadSite(FIXTURE_ROOT, ["fixture"]);
const PROVEN = ["typescript-fixture", "kotlin-fixture"] as const;
const catalogOf = (id: string) => fixtures.catalogs.find((c) => c.language.id === id)!;

/** What a consumer passes the code block: tokens it produced itself; the primitive never sees a `Highlight`. */
const tokensOf = (catalog: Catalog, code: string): CodeToken[] =>
  tokenize(code, catalog.language.highlight).map((t) => ({ text: t.text, kind: t.cls }));
const firstCode = (catalog: Catalog) => {
  for (const s of catalog.sheets) for (const c of s.cards) if (c.kind === "code") return c.code;
  throw new Error(`${catalog.language.id}: no code card`);
};

/** The consumer adapter: catalog data in, generic primitive props out. Nothing Swift-specific crosses it. */
function ProofPage({ catalog, languages }: { catalog: Catalog; languages: SiteLanguage[] }) {
  const { language } = catalog;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState(0);
  const [scheme, toggle] = useColorScheme(STORAGE_KEY);
  const options: SelectorOption[] = languages.map((l) => ({
    id: l.id,
    label: l.name,
    href: l.href,
    current: l.id === language.id,
    hint: l.id === language.id ? "current" : l.href === null ? "not built" : undefined,
    itemProps: { "data-option": l.id },
  }));
  const code = firstCode(catalog);
  return (
    <AppShell
      open={open}
      onOpenChange={setOpen}
      navLabel={`${language.name} topics`}
      menuLabel="Show topics"
      ids={{ shell: "p-shell", scrim: "p-scrim", nav: "p-nav", main: "p-main", topbar: "p-bar", menu: "p-menu" }}
      nav={
        <TopicNav
          title={language.title}
          meta={`${catalog.sheets.length} topics`}
          items={catalog.sheets.map((s) => ({ id: s.id, label: s.title, href: `#${s.id}`, group: s.group }))}
          active={catalog.sheets[0]!.id}
          onNavigate={() => setOpen(false)}
        />
      }
      bar={
        <>
          <SearchField id="p-q" value={query} onValueChange={setQuery} label={`Search ${language.name}`} placeholder="Search" />
          <DisclosureSelector label="Language" value={language.name} options={options} onOpen={() => setOpened((n) => n + 1)} />
          <ThemeToggle id="p-theme" scheme={scheme} onToggle={toggle} />
        </>
      }
    >
      <p id="p-query">{query}</p>
      <p id="p-opened">{opened}</p>
      {catalog.sheets.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.title}</h2>
        </section>
      ))}
      <CodeBlock code={code} language={language.codeLanguage} tokens={tokensOf(catalog, code)} tone="neutral" copy />
      <CodeBlock code="plain text, no tokens" language="text" />
    </AppShell>
  );
}

const tree = (catalog: Catalog) => (
  <ChakraProvider value={system}>
    <ProofPage catalog={catalog} languages={fixtures.languages} />
  </ChakraProvider>
);

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
  localStorage.clear();
  vi.useRealTimers();
});

/** Server render, then hydration, as a page load does; every recoverable error and console error is kept. */
async function load(catalog: Catalog) {
  const html = renderToString(tree(catalog));
  document.body.innerHTML = `<div id="root">${html}</div>`;
  const errors: unknown[] = [];
  const consoleErrors: unknown[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);
  try {
    await act(async () => {
      mounted = hydrateRoot(document.getElementById("root")!, tree(catalog), { onRecoverableError: (e) => errors.push(e) });
    });
  } finally {
    console.error = orig;
  }
  return { html, errors, consoleErrors };
}

const $ = (id: string) => document.getElementById(id)!;
const key = async (k: string, target: EventTarget = document.activeElement ?? document.body) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
};

describe("the primitives carry no product dependency (AC-1)", () => {
  const dir = path.join(ROOT, "src/bankai");
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(dir).filter((f) => /\.tsx?$/.test(f));
  /** Every module specifier, in any form: static `from`, bare side-effect `import`, dynamic `import()`, `require()`; either quote. */
  const specifiers = (src: string) =>
    [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!);

  it("finds every specifier form, so the rule cannot be dodged by syntax", () => {
    expect(specifiers(`import "lodash";\nimport x from 'lodash';\nawait import("gatsby-link");\nrequire("zod");\nexport { a } from "./a";`)).toEqual([
      "lodash",
      "lodash",
      "gatsby-link",
      "zod",
      "./a",
    ]);
  });

  it("import only React, Chakra UI and each other", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const s of specifiers(src)) expect(["react", "@chakra-ui/react"].includes(s) || /^\.\/[A-Za-z]+$/.test(s), `${f} imports ${s}`).toBe(true);
      // No router, no framework adapter, no content model, by name either.
      expect(src, f).not.toMatch(/gatsby|@reach\/router|react-router|\.\.\/content|\.\.\/ui/);
    }
  });

  it("keep behaviour and tokens framework-neutral: no styling engine below the Chakra layer", () => {
    const imports = (f: string) => specifiers(fs.readFileSync(path.join(dir, f), "utf8"));
    expect(imports("tokens.ts")).toEqual([]);
    expect(imports("behaviour.ts")).toEqual(["react"]);
    expect(imports("scheme.ts")).toEqual(["react"]);
  });

  it("are what the product's page composes: the product imports them, never the reverse", () => {
    const ui = ["CatalogPage.tsx", "languages.tsx", "text.tsx", "theme.ts", "hooks.ts"].map((f) => fs.readFileSync(path.join(ROOT, "src/ui", f), "utf8"));
    for (const src of ui) expect(src).toMatch(/from "\.\.\/bankai"/);
  });
});

describe.each(PROVEN)("%s through the primitives (AC-2, AC-3)", (id) => {
  const catalog = catalogOf(id);

  it("renders statically and hydrates with no mismatch, recoverable error or console error", async () => {
    const { html, errors, consoleErrors } = await load(catalog);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    // The static markup is complete with scripts off: the rail, the bar and the code are all there.
    expect(html).toContain(`aria-label="${catalog.language.name} topics"`);
    expect(document.querySelectorAll("#p-nav a[href^='#']")).toHaveLength(catalog.sheets.length);
    expect(document.querySelectorAll("#p-nav .navgroup").length).toBeGreaterThan(0);
    expect($("p-nav").querySelector("[aria-current='location']")!.getAttribute("href")).toBe(`#${catalog.sheets[0]!.id}`);
    const code = document.querySelector<HTMLElement>(`code[data-lang="${catalog.language.codeLanguage}"]`)!;
    expect(code.textContent).toBe(firstCode(catalog));
    expect(code.querySelector("span[class^='t-']")).not.toBeNull();
    expect(document.querySelector("code[data-lang='text']")!.textContent).toBe("plain text, no tokens");
    // The copy button exists only once scripts run: never a dead control in the static page.
    expect(html).not.toContain('class="copy"');
    expect(document.querySelector("button.copy")!.textContent).toBe("Copy");
  });

  it("lists every fixture language in the selector, the current one marked and not linked", async () => {
    await load(catalog);
    const items = [...document.querySelectorAll<HTMLElement>("[data-option]")];
    expect(items.map((li) => li.dataset.option)).toEqual(fixtures.languages.map((l) => l.id));
    const current = items.find((li) => li.dataset.option === id)!;
    expect(current.querySelector("a")).toBeNull();
    expect(current.querySelector("[aria-current='true']")!.textContent).toMatch(/current$/);
    for (const li of items.filter((li) => li !== current)) expect(li.querySelector("a")!.getAttribute("href")).toMatch(/^\//);
    // The toggle's accessible name carries the label and the visible value (WCAG 2.5.3).
    expect(document.querySelector("summary")!.textContent).toBe(`Language: ${catalog.language.name}▾`);
  });

  it("is operable by keyboard: shortcut and Escape on the search", async () => {
    await load(catalog);
    const q = $("p-q") as HTMLInputElement;
    await key("/", document.body);
    expect(document.activeElement).toBe(q);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(q, "collection");
      q.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect($("p-query").textContent).toBe("collection");
    // The shortcut types normally inside a field.
    await key("/", q);
    expect(document.activeElement).toBe(q);
    await key("Escape", q);
    expect($("p-query").textContent).toBe("");
    expect(document.activeElement).not.toBe(q);
  });

  it("is operable by keyboard: the selector opens, recomputes on open, and Escape returns focus to its toggle", async () => {
    await load(catalog);
    const summary = document.querySelector("summary")!;
    const details = summary.parentElement as HTMLDetailsElement;
    expect(summary.tabIndex).toBe(0);
    await act(async () => summary.click());
    expect(details.open).toBe(true);
    expect($("p-opened").textContent).toBe("1");
    const link = details.querySelector<HTMLElement>("a")!;
    link.focus();
    await key("Escape", link);
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    // Escape inside the open list goes no further: the search keeps its text.
    await act(async () => summary.click());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call($("p-q"), "kept");
      $("p-q").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(details.open).toBe(true);
    await key("Escape", details.querySelector("a")!);
    expect($("p-query").textContent).toBe("kept");
    // A press outside closes it.
    await act(async () => summary.click());
    await act(async () => $("p-main").dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(details.open).toBe(false);
  });

  it("is operable by keyboard: the drawer takes focus, makes the page inert, and gives focus back on Escape", async () => {
    await load(catalog);
    const menu = $("p-menu");
    // jsdom evaluates no media queries: show the button as the narrow layout does, so it can take focus.
    menu.style.display = "inline-flex";
    expect(menu.getAttribute("aria-controls")).toBe("p-nav");
    await act(async () => menu.click());
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect($("p-shell").hasAttribute("data-nav-open")).toBe(true);
    expect(document.activeElement).toBe($("p-nav").querySelector("a"));
    expect($("p-main").hasAttribute("inert")).toBe(true);
    await key("Escape");
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect($("p-main").hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(menu);
    // Following a rail link closes the drawer too.
    await act(async () => menu.click());
    await act(async () => $("p-nav").querySelectorAll("a")[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect($("p-shell").hasAttribute("data-nav-open")).toBe(false);
    // So does the scrim.
    await act(async () => menu.click());
    await act(async () => $("p-scrim").click());
    expect($("p-shell").hasAttribute("data-nav-open")).toBe(false);
  });
});

describe("copy feedback on the code block", () => {
  const catalog = catalogOf("kotlin-fixture");
  const status = () => document.querySelector(".codeblock [role='status']")!.textContent;

  it("copies the code, says so in the button and to assistive technology, then resets", async () => {
    const writeText = vi.fn(async () => {});
    clipboard(writeText);
    await load(catalog);
    vi.useFakeTimers();
    const button = document.querySelector<HTMLButtonElement>("button.copy")!;
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith(firstCode(catalog));
    expect(button.textContent).toBe("Copied");
    expect(button.dataset.state).toBe("copied");
    expect(status()).toBe("Copied");
    // A second success is announced again: the status text changes, invisibly.
    await act(async () => button.click());
    expect(status()).toBe("Copied\u00a0");
    await act(async () => vi.advanceTimersByTime(2000));
    expect(button.textContent).toBe("Copy");
    expect(status()).toBe("");
  });

  it("says when copying failed and how to copy instead, and holds that until the next press", async () => {
    clipboard(async () => {
      throw new Error("denied");
    });
    await load(catalog);
    vi.useFakeTimers();
    const button = document.querySelector<HTMLButtonElement>("button.copy")!;
    await act(async () => button.click());
    expect(button.dataset.state).toBe("failed");
    expect(button.textContent).toBe("Copy failed — select the text");
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(button.dataset.state).toBe("failed");
  });

  it("shows no button where the clipboard is unavailable", async () => {
    clipboard(undefined);
    await load(catalog);
    expect(document.querySelector("button.copy")).toBeNull();
  });

  it("takes the consumer's own labels, keeps a default for any left undefined, and names what it copies", async () => {
    clipboard(async () => {
      throw new Error("denied");
    });
    const block = (
      <ChakraProvider value={system}>
        <CodeBlock code="x" language="text" copy={{ idle: "Copiar", copied: undefined, context: "snippet de Kotlin" }} />
      </ChakraProvider>
    );
    document.body.innerHTML = `<div id="root">${renderToString(block)}</div>`;
    await act(async () => {
      mounted = hydrateRoot(document.getElementById("root")!, block);
    });
    const button = document.querySelector<HTMLButtonElement>("button.copy")!;
    expect(button.textContent).toBe("Copiar snippet de Kotlin");
    // The visible label stays the start of the accessible name (WCAG 2.5.3).
    expect(button.firstChild!.textContent).toBe("Copiar");
    await act(async () => button.click());
    expect(button.firstChild!.textContent).toBe("Copy failed — select the text");
  });

  it("sets nothing when the block is gone before the clipboard answers", async () => {
    let resolve!: () => void;
    clipboard(() => new Promise<void>((r) => (resolve = r)));
    await load(catalog);
    const orig = console.error;
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const button = document.querySelector<HTMLButtonElement>("button.copy")!;
      act(() => button.click());
      act(() => mounted!.unmount());
      mounted = null;
      vi.useFakeTimers();
      await act(async () => resolve());
      expect(vi.getTimerCount()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      console.error = orig;
    }
  });
});

describe("the drawer and the search keys, at the edges", () => {
  const catalog = catalogOf("typescript-fixture");

  it("closes the drawer when the window widens past the breakpoint, and stops listening on unmount", async () => {
    const listeners = new Set<() => void>();
    const mql = {
      matches: false,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    };
    const matchMedia = vi.fn(() => mql);
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      await load(catalog);
      expect(matchMedia).toHaveBeenCalledWith("(min-width: 901px)");
      $("p-menu").style.display = "inline-flex";
      await act(async () => $("p-menu").click());
      expect($("p-shell").hasAttribute("data-nav-open")).toBe(true);
      mql.matches = true;
      await act(async () => listeners.forEach((l) => l()));
      expect($("p-shell").hasAttribute("data-nav-open")).toBe(false);
      act(() => mounted!.unmount());
      mounted = null;
      expect(listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lets a consumer turn the search shortcut off", async () => {
    const field = (
      <ChakraProvider value={system}>
        <SearchField id="off-q" value="" onValueChange={() => {}} label="Search" placeholder="Search" shortcut={false} />
      </ChakraProvider>
    );
    document.body.innerHTML = `<div id="root">${renderToString(field)}</div>`;
    await act(async () => {
      mounted = hydrateRoot(document.getElementById("root")!, field);
    });
    await key("/", document.body);
    expect(document.activeElement).not.toBe($("off-q"));
  });
});

describe("both schemes (AC-3)", () => {
  const catalog = catalogOf("typescript-fixture");
  const styles = () => [...document.querySelectorAll("style")].map((s) => s.textContent).join("");

  it("defines the consumer's dark palette on :root and its light palette under data-theme", async () => {
    await load(catalog);
    const css = styles();
    expect(css).toContain(`--bg:${DARK.bg}`);
    expect(css).toMatch(new RegExp(`html\\[data-theme="light"\\]\\{[^}]*--bg:${LIGHT.bg}`));
    expect(css).toContain("--chakra-colors-cs-fg:var(--fg)");
  });

  it("starts dark, toggles to light and back, and remembers the choice", async () => {
    await load(catalog);
    const toggle = $("p-theme");
    expect(toggle.getAttribute("aria-label")).toBe("Switch to light theme");
    await act(async () => toggle.click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(toggle.getAttribute("aria-label")).toBe("Switch to dark theme");
    await act(async () => toggle.click());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("applies a stored light scheme before paint and hydrates into it with no mismatch", async () => {
    localStorage.setItem(STORAGE_KEY, "light");
    new Function(schemeInitScript(STORAGE_KEY))();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.className).toBe("light");
    const { errors, consoleErrors } = await load(catalog);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect($("p-theme").getAttribute("aria-label")).toBe("Switch to dark theme");
  });

  it("ignores anything stored that is not a scheme, and survives storage that throws", () => {
    localStorage.setItem(STORAGE_KEY, "sepia");
    new Function(schemeInitScript(STORAGE_KEY))();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => new Function(schemeInitScript(STORAGE_KEY))()).not.toThrow();
    get.mockRestore();
  });
});

describe("the pre-paint script's storage key", () => {
  it("refuses a key that could end the script element, and accepts a plain identifier", () => {
    expect(() => schemeInitScript("</script><script>alert(1)//")).toThrow(/storage key must match/);
    expect(() => schemeInitScript("")).toThrow();
    expect(schemeInitScript("cheat-theme")).not.toMatch(/<\//);
  });
});

describe("generated ids", () => {
  it("give two selectors on one page distinct, hydration-stable ids", async () => {
    const two = (
      <ChakraProvider value={system}>
        <DisclosureSelector label="A" value="a" options={[{ id: "a", label: "a", href: null, current: true }]} />
        <DisclosureSelector label="B" value="b" options={[{ id: "b", label: "b", href: "/b" }]} />
      </ChakraProvider>
    );
    document.body.innerHTML = `<div id="root">${renderToString(two)}</div>`;
    const errors: unknown[] = [];
    await act(async () => {
      mounted = hydrateRoot(document.getElementById("root")!, two, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    const ids = [...document.querySelectorAll("nav, details, summary, ul")].map((e) => e.id);
    expect(new Set(ids).size).toBe(8);
  });
});
