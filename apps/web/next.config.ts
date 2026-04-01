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
    "@manga-ai-studio/prompts",
    "@manga-ai-studio/exports",
  ],
};

export default nextConfig;
