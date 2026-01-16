import type { NextConfig } from "next";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 600_000,
  },
  async rewrites() {
    
    return [
      {
        source: "/health",
        destination: `${BACKEND_URL}/health`,
      },
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/threads/:path*",
        destination: `${BACKEND_URL}/threads/:path*`,
      },
    ];
  },
};

export default nextConfig;
