import type { NextConfig } from "next";

// Captured once when the build starts (`next build` or `next dev`) and baked into the
// compiled output, so the running app can display when it was built. The build pipeline
// (see Dockerfile) overrides this via the NEXT_PUBLIC_BUILD_DATE env var so the date
// reflects the actual pipeline run rather than whenever the container happened to compile it.
const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString();

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
  },
};

export default nextConfig;
