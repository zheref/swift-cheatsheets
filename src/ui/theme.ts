/**
 * Theme tokens and the Chakra system.
 *
 * The palette is defined once, as CSS custom properties on `:root` (dark, the
 * default) and `html[data-theme="light"]`. Diagrams colour themselves through
 * those same properties (`fill="var(--modern)"`), so they follow the theme with
 * no code. Chakra's semantic tokens point at the properties, and Chakra's own
 * `.dark` condition is kept in step by toggling the `dark`/`light` class.
 */
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

export type ThemeMode = "dark" | "light";
export const THEME_STORAGE_KEY = "cheat-theme";
export const DEFAULT_THEME: ThemeMode = "dark";

// --faint and --com were lifted from the legacy #6b7a90 / #79879b so every text use clears
// WCAG 1.4.3's 4.5:1 on all three surfaces in both themes (hanten, UX-1).
const dark = {
  "--bg": "#0e1117", "--bg2": "#151a23", "--card": "#161b25", "--line": "#262d3a",
  "--fg": "#e6edf3", "--dim": "#93a1b5", "--faint": "#8493a8",
  "--kw": "#ff79c6", "--str": "#7ee787", "--typ": "#7dd3fc", "--num": "#ffab70", "--com": "#8493a8", "--attr": "#d2a8ff", "--mem": "#ffd580",
  "--good": "#3fb950", "--bad": "#f85149", "--modern": "#58a6ff", "--legacy": "#d29922",
  "--accent": "#58a6ff",
};
const light = {
  "--bg": "#ffffff", "--bg2": "#f4f6fa", "--card": "#ffffff", "--line": "#dfe4ec",
  "--fg": "#161b22", "--dim": "#4c5a6e", "--faint": "#5f6d80",
  "--kw": "#b3319b", "--str": "#0a7d34", "--typ": "#0666b8", "--num": "#a04b00", "--com": "#5f6d80", "--attr": "#7a3ecb", "--mem": "#8a5a00",
  "--good": "#137a2b", "--bad": "#c1272d", "--modern": "#0666b8", "--legacy": "#8a5a00",
  "--accent": "#0666b8",
};

/**
 * Applies the stored theme before first paint. Both adapters inline this in
 * `<head>`, so a reader who chose light never sees a dark flash, and React never
 * renders a theme-dependent attribute that could mismatch on hydration.
 */
export const themeInitScript =
  `(function(){var r=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="light"||t==="dark"){r.setAttribute("data-theme",t);r.className=t;}}catch(e){}})();`;

const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
const tone = (c: string) => ({ "--tc": `var(${c})` });

const config = defineConfig({
  // No Chakra preflight: its `* { font: inherit }` reset sits in a cascade layer that
  // outranks SVG presentation attributes, which would strip every diagram's
  // font-size and font-weight. The page keeps the legacy page's own minimal reset.
  // Scoped to a class nothing carries rather than `false`: Chakra 3.38 serialises an
  // empty reset layer as a bare `@layer reset` that swallows the next layer block.
  preflight: { scope: ".chakra-preflight-unused", level: "parent" },
  // The reference has no network dependencies: system font stacks only.
  theme: {
    tokens: {
      fonts: { body: { value: SANS }, heading: { value: SANS }, mono: { value: MONO } },
    },
    semanticTokens: {
      colors: {
        cs: {
          bg: { value: "var(--bg)" }, bg2: { value: "var(--bg2)" }, card: { value: "var(--card)" },
          line: { value: "var(--line)" }, fg: { value: "var(--fg)" }, dim: { value: "var(--dim)" },
          faint: { value: "var(--faint)" }, accent: { value: "var(--accent)" },
        },
      },
    },
  },
  globalCss: {
    ":root": dark,
    'html[data-theme="light"]': light,
    "*, *::before, *::after": { boxSizing: "border-box" },
    "html, body": { margin: 0, padding: 0 },
    body: {
      background: "var(--bg)", color: "var(--fg)", font: `15px/1.5 ${SANS}`, textSizeAdjust: "100%",
      "@media print": { background: "#fff" },
    },
    "code, pre": { fontFamily: MONO },
    // ---------- cards ----------
    ".card .note": { margin: "0 0 8px", fontSize: "12.4px", color: "var(--dim)", lineHeight: 1.45 },
    ".card pre": {
      margin: 0, background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: "8px",
      padding: "9px 10px", overflowX: "auto", fontSize: "12.6px", lineHeight: 1.55, whiteSpace: "pre",
    },
    ".card pre + pre": { marginTop: "7px" },
    "code.inline": {
      background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: "5px",
      padding: ".5px 4px", fontSize: "11.9px", color: "var(--typ)",
    },
    ".cols": { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "9px" },
    ".col": { minWidth: 0 },
    ".collabel": {
      display: "inline-block", fontSize: "10.8px", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
      marginBottom: "4px", padding: "2px 7px", borderRadius: "20px",
      color: "var(--tc)", background: "color-mix(in srgb,var(--tc) 10%,transparent)",
    },
    ".tone-good": tone("--good"), ".tone-bad": tone("--bad"), ".tone-modern": tone("--modern"),
    ".tone-legacy": tone("--legacy"), ".tone-neutral": tone("--faint"),
    ".col pre": { borderLeft: "3px solid var(--tc)" },
    "ul.rules": { margin: 0, padding: 0, listStyle: "none" },
    "ul.rules li": {
      position: "relative", padding: "5px 0 5px 20px", fontSize: "13px", lineHeight: 1.5, borderBottom: "1px solid var(--line)",
    },
    "ul.rules li:last-child": { borderBottom: 0 },
    ".bullet": {
      position: "absolute", left: "2px", top: "11px", width: "8px", height: "8px", borderRadius: "3px", background: "var(--tc,var(--faint))",
    },
    "li.tone-good .bullet": { borderRadius: "8px" },
    "li.tone-bad .bullet": { borderRadius: "1px" },
    // ---------- diagrams ----------
    ".dgwrap": { overflowX: "auto", WebkitOverflowScrolling: "touch" },
    "svg.dg": { display: "block", width: "100%", minWidth: "720px", height: "auto", "@media (max-width: 900px)": { minWidth: "820px" } },
    "svg.dg text": { fontFamily: SANS, fill: "var(--dim)" },
    "svg.dg text.mono": { fontFamily: MONO, fill: "var(--dim)" },
    // ---------- tables ----------
    ".tablewrap": { overflowX: "auto" },
    ".tablewrap table": { borderCollapse: "collapse", width: "100%", fontSize: "12.6px" },
    ".tablewrap th, .tablewrap td": { textAlign: "left", padding: "6px 9px", borderBottom: "1px solid var(--line)", verticalAlign: "top" },
    ".tablewrap th": { color: "var(--faint)", fontSize: "10.8px", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 },
    ".tablewrap tbody tr:hover": { background: "rgba(127,150,190,.07)" },
    // ---------- syntax ----------
    ".t-kw": { color: "var(--kw)" }, ".t-str": { color: "var(--str)" }, ".t-typ": { color: "var(--typ)" },
    ".t-num": { color: "var(--num)" }, ".t-com": { color: "var(--com)", fontStyle: "italic" },
    ".t-attr": { color: "var(--attr)" }, ".t-mem": { color: "var(--mem)" },
    // ---------- print ----------
    "#side, #topbar, #scrim": { "@media print": { display: "none" } },
    ".card": { "@media print": { breakInside: "avoid", pageBreakInside: "avoid" } },
  },
});

export const system = createSystem(defaultConfig, config);
