import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["monaco-editor"],
  async rewrites() {
    return [
      {
        source: "/luca-attachments/:id",
        destination: "/api/attachments/:id",
      },
    ];
  },
};

export default nextConfig;
