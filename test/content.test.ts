import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tokenize } from "../src/content/highlight";
import { parseInline, plainInline } from "../src/content/inline";
import { CatalogError, diagramProblems, exampleProblems, loadCatalog, loadCatalogs } from "../src/content/load";
import { codeCard, compareCard, sheet as sheetSchema } from "../src/content/schema";
import { buildIndex, cardText, hitsLabel, search } from "../src/content/search";
import { FIXTURE_DIR, FIXTURE_ROOT, ROOT, swiftCatalog } from "./helpers";

/** The pre-migration browser highlighter (src/render.py at 1093188), verbatim, as the reference. */
function legacyHighlight(src: string): { cls: string | null; text: string }[] {
  const KW = ["func","let","var","struct","class","enum","actor","protocol","extension","import",
    "return","if","else","guard","switch","case","default","for","in","while","repeat","do","try",
    "catch","throw","throws","rethrows","async","await","defer","init","deinit","self","Self","nil",
    "true","false","some","any","where","as","is","inout","static","private","public","internal",
    "fileprivate","open","final","lazy","weak","unowned","mutating","nonmutating","associatedtype",
    "typealias","subscript","get","set","willSet","didSet","override","convenience","required",
    "indirect","operator","nonisolated","isolated","sending","consuming","borrowing","package","each","break","continue","fallthrough"];
  const RX = new RegExp(
    "(\\/\\/[^\\n]*)" + "|(\\/\\*[\\s\\S]*?\\*\\/)" + '|("(?:\\\\.|[^"\\\\])*")' + "|(@[A-Za-z_][\\w]*)" + "|(#[A-Za-z]+)" +
      "|(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)" + "|\\b(" + KW.join("|") + ")\\b" + "|(\\b[A-Z][A-Za-z0-9_]*\\b)" + "|(\\.[a-z_][\\w]*)",
    "g",
  );
  const CLS = [null, "com", "com", "str", "attr", "attr", "num", "kw", "typ", "mem"];
  const out: { cls: string | null; text: string }[] = [];
  let last = 0;
  for (let m = RX.exec(src); m !== null; m = RX.exec(src)) {
    if (m.index > last) out.push({ cls: null, text: src.slice(last, m.index) });
    let cls: string | null = null;
    for (let g = 1; g < m.length; g++) if (m[g] !== undefined) { cls = CLS[g] ?? null; break; }
    out.push({ cls, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ cls: null, text: src.slice(last) });
  return out;
}

describe("highlighter", () => {
  it("tokenizes every Swift code block exactly like the legacy highlighter", () => {
    const { language, sheets } = swiftCatalog();
    let blocks = 0;
    for (const s of sheets)
      for (const c of s.cards) {
        const codes = c.kind === "code" ? [c.code] : c.kind === "compare" ? c.columns.map((k) => k.code) : [];
        for (const code of codes) {
          expect(tokenize(code, language.highlight), `${s.id}/${c.id}`).toEqual(legacyHighlight(code));
          blocks++;
        }
      }
    expect(blocks).toBe(256);
  });

  it("is driven by data: another language's keywords and markers", () => {
    const h = { keywords: ["fun", "val"], lineComment: "#", capitalisedTypes: true, members: false };
    expect(tokenize("val x = Foo() # note", h)).toEqual([
      { cls: "kw", text: "val" },
      { cls: null, text: " x = " },
      { cls: "typ", text: "Foo" },
      { cls: null, text: "() " },
      { cls: "com", text: "# note" },
    ]);
  });
});

describe("inline markup", () => {
  it("splits code spans and bold the way the legacy renderer did", () => {
    expect(parseInline("use `xs.isEmpty` **always**")).toEqual([
      { text: "use ", code: false, bold: false },
      { text: "xs.isEmpty", code: true, bold: false },
      { text: " ", code: false, bold: false },
      { text: "always", code: false, bold: true },
    ]);
    expect(plainInline("`a` and **b**")).toBe("a and b");
  });
});

describe("search parity with the pre-migration page (AC-3)", () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/legacy-search.json"), "utf8")) as {
    queries: Record<string, { hits: string; sheets: string[]; cards: number }>;
  };
  const index = buildIndex(swiftCatalog());

  for (const [query, expected] of Object.entries(legacy.queries)) {
    it(`matches the legacy page for ${JSON.stringify(query)}`, () => {
      const r = search(index, query);
      expect(r.count).toBe(expected.cards);
      expect(index.sheets.map((s) => s.id).filter((id) => r.visibleSheets!.has(id))).toEqual(expected.sheets);
      expect(hitsLabel(r.count, query)).toBe(expected.hits);
    });
  }

  it("shows everything for an empty query", () => {
    expect(search(index, "   ")).toEqual({ visibleCards: null, visibleSheets: null, count: 0 });
  });
});

describe("loader", () => {
  it("loads only published catalogs by default", () => {
    expect(loadCatalogs(path.join(ROOT, "content")).map((c) => c.language.id)).toEqual(["swift", "csharp", "kotlin", "typescript"]);
    expect(loadCatalogs(FIXTURE_ROOT)).toEqual([]);
    expect(loadCatalogs(FIXTURE_ROOT, ["fixture"]).map((c) => c.language.id)).toEqual([
      "csharp-fixture",
      "kotlin-fixture",
      "swift-fixture",
      "typescript-fixture",
    ]);
  });

  it("accepts every committed diagram under the allowlist", () => {
    const diagrams = swiftCatalog().sheets.flatMap((s) => s.cards).filter((c) => c.kind === "diagram");
    expect(diagrams).toHaveLength(17);
    for (const d of diagrams) expect(diagramProblems(d.kind === "diagram" ? d.svg : ""), d.id).toEqual([]);
  });

  it("resolves diagram files into markup", () => {
    const c = loadCatalog(FIXTURE_DIR).sheets[0]!.cards.find((k) => k.kind === "diagram");
    expect(c?.kind === "diagram" && c.svg.startsWith('<svg class="dg"')).toBe(true);
  });

  const broken = (mutate: (dir: string) => void) => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "catalog-")), "kotlin-fixture");
    fs.cpSync(FIXTURE_DIR, dir, { recursive: true });
    mutate(dir);
    try {
      loadCatalog(dir);
    } catch (e) {
      expect(e).toBeInstanceOf(CatalogError);
      return (e as CatalogError).problems.join("\n");
    }
    throw new Error("expected the catalog to be refused");
  };
  const edit = (dir: string, file: string, from: string | RegExp, to: string) => {
    const p = path.join(dir, file);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(from, to));
  };

  it("refuses a YAML syntax error, naming the file, and keeps collecting", () => {
    const msg = broken((d) => {
      fs.appendFileSync(path.join(d, "sheets/fixture-concurrency.yaml"), "  - {id: x, kind: [\n");
      edit(d, "sheets/fixture-collections.yaml", "id: costs", "id: rules-of-thumb");
    });
    expect(msg).toMatch(/fixture-concurrency\.yaml: /);
    expect(msg).toMatch(/duplicate card ids rules-of-thumb/);
    expect(broken((d) => fs.appendFileSync(path.join(d, "language.yaml"), "sheets: [\n"))).toMatch(/language\.yaml: /);
  });
  it("refuses a diagram path that leaves diagrams/, and a missing diagram", () => {
    expect(broken((d) => edit(d, "sheets/fixture-collections.yaml", "svg: pyramid.svg", "svg: ../language.yaml"))).toMatch(
      /svg must name a file directly inside diagrams\//,
    );
    expect(broken((d) => edit(d, "sheets/fixture-collections.yaml", "svg: pyramid.svg", "svg: gone.svg"))).toMatch(/names missing diagram gone\.svg/);
  });
  it("refuses ids that disagree with their folder or file, and duplicate sheet ids", () => {
    expect(broken((d) => edit(d, "language.yaml", "id: kotlin-fixture", "id: kotlin-other"))).toMatch(/must match its folder name/);
    expect(broken((d) => edit(d, "sheets/fixture-concurrency.yaml", "id: fixture-concurrency", "id: fixture-other"))).toMatch(
      /must match its file name/,
    );
    expect(
      broken((d) => edit(d, "language.yaml", "sheets: [fixture-collections, fixture-concurrency]", "sheets: [fixture-collections, fixture-concurrency, fixture-collections]")),
    ).toMatch(/duplicate sheet ids fixture-collections/);
  });
  it("refuses two catalogs published at one route", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalogs-"));
    for (const id of ["kotlin-fixture", "kotlin-twin"]) {
      const dir = path.join(root, "languages", id);
      fs.cpSync(FIXTURE_DIR, dir, { recursive: true });
      if (id !== "kotlin-fixture") edit(dir, "language.yaml", "id: kotlin-fixture", `id: ${id}`);
    }
    expect(() => loadCatalogs(root, ["fixture"])).toThrow(/two catalogs publish at \/kotlin-fixture\//);
  });

  it("refuses a sheet id the page itself uses, which would shadow its anchor", () => {
    const msg = broken((d) => {
      edit(d, "language.yaml", "sheets: [fixture-collections, fixture-concurrency]", "sheets: [fixture-collections, langmenu]");
      fs.renameSync(path.join(d, "sheets/fixture-concurrency.yaml"), path.join(d, "sheets/langmenu.yaml"));
      edit(d, "sheets/langmenu.yaml", "id: fixture-concurrency", "id: langmenu");
    });
    expect(msg).toMatch(/langmenu\.yaml: id 'langmenu' is reserved by the page itself/);
  });

  it("refuses a duplicate card id", () => {
    expect(broken((d) => edit(d, "sheets/fixture-collections.yaml", "id: costs", "id: rules-of-thumb"))).toMatch(/duplicate card ids rules-of-thumb/);
  });
  it("refuses a listed sheet with no file, and a file nobody lists", () => {
    const msg = broken((d) => fs.renameSync(path.join(d, "sheets/fixture-concurrency.yaml"), path.join(d, "sheets/orphan.yaml")));
    expect(msg).toMatch(/fixture-concurrency.yaml: listed in language.yaml but missing/);
    expect(msg).toMatch(/orphan.yaml: not listed/);
  });
  it("refuses a group split across non-adjacent sheets", () => {
    const msg = broken((d) => {
      edit(d, "language.yaml", "sheets: [fixture-collections, fixture-concurrency]", "sheets: [fixture-collections, fixture-concurrency, fixture-extra]");
      edit(d, "sheets/fixture-concurrency.yaml", "group: Fixture Basics", "group: Other");
      fs.writeFileSync(
        path.join(d, "sheets/fixture-extra.yaml"),
        "id: fixture-extra\nconcept: x.y\nscope: shared\ntitle: X\ngroup: Fixture Basics\ncards:\n  - {id: a, kind: rules, title: A, items: [{tone: good, text: a}]}\n",
      );
    });
    expect(msg).toMatch(/group 'Fixture Basics' is split/);
  });
  it("refuses schema violations with the file and field", () => {
    expect(broken((d) => edit(d, "sheets/fixture-collections.yaml", "tone: bad", "tone: loud"))).toMatch(
      /fixture-collections.yaml: cards.1.columns.0.tone/,
    );
    expect(broken((d) => edit(d, "sheets/fixture-collections.yaml", "- [\"`Set`\", O(1) avg]", "- [\"`Set`\"]"))).toMatch(
      /one cell per header/,
    );
  });
  it("refuses a diagram that is not inert", () => {
    const wrap = (inner: string) => `<svg class="dg" viewBox="0 0 940 10">${inner}</svg>`;
    expect(diagramProblems(wrap("<script>x()</script>"))).toContain("element <script> is not allowed");
    expect(diagramProblems(wrap('<image href="https://x.test/a.png"/>'))).toEqual(
      expect.arrayContaining(["element <image> is not allowed", "attribute href is not allowed"]),
    );
    // Bypasses of a regex denylist found in security review: every one must be refused.
    for (const payload of [
      '<rect/onclick="alert(1)"/>',
      "<image href='https://example.invalid/p.png'/>",
      "<image href=https://example.invalid/p.png />",
      "<a xlink:href='&#106;avascript:alert(1)'><text>x</text></a>",
      '<rect style="fill:url(https://example.invalid/t)"/>',
      "<style>@import url(https://example.invalid/x.css)</style>",
      '<set attributeName="href" to="&#x6a;avascript:alert(1)"/>',
      '<rect fill="url(https://example.invalid/t)"/>',
      "<!-- comment --><rect/>",
      '<text x="1">&#106;</text>',
    ]) {
      expect(diagramProblems(wrap(payload)), payload).not.toEqual([]);
    }
    expect(diagramProblems(`${wrap("")}<script>x()</script>`)).not.toEqual([]);
    expect(diagramProblems('<svg class="dg" viewBox="0 0 940 10"><text font-size="good">a</text></svg>')).toContain(
      "non-numeric font-size: good",
    );
    expect(broken((d) => fs.writeFileSync(path.join(d, "diagrams/pyramid.svg"), '<svg class="dg" viewBox="0 0 800 10"></svg>'))).toMatch(
      /viewBox must be 940 units wide/,
    );
  });
});

describe("example metadata (zheref/swift-cheatsheets#3, AC-2, AC-3, SC-1)", () => {
  const card = (over: object) => ({ id: "c", kind: "code", title: "t", code: "x", ...over });
  const problems = (over: object) => {
    const r = codeCard.safeParse(card(over));
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };
  const ran = { status: "ran", toolchain: "Node 24", date: "2026-11-11" };

  it("accepts each validation status with what it needs", () => {
    expect(problems({ expected: "1", validation: ran })).toEqual([]);
    expect(problems({ validation: { ...ran, check: "exit-code" } })).toEqual([]);
    expect(problems({ validation: { ...ran, status: "compiled", host: "a browser page" } })).toEqual([]);
    expect(problems({ validation: { status: "excerpt", host: "an Android app" }, prerequisites: ["`npm ci`"] })).toEqual([]);
    const column = { label: "a", tone: "good", code: "x" };
    expect(compareCard.safeParse({ id: "c", kind: "compare", title: "t", columns: [column], validation: ran, expected: "y" }).success).toBe(true);
    expect(compareCard.safeParse({ id: "c", kind: "compare", title: "t", columns: [column], validation: ran }).success).toBe(false);
  });

  it("refuses a status that claims more than it says", () => {
    expect(problems({ validation: { status: "ran", date: "2026-11-11" }, expected: "1" })).toEqual(["validation.toolchain: a 'ran' example must name the toolchain it was proved with"]);
    expect(problems({ validation: { status: "compiled", toolchain: "tsc" } })).toEqual(["validation.date: a 'compiled' example must say when it was proved"]);
    expect(problems({ validation: { status: "excerpt" } })).toEqual(["validation.host: an excerpt must name the application host it needs"]);
    expect(problems({ validation: { status: "excerpt", host: "h", toolchain: "tsc" } })).toEqual([
      "validation.toolchain: an excerpt was not compiled or run: it has no toolchain or date",
    ]);
    expect(problems({ validation: { ...ran, status: "compiled", check: "stdout" } })).toEqual(["validation.check: only a 'ran' example has a checked result"]);
    expect(problems({ validation: { ...ran, date: "11/11/2026" }, expected: "1" })).toEqual(["validation.date: must be a YYYY-MM-DD date"]);
    expect(problems({ validation: ran })).toEqual(["expected: a 'ran' example checked on its output must state that output in `expected`"]);
    expect(problems({ prerequisites: [] })).toHaveLength(1);
  });

  it("names what an example lacks, counting applicability and sources from its card or sheet", () => {
    const sheet = sheetSchema.parse({
      id: "s",
      concept: "x",
      scope: "shared",
      title: "S",
      group: "G",
      applies: { platforms: ["node"], runtime: "Node.js" },
      sources: [{ title: "Docs", url: "https://example.com/" }],
      cards: [
        card({ id: "bare" }),
        card({ id: "full", expected: "1", prerequisites: ["p"], validation: ran, applies: { versions: { node: ">=22" } } }),
        { id: "r", kind: "rules", title: "Rules", items: [{ tone: "good", text: "t" }] },
      ],
    });
    expect(sheet.cards.flatMap((c) => exampleProblems(sheet, c))).toEqual([
      "card 'bare' is an example without applies.versions, prerequisites, validation, expected",
    ]);
    const plain = sheetSchema.parse({ ...sheet, applies: undefined, sources: undefined });
    expect(exampleProblems(plain, plain.cards[1]!)).toEqual(["card 'full' is an example without applies.platforms, applies.runtime, sources"]);
  });

  it("is enforced by the loader only for a language that asks for it — the Swift catalog is unchanged", () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "catalog-")), "kotlin-fixture");
    fs.cpSync(FIXTURE_DIR, dir, { recursive: true });
    expect(() => loadCatalog(dir)).not.toThrow();
    fs.appendFileSync(path.join(dir, "language.yaml"), "requireExampleMetadata: true\n");
    expect(() => loadCatalog(dir)).toThrow(/fixture-collections\.yaml: card '[a-z-]+' is an example without /);
    expect(swiftCatalog().language.requireExampleMetadata).toBeUndefined();
  });

  it("puts an example's setup into what search finds", () => {
    const c = codeCard.parse(card({ prerequisites: ["run `node --test`"] }));
    expect(cardText(c)).toContain("run node --test");
  });
});
