import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@es-trading/shared'],
  outputFileTracingRoot: process.cwd(),
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
