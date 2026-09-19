import type { NextConfig } from "next";

const config: NextConfig = {
  // @orderlane/core ships TypeScript source rather than a build step: it has no
  // dependencies, so there is nothing to bundle, and one fewer build artifact
  // to keep in sync.
  transpilePackages: ["@orderlane/core", "@orderlane/db", "@orderlane/services"],
  // typedRoutes is off: it cannot prove a template-literal href like
  // `/t/${slug}/orders`, and every route in this app is tenant-scoped. The
  // choice is between typed routes and readable links, and links win.

};

export default config;
