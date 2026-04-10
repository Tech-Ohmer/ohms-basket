import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read version from package.json so NEXT_PUBLIC_APP_VERSION is always in sync
const { version } = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8")
) as { version: string };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Expose app version to the client bundle
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
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
