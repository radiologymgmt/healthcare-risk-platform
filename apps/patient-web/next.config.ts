import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@healthcare/shared-contracts"],
};

export default nextConfig;
