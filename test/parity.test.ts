/**
 * Content and anchor parity with the pre-migration page (issue #1, AC-1, AC-2, SC-1).
 *
 * `fixtures/legacy-inventory.json` was extracted from the committed index.html
 * that the Python generator produced at 1093188 — independently of the
 * migration's own converter — and records, per sheet and card, the visible text
 * and every code block and diagram as SHA-256 digests.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Card } from "../src/content/schema";
import { cardText } from "../src/content/search";
import { isWide } from "../src/ui/cards";
import { ROOT, sha256, swiftCatalog } from "./helpers";

interface LegacyCard {
  kind: string;
  wide: boolean;
  title: string;
  note: string;
  textSha256: string;
  codeSha256: string[];
  svgSha256?: string;
}
interface Legacy {
  anchors: string[];
  nav: { href: string; label: string }[];
  sheets: { id: string; group: string; title: string; subtitle: string; cards: LegacyCard[] }[];
}

const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/legacy-inventory.json"), "utf8")) as Legacy;
const LEGACY_KIND: Record<Card["kind"], string> = { code: "code", compare: "cmp", rules: "rules", table: "table", diagram: "svg" };
const codeBlocks = (c: Card) => (c.kind === "code" ? [c.code] : c.kind === "compare" ? c.columns.map((k) => k.code) : []);

describe("Swift catalog parity with the pre-migration page", () => {
  const catalog = swiftCatalog();

  it("keeps the inventory totals: 29 sheets, 289 cards, 17 diagrams, 256 code blocks", () => {
    const cards = catalog.sheets.flatMap((s) => s.cards);
    expect(catalog.sheets).toHaveLength(29);
    expect(cards).toHaveLength(289);
    expect(cards.filter((c) => c.kind === "diagram")).toHaveLength(17);
    expect(cards.flatMap(codeBlocks)).toHaveLength(256);
    expect(legacy.sheets.flatMap((s) => s.cards)).toHaveLength(289);
  });

  it("keeps every anchor, in the same order (saved #links still land)", () => {
    expect(catalog.sheets.map((s) => s.id)).toEqual(legacy.anchors);
  });

  it("keeps the sidebar: same links, labels and order", () => {
    expect(catalog.sheets.map((s) => ({ href: `#${s.id}`, label: s.title }))).toEqual(legacy.nav);
  });

  it("keeps each sheet's group, title and subtitle", () => {
    expect(catalog.sheets.map(({ id, group, title, subtitle }) => ({ id, group, title, subtitle }))).toEqual(
      legacy.sheets.map(({ id, group, title, subtitle }) => ({ id, group, title, subtitle })),
    );
  });

  for (const [i, sheet] of legacy.sheets.entries()) {
    it(`keeps every card of #${sheet.id} intact`, () => {
      const migrated = catalog.sheets[i]!;
      expect(migrated.cards).toHaveLength(sheet.cards.length);
      sheet.cards.forEach((old, j) => {
        const card = migrated.cards[j]!;
        const where = `${sheet.id} card ${j} (${old.title})`;
        expect(LEGACY_KIND[card.kind], where).toBe(old.kind);
        expect(isWide(card), where).toBe(old.wide);
        expect(card.title, where).toBe(old.title);
        expect(card.note, where).toBe(old.note);
        expect(sha256(cardText(card)), `${where}: visible text`).toBe(old.textSha256);
        expect(codeBlocks(card).map(sha256), `${where}: code blocks`).toEqual(old.codeSha256);
        if (card.kind === "diagram") expect(sha256(card.svg), `${where}: diagram markup`).toBe(old.svgSha256);
      });
    });
  }
});
