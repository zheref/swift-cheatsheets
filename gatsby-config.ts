import type { GatsbyConfig } from "gatsby";

const config: GatsbyConfig = {
  siteMetadata: {
    title: "Reference Cheat Sheets",
    description: "Dense, searchable reference cheat sheets built from language catalogs kept as data.",
  },
  // Every catalog lives at a folder route (`/`, `/<language>/`), matching Gatsby's default output.
  trailingSlash: "always",
  jsxRuntime: "automatic",
  graphqlTypegen: false,
  plugins: [],
};

export default config;
