import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // `server-only` est un marker Next qui throw côté browser bundle. En
      // vitest (node env) il n'est pas nécessaire — on le stub via un module
      // vide pour ne pas casser l'import des fichiers `*.server.ts`.
      "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
    },
  },
});

