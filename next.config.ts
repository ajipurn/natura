import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (database lokal untuk development) memuat file WASM sendiri; jangan dibundel.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
