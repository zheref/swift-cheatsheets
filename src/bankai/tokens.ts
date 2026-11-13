/**
 * Design tokens for the Bankai candidate primitives (zheref/swift-cheatsheets#4).
 *
 * Plain data with no imports: every primitive in `src/bankai/` reads its
 * colours, sizes, spacing, radii, layers and overlays from here, so changing a
 * value re-themes every primitive with no component edit. The type scale is
 * zheref/swift-cheatsheets#5's: a short list of rem steps, dense on desktop and
 * floored on narrow screens, each role emitted as a custom property
 * (docs/BANKAI-PRIMITIVES.md, "Tokens").
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
  /** Dividers and passive outlines: cards, tables, chips. */
  line: "cs.line",
  /** A control's boundary — field, button, toggle — at 3:1 or more against the page and its own fill (WCAG 1.4.11). */
  edge: "cs.edge",
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

/**
 * The type scale's steps, in rem, so every size follows the reader's root font size (WCAG 1.4.4).
 * The names read at the default 16px root: `2xs` 11px … `display` 21px.
 */
export const typeScale = {
  "2xs": "0.6875rem",
  xs: "0.75rem",
  sm: "0.78125rem",
  md: "0.8125rem",
  lg: "0.875rem",
  xl: "0.9375rem",
  base: "1rem",
  display: "1.3125rem",
} as const;
export type TypeStep = keyof typeof typeScale;

/**
 * A type role's step on each layout. Desktop keeps the dense "second screen" scale; on narrow
 * screens nothing is below `xs` (12px) and body text is `base` (16px) — UX-8, as the maintainer
 * ruled on zheref/swift-cheatsheets#5 (OQ-1).
 */
export interface TypeRole {
  wide: TypeStep;
  narrow: TypeStep;
}

/** The primitives' type roles. A consumer adds its own beside them (`definePrimitivesConfig`'s `type`). */
export const typeRoles = {
  /** The page's base text. */
  body: { wide: "xl", narrow: "base" },
  /** An icon inside a square control. */
  icon: { wide: "xl", narrow: "xl" },
  /** Text in a search field: 16px on narrow screens, which also keeps mobile browsers from zooming on focus. */
  input: { wide: "lg", narrow: "base" },
  /** The navigation rail's title. */
  navTitle: { wide: "lg", narrow: "lg" },
  /** Navigation links, selector options, the selector's toggle, a field's visible label. */
  control: { wide: "md", narrow: "md" },
  /** Code inside a code block. */
  code: { wide: "sm", narrow: "sm" },
  /** One-line hints under an option, a copy button. */
  hint: { wide: "xs", narrow: "xs" },
  /** Small print under a title. */
  meta: { wide: "2xs", narrow: "xs" },
  /** Uppercase group labels. */
  groupLabel: { wide: "2xs", narrow: "xs" },
} as const satisfies Record<string, TypeRole>;

/**
 * A type role as the custom property the system emits for it: `fontSizeOf("hint")` is `var(--fs-hint)`.
 * It builds role maps (`fontSize`, a consumer's own); name a size through such a map, whose keys are
 * the declared roles, rather than calling this with a string a typo could leave undefined.
 */
export const fontSizeOf = (role: string) => `var(--fs-${role})`;

/** The primitives' type roles, as values a style can take. */
export const fontSize = Object.fromEntries(Object.keys(typeRoles).map((role) => [role, fontSizeOf(role)])) as {
  readonly [R in keyof typeof typeRoles]: string;
};

export const lineHeight = {
  body: 1.5,
  control: 1.3,
  title: "1.4",
  code: 1.55,
} as const;

/** Spacing, by role. */
/**
 * The spacing scale: one definition for the primitives' `space` roles and for every spacing step
 * the consumer's components name (`"2"`); `definePrimitivesConfig` hands it to Chakra as its
 * `spacing` tokens. Keys and values follow Chakra's own scale (a step is 0.25rem), so a step
 * means the same thing in both places, and in rem it follows the reader's root size.
 */
export const spaceScale = {
  px: "1px",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  2.5: "0.625rem",
  3: "0.75rem",
  3.5: "0.875rem",
  4: "1rem",
  4.5: "1.125rem",
  5: "1.25rem",
  8: "2rem",
  10: "2.5rem",
  16: "4rem",
  30: "7.5rem",
} as const;
const s = spaceScale;

/** Spacing, by role: each a step of `spaceScale`. */
export const space = {
  /** Between controls in a bar. */
  barGap: s[2],
  /** Between a label and its glyph inside a control. */
  inlineGap: s[1.5],
  /** The top bar's own padding. */
  barPadding: `${s[3]} 0 ${s[2.5]}`,
  /** The main column's padding: wide, then narrow. */
  mainPadding: `0 ${s[5]} ${s[30]}`,
  mainPaddingNarrow: `0 ${s[3]} ${s[30]}`,
  /** The navigation rail's padding. */
  railPadding: `${s[3.5]} ${s[2.5]} ${s[10]}`,
  /** A navigation link's padding and vertical rhythm. */
  navItemPadding: `${s[1.5]} ${s[2]}`,
  navItemGap: s.px,
  /** A group label's margin, and the rail title's. */
  groupLabelMargin: `${s[3.5]} ${s[2]} ${s[1]}`,
  navTitleMargin: `${s[1]} ${s[2]} ${s[3]}`,
  /** A control's horizontal padding: a search field, a toggle. */
  inputPaddingX: s[3],
  togglePaddingX: s[3],
  /** A popover's inner padding and its distance from its toggle. */
  menuPadding: s[1],
  menuOffset: s[1.5],
  /** A popover option's padding, and the gap between its label and hint. */
  optionPadding: `${s[1.5]} ${s[2.5]}`,
  optionLineGap: s.px,
  /** The gap between a title and its small print. */
  metaGap: s[0.5],
  /** A small action button's horizontal padding (copy). */
  actionPaddingX: s[2],
  /** The gap between a code block and the toolbar above it. */
  toolbarGap: s[1],
  /** A code block's padding, and the gap between consecutive blocks. */
  codePadding: `${s[2]} ${s[2.5]}`,
  codeStackGap: s[2],
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
  /** An icon: one em, so it follows the text of the control it sits in. */
  icon: "1em",
  /** The stripe that marks the current link in a navigation list. */
  currentStripe: "3px",
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

/** The printed page: white paper, whatever the scheme on screen. */
export const paper = { bg: "#fff" } as const;

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
export const tokens = {
  media, wideQuery, color, colorVar, typeScale, typeRoles, fontSize, lineHeight, letterSpacing, spaceScale, space, radius, size, layer, overlay, paper, motion, focusRing,
} as const;
export type Tokens = typeof tokens;
