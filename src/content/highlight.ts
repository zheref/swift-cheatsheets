/**
 * A data-driven tokenizer for C-family syntaxes.
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
  if (h.lineComment) add(`(${escapeRx(h.lineComment)}[^\\n]*)`, "com");
  if (h.blockComment) {
    const [open, close] = h.blockComment;
    add(`(${escapeRx(open)}[\\s\\S]*?${escapeRx(close)})`, "com");
  }
  add(`("(?:\\\\.|[^"\\\\])*")`, "str");
  if (h.attributePrefix) add(`(${escapeRx(h.attributePrefix)}[A-Za-z_][\\w]*)`, "attr");
  if (h.directivePrefix) add(`(${escapeRx(h.directivePrefix)}[A-Za-z]+)`, "attr");
  add(`(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)`, "num");
  add(`\\b(${h.keywords.map(escapeRx).join("|")})\\b`, "kw");
  if (h.capitalisedTypes) add(`(\\b[A-Z][A-Za-z0-9_]*\\b)`, "typ");
  if (h.members) add(`(\\.[a-z_][\\w]*)`, "mem");
  const compiled = { rx: new RegExp(parts.join("|"), "g"), classes };
  cache.set(h, compiled);
  return compiled;
}

export function tokenize(src: string, h: Highlight): Token[] {
  const { rx, classes } = compile(h);
  const out: Token[] = [];
  let last = 0;
  rx.lastIndex = 0;
  for (let m = rx.exec(src); m !== null; m = rx.exec(src)) {
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
