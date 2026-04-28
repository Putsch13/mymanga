/**
 * api-route-inventory.test.ts
 *
 * P1.14 — Test anti-régression pour l'inventaire des routes API.
 *
 * Ce test doit échouer si une nouvelle route écrit dans:
 *   - Chapter
 *   - SceneImage
 *   - Job
 *   - approvedOutline
 *   - productionPlan
 * sans être déclarée dans l'inventaire.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const API_DIR = path.resolve(__dirname, "../app/api");
const INVENTORY_FILE = path.resolve(
  __dirname,
  "../../../docs/audits/api-routes-inventory.generated.md",
);

const DECLARED_RISKY_ROUTES = [
  "projects/[id]/chapters/[chapterId]/launch",
  "projects/[id]/pipeline",
  "ai/generate",
  "jobs/[jobId]/run-now",
  "scene-images/[sceneImageId]/retry",
  "scene-images/[sceneImageId]/validate",
  "scene-images/[sceneImageId]/debug",
  "projects/[id]/chapters",
  "chapters/[chapterId]/export/pdf",
  "characters/[characterId]/canon-evolution",
  "diagnostics/admin",
  "internal/premium-run-audit/[chapterId]",
  "projects/[id]/canon-health",
  "estimate-image",
  "projects/[id]/chapters/[chapterId]/approved-outline",
];

const WRITE_PATTERNS = {
  Chapter: [
    /chapter\.update/i,
    /chapter\.create/i,
    /prisma\.chapter\./i,
    /\.chapters\.create/i,
    /\.chapters\.update/i,
  ],
  SceneImage: [
    /sceneImage\.update/i,
    /sceneImage\.create/i,
    /prisma\.sceneImage\./i,
    /\.sceneImages\.create/i,
    /\.sceneImages\.update/i,
  ],
  Job: [
    /job\.create/i,
    /prisma\.job\.create/i,
    /\.jobs\.create/i,
  ],
  approvedOutline: [
    /approvedOutline\s*[=:]/i,
    /\.approvedOutline\s*=/i,
    /update.*approvedOutline/i,
  ],
  productionPlan: [
    /productionPlan\s*[=:]/i,
    /\.productionPlan\s*=/i,
    /update.*productionPlan/i,
  ],
};

function findRouteFiles(dir: string, basePath = ""): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.endsWith(".test.ts")) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath, relativePath));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      files.push(relativePath);
    }
  }

  return files;
}

function checkPatterns(content: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(content));
}

function normalizeRoutePath(routeFile: string): string {
  return path.dirname(routeFile).replace(/\\/g, "/");
}

describe("API Route Inventory", () => {
  it("should have an up-to-date inventory file", () => {
    const exists = fs.existsSync(INVENTORY_FILE);
    expect(exists, "Run 'pnpm audit:routes' to generate the inventory").toBe(true);
  });

  describe("Risky routes must be declared", () => {
    const routeFiles = findRouteFiles(API_DIR);

    for (const routeFile of routeFiles) {
      const routePath = normalizeRoutePath(routeFile);

      it(`${routePath} should be declared if it writes to critical tables`, () => {
        const fullPath = path.join(API_DIR, routeFile);
        const content = fs.readFileSync(fullPath, "utf-8");

        const writes: string[] = [];

        for (const [table, patterns] of Object.entries(WRITE_PATTERNS)) {
          if (checkPatterns(content, patterns)) {
            writes.push(table);
          }
        }

        if (writes.length > 0) {
          const isDeclared = DECLARED_RISKY_ROUTES.some((declared) =>
            routePath.includes(declared) || declared.includes(routePath),
          );

          expect(
            isDeclared,
            `Route "${routePath}" writes to [${writes.join(", ")}] but is not declared in inventory. Add it to DECLARED_RISKY_ROUTES.`,
          ).toBe(true);
        }
      });
    }
  });

  describe("Premium canonical routes", () => {
    it("launch route should be canonical for premium chapters", () => {
      const launchPath = path.join(
        API_DIR,
        "projects/[id]/chapters/[chapterId]/launch/route.ts",
      );

      if (!fs.existsSync(launchPath)) {
        console.warn("Launch route not found, skipping");
        return;
      }

      const content = fs.readFileSync(launchPath, "utf-8");

      expect(content).toMatch(/heroCharacterId|focusCharacterIds/);
      expect(content).toMatch(/POST/);
    });

    it("pipeline route doit renvoyer 409 premium_only en prod premium-only", () => {
      const pipelinePath = path.join(API_DIR, "projects/[id]/pipeline/route.ts");
      if (!fs.existsSync(pipelinePath)) {
        return;
      }
      const content = fs.readFileSync(pipelinePath, "utf-8");
      expect(content).toContain("premium_only_launch_route_required");
      expect(content).toContain("409");
    });
  });

  describe("Legacy routes restrictions", () => {
    it("ai/generate doit être désactivée en production (outil dev)", () => {
      const generatePath = path.join(API_DIR, "ai/generate/route.ts");

      if (!fs.existsSync(generatePath)) {
        return;
      }

      const content = fs.readFileSync(generatePath, "utf-8");

      const blocksProd =
        /NODE_ENV\s*===\s*["']production["']/.test(content) &&
        /dev_image_generate_route_disabled/.test(content);

      expect(
        blocksProd,
        "ai/generate doit retourner 403 + dev_image_generate_route_disabled en production",
      ).toBe(true);
    });

    it("run-now doit bloquer GENERATE_CHAPTER_SCRIPT en prod premium-only (409)", () => {
      const runNowPath = path.join(API_DIR, "jobs/[jobId]/run-now/route.ts");
      if (!fs.existsSync(runNowPath)) {
        return;
      }
      const content = fs.readFileSync(runNowPath, "utf-8");
      expect(content).toContain("run_now_disabled_in_premium_only");
      expect(content).toContain("409");
    });

    it("estimate-image doit être désactivée en production (outil dev)", () => {
      const estimatePath = path.join(API_DIR, "estimate-image/route.ts");
      if (!fs.existsSync(estimatePath)) {
        return;
      }
      const content = fs.readFileSync(estimatePath, "utf-8");
      const blocksProd =
        /NODE_ENV\s*===\s*["']production["']/.test(content) &&
        /dev_estimate_image_route_disabled/.test(content);
      expect(blocksProd, "estimate-image doit être bloquée en prod").toBe(true);
    });
  });
});
