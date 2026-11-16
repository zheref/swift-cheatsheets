import type { GatsbySSR } from "gatsby";
import type { Catalog } from "./src/content/schema";
import { UiProvider } from "./src/ui/Provider";
import { DEFAULT_THEME, themeInitScript } from "./src/ui/theme";

export const wrapRootElement: GatsbySSR["wrapRootElement"] = ({ element }) => <UiProvider>{element}</UiProvider>;

export const onRenderBody: GatsbySSR["onRenderBody"] = ({ pathname, loadPageDataSync, setHtmlAttributes, setHeadComponents }) => {
  // Gatsby development renders can omit the page-data loader.
  const pageContext = loadPageDataSync?.(pathname)?.result?.pageContext as { catalog?: Catalog } | undefined;
  // Keep root attributes out of Gatsby Head so hydration preserves the pre-paint theme.
  const lang = pageContext?.catalog?.language.locale ?? "en";
  setHtmlAttributes({ lang, "data-theme": DEFAULT_THEME, className: DEFAULT_THEME } as Record<string, string>);
  setHeadComponents([
    <meta key="web-app" name="apple-mobile-web-app-capable" content="yes" />,
    <script key="theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript }} />,
  ]);
};
