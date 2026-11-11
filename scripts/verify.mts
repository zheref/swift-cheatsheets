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
 *  - the site loads scripts only from itself, and the offline file loads nothing at all.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
const fail = (where: string, what: string) => failures.push(`${where}: ${what}`);

interface LanguageFile {
  id: string;
  route: string;
  status: string;
  sheets: string[];
}

function check(file: string, lang: LanguageFile, offline: boolean) {
  const where = path.relative(root, file);
  if (!fs.existsSync(file)) return fail(where, "missing — run `npm run build`");
  const html = fs.readFileSync(file, "utf8");
  const { document: d } = new JSDOM(html).window;

  const sections = [...d.querySelectorAll("section.sheet")];
  const ids = sections.map((s) => s.id);
  if (JSON.stringify(ids) !== JSON.stringify(lang.sheets)) fail(where, `sections ${ids.length} do not match language.yaml's ${lang.sheets.length} sheets in order`);

  const links = [...d.querySelectorAll<HTMLAnchorElement>("#side a[href^='#']")].map((a) => a.getAttribute("href")!.slice(1));
  const missing = links.filter((h) => !d.getElementById(h));
  if (missing.length) fail(where, `sidebar links with no target: ${missing.join(", ")}`);
  if (links.length !== ids.length) fail(where, `${links.length} sidebar links for ${ids.length} sections`);

  const seen = new Set<string>();
  let previous: string | null = null;
  for (const s of sections) {
    const g = s.getAttribute("data-group") ?? "";
    if (g !== previous && seen.has(g)) fail(where, `group '${g}' is split across non-adjacent sheets`);
    seen.add(g);
    previous = g;
  }

  const blocks = [...d.querySelectorAll("pre > code")];
  if (!blocks.length) fail(where, "no code blocks found");
  for (const b of blocks) {
    const stray = [...b.children].find((c) => c.tagName !== "SPAN" || !/^t-[a-z]+$/.test(c.className) || c.children.length);
    if (stray) fail(where, `raw markup in a code block: <${stray.tagName.toLowerCase()}> near ${JSON.stringify((b.textContent ?? "").slice(0, 60))}`);
  }

  const bogus = [...d.querySelectorAll("svg.dg [font-size]")].map((e) => e.getAttribute("font-size")!).filter((v) => !/^\d+(?:\.\d+)?$/.test(v));
  if (bogus.length) fail(where, `non-numeric font-size in a diagram: ${[...new Set(bogus)].join(", ")}`);

  // What a reader sees: the body without its scripts and style sheets.
  const visibleBody = d.body.cloneNode(true) as HTMLElement;
  for (const el of visibleBody.querySelectorAll("script, style")) el.remove();
  const text = visibleBody.textContent ?? "";
  for (const artefact of ["[object Object]", "{{"]) { // not `undefined`/`NaN`: real TypeScript content says them
    if (new RegExp(`(?:^|[^A-Za-z])${artefact.replace(/[{}[\]]/g, "\\$&")}(?:[^A-Za-z]|$)`).test(text)) fail(where, `suspicious artefact in output: ${artefact}`);
  }

  for (const el of d.querySelectorAll("script[src], link[href], img[src], iframe[src], source[src]")) {
    const url = el.getAttribute("src") ?? el.getAttribute("href") ?? "";
    if (offline) fail(where, `offline file references ${url}`);
    else if (/^(?:[a-z]+:)?\/\//i.test(url)) fail(where, `site loads an external resource: ${url}`);
  }

  const cards = d.querySelectorAll("article.card").length;
  const diagrams = d.querySelectorAll("svg.dg").length;
  console.log(
    `${where.padEnd(28)} sections ${ids.length}  links ${links.length}  cards ${cards}  code blocks ${blocks.length}  diagrams ${diagrams}  ${Math.round(html.length / 1024)} KB`,
  );
}

const langRoot = path.join(root, "content/languages");
for (const dir of fs.readdirSync(langRoot)) {
  const lang = YAML.parse(fs.readFileSync(path.join(langRoot, dir, "language.yaml"), "utf8")) as LanguageFile;
  if (lang.status !== "published") continue;
  check(path.join(root, "public", lang.route, "index.html"), lang, false);
  check(lang.route === "/" ? path.join(root, "index.html") : path.join(root, "offline", `${lang.id}.html`), lang, true);
}

if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
