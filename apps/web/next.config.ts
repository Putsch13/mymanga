import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Render starter/low-memory instances can OOM during Next's post-compile
  // lint/typecheck phase. Keep local/CI checks strict, but allow deploy builds
  // to skip them via explicit env flags.
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_DEPLOY_SKIP_LINT === "1",
  },
  typescript: {
    ignoreBuildErrors: process.env.NEXT_DEPLOY_SKIP_TYPECHECK === "1",
  },
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
    // Externaliser sharp + ses bindings optionnels platform-specific sur client ET serveur
    // sharp ne peut PAS être bundlé par webpack (module natif Node.js)
    const sharpExternalFn = ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
      if (request === "sharp" || request?.startsWith("@img/sharp-") || request?.startsWith("sharp/")) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    };

    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      sharpExternalFn,
    ];

    return config;
  },
};

export default nextConfig;
