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
    // The deck cover centers the client's logo; static-fallback logos live in
    // public/ and are fs.read at runtime by the monthly-report route.
    "/api/monthly-report/**": ["./public/*.svg", "./public/*.png"],
  },
  async headers() {
    return [
      {
        // The F1 Pulse tag runs on client sites. Five minutes in the browser so
        // a fix reaches visitors quickly, a day at the CDN so origin is never
        // the bottleneck, and stale-while-revalidate so nobody ever waits on a
        // revalidation. Without this it inherits whatever the default is, and a
        // tag fix could sit uncollected for a long time.
        source: "/f1.js",
        headers: [
          { key: "cache-control", value: "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
          { key: "content-type", value: "application/javascript; charset=utf-8" },
          // Loaded cross-origin from client sites by design.
          { key: "access-control-allow-origin", value: "*" },
        ],
      },
    ];
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
