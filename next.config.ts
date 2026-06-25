import type { NextConfig } from "next";

const isStaticExport = process.env.BUILD_STATIC === "true" || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        // Static export mode for GitHub Pages
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  // When not in static export, OpenNext / CF deploy handles it (see deploy-cf.mjs)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
