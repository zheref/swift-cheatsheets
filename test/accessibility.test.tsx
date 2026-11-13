// @vitest-environment jsdom
/**
 * The accessibility and token gaps the page inherited from the legacy one
 * (zheref/swift-cheatsheets#5): control boundaries (AC-1), a type scale that
 * follows the reader and is floored on narrow screens (AC-2), a search label
 * that outlives typing (AC-3), vector icons and a theme control that shows its
 * target (AC-4), and one token definition the page reads (AC-5).
 */
import fs from "node:fs";
import path from "node:path";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { space, spaceScale, typeRoles, typeScale } from "../src/bankai";
import { loadCatalog } from "../src/content/load";
import type { Catalog } from "../src/content/schema";
import { CatalogPage } from "../src/ui/CatalogPage";
import { UiProvider } from "../src/ui/Provider";
import { palettes } from "../src/ui/theme";
import { FIXTURE_DIR, ROOT } from "./helpers";

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

const catalog: Catalog = loadCatalog(FIXTURE_DIR);
const page = () => (
  <UiProvider>
    <CatalogPage catalog={catalog} />
  </UiProvider>
);

async function hydrate() {
  document.documentElement.removeAttribute("data-theme");
  document.body.innerHTML = `<div id="root">${renderToString(page())}</div>`;
  await act(async () => {
    hydrateRoot(document.getElementById("root")!, page());
  });
}

const styles = () => [...document.querySelectorAll("style")].map((s) => s.textContent).join("");
const NARROW = "@media (max-width: 900px)";
const TOUCH = "@media (max-width: 900px),(pointer: coarse)";
/** The declarations an element's own Chakra class carries inside one media query (vendor-prefixed forms included). */
const inMedia = (el: Element, query: string) =>
  [...styles().matchAll(new RegExp(`${query.replace(/[()]/g, "\\$&")}\\{\\.${classOf(el)}\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join(";");
const classOf = (el: Element) => [...el.classList].find((c) => c.startsWith("css-"))!;
/** The declarations of an element's own Chakra class, at the top level of the sheet. */
const declarations = (el: Element) => {
  const match = new RegExp(`(?:^|\\})\\.${classOf(el)}\\{([^}]*)\\}`).exec(styles());
  return match ? match[1] : "";
};

// WCAG 2.x relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const linear = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(1) + 0.7152 * linear(3) + 0.0722 * linear(5);
};
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe("control boundaries (AC-1)", () => {
  for (const [scheme, p] of Object.entries(palettes)) {
    it(`${scheme}: a control's edge is at least 3:1 against the page, a control's fill and a card`, () => {
      for (const surface of [p.bg, p.bg2, p.card]) expect(contrast(p.edge, surface), `${p.edge} on ${surface}`).toBeGreaterThanOrEqual(3);
      // The edge is a new role, not a darker divider: cards and tables keep the quiet line.
      expect(p.edge).not.toBe(p.line);
    });
  }

  it("draws the search field, the bar buttons and the selector toggle with the edge role", async () => {
    await hydrate();
    const edged = [document.querySelector("[role='search']")!, document.getElementById("menu")!, document.getElementById("theme")!, document.getElementById("lang-toggle")!];
    for (const el of edged) expect(declarations(el), el.id || el.getAttribute("role")!).toContain("border-color:var(--chakra-colors-cs-edge)");
    expect(styles()).toContain("--chakra-colors-cs-edge:var(--edge)");
  });
});

describe("a type scale that follows the reader (AC-2)", () => {
  it("defines every step in rem, so text scales with the reader's root size", () => {
    for (const value of Object.values(typeScale)) expect(value).toMatch(/^\d+(\.\d+)?rem$/);
  });

  it("keeps the dense scale on desktop and floors narrow screens at 12px, with 16px body text", async () => {
    await hydrate();
    const css = styles();
    const px = (rem: string) => parseFloat(rem) * 16;
    const wide = /:root\{[^}]*?--fs-body:([\d.]+rem)/.exec(css);
    expect(wide?.[1]).toBe(typeScale.xl);
    const narrow = /@media \(max-width: 900px\)\{:root\{([^}]*)\}/.exec(css);
    expect(narrow).not.toBeNull();
    const floors = Object.fromEntries([...narrow![1]!.matchAll(/--fs-([\w-]+):([\d.]+rem)/g)].map((m) => [m[1]!, px(m[2]!)]));
    for (const role of [...Object.keys(typeRoles), "prose", "heading", "small", "label", "table", "sheetTitle"]) {
      expect(floors[role], role).toBeGreaterThanOrEqual(12);
    }
    for (const role of ["body", "prose", "input"]) expect(floors[role], role).toBe(16);
    // Desktop stays dense: the group labels are still below the narrow floor there.
    expect(px(typeScale[typeRoles.groupLabel.wide])).toBeLessThan(12);
  });

  it("renders no font size in px on the page: every size is a type role", async () => {
    await hydrate();
    const css = styles();
    expect(css.match(/font-size:[\d.]+px/g) ?? []).toEqual([]);
    expect(css).toContain("font-size:var(--fs-control)");
  });
});

describe("controls a reader can reach on any touch screen (UX-3)", () => {
  it("sizes the search field, the bar buttons and the rail links for touch on the narrow layout and any coarse pointer", async () => {
    await hydrate();
    expect(inMedia(document.querySelector("[role='search']")!, TOUCH)).toContain("min-height:44px");
    for (const id of ["menu", "theme"]) expect(inMedia(document.getElementById(id)!, TOUCH), id).toContain("min-height:44px;min-width:44px");
    expect(inMedia(document.querySelector("#side a")!, TOUCH)).toContain("min-height:44px");
  });
});

describe("a search field that keeps its label (AC-3)", () => {
  it("gives the field a full-width row of its own on the narrow layout, so the label never squeezes the text", async () => {
    await hydrate();
    const search = inMedia(document.querySelector("[role='search']")!, NARROW);
    expect(search).toContain(";order:1;");
    expect(search).toContain(";flex-basis:100%;");
    expect(inMedia(document.getElementById("topbar")!, NARROW)).toContain("flex-wrap:wrap");
    // Anchored sheets clear the taller two-row bar.
    expect(styles()).toMatch(/@media \(max-width: 900px\)\{html\{--anchor-offset:120px;\}\}/);
  });


  it("shows a visible label inside the field, tied to the input, that typing does not remove", async () => {
    await hydrate();
    const q = document.getElementById("q") as HTMLInputElement;
    const label = document.querySelector(`label[for='q']`)!;
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("Search");
    expect(label.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(label.closest("[role='search']")).toBe(q.closest("[role='search']"));
    // The visible label starts the accessible name (WCAG 2.5.3); the placeholder is only a hint.
    expect(q.getAttribute("aria-label")).toMatch(/^Search /);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(q, "actor");
      q.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.querySelector(`label[for='q']`)!.textContent).toBe("Search");
  });

  it("draws the focus ring on the field's boundary, with the input's own ring where :has() is unsupported (WCAG 2.4.7)", async () => {
    await hydrate();
    const css = styles();
    const box = classOf(document.querySelector("[role='search']")!);
    const input = classOf(document.getElementById("q")!);
    expect(css).toMatch(new RegExp(`\\.${box}:has\\(input:focus-visible\\)\\{[^}]*outline:2px solid var\\(--accent\\)`));
    expect(css).toMatch(new RegExp(`@supports not selector\\(:has\\(\\*\\)\\)\\{\\.${input}:focus-visible\\{outline:2px solid var\\(--accent\\)`));
  });
});

describe("vector icons and a theme control that shows its target (AC-4)", () => {
  it("draws the menu and theme controls with SVG, not font glyphs", async () => {
    await hydrate();
    for (const id of ["menu", "theme", "lang-toggle"]) {
      const el = document.getElementById(id)!;
      expect(el.querySelector("svg[aria-hidden='true'][focusable='false']"), id).not.toBeNull();
      expect(el.textContent, id).not.toMatch(/[☰☼▾✓]/u);
    }
  });

  it("shows a sun on the dark page and a moon on the light one, from <html data-theme>", async () => {
    await hydrate();
    const theme = document.getElementById("theme")!;
    expect([...theme.querySelectorAll("svg")].map((s) => s.getAttribute("class"))).toEqual(["to-light", "to-dark"]);
    const cls = classOf(theme);
    const css = styles();
    expect(css).toContain(`.${cls} .to-dark{display:none;}`);
    expect(css).toContain(`html[data-theme="light"] .${cls} .to-light{display:none;}`);
    expect(css).toContain(`html[data-theme="light"] .${cls} .to-dark{display:block;}`);
    expect(theme.getAttribute("aria-label")).toBe("Switch to light theme");
  });
});

describe("one token definition (AC-5)", () => {
  const source = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
  const tsx = (dir: string) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".tsx")).map((f) => `${dir}/${f}`);
  /** A quoted length (px, em, rem) anywhere in source — a prop, a template, a style object; a 1px hairline border excepted. */
  const lengths = (text: string) =>
    (text.match(/["`][^"`\n]*\b\d+(?:\.\d+)?(?:px|em|rem)\b[^"`\n]*["`]/g) ?? []).filter((m) => !/^["`]1px solid\b[^"`]*["`]$/.test(m));

  it("leaves no raw colour, font-size, length, line-height or tracking literal in any page component", () => {
    const page = [...tsx("src/ui"), ...tsx("src/pages")];
    expect(page).toContain("src/ui/CatalogPage.tsx");
    for (const file of page) {
      const text = source(file);
      expect(text.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? [], file).toEqual([]);
      expect(text.match(/fontSize="[^"]*"/g) ?? [], file).toEqual([]);
      expect(lengths(text), file).toEqual([]);
      expect(text.match(/\b(?:lineHeight|letterSpacing)="[^"]*"/g) ?? [], file).toEqual([]);
    }
  });

  it("keeps the primitives free of colour and length literals outside the token file", () => {
    for (const file of [...tsx("src/bankai"), "src/bankai/controls.ts", "src/bankai/system.ts"]) {
      const text = source(file);
      expect(text.match(/"#[0-9a-f]{3,8}"|rgba?\(/gi) ?? [], file).toEqual([]);
      expect(lengths(text), file).toEqual([]);
    }
  });

  it("gives Chakra the token file's spacing scale, so a step means one thing to the page and the primitives", async () => {
    await hydrate();
    const css = styles();
    for (const [step, value] of Object.entries(spaceScale)) {
      expect(css, step).toContain(`--chakra-spacing-${step.replace(".", "\\.")}:${value}`);
    }
    expect(space.barGap).toBe(spaceScale[2]);
  });
});
