/**
 * Design tokens for the Bankai candidate primitives (zheref/swift-cheatsheets#4).
 *
 * Plain data with no imports: every primitive in `src/bankai/` reads its
 * colours, sizes, spacing, radii, layers and overlays from here, so changing a
 * value re-themes every primitive with no component edit. The values are the
 * page's current ones, moved here unchanged — the dense desktop scale this
 * reference has always used. zheref/swift-cheatsheets#5 settles the type scale
 * and the narrow-screen floors on top of these names (docs/BANKAI-PRIMITIVES.md,
 * "Tokens").
 *
 * Names are semantic roles (what a value is for), not steps (how big it is):
 * a primitive asks for `fontSize.control`, and the theme decides which step of
 * its scale that is. Most groups are engine-neutral CSS values; two are not:
 * `color` holds Chakra semantic-token paths and `media` holds emotion selector
 * keys — the Chakra layer's mapping, which an extraction moves beside it.
 */

/** Media conditions, as Chakra/emotion selectors. */
export const media = {
  /** The one-column layout: drawer navigation, full-width search. */
  narrow: "@media (max-width: 900px)",
  /** Where a target must be touch-sized (UX-3): the narrow layout and any coarse pointer, whatever the width. */
  touch: "@media (max-width: 900px), (pointer: coarse)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  print: "@media print",
} as const;

/** The same breakpoint as a `matchMedia` query: the width at which the drawer no longer exists. */
export const wideQuery = "(min-width: 901px)";

/**
 * Colour roles, as Chakra semantic-token paths. The palette behind them is the
 * consumer's (`definePrimitivesConfig`); a primitive never names a colour value.
 */
export const color = {
  /** The page. */
  bg: "cs.bg",
  /** Controls, the navigation rail, code. */
  surface: "cs.bg2",
  /** Cards and popovers. */
  card: "cs.card",
  line: "cs.line",
  fg: "cs.fg",
  /** Secondary text. */
  dim: "cs.dim",
  /** Tertiary text: hints, group labels, placeholders. */
  faint: "cs.faint",
  accent: "cs.accent",
} as const;

/** The same roles as raw custom properties, for values Chakra cannot resolve (outlines, `color-mix`). */
export const colorVar = {
  fg: "var(--fg)",
  accent: "var(--accent)",
  /** The caution tone: notices that explain rather than warn, a failed action's label. */
  caution: "var(--legacy)",
} as const;

/** Type scale, by role. Desktop values; #5 adds the narrow-screen floors. */
export const fontSize = {
  /** The page's base text. */
  body: "15px",
  /** An icon glyph inside a square control. */
  icon: "15px",
  /** Text in a search field. */
  input: "14px",
  /** The navigation rail's title. */
  navTitle: "14px",
  /** Navigation links, selector options and the selector's toggle. */
  control: "13.2px",
  /** Code inside a code block. */
  code: "12.6px",
  /** One-line hints under an option, the selector's caret, a copy button. */
  hint: "12px",
  /** Small print under a title. */
  meta: "11px",
  /** Uppercase group labels. */
  groupLabel: "10.5px",
} as const;

export const lineHeight = {
  body: 1.5,
  control: 1.3,
  title: "1.4",
  code: 1.55,
} as const;

/** Spacing, by role. */
export const space = {
  /** Between controls in a bar. */
  barGap: "8px",
  /** Between a label and its glyph inside a control. */
  inlineGap: "6px",
  /** The top bar's own padding. */
  barPadding: "12px 0 10px",
  /** The main column's padding: wide, then narrow. */
  mainPadding: "0 20px 120px",
  mainPaddingNarrow: "0 12px 120px",
  /** The navigation rail's padding. */
  railPadding: "14px 10px 40px",
  /** A navigation link's padding and vertical rhythm. */
  navItemPadding: "6px 9px",
  navItemGap: "1px",
  /** A group label's margin, and the rail title's. */
  groupLabelMargin: "14px 8px 5px",
  navTitleMargin: "4px 8px 12px",
  /** A control's horizontal padding: a search field, a toggle. */
  inputPaddingX: "12px",
  togglePaddingX: "11px",
  /** A popover's inner padding and its distance from its toggle. */
  menuPadding: "5px",
  menuOffset: "6px",
  /** A popover option's padding, and the gap between its label and hint. */
  optionPadding: "6px 10px",
  optionLineGap: "1px",
  /** The gap between a title and its small print. */
  metaGap: "2px",
  /** A small action button's horizontal padding (copy). */
  actionPaddingX: "8px",
  /** The gap between a code block and the toolbar above it. */
  toolbarGap: "4px",
  /** A code block's padding, and the gap between consecutive blocks. */
  codePadding: "9px 10px",
  codeStackGap: "7px",
} as const;

/** Letter spacing, by role. */
export const letterSpacing = {
  groupLabel: ".09em",
  navTitle: ".02em",
} as const;

export const radius = {
  /** An option or link inside a list. */
  option: "7px",
  /** A code block. */
  code: "8px",
  /** A control: button, field, toggle. */
  control: "9px",
  /** A popover. */
  menu: "10px",
  /** A pill or chip. */
  pill: "20px",
} as const;

/** Fixed sizes, by role. */
export const size = {
  /** A control's height and a square control's width on a fine pointer. */
  control: "38px",
  /** A selector option on a fine pointer. */
  option: "40px",
  /** The minimum touch target (UX-3). */
  touch: "44px",
  /** The navigation rail's width. */
  rail: "236px",
  /** A popover's minimum width, and its margin from the viewport edge. */
  menuMin: "240px",
  menuViewportMargin: "24px",
  /** Where a long current value is clipped on narrow screens so the search keeps its width. */
  clipNarrow: "7.5em",
} as const;

/** Stacking order: one ladder, so overlays never fight. */
export const layer = {
  topbar: 20,
  menu: 30,
  scrim: 50,
  drawer: 60,
} as const;

/** Overlays: scrims, elevations and state washes. */
export const overlay = {
  scrim: "rgba(0,0,0,.45)",
  menuShadow: "0 10px 30px rgba(0,0,0,.35)",
  drawerShadow: "0 0 40px rgba(0,0,0,.5)",
  /** A hovered option or link. */
  hover: "rgba(127,150,190,.12)",
  /** The current link in a navigation list. */
  selected: "color-mix(in srgb, var(--accent) 14%, transparent)",
} as const;

const DRAWER = ".18s";
export const motion = {
  /** The drawer's slide, and how long its closed state waits before hiding. Every transition is dropped under `media.reducedMotion`. */
  drawer: `${DRAWER} ease`,
  drawerDuration: DRAWER,
} as const;

/** Focus rings (UX-1): one outline, offset by where the control sits. */
export const focusRing = {
  outside: { outline: `2px solid ${colorVar.accent}`, outlineOffset: "1px" },
  inside: { outline: `2px solid ${colorVar.accent}`, outlineOffset: "-2px" },
} as const;

/**
 * Every token, as one object: the shape #5 and an extracted package carry. Primitives
 * import the named groups; a runtime override (a provider) is not part of this contract.
 */
export const tokens = { media, wideQuery, color, colorVar, fontSize, lineHeight, letterSpacing, space, radius, size, layer, overlay, motion, focusRing } as const;
export type Tokens = typeof tokens;
