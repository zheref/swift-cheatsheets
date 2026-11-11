/**
 * Build-time catalog loader (Node only): reads `content/languages/<id>/`,
 * validates it against the schema and the catalog invariants, and returns the
 * resolved, ordered catalog. Every failure names its file.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { type Catalog, language as languageSchema, sheet as sheetSchema, type Sheet } from "./schema";

export class CatalogError extends Error {
  constructor(readonly problems: string[]) {
    super(`content catalog is invalid:\n  - ${problems.join("\n  - ")}`);
    this.name = "CatalogError";
  }
}

const readYaml = (file: string): unknown => YAML.parse(fs.readFileSync(file, "utf8"));

const issues = (file: string, err: z.ZodError) =>
  err.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`);

/** Trusted diagram markup must stay inert: no scripts, handlers, external references or foreign objects. */
export function diagramProblems(svg: string): string[] {
  const out: string[] = [];
  if (!/^<svg\b[^>]*\bclass="dg"/.test(svg)) out.push('must be a single <svg class="dg"> element');
  if (!/viewBox="0 0 940 \d+(?:\.\d+)?"/.test(svg)) out.push("viewBox must be 940 units wide");
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:/i.test(svg)) out.push("contains script, an event handler or foreignObject");
  if (/\b(?:href|xlink:href|src)\s*=\s*"(?!#)/i.test(svg)) out.push("references an external resource");
  const bogus = [...svg.matchAll(/font-size="([^"]*)"/g)].map((m) => m[1]).filter((v) => !/^\d+(?:\.\d+)?$/.test(v ?? ""));
  if (bogus.length) out.push(`non-numeric font-size: ${[...new Set(bogus)].join(", ")}`);
  return out;
}

export function loadCatalog(dir: string): Catalog {
  const problems: string[] = [];
  const langFile = path.join(dir, "language.yaml");
  const parsed = languageSchema.safeParse(readYaml(langFile));
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
    const res = sheetSchema.safeParse(readYaml(file));
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
