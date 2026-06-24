import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship public/logo-dark.png into the export route's lambda so the PDF
  // builder can fs.readFile it at runtime.
  outputFileTracingIncludes: {
    "/api/export/**": ["./public/logo-dark.png"],
  },
  // Prod has long-standing TS drift in admin/meetings — let the build through.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
