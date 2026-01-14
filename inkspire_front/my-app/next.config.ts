import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyTimeout: 600_000, // 600 seconds (10 minutes) for long-running scaffold generation
  },
  // Proxy API requests to FastAPI backend
  async rewrites() {
    return [
      {
        source: '/health',
        destination: 'http://localhost:8000/health',
      },
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/threads/:path*',
        destination: 'http://localhost:8000/threads/:path*',
      },
    ];
  },
};

export default nextConfig;
