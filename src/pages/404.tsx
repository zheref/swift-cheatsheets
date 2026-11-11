import { Box, Heading, Link, Text } from "@chakra-ui/react";
import type { HeadFC } from "gatsby";

export default function NotFound() {
  return (
    <Box as="main" maxW="560px" mx="auto" p="64px 20px">
      <Heading as="h1" fontSize="21px" mb="8px" color="cs.fg">
        Page not found
      </Heading>
      <Text color="cs.dim" fontSize="14px">
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
