import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Lets a page call forbidden() and render a real 403 instead of throwing
    // an unhandled error that surfaces as a 500. A permission denial is an
    // expected outcome, not a server fault.
    authInterrupts: true,
  },

  // Workspace libs ship raw TypeScript; Next compiles them with the app.
  transpilePackages: ["@gwprint/auth", "@gwprint/db", "@gwprint/shared"],

  // Emit a self-contained Node server (.next/standalone) that runs anywhere:
  // Docker, ECS, a bare EC2 box. Vercel ignores this, so it costs us nothing
  // today and keeps the exit door open — and because we build it in CI, the
  // door is verified rather than assumed.
  output: "standalone",
  // Monorepo: trace from the repo root or the workspace libs (@gwprint/db,
  // @gwprint/auth) are omitted from the bundle and the container dies at
  // startup with a module-not-found.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
