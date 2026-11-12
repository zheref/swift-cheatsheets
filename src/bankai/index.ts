/**
 * The Bankai candidate primitives (zheref/swift-cheatsheets#4): the public
 * surface a future Bankai package would export, proven here first.
 *
 * Dependency rule: files under `src/bankai/` import React, Chakra UI and each
 * other — never the content model, the product's `src/ui/`, Gatsby or any
 * router. test/bankai.test.tsx enforces it. docs/BANKAI-PRIMITIVES.md holds the
 * inventory and the extraction proposal.
 */
export { AppShell, type AppShellIds, type AppShellProps } from "./AppShell";
export { type CopyState, useCopy, useDisclosure, useDrawer, useSearchKeys } from "./behaviour";
export { CodeBlock, type CodeBlockProps, type CodeToken, type CopyLabels } from "./CodeBlock";
export { barButton, narrowTarget } from "./controls";
export { DisclosureSelector, type DisclosureSelectorProps, type SelectorIds, type SelectorOption } from "./DisclosureSelector";
export { type ColorScheme, schemeInitScript, useColorScheme } from "./scheme";
export { SearchField, type SearchFieldProps } from "./SearchField";
export {
  codeBlockCss,
  definePrimitivesConfig,
  type Palette,
  type PaletteRole,
  type PrimitivesTheme,
  type SurfaceRole,
  type SyntaxRole,
  syntaxCss,
  type ToneRole,
} from "./system";
export { ThemeToggle, type ThemeToggleProps } from "./ThemeToggle";
export * from "./tokens";
export { type TopicItem, TopicNav, type TopicNavProps } from "./TopicNav";
