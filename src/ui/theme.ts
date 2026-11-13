/**
 * Theme tokens and the Chakra system.
 *
 * The palette is defined once, as CSS custom properties on `:root` (dark, the
 * default) and `html[data-theme="light"]`. Diagrams colour themselves through
 * those same properties (`fill="var(--modern)"`), so they follow the theme with
 * no code. Chakra's semantic tokens point at the properties, and Chakra's own
 * `.dark` condition is kept in step by toggling the `dark`/`light` class.
 *
 * The base — palette wiring, preflight, reset, syntax colours, the code box,
 * the primitives' type roles — is the Bankai primitives' (src/bankai/system.ts);
 * this file supplies the reference's palette, fonts, its own type roles and
 * tokens, and its card styles. It is the one definition the page's components
 * read (UX-5): they name a role or a Chakra spacing step, never a length or a colour.
 */
import { createSystem, defaultConfig } from "@chakra-ui/react";
import {
  codeBlockCss,
  type ColorScheme,
  definePrimitivesConfig,
  fontSizeOf,
  media,
  type Palette,
  radius,
  schemeInitScript,
  syntaxCss,
  type TypeRole,
} from "../bankai";

export type ThemeMode = ColorScheme;
export const THEME_STORAGE_KEY = "cheat-theme";
export const DEFAULT_THEME: ThemeMode = "dark";

// --faint and --com were lifted from the legacy #6b7a90 / #79879b so every text use clears
// WCAG 1.4.3's 4.5:1 on all three surfaces in both themes (hanten, UX-1). --edge, a control's
// boundary, clears WCAG 1.4.11's 3:1 against the page, a control's fill and a card in both
// (dark ≥ 3.37:1, light ≥ 3.37:1); --line stays the quieter divider (zheref/swift-cheatsheets#5).
const dark: Palette = {
  bg: "#0e1117", bg2: "#151a23", card: "#161b25", line: "#262d3a", edge: "#606f85",
  fg: "#e6edf3", dim: "#93a1b5", faint: "#8493a8",
  kw: "#ff79c6", str: "#7ee787", typ: "#7dd3fc", num: "#ffab70", com: "#8493a8", attr: "#d2a8ff", mem: "#ffd580",
  good: "#3fb950", bad: "#f85149", modern: "#58a6ff", legacy: "#d29922",
  accent: "#58a6ff",
};
const light: Palette = {
  bg: "#ffffff", bg2: "#f4f6fa", card: "#ffffff", line: "#dfe4ec", edge: "#7a8799",
  fg: "#161b22", dim: "#4c5a6e", faint: "#5f6d80",
  kw: "#b3319b", str: "#0a7d34", typ: "#0666b8", num: "#a04b00", com: "#5f6d80", attr: "#7a3ecb", mem: "#8a5a00",
  good: "#137a2b", bad: "#c1272d", modern: "#0666b8", legacy: "#8a5a00",
  accent: "#0666b8",
};

/** Both schemes' palettes, as the system receives them. */
export const palettes = { dark, light } as const;

/**
 * Applies the stored theme before first paint. Both adapters inline this in
 * `<head>`, so a reader who chose light never sees a dark flash, and React never
 * renders a theme-dependent attribute that could mismatch on hydration.
 */
export const themeInitScript = schemeInitScript(THEME_STORAGE_KEY);

const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const tone = (c: string) => ({ "--tc": `var(${c})` });

/**
 * The reference's own type roles, beside the primitives' (`typeRoles`): dense on desktop, and
 * on narrow screens nothing below 12px and reading text at 16px (UX-8; zheref/swift-cheatsheets#5).
 */
const pageType = {
  /** A sheet's title. */
  sheetTitle: { wide: "display", narrow: "display" },
  /** A card's title, a notice's heading. */
  heading: { wide: "lg", narrow: "base" },
  /** Reading text: rules, notes, setup steps, described results, notices. */
  prose: { wide: "md", narrow: "base" },
  /** Table cells: dense data. */
  table: { wide: "sm", narrow: "sm" },
  /** Small print: chips, sources, validation lines, inline code, the match count. */
  small: { wide: "xs", narrow: "xs" },
  /** Uppercase column and table-header labels. */
  label: { wide: "2xs", narrow: "xs" },
} as const satisfies Record<string, TypeRole>;

/** The reference's type roles, as values a style can take. */
export const textSize = Object.fromEntries(Object.keys(pageType).map((role) => [role, fontSizeOf(role)])) as {
  readonly [R in keyof typeof pageType]: string;
};

/** The reference's own sizes and washes, by role. Spacing is Chakra's step scale (`"2"` is 0.5rem). */
export const pageSize = {
  /** How far below the sticky top bar an anchored sheet or card lands: the bar is two rows on the narrow layout. */
  anchorOffset: "var(--anchor-offset)",
  /** The narrowest a card is before the grid drops a column, and a comparison column. */
  cardMin: "370px",
  columnMin: "300px",
  /** A chip-sized link or button on a fine pointer; touch sizes are `size.touch`. */
  chip: "8",
  /** The match-count line while empty: a hairline, so the live region is laid out before it speaks. */
  statusLine: "1px",
  /** Rule widths: the line under a sheet's title, and the accent stripe on a notice or a comparison column. */
  dividerRule: "2px",
  accentRule: "3px",
} as const;

/** Line heights and tracking the page's titles and chips use, beside the primitives' `lineHeight`. */
export const pageText = {
  displayLeading: "1.3",
  displayTracking: "-.01em",
  headingTracking: "-.005em",
  /** Uppercase labels: column labels and table headers. */
  labelTracking: ".06em",
  /** How far a source link's underline sits below its text. */
  underlineOffset: "2px",
} as const;

export const pageOverlay = {
  /** A hovered table row: lighter than a hovered control. */
  rowHover: "rgba(127,150,190,.07)",
  /** A column label's fill, from its tone. */
  toneWash: "color-mix(in srgb,var(--tc) 10%,transparent)",
} as const;

/** A card's corner: a step above a control's. */
export const pageRadius = { card: "11px", inline: "5px", notice: radius.menu } as const;

const config = definePrimitivesConfig({
  palettes,
  // The reference has no network dependencies: system font stacks only.
  fonts: { sans: SANS, mono: MONO },
  type: pageType,
  globalCss: {
    // The sticky top bar's height, for anchored sheets and cards: one row wide, two rows narrow.
    html: { "--anchor-offset": "64px", [media.narrow]: { "--anchor-offset": "120px" } },
    // ---------- cards ----------
    ".card .note": { margin: 0, marginBottom: "2", fontSize: textSize.prose, color: "var(--dim)", lineHeight: 1.45 },
    ...codeBlockCss(".card"),
    "code.inline": {
      background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: pageRadius.inline,
      paddingInline: "1", fontSize: textSize.small, color: "var(--typ)",
    },
    ".cols": { display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${pageSize.columnMin},1fr))`, gap: "2" },
    ".col": { minWidth: 0 },
    ".collabel": {
      display: "inline-block", fontSize: textSize.label, fontWeight: 800, letterSpacing: pageText.labelTracking, textTransform: "uppercase",
      marginBottom: "1", paddingBlock: "0.5", paddingInline: "1.5", borderRadius: radius.pill,
      color: "var(--tc)", background: pageOverlay.toneWash,
    },
    ".tone-good": tone("--good"), ".tone-bad": tone("--bad"), ".tone-modern": tone("--modern"),
    ".tone-legacy": tone("--legacy"), ".tone-neutral": tone("--faint"),
    ".col pre": { borderLeft: `${pageSize.accentRule} solid var(--tc)` },
    "ul.rules": { margin: 0, padding: 0, listStyle: "none" },
    "ul.rules li": {
      position: "relative", paddingBlock: "1.5", paddingInlineStart: "5", fontSize: textSize.prose, lineHeight: 1.5, borderBottom: "1px solid var(--line)",
    },
    "ul.rules li:last-child": { borderBottom: 0 },
    ".bullet": {
      // Centred on the first line at any text size: the row's top padding, then half a line less half the bullet.
      position: "absolute", left: "0.5", top: "calc(0.375rem + 0.75em - 4px)", width: "8px", height: "8px", borderRadius: "3px", background: "var(--tc,var(--faint))",
    },
    "li.tone-good .bullet": { borderRadius: "8px" },
    "li.tone-bad .bullet": { borderRadius: "1px" },
    // ---------- diagrams ----------
    // Diagrams are drawn images: their labels keep the SVG's own sizes and scroll with it, outside
    // the type scale (the maintainer's ruling on zheref/swift-cheatsheets#5; their legibility is #13).
    ".dgwrap": { overflowX: "auto", WebkitOverflowScrolling: "touch" },
    "svg.dg": { display: "block", width: "100%", minWidth: "720px", height: "auto", [media.narrow]: { minWidth: "820px" } },
    "svg.dg text": { fontFamily: SANS, fill: "var(--dim)" },
    "svg.dg text.mono": { fontFamily: MONO, fill: "var(--dim)" },
    // ---------- tables ----------
    ".tablewrap": { overflowX: "auto" },
    ".tablewrap table": { borderCollapse: "collapse", width: "100%", fontSize: textSize.table },
    ".tablewrap th, .tablewrap td": { textAlign: "left", paddingBlock: "1.5", paddingInline: "2", borderBottom: "1px solid var(--line)", verticalAlign: "top" },
    ".tablewrap th": { color: "var(--faint)", fontSize: textSize.label, textTransform: "uppercase", letterSpacing: pageText.labelTracking, fontWeight: 700 },
    ".tablewrap tbody tr:hover": { background: pageOverlay.rowHover },
    // ---------- syntax ----------
    ...syntaxCss,
    // ---------- print ----------
    "#side, #topbar, #scrim": { [media.print]: { display: "none" } },
    ".card": { [media.print]: { breakInside: "avoid", pageBreakInside: "avoid" } },
  },
});

export const system = createSystem(defaultConfig, config);
