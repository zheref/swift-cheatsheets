/**
 * Full-text search over a catalog, independent of any renderer.
 *
 * Semantics are the legacy page's: the query splits on whitespace, every term
 * must appear (case-insensitive); a sheet whose title or subtitle matches shows
 * all of its cards, otherwise only the cards whose own text matches.
 */
import { plainInline } from "./inline";
import type { Card, Catalog, Sheet } from "./schema";

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

/** The visible text of trusted SVG markup: tags dropped, entities decoded. */
export function svgText(svg: string): string {
  return svg.replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITY[e] ?? "");
}

/** Everything a reader can see on a card, in reading order. */
export function cardText(card: Card): string {
  const parts = [card.title, card.note];
  switch (card.kind) {
    case "code":
      parts.push(card.code, card.expected ?? "");
      break;
    case "compare":
      for (const c of card.columns) parts.push(c.label, c.code);
      parts.push(card.expected ?? "");
      break;
    case "rules":
      for (const i of card.items) parts.push(plainInline(i.text));
      break;
    case "table":
      parts.push(...card.headers);
      for (const r of card.rows) parts.push(...r.map(plainInline));
      break;
    case "diagram":
      parts.push(svgText(card.svg));
      break;
  }
  return parts.join("");
}

export const sheetText = (s: Sheet) => s.title + s.subtitle;

export interface SearchIndex {
  sheets: { id: string; hay: string; cards: { key: string; hay: string }[] }[];
}

export const cardKey = (sheetId: string, cardId: string) => `${sheetId}/${cardId}`;

export function buildIndex(catalog: Catalog): SearchIndex {
  return {
    sheets: catalog.sheets.map((s) => ({
      id: s.id,
      hay: sheetText(s).toLowerCase(),
      cards: s.cards.map((c) => ({ key: cardKey(s.id, c.id), hay: cardText(c).toLowerCase() })),
    })),
  };
}

export interface SearchResult {
  /** `null` when the query is empty: everything is visible. */
  visibleCards: Set<string> | null;
  visibleSheets: Set<string> | null;
  count: number;
}

export function search(index: SearchIndex, query: string): SearchResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { visibleCards: null, visibleSheets: null, count: 0 };
  const visibleCards = new Set<string>();
  const visibleSheets = new Set<string>();
  for (const s of index.sheets) {
    const sheetMatch = terms.every((t) => s.hay.includes(t));
    let shown = 0;
    for (const c of s.cards) {
      if (sheetMatch || terms.every((t) => c.hay.includes(t))) {
        visibleCards.add(c.key);
        shown++;
      }
    }
    if (shown) visibleSheets.add(s.id);
  }
  return { visibleCards, visibleSheets, count: visibleCards.size };
}

export const hitsLabel = (count: number, query: string) =>
  `${count} card${count === 1 ? "" : "s"} matching “${query}”`;
