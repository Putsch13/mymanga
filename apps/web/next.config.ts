import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@manga-ai-studio/ui",
    "@manga-ai-studio/db",
    "@manga-ai-studio/config",
    "@manga-ai-studio/core",
    "@manga-ai-studio/ai",
    "@manga-ai-studio/moderation",
    "@manga-ai-studio/billing",
    "@manga-ai-studio/workflow",
    "@manga-ai-studio/memory",
    "@manga-ai-studio/exports",
  ],
  // Modules Node.js natifs utilisés uniquement côté serveur (API routes, Server Components)
  // → ne pas bundler côté client (sharp, pdf-lib, fal-storage-service, etc.)
  serverExternalPackages: [
    "sharp",
    "pdf-lib",
    "@fal-ai/client",
    "@fal-ai/serverless-client",
  ],
};

export default nextConfig;
