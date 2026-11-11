import type { GatsbySSR } from "gatsby";
import { UiProvider } from "./src/ui/Provider";
import { DEFAULT_THEME, themeInitScript } from "./src/ui/theme";

export const wrapRootElement: GatsbySSR["wrapRootElement"] = ({ element }) => <UiProvider>{element}</UiProvider>;

export const onRenderBody: GatsbySSR["onRenderBody"] = ({ setHtmlAttributes, setHeadComponents }) => {
  setHtmlAttributes({ "data-theme": DEFAULT_THEME, className: DEFAULT_THEME } as Record<string, string>);
  setHeadComponents([
    <meta key="web-app" name="apple-mobile-web-app-capable" content="yes" />,
    <script key="theme-init" dangerouslySetInnerHTML={{ __html: themeInitScript }} />,
  ]);
};
