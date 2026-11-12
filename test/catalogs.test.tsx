/**
 * The TypeScript, Kotlin and C# catalogs (zheref/swift-cheatsheets#3): published as data,
 * the three kinds of material kept apart (AC-1), every example carrying what a reader needs
 * to reproduce it (AC-2, AC-3, SC-1), and a coverage matrix that gives every Swift topic a
 * disposition without inventing a translation (AC-4).
 */
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { switchLink } from "../src/content/languages";
import { exampleProblems, loadSite } from "../src/content/load";
import type { Catalog, Sheet, TableCard } from "../src/content/schema";
import { describesResult, validationLabel } from "../src/ui/cards";
import { CatalogPage } from "../src/ui/CatalogPage";
import { UiProvider } from "../src/ui/Provider";
import { ROOT } from "./helpers";

const NEW = ["typescript", "kotlin", "csharp"] as const;
const site = loadSite(path.join(ROOT, "content"));
const catalog = (id: string) => site.catalogs.find((c) => c.language.id === id)!;
const swift = catalog("swift");
const examples = (c: Catalog) => c.sheets.flatMap((s) => s.cards.filter((card) => card.kind === "code" || card.kind === "compare").map((card) => ({ sheet: s, card })));

describe.each(NEW)("the %s catalog", (id) => {
  const c = catalog(id);

  it("is published at its own route, listed in the registry, from data alone", () => {
    expect(c.language).toMatchObject({ status: "published", route: `/${id}/`, codeLanguage: id, requireExampleMetadata: true });
    expect(site.languages.find((l) => l.id === id)).toMatchObject({ href: `/${id}/`, name: c.language.name });
  });

  it("keeps shared concepts, language topics and platform material in separate groups (AC-1)", () => {
    const scopesByGroup = new Map<string, Set<string>>();
    for (const s of c.sheets) scopesByGroup.set(s.group, (scopesByGroup.get(s.group) ?? new Set()).add(s.scope));
    for (const [group, scopes] of scopesByGroup) expect([...scopes], `group '${group}'`).toHaveLength(1);
    expect(new Set(c.sheets.map((s) => s.scope))).toEqual(new Set(["shared", "language", "platform"]));
    expect(c.sheets.filter((s) => s.scope === "shared").every((s) => s.group === "Shared concepts")).toBe(true);
    // Platform material says which platform, on the sheet a reader sees.
    for (const s of c.sheets.filter((s) => s.scope === "platform")) expect(s.applies?.platforms, s.id).toBeDefined();
  });

  it("gives 100% of its examples platform, runtime and version applicability, sources, setup, a result and a validation status (SC-1)", () => {
    const all = examples(c);
    expect(all.length).toBeGreaterThan(25);
    expect(all.flatMap(({ sheet, card }) => exampleProblems(sheet, card))).toEqual([]);
    expect(all.every(({ card }) => card.validation !== undefined)).toBe(true);
  });

  it("validates most examples by running them, and says where one needs an application host", () => {
    const statuses = examples(c).map(({ card }) => (card.kind === "code" || card.kind === "compare" ? card.validation!.status : ""));
    expect(statuses.filter((s) => s === "ran").length / statuses.length).toBeGreaterThan(0.8);
    for (const { card } of examples(c)) {
      if (card.kind !== "code" && card.kind !== "compare") continue;
      if (card.validation!.status !== "ran") expect(card.validation!.host, card.id).toBeDefined();
    }
  });
});

describe("the coverage matrix (AC-4)", () => {
  const DISPOSITIONS = ["equivalent", "partial", "no counterpart"];

  /** The matrix rows of a catalog's coverage sheet: [Swift topic, disposition, here, why]. */
  const matrix = (c: Catalog) => {
    const sheet = c.sheets.find((s) => s.concept === "meta.coverage")!;
    const table = sheet.cards.find((card) => card.id === "matrix") as TableCard;
    expect(table.headers).toEqual(["Swift topic", "Disposition", "Here", "Why"]);
    return table.rows.map(([topic = "", disposition = "", here = "", why = ""]) => ({ topic, disposition, here, why }));
  };
  const byTitle = (c: Catalog, title: string): Sheet | undefined => c.sheets.find((s) => s.title === title);

  it.each(NEW)("%s: lists every Swift topic once, in Swift's order, with a disposition and a reason", (id) => {
    const rows = matrix(catalog(id));
    expect(rows.map((r) => r.topic)).toEqual(swift.sheets.map((s) => s.title));
    for (const r of rows) {
      expect(DISPOSITIONS, r.topic).toContain(r.disposition);
      expect(r.why.length, r.topic).toBeGreaterThan(10);
    }
  });

  it.each(NEW)("%s: an equivalent shares the Swift concept id; a partial names a sheet that does not; no counterpart names none", (id) => {
    const c = catalog(id);
    for (const [i, r] of matrix(c).entries()) {
      const swiftSheet = swift.sheets[i]!;
      const here = byTitle(c, r.here);
      if (r.disposition === "no counterpart") {
        expect(r.here, r.topic).toBe("—");
        continue;
      }
      expect(here, `${r.topic} → ${r.here}`).toBeDefined();
      if (r.disposition === "equivalent") expect(here!.concept, r.topic).toBe(swiftSheet.concept);
      else expect(here!.concept, r.topic).not.toBe(swiftSheet.concept);
    }
  });

  it.each(NEW)("%s: every sheet reusing a Swift concept is that topic's equivalent — no silent reuse", (id) => {
    const c = catalog(id);
    const rows = matrix(c);
    for (const s of c.sheets) {
      const i = swift.sheets.findIndex((x) => x.concept === s.concept);
      if (i < 0) continue;
      expect(rows[i], s.id).toMatchObject({ disposition: "equivalent", here: s.title });
    }
  });

  it.each(NEW)("%s: the selector lands on the equivalent from Swift, and explains the absence otherwise", (id) => {
    const target = site.languages.find((l) => l.id === id)!;
    for (const [i, r] of matrix(catalog(id)).entries()) {
      const link = switchLink(target, swift.sheets[i]!.concept, "swift");
      if (r.disposition === "equivalent") expect(link.match?.title, r.topic).toBe(r.here);
      else expect(link.href, r.topic).toMatch(new RegExp(`^/${id}/\\?from=swift&concept=`));
    }
  });
});

describe("a platform-specific example as a reader sees it (AC-3)", () => {
  it.each([
    ["typescript", "ts-node-files", "atomic-write", ["node", "node >=22.18", "Node.js 22.18 or later", "fsPromises.rename — Node.js", "Ran with Node 24.16.0, TypeScript 5.9.3 on 2026-11-11"]],
    ["kotlin", "kt-compose-state", "remember-and-hoisting", ["android", "compose-bom >=2024.09.00", "Android Studio project", "State and Jetpack Compose — Android Developers", "Excerpt, not compiled or run here: it needs an Android app"]],
    ["csharp", "cs-files", "atomic-write", ["dotnet", "dotnet >=8", ".NET 8 SDK or later", "File.Move — .NET API", "Ran with .NET SDK 9.0.304"]],
  ] as const)("%s %s: platform, setup, versions, sources and validation are on the page", (id, sheetId, cardId, visible) => {
    const html = renderToString(
      <UiProvider>
        <CatalogPage catalog={catalog(id)} languages={site.languages} />
      </UiProvider>,
    );
    const section = html.slice(html.indexOf(`id="${sheetId}"`));
    const card = section.slice(section.indexOf(`id="${sheetId}--${cardId}"`), section.indexOf("</article>", section.indexOf(`id="${sheetId}--${cardId}"`)));
    const text = card.replace(/<[^>]+>/g, " ").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
    const header = section.slice(0, section.indexOf("</header>")).replace(/<[^>]+>/g, " ").replace(/&gt;/g, ">").replace(/\s+/g, " ");
    for (const v of visible) expect(`${header} ${text}`, v).toContain(v);
    expect(card).toMatch(/class="[^"]*\bvalidation\b[^"]*" data-status="(?:ran|compiled|excerpt)"/);
  });
});

describe("the validation line", () => {
  const proved = { toolchain: "kotlinc 2.2.20", date: "2026-11-11" };
  it("says how far each status went, in words", () => {
    expect(validationLabel({ status: "ran", ...proved })).toBe("Ran with kotlinc 2.2.20 on 2026-11-11: the output matched the result shown.");
    expect(validationLabel({ status: "ran", check: "exit-code", ...proved })).toBe("Ran with kotlinc 2.2.20 on 2026-11-11: it exited 0.");
    expect(validationLabel({ status: "compiled", ...proved })).toBe("Compiled with kotlinc 2.2.20 on 2026-11-11; not run here.");
    expect(validationLabel({ status: "compiled", host: "a JUnit launcher", ...proved })).toBe(
      "Compiled with kotlinc 2.2.20 on 2026-11-11; not run here — running it needs a JUnit launcher.",
    );
    expect(validationLabel({ status: "excerpt", host: "an Android app" })).toBe("Excerpt, not compiled or run here: it needs an Android app.");
  });

  it("is absent from the Swift catalog, whose cards carry no example metadata", () => {
    const html = renderToString(
      <UiProvider>
        <CatalogPage catalog={swift} languages={site.languages} />
      </UiProvider>,
    );
    expect(html).not.toContain("data-status=");
    expect(html).not.toContain('class="prerequisites"');
  });
});

describe("an example's result", () => {
  it("is code when it is printed output, and words when it describes an effect", () => {
    const ts = catalog("typescript");
    const card = (sheet: string, id: string) => ts.sheets.find((s) => s.id === sheet)!.cards.find((c) => c.id === id)!;
    expect(describesResult(card("ts-collections", "map-vs-object"))).toBe(false); // ran, checked on stdout
    expect(describesResult(card("ts-testing", "node-test-basics"))).toBe(true); // ran, checked on exit status
    expect(describesResult(card("ts-browser-state", "render-from-state"))).toBe(true); // compiled
    expect(describesResult(card("ts-collections", "costs"))).toBe(false); // not an example
    expect(swift.sheets.flatMap((s) => s.cards).some(describesResult)).toBe(false); // the Swift catalog renders as before

    const html = renderToString(
      <UiProvider>
        <CatalogPage catalog={ts} languages={site.languages} />
      </UiProvider>,
    );
    const article = (id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf("</article>", html.indexOf(`id="${id}"`)));
    expect(article("ts-browser-state--render-from-state")).toMatch(/class="[^"]*\bdescribed\b/);
    expect(article("ts-collections--map-vs-object")).not.toMatch(/\bdescribed\b/);
  });
});
