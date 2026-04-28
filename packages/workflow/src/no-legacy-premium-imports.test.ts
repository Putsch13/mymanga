/**
 * no-legacy-premium-imports.test.ts
 *
 * P1.15 — Test anti-régression pour les imports legacy dans le pipeline premium.
 *
 * Ces fichiers ne doivent importer aucun module legacy:
 *   - run-premium-v3-pipeline.ts
 *   - passes/render-pass.ts
 *   - build-storyboard-plan-from-approved-production-plan.ts
 *   - passes/enrich-panel-render-spec.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

const PREMIUM_FILES = [
  "run-premium-v3-pipeline.ts",
  "passes/render-pass.ts",
  "build-storyboard-plan-from-approved-production-plan.ts",
  "passes/enrich-panel-render-spec.ts",
];

const FORBIDDEN_IMPORTS = [
  "prompt-translator",
  "fal-scene-strategy",
  "blueprint-enrichment",
  "densify-premium-blueprints",
  "run-legacy-compatible",
];

/** Import quarantaine : pont canonique → storyboard (hors premium-only). */
const ALLOWED_QUARANTINE_LEGACY_IMPORT = /from\s+["']\.\/legacy\/build-storyboard-plan-from-canonical-plan["']/;

const LEGACY_PATTERNS = [
  /import.*from.*['"].*legacy.*['"]/i,
  /require\s*\(\s*['"].*legacy.*['"]\s*\)/i,
];

function getWorkflowSrcPath(): string {
  return resolve(__dirname);
}

describe("Premium pipeline legacy isolation", () => {
  for (const file of PREMIUM_FILES) {
    describe(file, () => {
      it("should not import legacy modules", () => {
        const filePath = resolve(getWorkflowSrcPath(), file);
        
        if (!existsSync(filePath)) {
          console.warn(`File not found: ${filePath}`);
          return;
        }

        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        const violations: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;

          for (const forbidden of FORBIDDEN_IMPORTS) {
            if (line.includes(forbidden)) {
              violations.push(`Line ${lineNum}: Contains forbidden import "${forbidden}"`);
            }
          }

          for (const pattern of LEGACY_PATTERNS) {
            if (pattern.test(line)) {
              if (ALLOWED_QUARANTINE_LEGACY_IMPORT.test(line)) continue;
              violations.push(`Line ${lineNum}: Matches legacy pattern`);
            }
          }
        }

        expect(violations, `Violations in ${file}:\n${violations.join("\n")}`).toHaveLength(0);
      });

      it("should not contain @deprecated code", () => {
        const filePath = resolve(getWorkflowSrcPath(), file);
        
        if (!existsSync(filePath)) {
          return;
        }

        const content = readFileSync(filePath, "utf-8");
        
        const hasDeprecated = /@deprecated/i.test(content);
        expect(hasDeprecated, `${file} contains @deprecated code`).toBe(false);
      });

      it("should not use LEGACY_ constants", () => {
        const filePath = resolve(getWorkflowSrcPath(), file);
        
        if (!existsSync(filePath)) {
          return;
        }

        const content = readFileSync(filePath, "utf-8");
        
        const hasLegacyConstant = /\bLEGACY_[A-Z_]+\b/.test(content);
        expect(hasLegacyConstant, `${file} uses LEGACY_ constants`).toBe(false);
      });
    });
  }
});

describe("Premium pipeline required imports", () => {
  it("run-premium-v3-pipeline should import premium guards", () => {
    const filePath = resolve(getWorkflowSrcPath(), "run-premium-v3-pipeline.ts");
    
    if (!existsSync(filePath)) {
      console.warn("File not found, skipping test");
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    
    expect(content).toContain("assert-premium-ai-engines-ready");
  });

  it("render-pass should not import legacy image generators", () => {
    const filePath = resolve(getWorkflowSrcPath(), "passes/render-pass.ts");
    
    if (!existsSync(filePath)) {
      console.warn("File not found, skipping test");
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    
    expect(content).not.toMatch(/image-generation-pass/i);
    expect(content).not.toMatch(/legacy.*generator/i);
  });
});
