import { defineConfig } from "vitest/config";
import path from "node:path";

const repoContracts = path.resolve(__dirname, "../../tests/contracts/**/*.test.ts");

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", repoContracts],
    exclude: ["tests/e2e/**"],
    testTimeout: 20000,
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

