import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@healthcare/shared-contracts"],
};

export default nextConfig;
