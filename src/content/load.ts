/**
 * Build-time catalog loader (Node only): reads `content/languages/<id>/`,
 * validates it against the schema and the catalog invariants, and returns the
 * resolved, ordered catalog. Every failure names its file.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { topicsOf } from "./languages";
import {
  type Catalog,
  language as languageSchema,
  registry as registrySchema,
  type Registry,
  type SiteLanguage,
  sheet as sheetSchema,
  type Sheet,
} from "./schema";

export class CatalogError extends Error {
  constructor(readonly problems: string[]) {
    super(`content catalog is invalid:\n  - ${problems.join("\n  - ")}`);
    this.name = "CatalogError";
  }
}

/** Parses one YAML file; a syntax error becomes a problem that names the file, never a bare throw. */
function readYaml(file: string, problems: string[]): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: YAML.parse(fs.readFileSync(file, "utf8")) };
  } catch (err) {
    problems.push(`${file}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    return { ok: false };
  }
}

const issues = (file: string, err: z.ZodError) =>
  err.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`);

/**
 * Diagrams are injected as raw markup, so they are validated against an
 * ALLOWLIST over a strict tokenisation, never a denylist: only these drawing
 * elements and presentation attributes, double-quoted values, the four named
 * entities, and references only to fragments in the same file (`url(#id)`).
 * Anything the tokenizer does not recognise — comments, CDATA, single-quoted or
 * unquoted values, `&#` references, `style`, handlers, `href`, animation — is refused.
 */
const SVG_ELEMENTS = new Set(["svg", "g", "defs", "marker", "path", "rect", "line", "polyline", "polygon", "circle", "ellipse", "text", "tspan", "title", "desc"]);
const SVG_ATTRIBUTES = new Set([
  "xmlns", "class", "id", "role", "viewBox", "transform", "opacity",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "dx", "dy", "width", "height", "d", "points",
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "font-size", "font-weight", "text-anchor", "dominant-baseline", "letter-spacing",
  "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight", "refX", "refY", "orient",
]);
const TAG = /<(\/?)([A-Za-z][A-Za-z0-9-]*)((?:\s+[A-Za-z][A-Za-z0-9-]*="[^"<>&]*")*)\s*(\/?)>/y;
const ATTR = /([A-Za-z][A-Za-z0-9-]*)="([^"]*)"/g;
const TEXT = /(?:[^<&]+|&(?:amp|lt|gt|quot);)+/y;

export function diagramProblems(svg: string): string[] {
  const out = new Set<string>();
  const stack: string[] = [];
  let pos = 0;
  let roots = 0;
  while (pos < svg.length) {
    TAG.lastIndex = pos;
    const tag = TAG.exec(svg);
    if (tag) {
      const [, closing, name = "", attrs = "", selfClosing] = tag;
      if (!SVG_ELEMENTS.has(name)) out.add(`element <${name}> is not allowed`);
      if (closing) {
        if (stack.pop() !== name) out.add(`unbalanced </${name}>`);
      } else {
        if (!stack.length) roots++;
        for (const [, attr = "", value = ""] of attrs.matchAll(ATTR)) {
          if (!SVG_ATTRIBUTES.has(attr)) out.add(`attribute ${attr} is not allowed`);
          if (/url\(/i.test(value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(value)) out.add(`${attr} references something outside the file`);
          if (attr === "font-size" && !/^\d+(?:\.\d+)?$/.test(value)) out.add(`non-numeric font-size: ${value}`);
        }
        if (name === "svg" && !stack.length) {
          if (!/\sclass="dg"/.test(attrs)) out.add('must be a single <svg class="dg"> element');
          if (!/\sviewBox="0 0 940 \d+(?:\.\d+)?"/.test(attrs)) out.add("viewBox must be 940 units wide");
        }
        if (!selfClosing) stack.push(name);
      }
      pos = TAG.lastIndex;
      continue;
    }
    TEXT.lastIndex = pos;
    if (TEXT.exec(svg) && stack.length) {
      pos = TEXT.lastIndex;
      continue;
    }
    out.add(`unrecognised markup at offset ${pos}: ${JSON.stringify(svg.slice(pos, pos + 24))}`);
    break;
  }
  if (stack.length) out.add(`unclosed <${stack.join("> <")}>`);
  if (roots !== 1 || !svg.startsWith("<svg")) out.add('must be a single <svg class="dg"> element');
  return [...out];
}

export function loadCatalog(dir: string): Catalog {
  const problems: string[] = [];
  const langFile = path.join(dir, "language.yaml");
  const raw = readYaml(langFile, problems);
  if (!raw.ok) throw new CatalogError(problems);
  const parsed = languageSchema.safeParse(raw.value);
  if (!parsed.success) throw new CatalogError(issues(langFile, parsed.error));
  const { sheets: order, ...language } = parsed.data;
  if (path.basename(dir) !== language.id) problems.push(`${langFile}: id '${language.id}' must match its folder name`);

  const sheetDir = path.join(dir, "sheets");
  const files = fs.existsSync(sheetDir) ? fs.readdirSync(sheetDir).filter((f) => f.endsWith(".yaml")) : [];
  for (const f of files) {
    if (!order.includes(f.replace(/\.yaml$/, ""))) problems.push(`${path.join(sheetDir, f)}: not listed in language.yaml 'sheets'`);
  }
  const dupes = order.filter((id, i) => order.indexOf(id) !== i);
  if (dupes.length) problems.push(`${langFile}: duplicate sheet ids ${[...new Set(dupes)].join(", ")}`);

  const sheets: Sheet[] = [];
  for (const id of order) {
    const file = path.join(sheetDir, `${id}.yaml`);
    if (!fs.existsSync(file)) {
      problems.push(`${file}: listed in language.yaml but missing`);
      continue;
    }
    const raw = readYaml(file, problems);
    if (!raw.ok) continue;
    const res = sheetSchema.safeParse(raw.value);
    if (!res.success) {
      problems.push(...issues(file, res.error));
      continue;
    }
    const s = res.data;
    if (s.id !== id) problems.push(`${file}: id '${s.id}' must match its file name`);
    const cardIds = s.cards.map((c) => c.id);
    const dupCards = cardIds.filter((c, i) => cardIds.indexOf(c) !== i);
    if (dupCards.length) problems.push(`${file}: duplicate card ids ${[...new Set(dupCards)].join(", ")}`);
    for (const c of s.cards) {
      if (c.kind !== "diagram") continue;
      const svgFile = path.join(dir, "diagrams", c.svg);
      if (path.dirname(path.resolve(svgFile)) !== path.resolve(dir, "diagrams")) {
        problems.push(`${file}: card '${c.id}' svg must name a file directly inside diagrams/`);
        continue;
      }
      if (!fs.existsSync(svgFile)) {
        problems.push(`${file}: card '${c.id}' names missing diagram ${c.svg}`);
        continue;
      }
      c.svg = fs.readFileSync(svgFile, "utf8").trim();
      for (const p of diagramProblems(c.svg)) problems.push(`${svgFile}: ${p}`);
    }
    sheets.push(s);
  }

  // Sheets sharing a group must be adjacent, or the sidebar repeats a heading.
  const seen = new Set<string>();
  let previous: string | null = null;
  for (const s of sheets) {
    if (s.group !== previous && seen.has(s.group)) problems.push(`${langFile}: group '${s.group}' is split across non-adjacent sheets (at '${s.id}')`);
    seen.add(s.group);
    previous = s.group;
  }

  if (problems.length) throw new CatalogError(problems);
  return { language, sheets };
}

/** Every catalog under `<contentRoot>/languages/`, filtered by status. */
export function loadCatalogs(contentRoot: string, statuses: string[] = ["published"]): Catalog[] {
  const root = path.join(contentRoot, "languages");
  const catalogs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => loadCatalog(path.join(root, d.name)))
    .filter((c) => statuses.includes(c.language.status));
  const routes = catalogs.map((c) => c.language.route);
  const clash = routes.filter((r, i) => routes.indexOf(r) !== i);
  if (clash.length) throw new CatalogError([`two catalogs publish at ${[...new Set(clash)].join(", ")}`]);
  return catalogs.sort((a, b) => a.language.route.localeCompare(b.language.route));
}

/** The selector's registry, `<contentRoot>/registry.yaml`, validated. */
export function loadRegistry(contentRoot: string): Registry {
  const file = path.join(contentRoot, "registry.yaml");
  const problems: string[] = [];
  if (!fs.existsSync(file)) throw new CatalogError([`${file}: missing — every content root lists its languages there`]);
  const raw = readYaml(file, problems);
  if (!raw.ok) throw new CatalogError(problems);
  const parsed = registrySchema.safeParse(raw.value);
  if (!parsed.success) throw new CatalogError(issues(file, parsed.error));
  const ids = parsed.data.languages.map((l) => l.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new CatalogError([`${file}: duplicate language ids ${[...new Set(dupes)].join(", ")}`]);
  return parsed.data;
}

/**
 * The catalogs a build publishes, and the selector's languages in registry
 * order. Each built catalog must be in the registry under its own name, so the
 * selector can never omit or mislabel a page; a registry entry with no built
 * catalog is listed with `href: null`. `href` defaults to the catalog's route.
 */
export function loadSite(contentRoot: string, statuses: string[] = ["published"]): { catalogs: Catalog[]; languages: SiteLanguage[] } {
  const catalogs = loadCatalogs(contentRoot, statuses);
  const { languages: entries } = loadRegistry(contentRoot);
  const file = path.join(contentRoot, "registry.yaml");
  const problems: string[] = [];
  for (const c of catalogs) {
    const entry = entries.find((e) => e.id === c.language.id);
    if (!entry) problems.push(`${file}: catalog '${c.language.id}' is built but not listed`);
    else if (entry.name !== c.language.name) problems.push(`${file}: '${entry.id}' is named '${entry.name}' but its catalog says '${c.language.name}'`);
  }
  if (problems.length) throw new CatalogError(problems);
  const languages = entries.map(({ id, name }) => {
    const catalog = catalogs.find((c) => c.language.id === id);
    return { id, name, href: catalog?.language.route ?? null, topics: catalog ? topicsOf(catalog) : [] };
  });
  return { catalogs, languages };
}
