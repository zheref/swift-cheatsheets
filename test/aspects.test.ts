/**
 * The required aspects (content/aspects.yaml): the registry is well-formed, every published
 * catalog covers every part or carries a reasoned waiver, and the scaffold for a new
 * language — committed as templates/new-language/ — is a valid catalog that covers them all.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type Fetcher, fetchJars, jarFile, jarUrl, parseJars, sha256 } from "../scripts/fetch-example-jars.mts";
import { main, scaffold, writeScaffold } from "../scripts/new-language.mts";
import { aspectGaps, type Aspects, isPending, loadAspects } from "../src/content/aspects";
import { CatalogError, exampleProblems, loadCatalog, loadCatalogs } from "../src/content/load";
import type { Catalog, TableCard } from "../src/content/schema";
import { ROOT, swiftCatalog } from "./helpers";

const CONTENT = path.join(ROOT, "content");
const TEMPLATE = path.join(ROOT, "templates/new-language");
const registry = loadAspects(CONTENT);
const catalogs = loadCatalogs(CONTENT);
const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** The problems the loader reports for an `aspects.yaml` with this content. */
function refused(yaml: string | null): string {
  const root = tmp("aspects-");
  if (yaml !== null) fs.writeFileSync(path.join(root, "aspects.yaml"), yaml);
  try {
    loadAspects(root);
  } catch (e) {
    expect(e).toBeInstanceOf(CatalogError);
    return (e as CatalogError).problems.join("\n");
  }
  throw new Error("expected the registry to be refused");
}
const part = (id: string, concept: string) => `{ id: ${id}, title: T, scope: shared, concepts: [${concept}], covers: [something] }`;

describe("the aspects registry", () => {
  it("names the twenty aspects every catalog covers, each with a checklist", () => {
    expect(registry.aspects.map((a) => a.id)).toEqual([
      "ui-layers",
      "styling",
      "state-management",
      "structured-concurrency",
      "async-flows",
      "timers-and-scheduling",
      "networking",
      "video-streaming",
      "security",
      "accessibility",
      "localization",
      "serialization",
      "collections-and-strings",
      "unit-and-integration-testing",
      "ui-and-e2e-testing",
      "architecture",
      "clean-code",
      "solid",
      "functional-programming",
      "modularization",
    ]);
    for (const a of registry.aspects) for (const p of a.parts) expect(p.covers.length, `${a.id}/${p.id}`).toBeGreaterThanOrEqual(3);
  });

  it("is refused when it is missing, malformed, ambiguous or waives a part that does not exist", () => {
    expect(refused(null)).toMatch(/aspects\.yaml: missing$/);
    expect(refused("aspects: [")).toMatch(/aspects\.yaml: /);
    expect(refused("aspects: []")).toMatch(/aspects\.yaml: aspects: /);
    expect(refused(`aspects:\n  - { id: a, title: A, parts: [${part("p", "x.y")}] }\n  - { id: a, title: A, parts: [${part("q", "x.z")}] }`)).toMatch(/duplicate aspect 'a'/);
    expect(refused(`aspects:\n  - { id: a, title: A, parts: [${part("p", "x.y")}] }\n  - { id: b, title: B, parts: [${part("p", "x.z")}] }`)).toMatch(/duplicate part 'p'/);
    expect(refused(`aspects:\n  - { id: a, title: A, parts: [${part("p", "x.y")}, ${part("q", "x.y")}] }`)).toMatch(/concept 'x\.y' is claimed by more than one part/);
    expect(refused(`aspects:\n  - { id: a, title: A, parts: [${part("p", "x.y")}] }\nwaivers:\n  - { language: l, aspect: a, part: nope, reason: "the topic does not exist there" }`)).toMatch(
      /a waiver for 'l' names 'a\/nope', which is not a part/,
    );
  });

  it("counts a part as covered by a sheet with any of its concepts, or by a waiver for that language", () => {
    const swift = swiftCatalog();
    const small: Aspects = {
      aspects: [
        { id: "have", title: "H", parts: [{ id: "h", title: "H", scope: "shared", concepts: ["nope.never", "collections.types"], covers: ["x"] }] },
        { id: "lack", title: "L", parts: [{ id: "l", title: "L", scope: "shared", concepts: ["nope.missing"], covers: ["x"] }] },
      ],
    };
    expect(aspectGaps(swift, small)).toEqual([{ aspect: "lack", part: "l", concepts: ["nope.missing"] }]);
    const reason = "there is no such thing on this platform";
    expect(aspectGaps(swift, { ...small, waivers: [{ language: "swift", aspect: "lack", part: "l", reason }] })).toEqual([]);
    expect(aspectGaps(swift, { ...small, waivers: [{ language: "kotlin", aspect: "lack", part: "l", reason }] })).toHaveLength(1);
    expect(isPending({ ...small, pending: ["swift"] }, "swift")).toBe(true);
    expect(isPending(small, "swift")).toBe(false);
  });
});

describe("every published catalog against the registry", () => {
  it("lists as pending only catalogs that exist, and waives only for catalogs that exist", () => {
    const ids = catalogs.map((c) => c.language.id);
    for (const id of registry.pending ?? []) expect(ids, `pending '${id}'`).toContain(id);
    for (const w of registry.waivers ?? []) expect(ids, `waiver for '${w.language}'`).toContain(w.language);
  });

  it.each(catalogs.map((c) => [c.language.id, c] as const))("%s covers every required part, or is still pending", (id, catalog) => {
    const gaps = aspectGaps(catalog, registry);
    if (isPending(registry, id)) {
      // A catalog leaves `pending` the moment it has no gap left: the list only ever shrinks.
      expect(gaps.length, `'${id}' has no gap left — remove it from pending in content/aspects.yaml`).toBeGreaterThan(0);
      return;
    }
    expect(gaps.map((g) => `${g.aspect}/${g.part} — add a sheet with concept ${g.concepts[0]}`)).toEqual([]);
  });
});

describe("the scaffold for a new language (templates/new-language)", () => {
  const files = scaffold(ROOT, { id: "new-language", name: "New Language", prefix: "nl" });
  const committed = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? committed(path.join(dir, d.name)) : [path.relative(TEMPLATE, path.join(dir, d.name))]));

  /** The scaffold written where a catalog lives, and loaded through the real loader. */
  function loaded(): Catalog {
    const dir = path.join(tmp("scaffold-"), "new-language");
    writeScaffold(dir, files);
    return loadCatalog(dir);
  }

  it("is exactly what the committed template holds (regenerate with `npm run template`)", () => {
    expect(committed(TEMPLATE).sort()).toEqual([...files.keys()].sort());
    for (const [file, content] of files) expect(fs.readFileSync(path.join(TEMPLATE, file), "utf8"), file).toBe(content);
  });

  it("is a valid draft catalog that covers every required part", () => {
    const catalog = loaded();
    expect(catalog.language).toMatchObject({ id: "new-language", status: "draft", route: "/new-language/" });
    expect(aspectGaps(catalog, registry)).toEqual([]);
    expect(catalog.sheets.map((s) => s.id)).toEqual(expect.arrayContaining(registry.aspects.flatMap((a) => a.parts.map((p) => `nl-${p.id}`))));
  });

  it("carries each part's checklist, and an example with all the metadata a published one states", () => {
    const catalog = loaded();
    for (const a of registry.aspects)
      for (const p of a.parts) {
        const sheet = catalog.sheets.find((s) => s.id === `nl-${p.id}`)!;
        expect(sheet, p.id).toMatchObject({ concept: p.concepts[0], scope: p.scope, title: p.title });
        const checklist = sheet.cards.find((c) => c.id === "must-cover")!;
        expect(checklist.kind === "rules" && checklist.items.map((i) => i.text), p.id).toEqual(p.covers);
        expect(sheet.cards.flatMap((c) => exampleProblems(sheet, c)), p.id).toEqual([]);
      }
  });

  it("keeps the three kinds of material apart, and ends with a coverage matrix over every Swift topic", () => {
    const catalog = loaded();
    const scopes = new Map<string, Set<string>>();
    for (const s of catalog.sheets) scopes.set(s.group, (scopes.get(s.group) ?? new Set()).add(s.scope));
    for (const [group, set] of scopes) expect([...set], group).toHaveLength(1);
    expect(new Set(catalog.sheets.map((s) => s.scope))).toEqual(new Set(["shared", "language", "platform"]));
    for (const s of catalog.sheets.filter((s) => s.scope === "platform")) expect(s.applies?.platforms, s.id).toBeDefined();

    const coverage = catalog.sheets.at(-1)!;
    expect(coverage.concept).toBe("meta.coverage");
    const matrix = coverage.cards.find((c) => c.id === "matrix") as TableCard;
    const swift = swiftCatalog();
    expect(matrix.rows.map((r) => r[0])).toEqual(swift.sheets.map((s) => s.title));
    for (const [i, [, disposition, here]] of matrix.rows.entries()) {
      const mine = catalog.sheets.find((s) => s.concept === swift.sheets[i]!.concept);
      expect([disposition, here], swift.sheets[i]!.id).toEqual(mine ? ["equivalent", mine.title] : ["no counterpart", "—"]);
    }
  });

  it("refuses an id that is not a slug, and never overwrites a catalog", () => {
    expect(() => scaffold(ROOT, { id: "New Language", name: "x" })).toThrow("lowercase kebab-case");
    expect(() => scaffold(ROOT, { id: "ok", name: "x", prefix: "Not_OK" })).toThrow("lowercase kebab-case");
    expect(scaffold(ROOT, { id: "rust", name: "Rust" }).has("sheets/rust-styling.yaml")).toBe(true); // the prefix defaults to the id
    expect(() => writeScaffold(TEMPLATE, files)).toThrow("already exists");
  });

  it("is one command: it writes the catalog folder, and says what went wrong otherwise", () => {
    const out = path.join(tmp("cli-"), "rust");
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    expect(main(["rust", "Rust", "--prefix", "rs", "--out", out], ROOT, log)).toBe(0);
    expect(lines.at(-1)).toBe(`wrote ${files.size} files to ${out} — next: docs/ADDING-A-LANGUAGE.md`);
    expect(loadCatalog(out).sheets.map((s) => s.id)).toContain("rs-networking-rest");
    expect(main(["rust", "Rust", "--out", out], ROOT, log)).toBe(1); // never over a catalog
    expect(lines.at(-1)).toMatch(/already exists/);
    expect(main(["rust"], ROOT, log)).toBe(2);
    expect(lines.at(-1)).toMatch(/^usage: /);
    expect(main(["Not A Slug", "x", "--out", path.join(tmp("cli-"), "x")], ROOT, log)).toBe(1);
  });
});

describe("the pinned jars of the Kotlin examples", () => {
  const jars = parseJars(fs.readFileSync(path.join(ROOT, "examples/kotlin/jars.txt"), "utf8"));

  it("pins every jar by coordinates and SHA-256, fetched from Maven Central only", () => {
    expect(jars.length).toBeGreaterThan(0);
    for (const j of jars) {
      expect(j.sha256, j.artifact).toMatch(/^[0-9a-f]{64}$/);
      expect(jarUrl(j), j.artifact).toBe(`https://repo1.maven.org/maven2/${j.group.replaceAll(".", "/")}/${j.artifact}/${j.version}/${jarFile(j)}`);
    }
    expect(jarFile({ group: "g", artifact: "a", version: "1.2.3", sha256: "" })).toBe("a-1.2.3.jar");
  });

  it("ignores comments and blank lines, and refuses a line that is not a pinned coordinate", () => {
    const digest = "a".repeat(64);
    expect(parseJars(`# why\n\norg.x:lib:1.0 ${digest}\n`)).toEqual([{ group: "org.x", artifact: "lib", version: "1.0", sha256: digest }]);
    expect(() => parseJars("org.x:lib:1.0")).toThrow("is not 'group:artifact:version sha256'");
    expect(() => parseJars(`org.x:lib:1.0 ${digest.slice(1)}`)).toThrow("is not 'group:artifact:version sha256'");
    expect(sha256(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("writes a download only when its digest is the pinned one, and keeps a jar that is already right", async () => {
    const dir = tmp("jars-");
    const bytes = (text: string) => new TextEncoder().encode(text);
    const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    fs.writeFileSync(path.join(dir, "jars.txt"), `org.x:good:1.0 ${abc}\norg.x:tampered:1.0 ${abc}\norg.x:gone:1.0 ${abc}\n`);
    const calls: string[] = [];
    const fetcher: Fetcher = async (url) => {
      calls.push(url);
      const body = url.includes("/good/") ? bytes("abc") : bytes("something else");
      return { ok: !url.includes("/gone/"), status: url.includes("/gone/") ? 404 : 200, arrayBuffer: async () => body.buffer as ArrayBuffer };
    };
    const lines: string[] = [];
    expect(await fetchJars(dir, fetcher, (l) => lines.push(l))).toBe(false);
    expect(lines).toEqual([
      "fetched  good-1.0.jar",
      `REFUSED  tampered-1.0.jar: digest ${sha256(bytes("something else"))} is not the pinned one`,
      "REFUSED  gone-1.0.jar: HTTP 404",
    ]);
    expect(fs.readdirSync(path.join(dir, "lib"))).toEqual(["good-1.0.jar"]); // nothing unverified reaches the disk
    // A second run fetches only what is still missing.
    calls.length = 0;
    fs.writeFileSync(path.join(dir, "jars.txt"), `org.x:good:1.0 ${abc}\n`);
    expect(await fetchJars(dir, fetcher, (l) => lines.push(l))).toBe(true);
    expect(calls).toEqual([]);
    expect(lines.at(-1)).toBe("kept     good-1.0.jar");
  });
});
