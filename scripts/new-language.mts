/**
 * Scaffolds a catalog for a new language or stack from the required aspects
 * (content/aspects.yaml): a draft `language.yaml`, one stub sheet per required part — each
 * carrying the checklist it must answer — a language-essentials stub, and a coverage sheet
 * against the Swift catalog. Nothing can be forgotten, because nothing is typed from memory.
 *
 *   node scripts/new-language.mts <id> <Name> [--prefix <sheet-prefix>] [--out <dir>]
 *
 * Writes `content/languages/<id>/` (or `--out`), and refuses a folder that already exists.
 * `templates/new-language/` is this script's committed output, kept current by a test.
 * docs/ADDING-A-LANGUAGE.md is the guide.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

// Read as plain data, like scripts/verify.mts: Node runs this file directly, without a bundler
// to resolve src/. test/aspects.test.ts validates the same files through the real loaders.
interface AspectPart {
  id: string;
  title: string;
  scope: "shared" | "language" | "platform";
  concepts: [string, ...string[]];
  covers: string[];
}
interface Registry {
  aspects: { id: string; title: string; parts: AspectPart[] }[];
}
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const readYaml = <T,>(file: string) => YAML.parse(fs.readFileSync(file, "utf8")) as T;

export interface ScaffoldOptions {
  /** The catalog folder and language id, kebab-case. */
  id: string;
  /** The selector's label. */
  name: string;
  /** Sheet-id prefix, so anchors stay unique across catalogs; defaults to the id. */
  prefix?: string;
}

const GROUP = { shared: "Shared concepts", language: "language", platform: "Platform" } as const;
const TODO = "TODO";
const stringify = (value: unknown) => YAML.stringify(value, { lineWidth: 0 });

/** The example card every stub carries: all the metadata a published example states, as an excerpt. */
const exampleCard = {
  id: "example",
  kind: "code",
  title: `${TODO}: a practical example`,
  note: `${TODO}: one line on when a reader reaches for this.`,
  prerequisites: [`${TODO}: the toolchain and version`, `${TODO}: where to save the snippet and the command that runs it`],
  code: `// ${TODO}: the whole program — what is on the page is what runs`,
  expected: `${TODO}: the output it prints, or the effect in words`,
  validation: { status: "excerpt", host: `${TODO}: replace with 'ran' or 'compiled' plus toolchain and date once it is proved` },
};

function stubSheet(id: string, part: AspectPart, where: string, group: string) {
  return {
    id,
    concept: part.concepts[0],
    scope: part.scope,
    title: part.title,
    group,
    subtitle: `${TODO}: one line saying what this sheet answers.`,
    applies: { platforms: ["todo"], runtime: `${TODO}: the runtime in words`, versions: { todo: ">=0" } },
    sources: [{ title: `${TODO}: the primary documentation`, url: "https://example.com/" }],
    cards: [
      {
        id: "must-cover",
        kind: "rules",
        title: "What this sheet must cover",
        note: `Required by content/aspects.yaml (${where}). Replace this card with real ones that answer every point.`,
        items: part.covers.map((text) => ({ tone: "neutral", text })),
      },
      exampleCard,
    ],
  };
}

/** The files of a scaffolded catalog, by path relative to its folder. */
export function scaffold(root: string, { id, name, prefix = id }: ScaffoldOptions): Map<string, string> {
  if (!SLUG.test(id) || !SLUG.test(prefix)) throw new Error("the id and the prefix must be lowercase kebab-case slugs");
  const registry = readYaml<Registry>(path.join(root, "content/aspects.yaml"));
  const swiftDir = path.join(root, "content/languages/swift");
  const swift = readYaml<{ sheets: string[] }>(path.join(swiftDir, "language.yaml")).sheets.map((sheet) =>
    readYaml<{ concept: string; title: string }>(path.join(swiftDir, "sheets", `${sheet}.yaml`)),
  );
  const files = new Map<string, string>();
  const sheets: { id: string; concept: string; title: string }[] = [];
  const add = (sheet: { id: string; concept: string | undefined; title: string } & Record<string, unknown>) => {
    sheets.push({ id: sheet.id, concept: sheet.concept ?? "", title: sheet.title });
    files.set(`sheets/${sheet.id}.yaml`, stringify(sheet));
  };

  const parts = registry.aspects.flatMap((a) => a.parts.map((p) => ({ part: p, where: `${a.id} / ${p.id}`, id: `${prefix}-${p.id}` })));
  // Groups must be adjacent: shared concepts, then the language itself, then platform material, then coverage.
  for (const p of parts.filter((p) => p.part.scope === "shared")) add(stubSheet(p.id, p.part, p.where, GROUP.shared));
  add(
    stubSheet(
      `${prefix}-essentials`,
      {
        id: "essentials",
        title: `${name} Language Essentials`,
        scope: "language",
        concepts: ["language.essentials"],
        covers: [
          "generics and constraints; the type system's distinctive features",
          "optional or nullable values; error handling",
          "value versus reference semantics; memory and lifetime",
          "pattern matching and control flow; a table mapping Swift ideas to this language",
        ],
      },
      "not a required aspect: every catalog has one",
      `${name} ${GROUP.language}`,
    ),
  );
  for (const p of parts.filter((p) => p.part.scope !== "shared")) add(stubSheet(p.id, p.part, p.where, p.part.scope === "platform" ? GROUP.platform : `${name} ${GROUP.language}`));

  // The coverage sheet: every Swift topic, in Swift's order, with a disposition (docs/CONTENT-MODEL.md).
  const mine = new Map(sheets.map((s) => [s.concept, s.title]));
  add({
    id: `${prefix}-coverage`,
    concept: "meta.coverage",
    scope: "language",
    title: "Coverage against the Swift Catalog",
    group: "Coverage",
    subtitle: "Every Swift topic, and what this catalog has for it — an equivalent, a partial counterpart, or the reason there is none.",
    cards: [
      {
        id: "how-to-read",
        kind: "rules",
        title: "How to read the matrix",
        note: "Nothing here is a translation made to fill a gap.",
        items: [
          { tone: "good", text: "**equivalent** — a sheet here covers the same concept and shares its concept id, so the language selector lands on it from the Swift sheet." },
          { tone: "neutral", text: "**partial** — a sheet here covers part of it under its own concept id, so the selector does not land on it: the Here column names it and the reason says what is missing." },
          { tone: "bad", text: "**no counterpart** — nothing here; the reason says whether the topic does not exist in this language or is simply not written yet." },
        ],
      },
      {
        id: "matrix",
        kind: "table",
        title: "Swift topic by topic",
        note: "In the Swift catalog's reading order.",
        headers: ["Swift topic", "Disposition", "Here", "Why"],
        rows: swift.map((s) =>
          mine.has(s.concept)
            ? [s.title, "equivalent", mine.get(s.concept), `${TODO}: what this catalog's sheet covers of it`]
            : [s.title, "no counterpart", "—", `${TODO}: does the topic not exist here, or is it not written yet?`],
        ),
      },
    ],
  });

  files.set(
    "language.yaml",
    `# A catalog scaffolded by scripts/new-language.mts from content/aspects.yaml.
# docs/ADDING-A-LANGUAGE.md walks through what to replace; search for ${TODO}.
id: ${id}
name: ${stringify(name).trim()}
title: ${stringify(`${name} Cheat Sheets`).trim()}
route: /${id}/
# draft = validated but not built. Flip to published when no ${TODO} is left.
status: draft
description: "${TODO}: one sentence naming what the catalog covers."
locale: en
# The code blocks' language name. scripts/run-examples.mts needs a Runner for it before
# requireExampleMetadata can be switched on.
codeLanguage: ${id}
# requireExampleMetadata: true
highlight:
  # ${TODO}: the language's reserved words; quote "true", "false" and "null".
  keywords: [if, else, return]
  lineComment: //
  blockComment: [/*, "*/"]
  capitalisedTypes: true
  members: true
applies:
  runtime: "${TODO}: the runtime in words"
sheets:
${sheets.map((s) => `  - ${s.id}`).join("\n")}
`,
  );
  return files;
}

/** Writes a scaffold into `dir`, which must not exist yet. */
export function writeScaffold(dir: string, files: Map<string, string>) {
  if (fs.existsSync(dir)) throw new Error(`${dir} already exists — a scaffold never overwrites a catalog`);
  for (const [file, content] of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
}

/** The command line: the exit status, with what happened on `log`. */
export function main(argv: string[], root: string, log: (line: string) => void = console.log): number {
  const args = [...argv];
  const flag = (name: string) => (args.includes(name) ? args.splice(args.indexOf(name), 2)[1] : undefined);
  const prefix = flag("--prefix");
  const out = flag("--out");
  const [id, name] = args;
  if (!id || !name) {
    log("usage: node scripts/new-language.mts <id> <Name> [--prefix <sheet-prefix>] [--out <dir>]");
    return 2;
  }
  try {
    const dir = path.resolve(out ?? path.join(root, "content/languages", id));
    const files = scaffold(root, { id, name, ...(prefix ? { prefix } : {}) });
    writeScaffold(dir, files);
    log(`wrote ${files.size} files to ${dir} — next: docs/ADDING-A-LANGUAGE.md`);
    return 0;
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")));
}
