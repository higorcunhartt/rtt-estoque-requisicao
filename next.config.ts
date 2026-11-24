import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O JSON de partida (data/seed.json) precisa ir junto das funções serverless na Netlify.
  outputFileTracingIncludes: {
    "/api/dados": ["./data/seed.json"],
  },
};

export default nextConfig;
