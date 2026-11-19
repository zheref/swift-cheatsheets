/**
 * A data-driven tokenizer for programming languages and terminal scripts.
 *
 * The rule order is the legacy Swift highlighter's, verbatim, so the migrated
 * catalog colours exactly as before: comments, strings, attributes, directives,
 * numbers, keywords, capitalised types, `.member` access. A language changes
 * only the data in its `highlight` block (keywords, comment markers, prefixes).
 *
 * Highlighting runs at render time on plain strings and React escapes every
 * token, so no snippet can inject markup.
 */
import type { Highlight } from "./schema";

export type TokenClass = "com" | "str" | "attr" | "num" | "kw" | "typ" | "mem";
export interface Token {
  /** `null` for plain text between tokens. */
  cls: TokenClass | null;
  text: string;
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

interface Compiled {
  rx: RegExp;
  classes: (TokenClass | null)[];
}

const cache = new WeakMap<Highlight, Compiled>();

function compile(h: Highlight): Compiled {
  const hit = cache.get(h);
  if (hit) return hit;
  const parts: string[] = [];
  const classes: (TokenClass | null)[] = [null];
  const add = (src: string, cls: TokenClass) => {
    parts.push(src);
    classes.push(cls);
  };
  if (h.dialect === "batch") add("(^[ \\t]*@?rem\\b[^\\n]*)", "com");
  if (h.lineComment) add(`(${escapeRx(h.lineComment)}[^\\n]*)`, "com");
  if (h.blockComment) {
    const [open, close] = h.blockComment;
    add(`(${escapeRx(open)}[\\s\\S]*?${escapeRx(close)})`, "com");
  }
  if (h.dialect === "sh") add("('[^']*')", "str");
  if (h.dialect === "powershell") {
    add("('(?:''|[^'])*')", "str");
    add('("(?:`[\\s\\S]|""|[^"`])*")', "str");
  } else if (h.dialect === "batch") {
    add('("[^"\\n]*")', "str");
  } else {
    add('("(?:\\\\.|[^"\\\\])*")', "str");
  }
  if (h.attributePrefix) add(`(${escapeRx(h.attributePrefix)}[A-Za-z_][\\w]*)`, "attr");
  if (h.directivePrefix) add(`(${escapeRx(h.directivePrefix)}[A-Za-z]+)`, "attr");
  add(`(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)`, "num");
  add(`\\b(${h.keywords.map(escapeRx).join("|")})\\b`, "kw");
  if (h.capitalisedTypes) add(`(\\b[A-Z][A-Za-z0-9_]*\\b)`, "typ");
  if (h.members) add(`(\\.[a-z_][\\w]*)`, "mem");
  const flags = h.dialect === "powershell" || h.dialect === "batch" ? "gim" : "gm";
  const compiled = { rx: new RegExp(parts.join("|"), flags), classes };
  cache.set(h, compiled);
  return compiled;
}

/** A continued line inherits the preceding shell word. Escaped separators belong to that word. */
function startsShellComment(src: string, index: number, escape: string): boolean {
  let i = index - 1;
  while (i >= 0) {
    if (!/[\s;|&()]/.test(src[i]!)) return false;
    let before = i - 1;
    while (before >= 0 && src[before] === escape) before--;
    if ((i - before - 1) % 2 === 0) return true;
    if (src[i] !== "\n") return false;
    i -= 2;
  }
  return true;
}

export function tokenize(src: string, h: Highlight): Token[] {
  const { rx, classes } = compile(h);
  const out: Token[] = [];
  let last = 0;
  rx.lastIndex = 0;
  for (let m = rx.exec(src); m !== null; m = rx.exec(src)) {
    // A hash inside a shell word (including $#) is data. Resume matching after it
    // so an actual comment or quoted string later on this line can still be coloured.
    if ((h.dialect === "sh" || h.dialect === "powershell") && m[0].startsWith("#") && !startsShellComment(src, m.index, h.dialect === "sh" ? "\\" : "`")) {
      rx.lastIndex = m.index + 1;
      continue;
    }
    if (m.index > last) out.push({ cls: null, text: src.slice(last, m.index) });
    let cls: TokenClass | null = null;
    for (let g = 1; g < m.length; g++) {
      if (m[g] !== undefined) {
        cls = classes[g] ?? null;
        break;
      }
    }
    out.push({ cls, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ cls: null, text: src.slice(last) });
  return out;
}
