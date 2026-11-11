/**
 * Structural checks on the BUILT pages — the Gatsby site (`public/`) and the
 * offline artifacts — independent of the code that produced them.
 *
 *   node scripts/verify.mts
 *
 * For every published catalog:
 *  - the page has one section per listed sheet, in order, and every sidebar link resolves;
 *  - sheets sharing a group are adjacent (a split group repeats its sidebar heading);
 *  - code blocks hold only text and highlight spans (no raw markup leaked);
 *  - every diagram's font-size is numeric;
 *  - no template or serialisation artefacts leaked into the text;
 *  - the site requests resources only from itself, and the offline file requests nothing at all:
 *    every URL-bearing attribute (src, srcset, data, poster, and href on anything but a link
 *    a reader follows), and every url()/@import in style sheets and style attributes, is read.
 * A run that checks no published catalog fails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import YAML from "yaml";

export interface PageStats {
  sections: number;
  links: number;
  cards: number;
  blocks: number;
  diagrams: number;
}

const FETCHING_ATTRIBUTES = ["src", "srcset", "data", "poster", "action", "formaction", "background"];
const isExternal = (url: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim()) || /^(?:data|javascript|blob):/i.test(url.trim());

/** `url(...)` targets other than same-document fragments, and every `@import`. */
export function cssReferences(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].map((m) => m[2] ?? "").filter((u) => !u.startsWith("#"));
  const imports = [...css.matchAll(/@import\s+(?:url\()?\s*["']?([^"');\s]+)/gi)].map((m) => `@import ${m[1]}`);
  return [...urls, ...imports];
}

/** Every resource the markup would make a browser fetch, as `<where>: <url>` strings. */
export function resourceReferences(d: Document): string[] {
  const out: string[] = [];
  for (const el of d.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    for (const attr of el.getAttributeNames()) {
      const value = el.getAttribute(attr) ?? "";
      const name = attr.toLowerCase();
      if (FETCHING_ATTRIBUTES.includes(name)) out.push(`<${tag} ${name}>: ${value}`);
      // A link the reader follows is not a request; any other href (stylesheet, svg image/use…) is.
      if ((name === "href" || name === "xlink:href") && tag !== "a" && !value.startsWith("#")) out.push(`<${tag} ${name}>: ${value}`);
      if (name === "style") out.push(...cssReferences(value).map((u) => `<${tag} style>: ${u}`));
    }
    if (tag === "style") out.push(...cssReferences(el.textContent ?? "").map((u) => `<style>: ${u}`));
  }
  return out;
}

/** The problems with one built page; `offline` pages may reference nothing at all. */
export function checkPage(html: string, sheets: string[], offline: boolean): { problems: string[]; stats: PageStats } {
  const problems: string[] = [];
  const { document: d } = new JSDOM(html).window;

  const sections = [...d.querySelectorAll("section.sheet")];
  const ids = sections.map((s) => s.id);
  if (JSON.stringify(ids) !== JSON.stringify(sheets)) problems.push(`sections ${ids.length} do not match language.yaml's ${sheets.length} sheets in order`);

  const links = [...d.querySelectorAll<HTMLAnchorElement>("#side a[href^='#']")].map((a) => a.getAttribute("href")!.slice(1));
  const missing = links.filter((h) => !d.getElementById(h));
  if (missing.length) problems.push(`sidebar links with no target: ${missing.join(", ")}`);
  if (links.length !== ids.length) problems.push(`${links.length} sidebar links for ${ids.length} sections`);

  const seen = new Set<string>();
  let previous: string | null = null;
  for (const s of sections) {
    const g = s.getAttribute("data-group") ?? "";
    if (g !== previous && seen.has(g)) problems.push(`group '${g}' is split across non-adjacent sheets`);
    seen.add(g);
    previous = g;
  }

  const blocks = [...d.querySelectorAll("pre > code")];
  if (!blocks.length) problems.push("no code blocks found");
  for (const b of blocks) {
    const stray = [...b.children].find((c) => c.tagName !== "SPAN" || !/^t-[a-z]+$/.test(c.className) || c.children.length);
    if (stray) problems.push(`raw markup in a code block: <${stray.tagName.toLowerCase()}> near ${JSON.stringify((b.textContent ?? "").slice(0, 60))}`);
  }

  const bogus = [...d.querySelectorAll("svg.dg [font-size]")].map((e) => e.getAttribute("font-size")!).filter((v) => !/^\d+(?:\.\d+)?$/.test(v));
  if (bogus.length) problems.push(`non-numeric font-size in a diagram: ${[...new Set(bogus)].join(", ")}`);

  // What a reader sees: the body without its scripts and style sheets.
  const visibleBody = d.body.cloneNode(true) as HTMLElement;
  for (const el of visibleBody.querySelectorAll("script, style")) el.remove();
  const text = visibleBody.textContent ?? "";
  for (const artefact of ["[object Object]", "{{"]) { // not `undefined`/`NaN`: real TypeScript content says them
    if (text.includes(artefact)) problems.push(`suspicious artefact in output: ${artefact}`);
  }

  for (const ref of resourceReferences(d)) {
    const url = ref.slice(ref.indexOf(": ") + 2);
    if (offline) problems.push(`offline file references ${ref}`);
    else if (isExternal(url)) problems.push(`site loads an external resource: ${ref}`);
  }

  const stats = {
    sections: ids.length,
    links: links.length,
    cards: d.querySelectorAll("article.card").length,
    blocks: blocks.length,
    diagrams: d.querySelectorAll("svg.dg").length,
  };
  return { problems, stats };
}

interface LanguageFile {
  id: string;
  route: string;
  status: string;
  sheets: string[];
}

/** Checks every published catalog's two pages under `root`; returns the failures. */
export function verifyRepository(root: string, log: (line: string) => void = console.log): string[] {
  const failures: string[] = [];
  const langRoot = path.join(root, "content/languages");
  let checked = 0;
  for (const dir of fs.readdirSync(langRoot, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const lang = YAML.parse(fs.readFileSync(path.join(langRoot, dir.name, "language.yaml"), "utf8")) as LanguageFile;
    if (lang.status !== "published") continue;
    checked++;
    const pages: [string, boolean][] = [
      [path.join(root, "public", lang.route, "index.html"), false],
      [lang.route === "/" ? path.join(root, "index.html") : path.join(root, "offline", `${lang.id}.html`), true],
    ];
    for (const [file, offline] of pages) {
      const where = path.relative(root, file);
      if (!fs.existsSync(file)) {
        failures.push(`${where}: missing — run \`npm run build\``);
        continue;
      }
      const html = fs.readFileSync(file, "utf8");
      const { problems, stats } = checkPage(html, lang.sheets, offline);
      failures.push(...problems.map((p) => `${where}: ${p}`));
      log(
        `${where.padEnd(28)} sections ${stats.sections}  links ${stats.links}  cards ${stats.cards}  code blocks ${stats.blocks}  diagrams ${stats.diagrams}  ${Math.round(html.length / 1024)} KB`,
      );
    }
  }
  if (!checked) failures.push("content/languages: no published catalog to check");
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const failures = verifyRepository(root);
  if (failures.length) {
    console.error("\nFAILURES:");
    for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}
