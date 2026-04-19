/**
 * P3.1 — Test de non-régression : le bundle d'audit (`pnpm audit:bundle`) ne
 * doit JAMAIS embarquer de `*.tsbuildinfo`, ni de fichiers `.env` réels, ni
 * de `node_modules`.
 *
 * On inspecte directement le script `scripts/audit-bundle.mjs` : il doit
 * contenir ces exclusions dans sa liste `EXCLUDES`. Ça évite toute dérive
 * silencieuse si quelqu'un retire un pattern d'exclusion critique.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("P3.1 — audit-bundle.mjs : exclusions critiques", () => {
  const scriptPath = resolve(__dirname, "../../../scripts/audit-bundle.mjs");
  const src = readFileSync(scriptPath, "utf8");

  const mustExclude = [
    "*.tsbuildinfo",
    "node_modules",
    ".next",
    ".env",
    ".env.*",
    "*.log",
    ".git",
  ];

  for (const pattern of mustExclude) {
    it(`exclut ${pattern}`, () => {
      expect(src).toContain(`"${pattern}"`);
    });
  }

  it("whitelist ne contient pas de répertoire de build", () => {
    expect(src).not.toMatch(/WHITELIST_ENTRIES[^\]]*"\.next"/);
    expect(src).not.toMatch(/WHITELIST_ENTRIES[^\]]*"dist"/);
    expect(src).not.toMatch(/WHITELIST_ENTRIES[^\]]*"coverage"/);
  });
});
