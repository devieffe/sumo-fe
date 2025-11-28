import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['upload.wikimedia.org', 'serpapi.com'], // allow external image hosts
  },
};

export default nextConfig;
