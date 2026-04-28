/**
 * Anti-régression : le studio ne doit pas appeler les routes legacy pour lancer
 * un chapitre (prod premium-only → POST .../chapters/[chapterId]/launch uniquement).
 */

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const STUDIO_DIR = path.resolve(__dirname, "../components/studio");

const FORBIDDEN_SUBSTRINGS = [
  '`/api/projects/${projectId}/pipeline`',
  "`/api/projects/${projectId}/pipeline`",
  "/pipeline`,",
  "/pipeline'",
  "/run-now",
  "/api/ai/generate",
  "/api/estimate-image",
];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules") continue;
      walkTsFiles(full, out);
    } else if (name.isFile() && (name.name.endsWith(".tsx") || name.name.endsWith(".ts"))) {
      if (name.name.endsWith(".test.ts")) continue;
      out.push(full);
    }
  }
  return out;
}

describe("studio — routes de lancement chapitre", () => {
  it("aucun composant studio n'appelle les endpoints legacy de génération chapitre", () => {
    const files = walkTsFiles(STUDIO_DIR);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        if (content.includes(forbidden)) {
          violations.push(`${path.relative(STUDIO_DIR, file)}: contient "${forbidden}"`);
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
