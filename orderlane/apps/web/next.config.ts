import type { NextConfig } from "next";

const config: NextConfig = {
  // @orderlane/core ships TypeScript source rather than a build step: it has no
  // dependencies, so there is nothing to bundle, and one fewer build artifact
  // to keep in sync.
  transpilePackages: ["@orderlane/core"],
  typedRoutes: true,
};

export default config;
