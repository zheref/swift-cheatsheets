/**
 * Minimal inline markup for rule and table text: `code` spans and **bold**.
 *
 * Backticks toggle code and `**` toggles bold across the whole string, which is
 * exactly how the legacy renderer split its text, so every existing cell reads
 * the same. Output is a flat list of segments a renderer turns into elements.
 */
export interface Segment {
  text: string;
  code: boolean;
  bold: boolean;
}

export function parseInline(s: string): Segment[] {
  const out: Segment[] = [];
  let bold = false;
  s.split("`").forEach((chunk, i) => {
    const code = i % 2 === 1;
    chunk.split("**").forEach((piece, j) => {
      if (j > 0) bold = !bold;
      if (piece) out.push({ text: piece, code, bold });
    });
  });
  return out;
}

/** The text a reader sees: the markup characters removed. */
export function plainInline(s: string): string {
  return parseInline(s)
    .map((p) => p.text)
    .join("");
}
