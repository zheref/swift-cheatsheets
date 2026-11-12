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
 *  - no template or serialisation artefacts leaked into the text, and no page element id (outside
 *    the diagrams' own SVG ids) is used twice;
 *  - the language selector lists the registry's languages in order, marks exactly this one
 *    current, and every language link it holds lands on a page that was built;
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

const FETCHING_ATTRIBUTES = ["src", "data", "poster", "action", "formaction", "background"];
const isExternal = (url: string) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim()) || /^(?:data|javascript|blob):/i.test(url.trim());

/** The URLs a style sheet fetches: `url(...)` targets other than same-document fragments, and every `@import`. */
export function cssReferences(css: string): string[] {
  const urls = [...css.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].map((m) => m[2] ?? "").filter((u) => !u.startsWith("#"));
  // `@import url(x)` is already counted above; a bare or quoted `@import "x"` is not.
  const imports = [...css.matchAll(/@import\s+(["'])([^"']+)\1/gi)].map((m) => m[2] ?? "");
  return [...urls, ...imports];
}

/** Each candidate URL of a `srcset` (`url [descriptor], url [descriptor], …`). */
export const srcsetCandidates = (value: string) =>
  value
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);

export interface ResourceReference {
  where: string;
  url: string;
}

/** Every resource the markup would make a browser fetch, one URL per entry. */
export function resourceReferences(d: Document): ResourceReference[] {
  const out: ResourceReference[] = [];
  for (const el of d.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    for (const attr of el.getAttributeNames()) {
      const value = el.getAttribute(attr) ?? "";
      const name = attr.toLowerCase();
      const where = `<${tag} ${name}>`;
      if (name === "srcset") out.push(...srcsetCandidates(value).map((url) => ({ where, url })));
      else if (FETCHING_ATTRIBUTES.includes(name)) out.push({ where, url: value });
      // A link the reader follows is not a request; any other href (stylesheet, svg image/use…) is.
      if ((name === "href" || name === "xlink:href") && tag !== "a" && !value.startsWith("#")) out.push({ where, url: value });
      if (name === "style") out.push(...cssReferences(value).map((url) => ({ where: `<${tag} style>`, url })));
    }
    if (tag === "style") out.push(...cssReferences(el.textContent ?? "").map((url) => ({ where: "<style>", url })));
  }
  return out;
}

/**
 * The problems with one built page; `offline` pages may reference nothing at all. With
 * `languages` (the registry's ids, in order) the selector is checked too, and its link
 * targets are returned for the caller to resolve against the built files.
 */
export function checkPage(
  html: string,
  sheets: string[],
  offline: boolean,
  languages?: { ids: string[]; current: string },
): { problems: string[]; stats: PageStats; languageLinks: string[] } {
  const problems: string[] = [];
  const { document: d } = new JSDOM(html).window;

  const options = [...d.querySelectorAll<HTMLElement>("nav#langnav #langlist > li")];
  if (languages) {
    const ids = options.map((o) => o.getAttribute("data-lang-option") ?? "");
    if (JSON.stringify(ids) !== JSON.stringify(languages.ids)) problems.push(`language selector lists [${ids.join(", ")}], registry.yaml [${languages.ids.join(", ")}]`);
    const current = options.filter((o) => o.querySelector("[aria-current]")).map((o) => o.getAttribute("data-lang-option"));
    if (JSON.stringify(current) !== JSON.stringify([languages.current])) problems.push(`language selector marks [${current.join(", ")}] current, not ${languages.current}`);
  }
  // A sheet anchor shadowed by another element (a control sharing its id) breaks saved `#links`.
  // Ids inside diagrams are each SVG's own marker/gradient names, outside this check.
  const allIds = [...d.querySelectorAll("[id]")].filter((e) => !e.closest("svg.dg")).map((e) => e.id);
  const dupIds = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dupIds.length) problems.push(`duplicate element ids: ${[...new Set(dupIds)].join(", ")}`);
  const languageLinks = options.flatMap((o) => [...o.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!));

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

  for (const { where, url } of resourceReferences(d)) {
    if (offline) problems.push(`offline file references ${where}: ${url}`);
    else if (isExternal(url)) problems.push(`site loads an external resource: ${where}: ${url}`);
  }

  const stats = {
    sections: ids.length,
    links: links.length,
    cards: d.querySelectorAll("article.card").length,
    blocks: blocks.length,
    diagrams: d.querySelectorAll("svg.dg").length,
  };
  return { problems, stats, languageLinks };
}

interface LanguageFile {
  id: string;
  route: string;
  status: string;
  sheets: string[];
}

/**
 * The built file a selector link lands on, or `null` when the link cannot work: the site
 * links by route (under public/), an offline file only by a path relative to itself, and
 * neither may resolve outside what the build wrote (public/ on the site, the checkout offline).
 */
function linkTarget(root: string, page: string, href: string, offline: boolean): string | null {
  const bare = href.replace(/[?#].*$/, "");
  if (bare.startsWith("/") === offline || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return null;
  const base = offline ? root : path.join(root, "public");
  const target = offline ? path.resolve(path.dirname(page), bare) : path.join(base, bare);
  const inside = path.relative(base, target);
  if (inside.startsWith("..") || path.isAbsolute(inside)) return null;
  return bare.endsWith("/") ? path.join(target, "index.html") : target;
}

/** The registry's language ids, or the reason they cannot be read — named, never a bare throw. */
function readRegistry(file: string): { ids: string[] } | { problem: string } {
  if (!fs.existsSync(file)) return { problem: "content/registry.yaml: missing" };
  let doc: unknown;
  try {
    doc = YAML.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return { problem: `content/registry.yaml: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
  }
  const languages = (doc as { languages?: unknown } | null)?.languages;
  if (!Array.isArray(languages) || !languages.every((l) => typeof (l as { id?: unknown })?.id === "string")) {
    return { problem: "content/registry.yaml: malformed — expected `languages:` entries with an `id`" };
  }
  return { ids: languages.map((l) => (l as { id: string }).id) };
}

/** Checks every published catalog's two pages under `root`; returns the failures. */
export function verifyRepository(root: string, log: (line: string) => void = console.log): string[] {
  const failures: string[] = [];
  const langRoot = path.join(root, "content/languages");
  const registryFile = path.join(root, "content/registry.yaml");
  const read = readRegistry(registryFile);
  const registry = "ids" in read ? read.ids : null;
  if ("problem" in read) failures.push(read.problem);
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
      const { problems, stats, languageLinks } = checkPage(html, lang.sheets, offline, registry ? { ids: registry, current: lang.id } : undefined);
      failures.push(...problems.map((p) => `${where}: ${p}`));
      for (const href of languageLinks) {
        const target = linkTarget(root, file, href, offline);
        if (!target || !fs.existsSync(target)) failures.push(`${where}: language link ${href} lands on no built page`);
      }
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
