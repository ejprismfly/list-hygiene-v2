import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.96.69.47"],
  experimental: {
    // Keep production builds within the 2 GB deployment host's memory budget.
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
