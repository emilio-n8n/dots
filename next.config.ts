import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    proxyTimeout: 1000 * 60 * 30,
  },
};

export default nextConfig;