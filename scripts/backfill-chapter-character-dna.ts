#!/usr/bin/env npx tsx
/**
 * Point d’entrée racine (TODO P0.3) — délègue à l’implémentation web qui charge
 * Prisma + snapshot studio.
 *
 * Usage : `pnpm exec tsx scripts/backfill-chapter-character-dna.ts [chapterId]`
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(repoRoot, "apps/web/scripts/backfill-chapter-character-dna.ts");
const result = spawnSync("pnpm", ["exec", "tsx", target, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
