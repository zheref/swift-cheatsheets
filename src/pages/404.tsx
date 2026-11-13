import { Box, Heading, Link, Text } from "@chakra-ui/react";
import type { HeadFC } from "gatsby";
import { textSize } from "../ui/theme";

export default function NotFound() {
  return (
    <Box as="main" maxW="xl" mx="auto" py="16" px="5">
      <Heading as="h1" fontSize={textSize.sheetTitle} mb="2" color="cs.fg">
        Page not found
      </Heading>
      <Text color="cs.dim" fontSize={textSize.prose}>
        Every sheet lives on one page per language, addressed by anchor.{" "}
        <Link href="/" color="cs.accent">
          Open the Swift sheets
        </Link>
        .
      </Text>
    </Box>
  );
}

export const Head: HeadFC = () => (
  <>
    <html lang="en" />
    <title>Page not found</title>
  </>
);
