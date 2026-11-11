import { ChakraProvider } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { system } from "./theme";

/** The one provider every adapter wraps the page in. */
export function UiProvider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
