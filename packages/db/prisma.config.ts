import { defineConfig } from "prisma/config";
import path from "node:path";

// Prisma 6+ : le champ `package.json#prisma` est déprécié.
// On charge le .env (symlinké dans ce package) sans ajouter de dépendance.
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // noop (prod: vars d'env injectées par la plateforme)
  }
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx prisma/seed.ts",
  },
});

