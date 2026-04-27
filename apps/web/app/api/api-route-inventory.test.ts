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

const API_DIR = path.resolve(__dirname);
const INVENTORY_FILE = path.resolve(
  __dirname,
  "../../../../docs/audits/api-routes-inventory.generated.md"
);

const DECLARED_RISKY_ROUTES = [
  "projects/[id]/chapters/[chapterId]/launch",
  "projects/[id]/pipeline",
  "ai/generate",
  "jobs/[jobId]/run-now",
  "scene-images/[sceneImageId]/retry",
  "scene-images/[sceneImageId]/validate",
  "projects/[id]/chapters",
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
            routePath.includes(declared) || declared.includes(routePath)
          );

          expect(
            isDeclared,
            `Route "${routePath}" writes to [${writes.join(", ")}] but is not declared in inventory. Add it to DECLARED_RISKY_ROUTES.`
          ).toBe(true);
        }
      });
    }
  });

  describe("Premium canonical routes", () => {
    it("launch route should be canonical for premium chapters", () => {
      const launchPath = path.join(
        API_DIR,
        "projects/[id]/chapters/[chapterId]/launch/route.ts"
      );
      
      if (!fs.existsSync(launchPath)) {
        console.warn("Launch route not found, skipping");
        return;
      }

      const content = fs.readFileSync(launchPath, "utf-8");
      
      expect(content).toMatch(/heroCharacterId|focusCharacterIds/);
      expect(content).toMatch(/POST/);
    });

    it("pipeline route should delegate or be debug-only", () => {
      const pipelinePath = path.join(
        API_DIR,
        "projects/[id]/pipeline/route.ts"
      );
      
      if (!fs.existsSync(pipelinePath)) {
        return;
      }

      const content = fs.readFileSync(pipelinePath, "utf-8");
      
      const isDebugOnly = /NODE_ENV.*development/i.test(content) ||
                         /debug.*only/i.test(content);
      const delegates = /launch/i.test(content);

      expect(
        isDebugOnly || delegates,
        "Pipeline route should delegate to launch or be debug-only"
      ).toBe(true);
    });
  });

  describe("Legacy routes restrictions", () => {
    it("ai/generate should not be used for premium chapters", () => {
      const generatePath = path.join(API_DIR, "ai/generate/route.ts");
      
      if (!fs.existsSync(generatePath)) {
        return;
      }

      const content = fs.readFileSync(generatePath, "utf-8");
      
      const hasPremiumGuard = 
        /premium.*blocked/i.test(content) ||
        /legacy.*only/i.test(content) ||
        /dev.*only/i.test(content) ||
        /if\s*\(.*isPremium/i.test(content);

      expect(
        hasPremiumGuard,
        "ai/generate should block premium chapters or be marked as dev-only"
      ).toBe(true);
    });
  });
});
