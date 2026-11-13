// @vitest-environment jsdom
/**
 * The language selector and language-scoped catalogs (zheref/swift-cheatsheets#2):
 * the registry, the four configured languages proved through fixture catalogs
 * (SC-1), concept-preserving switches (AC-2), the absence state (AC-3), addresses
 * that restore on reload and history (AC-4), the selector's keyboard and
 * screen-reader behaviour (AC-5), and search and highlighting scoped to the
 * active language (AC-1).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPages } from "../gatsby-node";
import { offlineFile, offlineLanguages } from "../src/adapters/offline/paths";
import { PAGE_IDS } from "../src/content/ids";
import { readArrival, relatedTopics, sheetOfHash, soleLanguage, switchLink } from "../src/content/languages";
import { CatalogError, loadRegistry, loadSite } from "../src/content/load";
import type { Catalog, SiteLanguage } from "../src/content/schema";
import { buildIndex, search } from "../src/content/search";
import { CatalogPage } from "../src/ui/CatalogPage";
import { UiProvider } from "../src/ui/Provider";
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
  // jsdom has no layout, so no scrolling either.
  Element.prototype.scrollIntoView ??= function () {};
});

const CONFIGURED = ["swift", "typescript", "kotlin", "csharp"];
const fixtures = loadSite(FIXTURE_ROOT, ["fixture"]);
const published = loadSite(path.join(ROOT, "content"));
const catalogOf = (id: string) => fixtures.catalogs.find((c) => c.language.id === id)!;
const languageOf = (id: string) => fixtures.languages.find((l) => l.id === id)!;

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  window.history.replaceState(null, "", "/");
});

/** Renders on the server, then hydrates in the browser at `url`, as a page load does. */
async function open(catalog: Catalog, languages: SiteLanguage[], url = catalog.language.route) {
  act(() => mounted?.unmount());
  window.history.replaceState(null, "", url);
  const page = (
    <UiProvider>
      <CatalogPage catalog={catalog} languages={languages} />
    </UiProvider>
  );
  document.body.innerHTML = `<div id="root">${renderToString(page)}</div>`;
  const errors: unknown[] = [];
  await act(async () => {
    mounted = hydrateRoot(document.getElementById("root")!, page, { onRecoverableError: (e) => errors.push(e) });
  });
  expect(errors).toEqual([]);
}

const options = () =>
  [...document.querySelectorAll<HTMLElement>("#langlist > li")].map((li) => ({
    id: li.dataset.langOption,
    state: li.dataset.state,
    match: li.dataset.match,
    href: li.querySelector("a")?.getAttribute("href") ?? null,
    text: li.textContent,
  }));
const toggle = () => document.getElementById("lang-toggle")!;
/** Opens the selector, which is when it reads the reader's topic. */
const openSelector = async () => {
  if (details().open) await act(async () => toggle().click());
  await act(async () => toggle().click());
};
const details = () => document.getElementById("langmenu") as HTMLDetailsElement;
const typeQuery = async (value: string) => {
  const q = document.getElementById("q") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(q, value);
    q.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const visibleCards = () => [...document.querySelectorAll<HTMLElement>("article.card")].filter((c) => !c.hidden);

describe("the registry", () => {
  it("configures Swift, TypeScript, Kotlin and C#, in that order", () => {
    expect(loadRegistry(path.join(ROOT, "content")).languages).toEqual([
      { id: "swift", name: "Swift" },
      { id: "typescript", name: "TypeScript" },
      { id: "kotlin", name: "Kotlin" },
      { id: "csharp", name: "C#" },
    ]);
  });

  it("publishes all four, each at its own route with its own topics (zheref/swift-cheatsheets#3)", () => {
    expect(published.catalogs.map((c) => c.language.id)).toEqual(["swift", "csharp", "kotlin", "typescript"]);
    expect(published.languages.map(({ id, href }) => ({ id, href }))).toEqual([
      { id: "swift", href: "/" },
      { id: "typescript", href: "/typescript/" },
      { id: "kotlin", href: "/kotlin/" },
      { id: "csharp", href: "/csharp/" },
    ]);
    expect(published.languages[0]!.topics).toHaveLength(29);
    expect(published.languages.every((l) => l.topics.length > 0)).toBe(true);
  });

  it("has one fixture catalog standing in for each configured language, in the same order (SC-1)", () => {
    expect(fixtures.languages.map((l) => l.id)).toEqual(CONFIGURED.map((id) => `${id}-fixture`));
    expect(fixtures.languages.map((l) => catalogOf(l.id).language.codeLanguage)).toEqual(CONFIGURED);
    expect(fixtures.catalogs.every((c) => c.language.status === "fixture")).toBe(true);
  });

  const root = (registry: string | null, mutate?: (dir: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "registry-"));
    fs.cpSync(path.join(FIXTURE_ROOT, "languages"), path.join(dir, "languages"), { recursive: true });
    if (registry !== null) fs.writeFileSync(path.join(dir, "registry.yaml"), registry);
    mutate?.(dir);
    return dir;
  };
  const refusal = (dir: string) => {
    try {
      loadSite(dir, ["fixture"]);
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      return (e as CatalogError).problems.join("\n");
    }
    throw new Error("expected the site to be refused");
  };
  const all = fs.readFileSync(path.join(FIXTURE_ROOT, "registry.yaml"), "utf8");

  it("refuses a missing registry, a malformed one, and duplicate ids", () => {
    expect(refusal(root(null))).toMatch(/registry\.yaml: missing/);
    expect(refusal(root("languages: [\n"))).toMatch(/registry\.yaml:/);
    expect(refusal(root("languages:\n  - id: Swift\n    name: Swift\n"))).toMatch(/languages\.0\.id: must be a lowercase kebab-case slug/);
    expect(refusal(root(`${all}  - id: swift-fixture\n    name: Swift (fixture)\n`))).toMatch(/duplicate language ids swift-fixture/);
  });

  it("refuses a built catalog the registry omits or names differently", () => {
    expect(refusal(root(all.replace(/ {2}- id: csharp-fixture\n {4}name: C# \(fixture\)\n/, "")))).toMatch(
      /catalog 'csharp-fixture' is built but not listed/,
    );
    expect(refusal(root(all.replace("name: C# (fixture)", "name: C Sharp")))).toMatch(/'csharp-fixture' is named 'C Sharp' but its catalog says 'C# \(fixture\)'/);
  });

  it("lists a registry language whose catalog is not built as unavailable", () => {
    const dir = root(all, (d) => {
      const lang = path.join(d, "languages/csharp-fixture/language.yaml");
      fs.writeFileSync(lang, fs.readFileSync(lang, "utf8").replace("status: fixture", "status: draft"));
    });
    const site = loadSite(dir, ["fixture"]);
    expect(site.catalogs.map((c) => c.language.id)).not.toContain("csharp-fixture");
    expect(site.languages.find((l) => l.id === "csharp-fixture")).toMatchObject({ href: null, topics: [] });
  });
});

describe("switching languages, as pure functions", () => {
  const kotlin = languageOf("kotlin-fixture");

  it("links to the equivalent sheet by concept, not by sheet id (AC-2)", () => {
    expect(switchLink(kotlin, "concurrency.async-await", "swift-fixture")).toEqual({
      href: "/kotlin-fixture/#fixture-concurrency",
      match: { concept: "concurrency.async-await", sheet: "fixture-concurrency", title: "Fixture — Coroutines" },
    });
  });

  it("carries an absent concept and its origin in the query (AC-3)", () => {
    expect(switchLink(kotlin, "concurrency.isolation", "swift-fixture")).toEqual({
      href: "/kotlin-fixture/?from=swift-fixture&concept=concurrency.isolation",
      match: null,
    });
  });

  it("lands on the top with no topic, links nothing for an unpublished language, and never re-targets the current one", () => {
    expect(switchLink(kotlin, null, "swift-fixture")).toEqual({ href: "/kotlin-fixture/", match: null });
    expect(switchLink({ ...kotlin, href: null }, "concurrency.async-await", "swift-fixture")).toEqual({ href: null, match: null });
    expect(switchLink(kotlin, "concurrency.async-await", "kotlin-fixture")).toEqual({ href: "/kotlin-fixture/", match: null });
  });

  it("reads an arrival from the query and ignores anything malformed", () => {
    expect(readArrival("?from=swift-fixture&concept=concurrency.isolation")).toEqual({ from: "swift-fixture", concept: "concurrency.isolation" });
    for (const q of ["", "?from=swift-fixture", "?concept=a.b", "?from=Swift&concept=a.b", "?from=swift&concept=<script>", "?from=swift&concept=a..b"]) {
      expect(readArrival(q), q).toBeNull();
    }
  });

  it("offers related topics first, every topic when none is related", () => {
    const ts = languageOf("typescript-fixture").topics;
    expect(relatedTopics(ts, "concurrency.isolation")).toEqual({ related: true, topics: [ts[1]] });
    expect(relatedTopics(ts, "platform.bluetooth-le")).toEqual({ related: false, topics: ts });
  });

  it("reads the sheet from a sheet or card hash", () => {
    expect(sheetOfHash("#conc-core")).toBe("conc-core");
    expect(sheetOfHash("#conc-core--sendable")).toBe("conc-core");
    expect(sheetOfHash("")).toBe("");
  });

  it("gives a page rendered alone a selector of one", () => {
    const k = catalogOf("kotlin-fixture");
    expect(soleLanguage(k)).toEqual(languageOf("kotlin-fixture"));
  });
});

describe("routes and selector for all four configured languages (SC-1)", () => {
  it("creates one page per fixture language from one template, each with the whole fixture registry", async () => {
    const createPage = vi.fn();
    const prev = process.env.CHEATSHEETS_FIXTURES;
    process.env.CHEATSHEETS_FIXTURES = "1";
    try {
      await (createPages as (a: unknown) => Promise<void>)({ actions: { createPage }, reporter: { info: vi.fn() } });
    } finally {
      if (prev === undefined) delete process.env.CHEATSHEETS_FIXTURES;
      else process.env.CHEATSHEETS_FIXTURES = prev;
    }
    const pages = createPage.mock.calls.map(([p]) => p as { path: string; context: { catalog: Catalog; languages: SiteLanguage[] } });
    const fixturePages = pages.filter((p) => p.context.catalog.language.status === "fixture");
    expect(fixturePages.map((p) => p.path).sort()).toEqual(CONFIGURED.map((id) => `/${id}-fixture/`).sort());
    for (const p of fixturePages) {
      expect(p.context.languages.map((l) => l.href)).toEqual(CONFIGURED.map((id) => `/${id}-fixture/`));
    }
    // The published page's selector never links to a fixture, and no fixture page links to it.
    const swift = pages.find((p) => p.path === "/")!;
    expect(swift.context.languages.map((l) => l.id)).toEqual(CONFIGURED);
    expect(JSON.stringify(swift.context.languages)).not.toMatch(/fixture/);
    expect(fixturePages.every((p) => !p.context.languages.some((l) => l.href === "/"))).toBe(true);
  });

  for (const id of CONFIGURED) {
    const fixture = `${id}-fixture`;
    it(`${fixture}: the selector names the language, marks it current, and links the other three`, async () => {
      await open(catalogOf(fixture), fixtures.languages);
      const opts = options();
      expect(opts.map((o) => o.id)).toEqual(CONFIGURED.map((c) => `${c}-fixture`));
      for (const o of opts) {
        if (o.id === fixture) {
          expect(o.state).toBe("current");
          expect(o.href).toBeNull();
        } else {
          expect(o.state).toBe("available");
          expect(o.href).toBe(`/${o.id}/`);
        }
      }
      expect(document.querySelector("#langlist [aria-current='true']")!.textContent).toContain(languageOf(fixture).name);
      expect(toggle().textContent).toBe(`Language: ${languageOf(fixture).name}`);
      expect(document.getElementById("shell")!.dataset.lang).toBe(fixture);
      expect(document.getElementById("fixture-note")!.textContent).toMatch(/not reference material/);
    });
  }
});

describe("the selected concept survives a switch (AC-2) or its absence is explained (AC-3)", () => {
  it("points each language at its own sheet for the reader's concept", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages, "/swift-fixture/#swift-concurrency");
    await openSelector();
    expect(options().filter((o) => o.state === "available")).toEqual([
      expect.objectContaining({ id: "typescript-fixture", match: "same", href: "/typescript-fixture/#ts-async" }),
      expect.objectContaining({ id: "kotlin-fixture", match: "same", href: "/kotlin-fixture/#fixture-concurrency" }),
      expect.objectContaining({
        id: "csharp-fixture",
        match: "absent",
        href: "/csharp-fixture/?from=swift-fixture&concept=concurrency.async-await",
      }),
    ]);
    expect(options()[1]!.text).toContain("same topic: Fixture — TypeScript promises");
    expect(options()[3]!.text).toContain("no equivalent topic yet");
  });

  it("reads the reader's topic each time it opens: a card hash, then a new hash", async () => {
    await open(catalogOf("kotlin-fixture"), fixtures.languages, "/kotlin-fixture/#fixture-collections--costs");
    // Closed (and with scripts off) the links go to each language's top.
    expect(options().find((o) => o.id === "csharp-fixture")!.href).toBe("/csharp-fixture/");
    await openSelector();
    expect(options().find((o) => o.id === "csharp-fixture")!.href).toBe("/csharp-fixture/#cs-collections");
    window.history.replaceState(null, "", "/kotlin-fixture/#fixture-concurrency");
    await openSelector();
    expect(options().find((o) => o.id === "swift-fixture")!.href).toBe("/swift-fixture/#swift-concurrency");
  });

  it("follows the scroll once the named sheet is off screen, and a filtered-out sheet is never the topic", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages, "/swift-fixture/#swift-collections");
    const place = (id: string, top: number) =>
      vi.spyOn(document.getElementById(id)!, "getBoundingClientRect").mockReturnValue({ top, bottom: top + 300 } as DOMRect);
    // The one-row desktop bar, as drawn.
    vi.spyOn(document.getElementById("topbar")!, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 61 } as DOMRect);
    place("swift-collections", -900);
    place("swift-concurrency", -400);
    place("swift-isolation", 40);
    Object.defineProperty(window, "scrollY", { value: 1200, configurable: true });
    try {
      await openSelector();
      expect(options().find((o) => o.id === "typescript-fixture")!.href).toBe("/typescript-fixture/?from=swift-fixture&concept=concurrency.isolation");
      document.getElementById("swift-isolation")!.hidden = true;
      await openSelector();
      expect(options().find((o) => o.id === "typescript-fixture")!.href).toBe("/typescript-fixture/#ts-async");
    } finally {
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
      vi.restoreAllMocks();
    }
  });

  it("measures the bar as drawn: under the two-row narrow bar, a sheet hidden behind it is not the topic", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages, "/swift-fixture/");
    const place = (id: string, top: number, bottom = top + 300) =>
      vi.spyOn(document.getElementById(id)!, "getBoundingClientRect").mockReturnValue({ top, bottom } as DOMRect);
    // The narrow layout's two-row bar reaches 119px; the concurrency sheet ends behind it at 100px,
    // and the isolation sheet's top sits just under the bar, at 100px — with 80px assumed, concurrency won.
    vi.spyOn(document.getElementById("topbar")!, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 119 } as DOMRect);
    place("swift-collections", -900);
    place("swift-concurrency", -200, 100);
    place("swift-isolation", 100);
    Object.defineProperty(window, "scrollY", { value: 1200, configurable: true });
    try {
      await openSelector();
      expect(options().find((o) => o.id === "typescript-fixture")!.href).toBe("/typescript-fixture/?from=swift-fixture&concept=concurrency.isolation");
    } finally {
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
      vi.restoreAllMocks();
    }
  });

  it("links to each language's top from an unscrolled page with no topic", async () => {
    await open(catalogOf("typescript-fixture"), fixtures.languages);
    await openSelector();
    expect(options().filter((o) => o.state === "available").map((o) => [o.href, o.match])).toEqual([
      ["/swift-fixture/", undefined],
      ["/kotlin-fixture/", undefined],
      ["/csharp-fixture/", undefined],
    ]);
  });

  it("explains a missing concept on arrival, names its origin, offers related topics, and takes focus", async () => {
    await open(catalogOf("typescript-fixture"), fixtures.languages, "/typescript-fixture/?from=swift-fixture&concept=concurrency.isolation");
    const notice = document.getElementById("absence")!;
    expect(document.getElementById("absence-title")!.textContent).toBe("No TypeScript (fixture) equivalent for “Fixture — Swift actors”");
    expect(notice.textContent).toContain("You switched from Swift (fixture), on a topic this TypeScript (fixture) catalog does not cover yet.");
    // The concept id is internal; the heading names the topic by title.
    expect(notice.querySelector("p")!.textContent).not.toContain("concurrency.isolation");
    expect(notice.textContent).toContain("Related TypeScript (fixture) topics:");
    expect([...notice.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#ts-async"]);
    expect(document.activeElement).toBe(notice);
    expect(notice.getAttribute("aria-labelledby")).toBe("absence-title");
  });

  it("offers every topic when none is related, and names a concept whose origin is unknown", async () => {
    await open(catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=elsewhere&concept=concurrency.async-await");
    const notice = document.getElementById("absence")!;
    expect(document.getElementById("absence-title")!.textContent).toBe("No C# (fixture) equivalent for “concurrency.async-await”");
    expect(notice.textContent).toContain("You arrived on a topic");
    expect(notice.textContent).toContain("Every C# (fixture) topic:");
    expect([...notice.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#cs-collections", "#cs-patterns"]);
  });

  it("dismisses the notice, drops the query so a reload does not repeat it, and hands focus to the toggle", async () => {
    await open(catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=kotlin-fixture&concept=concurrency.async-await#cs-patterns");
    const dismiss = document.getElementById("absence-dismiss")!;
    dismiss.focus();
    await act(async () => dismiss.click());
    expect(document.getElementById("absence")).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.pathname + window.location.hash).toBe("/csharp-fixture/#cs-patterns");
    expect(document.activeElement).toBe(toggle());
  });

  it("does not pull focus back to the notice when history only moves the hash", async () => {
    await open(catalogOf("kotlin-fixture"), fixtures.languages, "/kotlin-fixture/?from=swift-fixture&concept=concurrency.isolation");
    expect(document.activeElement!.id).toBe("absence");
    const q = document.getElementById("q")!;
    q.focus();
    await act(async () => {
      window.history.pushState(null, "", "/kotlin-fixture/?from=swift-fixture&concept=concurrency.isolation#fixture-collections");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(document.getElementById("absence")).not.toBeNull();
    expect(document.activeElement).toBe(q);
  });

  it("reads a hand-made link claiming to come from this same language as an unknown origin", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages, "/swift-fixture/?from=swift-fixture&concept=platform.bluetooth-le");
    const notice = document.getElementById("absence")!;
    expect(notice.textContent).toContain("You arrived on a topic");
    expect(notice.textContent).not.toContain("You switched from Swift (fixture)");
  });

  it("choosing an offered topic retires the notice and goes to the topic", async () => {
    await open(catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=kotlin-fixture&concept=concurrency.async-await");
    await act(async () => (document.querySelector("#absence a[href='#cs-patterns']") as HTMLElement).click());
    expect(document.getElementById("absence")).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#cs-patterns");
  });

  it("choosing an offered topic that the current search hides clears the search first, then navigates", async () => {
    await open(catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=kotlin-fixture&concept=concurrency.async-await");
    await typeQuery("zzz-nothing");
    expect(document.getElementById("cs-patterns")!.hidden).toBe(true);
    await act(async () => (document.querySelector("#absence a[href='#cs-patterns']") as HTMLElement).click());
    expect((document.getElementById("q") as HTMLInputElement).value).toBe("");
    expect(document.getElementById("cs-patterns")!.hidden).toBe(false);
    expect(window.location.hash).toBe("#cs-patterns");
    expect(document.getElementById("absence")).toBeNull();
  });

  it("Dismiss leaves the search alone", async () => {
    await open(catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=kotlin-fixture&concept=concurrency.async-await");
    await typeQuery("list");
    await act(async () => document.getElementById("absence-dismiss")!.click());
    expect((document.getElementById("q") as HTMLInputElement).value).toBe("list");
  });

  it("lands on the sheet when a ?concept= link names one this catalog has", async () => {
    await open(catalogOf("kotlin-fixture"), fixtures.languages, "/kotlin-fixture/?from=swift-fixture&concept=concurrency.async-await");
    expect(document.getElementById("absence")).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#fixture-concurrency");
  });
});

describe("page ids never shadow a sheet anchor", () => {
  it("renders only reserved page ids besides sheet and card anchors, each once", async () => {
    const swift = published.catalogs[0]!;
    const pages: [Catalog, SiteLanguage[], string][] = [
      [swift, published.languages, "/#lang"],
      [catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=kotlin-fixture&concept=concurrency.async-await"],
    ];
    for (const [catalog, languages, url] of pages) {
      await open(catalog, languages, url);
      await typeQuery("zzz-nothing"); // the empty state renders too
      // Diagram-internal SVG ids (markers) are each diagram's own and out of scope here.
      const ids = [...document.querySelectorAll("[id]")].filter((e) => !e.closest("svg.dg")).map((e) => e.id).filter((id) => id !== "root");
      expect(ids.filter((id, i) => ids.indexOf(id) !== i), catalog.language.id).toEqual([]);
      const sheets = new Set(catalog.sheets.map((s) => s.id));
      const chrome = ids.filter((id) => !sheets.has(id) && !id.includes("--"));
      expect(chrome.filter((id) => !(PAGE_IDS as readonly string[]).includes(id)), catalog.language.id).toEqual([]);
    }
    // Swift's own `lang` sheet keeps its anchor: the saved #lang link lands on the section.
    await open(swift, published.languages, "/#lang");
    expect(document.getElementById("lang")!.tagName).toBe("SECTION");
    expect(published.catalogs.flatMap((c) => c.sheets).filter((s) => (PAGE_IDS as readonly string[]).includes(s.id))).toEqual([]);
  });
});

describe("addresses restore the same language and topic (AC-4)", () => {
  it("a reload of the same address renders the same language, topic and notice", async () => {
    const url = "/kotlin-fixture/?from=swift-fixture&concept=concurrency.isolation";
    const snapshot = () => ({
      lang: document.getElementById("shell")!.dataset.lang,
      title: document.getElementById("absence-title")?.textContent,
      links: options().map((o) => o.href),
    });
    await open(catalogOf("kotlin-fixture"), fixtures.languages, url);
    await openSelector();
    const first = snapshot();
    await open(catalogOf("kotlin-fixture"), fixtures.languages, url);
    await openSelector();
    expect(snapshot()).toEqual(first);
    expect(first.lang).toBe("kotlin-fixture");
    expect(first.title).toContain("Fixture — Swift actors");

    await open(catalogOf("swift-fixture"), fixtures.languages, "/swift-fixture/#swift-isolation");
    await openSelector();
    const before = options().map((o) => o.href);
    await open(catalogOf("swift-fixture"), fixtures.languages, "/swift-fixture/#swift-isolation");
    await openSelector();
    expect(options().map((o) => o.href)).toEqual(before);
    expect(before[1]).toBe("/typescript-fixture/?from=swift-fixture&concept=concurrency.isolation");
  });

  it("back and forward re-read the address: the notice follows the history entry", async () => {
    await open(catalogOf("kotlin-fixture"), fixtures.languages, "/kotlin-fixture/#fixture-collections");
    expect(document.getElementById("absence")).toBeNull();
    await act(async () => {
      window.history.pushState(null, "", "/kotlin-fixture/?from=swift-fixture&concept=concurrency.isolation");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(document.getElementById("absence")).not.toBeNull();
    await act(async () => {
      window.history.replaceState(null, "", "/kotlin-fixture/#fixture-collections");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(document.getElementById("absence")).toBeNull();
  });
});

describe("the selector by keyboard and screen reader (AC-5)", () => {
  it("is a labelled navigation landmark whose toggle names the selected language", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages);
    const nav = document.getElementById("langnav")!;
    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("Language");
    expect(toggle().tagName).toBe("SUMMARY");
    expect(toggle().tabIndex).toBe(0);
    // The visible name is part of the accessible one (WCAG 2.5.3), and the caret — a vector icon — is hidden from it.
    expect(toggle().querySelector("svg[aria-hidden='true']")).not.toBeNull();
    // The search is its own landmark, no longer wrapping the selector.
    expect(document.querySelector("[role='search'] #q")).not.toBeNull();
    expect(document.querySelector("[role='search'] #langnav")).toBeNull();
  });

  it("opens from its toggle, closes with Escape back onto the toggle, and leaves the search alone", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages);
    await typeQuery("actor");
    toggle().focus();
    await act(async () => toggle().click());
    expect(details().open).toBe(true);
    const link = document.querySelector<HTMLElement>("#langlist a")!;
    link.focus();
    await act(async () => {
      link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(details().open).toBe(false);
    expect(document.activeElement).toBe(toggle());
    expect((document.getElementById("q") as HTMLInputElement).value).toBe("actor");
  });

  it("closes when the pointer or focus goes elsewhere", async () => {
    await open(catalogOf("swift-fixture"), fixtures.languages);
    await act(async () => toggle().click());
    expect(details().open).toBe(true);
    await act(async () => document.getElementById("main")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(details().open).toBe(false);
    await act(async () => toggle().click());
    await act(async () => (document.getElementById("q") as HTMLElement).focus());
    expect(details().open).toBe(false);
  });

  it("states an unpublished language as unavailable, without a link to follow", async () => {
    // The real registry with Kotlin and C# not built, as a build that skips them would see it.
    const unbuilt = published.languages.map((l) => (l.id === "kotlin" || l.id === "csharp" ? { ...l, href: null, topics: [] } : l));
    await open(published.catalogs[0]!, unbuilt);
    const opts = options();
    expect(opts.map((o) => [o.id, o.state, o.href?.replace(/[?#].*$/, "") ?? null])).toEqual([
      ["swift", "current", null],
      ["typescript", "available", "/typescript/"],
      ["kotlin", "unavailable", null],
      ["csharp", "unavailable", null],
    ]);
    for (const li of document.querySelectorAll("#langlist [data-state='unavailable'] > span")) {
      // No link to follow, and the visible hint carries the state (aria-disabled is not allowed on a generic span).
      expect(li.hasAttribute("aria-disabled")).toBe(false);
      expect(li.textContent).toMatch(/not yet published$/);
    }
    expect(document.getElementById("fixture-note")).toBeNull();
  });

  it("gives every control a touch-sized target on narrow screens and coarse pointers, and a visible focus ring", async () => {
    await open(catalogOf("csharp-fixture"), fixtures.languages, "/csharp-fixture/?from=kotlin-fixture&concept=concurrency.async-await");
    const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
    const rule = (el: Element, body: string) => css.includes(`.${el.classList[0]}${body}`);
    const touch = (el: Element, decl: string) => css.includes(`@media (max-width: 900px),(pointer: coarse){.${el.classList[0]}{${decl};}}`);
    // UX-3: 44px on the ≤900px layout and on any coarse pointer — the toggle, every option, every offered topic, Dismiss.
    expect(touch(toggle(), "min-height:44px")).toBe(true);
    expect(touch(document.getElementById("absence-dismiss")!, "min-height:44px")).toBe(true);
    const targets = [...document.querySelectorAll("#langlist > li > *"), ...document.querySelectorAll("#absence li > a")];
    expect(targets).toHaveLength(6);
    for (const el of targets) expect(touch(el, "min-height:44px"), el.textContent!).toBe(true);
    for (const el of [toggle(), document.querySelector("#langlist a")!, document.querySelector("#absence li > a")!, document.getElementById("absence-dismiss")!]) {
      expect(rule(el, ":is(:focus-visible, [data-focus-visible]){outline:2px solid var(--accent)"), el.textContent!).toBe(true);
    }
    // Offered topics sit one spacing step (0.5rem, 8px at the default size) apart.
    expect(css).toMatch(new RegExp(`\\.${document.querySelector("#absence ul")!.classList[0]}\\{[^}]*gap:var\\(--chakra-spacing-2\\)`));
  });
});

describe("search and highlighting are scoped to the active language (AC-1)", () => {
  for (const id of CONFIGURED) {
    const fixture = `${id}-fixture`;
    it(`${fixture}: a query shared by all four returns only this language's cards`, async () => {
      const catalog = catalogOf(fixture);
      const own = new Set(catalog.sheets.flatMap((s) => s.cards.map((c) => `${s.id}/${c.id}`)));
      // At the model: every hit is one of this catalog's own cards.
      const hits = search(buildIndex(catalog), "collection");
      expect(hits.count).toBeGreaterThan(0);
      expect([...hits.visibleCards!].filter((k) => !own.has(k))).toEqual([]);
      // On the page: every visible snippet is highlighted as this language.
      await open(catalog, fixtures.languages);
      await typeQuery("collection");
      const shown = visibleCards();
      expect(shown.length).toBe(hits.count);
      const langs = new Set(shown.flatMap((c) => [...c.querySelectorAll("code[data-lang]")].map((e) => e.getAttribute("data-lang"))));
      expect([...langs]).toEqual([catalog.language.codeLanguage]);
      expect(document.getElementById("q")!.getAttribute("aria-label")).toBe(`Search all ${catalog.language.name} sheets`);
    });
  }

  it("finds nothing of another language's, and says so", async () => {
    await open(catalogOf("typescript-fixture"), fixtures.languages);
    await typeQuery("suspend");
    expect(visibleCards()).toEqual([]);
    expect(document.getElementById("hits")!.textContent).toBe("0 cards matching “suspend”");
    expect(document.getElementById("empty")!.textContent).toContain("No TypeScript (fixture) card matches. Search covers this language only");
  });

  it("highlights each language's snippets with its own keywords", async () => {
    const keywords = async (id: string) => {
      await open(catalogOf(id), fixtures.languages);
      return new Set([...document.querySelectorAll(".t-kw")].map((e) => e.textContent));
    };
    expect(await keywords("swift-fixture")).toEqual(new Set(["let", "func", "async", "actor", "var"]));
    expect(await keywords("typescript-fixture")).toEqual(new Set(["const", "async", "function", "return", "typeof"]));
    expect(await keywords("csharp-fixture")).toEqual(new Set(["var", "new", "is", "return"]));
    // `var` is a keyword in Swift and C#, `const` only in TypeScript: nothing is borrowed across catalogs.
    expect([...(await keywords("kotlin-fixture"))]).not.toContain("const");
  });
});

describe("offline files link to each other by relative path", () => {
  const site = { catalogs: fixtures.catalogs, languages: fixtures.languages };
  const asDefault = (id: string) => ({ ...catalogOf(id), language: { ...catalogOf(id).language, route: "/" } });

  it("names each catalog's file", () => {
    expect(offlineFile({ id: "swift", route: "/" })).toBe("index.html");
    expect(offlineFile({ id: "kotlin", route: "/kotlin/" })).toBe("offline/kotlin.html");
  });

  it("rewrites every route to a path relative to the file the selector is in", () => {
    const swift = asDefault("swift-fixture");
    const catalogs = [swift, ...site.catalogs.filter((c) => c.language.id !== "swift-fixture")];
    expect(offlineLanguages(site.languages, catalogs, swift).map((l) => l.href)).toEqual([
      "index.html",
      "offline/typescript-fixture.html",
      "offline/kotlin-fixture.html",
      "offline/csharp-fixture.html",
    ]);
    expect(offlineLanguages(site.languages, catalogs, catalogOf("kotlin-fixture")).map((l) => l.href)).toEqual([
      "../index.html",
      "typescript-fixture.html",
      "kotlin-fixture.html",
      "csharp-fixture.html",
    ]);
    expect(offlineLanguages(site.languages, [swift], swift).map((l) => l.href)).toEqual(["index.html", null, null, null]);
  });
});
