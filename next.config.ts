import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export for Capacitor APK build (set NEXT_OUTPUT=export for APK CI)
  output: process.env.NEXT_OUTPUT === "export" ? "export" : undefined,
  // Headers for PWA manifest (web deployment only — not used in static export)
  ...(process.env.NEXT_OUTPUT !== "export" && {
    async headers() {
      return [
        {
          source: "/manifest.json",
          headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
        },
      ];
    },
  }),
};

export default nextConfig;
