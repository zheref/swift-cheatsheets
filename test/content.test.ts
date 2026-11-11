import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tokenize } from "../src/content/highlight";
import { parseInline, plainInline } from "../src/content/inline";
import { CatalogError, diagramProblems, loadCatalog, loadCatalogs } from "../src/content/load";
import { buildIndex, hitsLabel, search } from "../src/content/search";
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

describe("search", () => {
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
    expect(loadCatalogs(path.join(ROOT, "content")).map((c) => c.language.id)).toEqual(["swift"]);
    expect(loadCatalogs(FIXTURE_ROOT)).toEqual([]);
    expect(loadCatalogs(FIXTURE_ROOT, ["fixture"]).map((c) => c.language.id)).toEqual(["kotlin-fixture"]);
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
    expect(diagramProblems('<svg class="dg" viewBox="0 0 940 10"><script>x()</script></svg>')).toContain(
      "contains script, an event handler or foreignObject",
    );
    expect(diagramProblems('<svg class="dg" viewBox="0 0 940 10"><image href="https://x.test/a.png"/></svg>')).toContain(
      "references an external resource",
    );
    expect(diagramProblems('<svg class="dg" viewBox="0 0 940 10"><text font-size="good">a</text></svg>')).toContain(
      "non-numeric font-size: good",
    );
    expect(broken((d) => fs.writeFileSync(path.join(d, "diagrams/pyramid.svg"), '<svg class="dg" viewBox="0 0 800 10"></svg>'))).toMatch(
      /viewBox must be 940 units wide/,
    );
  });
});
