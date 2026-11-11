// @vitest-environment jsdom
/**
 * Static rendering, hydration and interaction of the shared page (AC-3, AC-4),
 * plus the offline artifact opened straight from disk (AC-5).
 */
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCatalog } from "../src/content/load";
import type { Catalog } from "../src/content/schema";
import { CatalogPage } from "../src/ui/CatalogPage";
import { UiProvider } from "../src/ui/Provider";
import { FIXTURE_DIR, ROOT, swiftCatalog } from "./helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom has no layout; the active-section observer only needs to exist.
  globalThis.IntersectionObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
});

const page = (catalog: Catalog) => (
  <UiProvider>
    <CatalogPage catalog={catalog} />
  </UiProvider>
);

async function hydrate(catalog: Catalog) {
  document.body.innerHTML = `<div id="root">${renderToString(page(catalog))}</div>`;
  const container = document.getElementById("root")!;
  const errors: unknown[] = [];
  const consoleErrors: unknown[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => consoleErrors.push(args);
  try {
    await act(async () => {
      hydrateRoot(container, page(catalog), { onRecoverableError: (e) => errors.push(e) });
    });
  } finally {
    console.error = orig;
  }
  return { container, errors, consoleErrors };
}

const typeQuery = async (value: string) => {
  const q = document.getElementById("q") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(q, value);
    q.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => !e.hidden);

describe("Swift page: static render then hydration (AC-3)", () => {
  it("hydrates with no mismatch or recoverable error", async () => {
    const { errors, consoleErrors } = await hydrate(swiftCatalog());
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(document.querySelectorAll("section.sheet")).toHaveLength(29);
    expect(document.querySelectorAll("article.card")).toHaveLength(289);
    expect(document.querySelectorAll("svg.dg")).toHaveLength(17);
    expect(document.querySelectorAll("#side a[href^='#']")).toHaveLength(29);
  });

  it("searches, clears with Escape, and toggles the theme after hydration", async () => {
    await hydrate(swiftCatalog());
    await typeQuery("actor sendable");
    expect(visible("article.card")).toHaveLength(18);
    expect(document.getElementById("hits")!.textContent).toBe("18 cards matching “actor sendable”");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(visible("article.card")).toHaveLength(289);
    expect((document.getElementById("q") as HTMLInputElement).value).toBe("");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement?.id).toBe("q");

    const before = document.documentElement.getAttribute("data-theme") ?? "dark";
    await act(async () => document.getElementById("theme")!.click());
    const after = document.documentElement.getAttribute("data-theme");
    expect(after).not.toBe(before);
    expect(document.documentElement.classList.contains(after!)).toBe(true);
    expect(localStorage.getItem("cheat-theme")).toBe(after);
  });

  it("opens and closes the narrow-screen navigation from the menu button", async () => {
    await hydrate(swiftCatalog());
    const menu = document.getElementById("menu")!;
    // jsdom evaluates no media queries: show the button as the ≤900px layout does, so it can take focus.
    menu.style.display = "inline-flex";
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    await act(async () => menu.click());
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("shell")!.hasAttribute("data-nav-open")).toBe(true);
    // Focus moves into the drawer and the page behind it is inert.
    expect(document.activeElement).toBe(document.querySelector("#side a"));
    expect(document.getElementById("main")!.hasAttribute("inert")).toBe(true);
    await act(async () => (document.querySelector("#side a[data-target='files']") as HTMLElement).click());
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("main")!.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(menu);

    // Escape closes an open drawer and hands focus back to the menu button.
    await act(async () => menu.click());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu);
  });

  it("names every diagram by its card heading", async () => {
    await hydrate(swiftCatalog());
    const svgs = [...document.querySelectorAll("svg.dg")];
    expect(svgs).toHaveLength(17);
    for (const svg of svgs) {
      const title = document.getElementById(svg.getAttribute("aria-labelledby") ?? "");
      expect(title?.tagName).toBe("H3");
      expect(svg.closest("article")!.contains(title)).toBe(true);
    }
  });
});

describe("a second language renders through the same model and page (AC-4)", () => {
  const fixture = loadCatalog(FIXTURE_DIR);

  it("renders the fixture catalog with no language-specific template", async () => {
    const { errors } = await hydrate(fixture);
    expect(errors).toEqual([]);
    expect([...document.querySelectorAll("section.sheet")].map((s) => s.id)).toEqual(["fixture-collections", "fixture-concurrency"]);
    expect(document.querySelectorAll("article.card")).toHaveLength(6);
    expect(document.querySelector("#side h1")!.textContent).toContain("Kotlin Fixture Catalog");
    expect(document.getElementById("shell")!.getAttribute("data-lang")).toBe("kotlin-fixture");
    // Highlighting comes from the fixture's own keyword data.
    expect([...document.querySelectorAll("code[data-lang='kotlin'] .t-kw")].map((e) => e.textContent)).toEqual(
      expect.arrayContaining(["val", "fun", "suspend"]),
    );
    // The optional metadata surfaces: expected result, applicability, sources, concept ids.
    const card = document.getElementById("fixture-collections--read-only-list")!;
    expect(card.querySelector(".expected")!.textContent).toBe("Result6");
    expect(card.querySelector(".applies")!.textContent).toBe("jvmandroid");
    expect(card.querySelector(".sources a")!.getAttribute("href")).toBe(
      "https://kotlinlang.org/api/core/kotlin-stdlib/kotlin.collections/-list/",
    );
    expect(card.getAttribute("data-concept")).toBe("collections.types.list");
    expect(document.getElementById("fixture-collections")!.querySelector(".applies")!.textContent).toBe("kotlin >=2.0");
    // Nothing Swift leaks in.
    expect(document.body.textContent).not.toMatch(/Swift/);
  });

  it("searches the fixture catalog alone", async () => {
    await hydrate(fixture);
    await typeQuery("suspend");
    expect(visible("section.sheet").map((s) => s.id)).toEqual(["fixture-concurrency"]);
  });
});

describe("offline artifact opened from disk (AC-5)", () => {
  const file = path.join(ROOT, "index.html");

  it("is self-contained: no external scripts, styles, images or frames", () => {
    const html = fs.readFileSync(file, "utf8");
    expect(html).not.toMatch(/<(?:script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)=/i);
    const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    expect(styles).not.toMatch(/@import|url\(\s*["']?(?:https?:)?\/\//i);
  });

  it("keeps diagram font attributes effective: no universal font reset, no broken layer block", () => {
    const html = fs.readFileSync(file, "utf8");
    // A `* { font: inherit }` rule outranks SVG presentation attributes and shrinks/grows every diagram label.
    expect(html).not.toMatch(/(?:^|[}>])\*\{[^}]*font:inherit/);
    // An empty Chakra layer serialises as a bare `@layer x` that swallows the next block.
    expect(html).not.toMatch(/@layer [a-z]+@layer/);
    expect(html).toContain("svg.dg text{");
  });

  it("hydrates, navigates and searches with resource loading disabled", async () => {
    const html = fs.readFileSync(file, "utf8");
    const errors: string[] = [];
    const dom = new JSDOM(html, {
      url: `file://${file}`,
      runScripts: "dangerously",
      pretendToBeVisual: true,
      beforeParse(w) {
        (w as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
          observe() {}
          disconnect() {}
        };
        w.console.error = (...a: unknown[]) => errors.push(a.map(String).join(" "));
      },
    });
    const { document: d } = dom.window;
    await new Promise((r) => setTimeout(r, 50));
    const root = d.getElementById("root")!;
    expect(Object.keys(root).some((k) => k.startsWith("__reactContainer"))).toBe(true);
    expect(errors).toEqual([]);
    expect(d.querySelectorAll("section.sheet")).toHaveLength(29);
    expect(d.querySelectorAll("svg.dg")).toHaveLength(17);
    expect(d.querySelectorAll("pre code .t-kw").length).toBeGreaterThan(1000);
    expect([...d.querySelectorAll("#side a")].map((a) => a.getAttribute("href"))).toEqual(
      swiftCatalog().sheets.map((s) => `#${s.id}`),
    );

    const q = d.getElementById("q") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(q, "debounce");
    q.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    expect(d.getElementById("hits")!.textContent).toBe("23 cards matching “debounce”");
    dom.window.close();
  });
});
