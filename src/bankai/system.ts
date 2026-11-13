/**
 * The Chakra configuration the Bankai primitives need, built from a consumer's
 * palette and fonts. The consumer adds its own global styles and creates the
 * system (`createSystem(defaultConfig, definePrimitivesConfig(...))`).
 *
 * Colours are CSS custom properties on `:root` (the dark default) and
 * `html[data-theme="light"]`, so anything — a diagram's `fill="var(--modern)"`,
 * a `color-mix()` — follows the scheme with no code; Chakra's semantic tokens
 * point at the same properties.
 */
import { defineConfig, type SystemStyleObject } from "@chakra-ui/react";
import { fontSize, lineHeight, media, paper, radius, space, type TypeRole, typeRoles, typeScale } from "./tokens";

/** Surface and text roles every primitive reads. */
export type SurfaceRole = "bg" | "bg2" | "card" | "line" | "edge" | "fg" | "dim" | "faint" | "accent";
/** Intent tones: a comparison column, a rule, a notice. */
export type ToneRole = "good" | "bad" | "modern" | "legacy";
/** Syntax roles a code block colours (see `CodeToken`). */
export type SyntaxRole = "kw" | "str" | "typ" | "num" | "com" | "attr" | "mem";
export type PaletteRole = SurfaceRole | ToneRole | SyntaxRole;

/** One scheme's colours; each role becomes the custom property `--<role>`, in the order given. */
export type Palette = Record<PaletteRole, string>;

export interface PrimitivesTheme {
  palettes: { dark: Palette; light: Palette };
  fonts: { sans: string; mono: string };
  /**
   * The consumer's own type roles, beside the primitives' (`typeRoles`): each becomes
   * `--fs-<role>` with its narrow-screen step, read through `fontSizeOf(role)`.
   */
  type?: Record<string, TypeRole>;
  /** The consumer's own global styles, after the primitives' base. */
  globalCss?: Record<string, SystemStyleObject>;
}

const SURFACES: SurfaceRole[] = ["bg", "bg2", "card", "line", "edge", "fg", "dim", "faint", "accent"];

const asProperties = (palette: Palette): SystemStyleObject =>
  // Custom properties, which Chakra's style type does not model.
  Object.fromEntries(Object.entries(palette).map(([role, value]) => [`--${role}`, value])) as unknown as SystemStyleObject;

/** Every type role as `--fs-<role>` on one layout, so one narrow-screen block re-floors the whole page. */
const typeProperties = (roles: Record<string, TypeRole>, layout: keyof TypeRole): SystemStyleObject =>
  Object.fromEntries(Object.entries(roles).map(([role, steps]) => [`--fs-${role}`, typeScale[steps[layout]]])) as unknown as SystemStyleObject;

/** Syntax colouring for `CodeBlock`'s tokens: `.t-<role>` reads `--<role>`; comments are italic. */
export const syntaxCss: Record<string, SystemStyleObject> = {
  ".t-kw": { color: "var(--kw)" }, ".t-str": { color: "var(--str)" }, ".t-typ": { color: "var(--typ)" },
  ".t-num": { color: "var(--num)" }, ".t-com": { color: "var(--com)", fontStyle: "italic" },
  ".t-attr": { color: "var(--attr)" }, ".t-mem": { color: "var(--mem)" },
};

/**
 * A code block's box — background, border, padding, and a horizontal scroll inside the
 * block so a long line never widens the page. `CodeBlock` renders an unstyled `<pre>`,
 * so this is its required setup: spread it into the system's global CSS, scoped to where
 * the consumer shows code (`.card` here), or unscoped (every `pre`).
 */
export const codeBlockCss = (scope = ""): Record<string, SystemStyleObject> => {
  const pre = scope ? `${scope} pre` : "pre";
  return {
    [pre]: {
      margin: 0, background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: radius.code,
      padding: space.codePadding, overflowX: "auto", fontSize: fontSize.code, lineHeight: lineHeight.code, whiteSpace: "pre",
    },
    [`${pre} + pre`]: { marginTop: space.codeStackGap },
  };
};

export function definePrimitivesConfig({ palettes, fonts, type = {}, globalCss = {} }: PrimitivesTheme) {
  const roles = { ...typeRoles, ...type };
  return defineConfig({
    // No Chakra preflight: its `* { font: inherit }` reset sits in a cascade layer that
    // outranks SVG presentation attributes, which would strip every diagram's
    // font-size and font-weight. The page keeps its own minimal reset below.
    // Scoped to a class nothing carries rather than `false`: Chakra 3.38 serialises an
    // empty reset layer as a bare `@layer reset` that swallows the next layer block.
    preflight: { scope: ".chakra-preflight-unused", level: "parent" },
    theme: {
      tokens: {
        fonts: { body: { value: fonts.sans }, heading: { value: fonts.sans }, mono: { value: fonts.mono } },
      },
      semanticTokens: {
        colors: { cs: Object.fromEntries(SURFACES.map((role) => [role, { value: `var(--${role})` }])) },
      },
    },
    globalCss: {
      ":root": {
        ...asProperties(palettes.dark),
        ...typeProperties(roles, "wide"),
        [media.narrow]: typeProperties(roles, "narrow"),
      },
      'html[data-theme="light"]': asProperties(palettes.light),
      "*, *::before, *::after": { boxSizing: "border-box" },
      "html, body": { margin: 0, padding: 0 },
      body: {
        background: "var(--bg)", color: "var(--fg)", font: `${fontSize.body}/${lineHeight.body} ${fonts.sans}`, textSizeAdjust: "100%",
        [media.print]: { background: paper.bg },
      },
      "code, pre": { fontFamily: fonts.mono },
      ...globalCss,
    },
  });
}
