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
  // Modules Node.js natifs uniquement côté serveur — ne pas bundler avec webpack
  serverExternalPackages: [
    "sharp",
    "pdf-lib",
    "@fal-ai/client",
    "@fal-ai/serverless-client",
  ],
  webpack(config, { isServer }) {
    if (isServer) {
      // Ignorer les dépendances optionnelles de sharp (bindings platform-specific)
      // qui ne sont pas installées selon la plateforme de build
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request?.startsWith("@img/sharp-")) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
