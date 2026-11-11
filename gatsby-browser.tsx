import type { GatsbyBrowser } from "gatsby";
import { UiProvider } from "./src/ui/Provider";

export const wrapRootElement: GatsbyBrowser["wrapRootElement"] = ({ element }) => <UiProvider>{element}</UiProvider>;
