import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship public/logo-dark.png into the export route's lambda so the PDF
  // builder can fs.readFile it at runtime.
  outputFileTracingIncludes: {
    // Ship logo-dark.png into the routes that render PDFs at runtime —
    // the export route, the client portal (which self-heals onboarding
    // PDFs), and the client onboarding submit action.
    "/api/export/**": ["./public/logo-dark.png"],
    "/client/**": ["./public/logo-dark.png"],
  },
  experimental: {
    serverActions: {
      // Onboarding submit can include multiple brand-asset images.
      // Client-message compose can attach up to 10 files × 50 MB each,
      // plus the multipart headers; 100mb gives room without being wasteful.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
