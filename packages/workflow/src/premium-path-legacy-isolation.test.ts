import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * COMMIT G — tests BLOQUANTS pour l'isolation legacy du chemin premium v3.
 *
 * Contrat (mission de refonte, P11 §4) :
 * Le chemin premium doit être EXCLUSIVEMENT :
 *   StoryArc -> StoryboardPlan -> PanelRenderSpec -> minimal prompt -> FAL v3.
 *
 * Aucun module du chemin premium NE DOIT importer :
 *   - `manga-prompt-composer` (prompt legacy narratif)
 *   - `fal-scene-strategy`    (routage FAL heuristique legacy)
 *   - `prompt-translator`     (bricolage FR/EN legacy)
 *   - `panel-blueprint-builder` (blueprint legacy pre-storyboard)
 *   - `blueprint-enrichment`  (expand-to-minimum legacy)
 *
 * Si un de ces tests casse, c'est qu'une régression a réintroduit du legacy
 * dans le chemin premium. À corriger AVANT merge.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");

const PREMIUM_PATH_FILES = [
  // Workflow v3 passes
  "packages/workflow/src/passes/story-pass.ts",
  "packages/workflow/src/passes/storyboard-pass.ts",
  "packages/workflow/src/passes/render-pass.ts",
  // AI v3 services
  "packages/ai/src/services/minimal-panel-prompt-builder.ts",
  "packages/ai/src/services/fal-render-route-v3.ts",
  "packages/ai/src/services/render-spec-builder.ts",
  // AI v3 agents
  "packages/ai/src/agents/story-architect-agent.ts",
  "packages/ai/src/agents/manga-editor-agent-llm.ts",
  // AI v3 validators
  "packages/ai/src/validators/render-spec-validator.ts",
  "packages/ai/src/validators/storyboard-validator.ts",
  "packages/ai/src/validators/visual-coverage-validator.ts",
  // AI v3 contracts
  "packages/ai/src/contracts/panel-render-spec.ts",
  "packages/ai/src/contracts/storyboard-plan.ts",
  "packages/ai/src/contracts/story-arc.ts",
];

const FORBIDDEN_LEGACY_IMPORTS = [
  "manga-prompt-composer",
  "fal-scene-strategy",
  "prompt-translator",
  "panel-blueprint-builder",
  "blueprint-enrichment",
];

function readPremiumFile(relativePath: string): string {
  const absolutePath = path.resolve(REPO_ROOT, relativePath);
  return fs.readFileSync(absolutePath, "utf-8");
}

/**
 * Extrait toutes les lignes `import ... from "..."` (ES modules)
 * et `require("...")` d'un fichier. Ignore les commentaires.
 */
function extractImportSpecifiers(source: string): string[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

  const specifiers: string[] = [];
  const importRegex = /from\s+["']([^"']+)["']/g;
  const requireRegex = /require\(\s*["']([^"']+)["']\s*\)/g;
  const dynamicImportRegex = /import\(\s*["']([^"']+)["']\s*\)/g;

  for (const regex of [importRegex, requireRegex, dynamicImportRegex]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(withoutLineComments)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

describe("premium path — legacy isolation (commit G, P11 §4)", () => {
  it.each(PREMIUM_PATH_FILES)(
    "%s n'importe AUCUN module legacy interdit",
    (relativePath) => {
      const source = readPremiumFile(relativePath);
      const specifiers = extractImportSpecifiers(source);

      const violations = specifiers.filter((specifier) =>
        FORBIDDEN_LEGACY_IMPORTS.some((forbidden) =>
          specifier.includes(forbidden),
        ),
      );

      expect(
        violations,
        `[premium/legacy-isolation] ${relativePath} importe du legacy :\n` +
          `  ${violations.join("\n  ")}\n` +
          `  Modules legacy interdits dans le chemin premium : ${FORBIDDEN_LEGACY_IMPORTS.join(", ")}\n` +
          `  Action : retire cet import. Le chemin premium DOIT passer par minimal-panel-prompt-builder + fal-render-route-v3.`,
      ).toEqual([]);
    },
  );

  it("tous les fichiers du chemin premium listés existent (pas de ref fantôme)", () => {
    const missing = PREMIUM_PATH_FILES.filter(
      (relativePath) => !fs.existsSync(path.resolve(REPO_ROOT, relativePath)),
    );
    expect(
      missing,
      `Fichiers premium référencés mais manquants :\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });
});

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const PREMIUM_CANONICAL_FILES_NO_DENSIFY = [
  "packages/workflow/src/run-premium-v3-pipeline.ts",
  "packages/ai/src/services/premium-chapter-contract-builder.ts",
  "packages/workflow/src/passes/render-pass.ts",
  "packages/workflow/src/build-storyboard-plan-from-canonical-plan.ts",
  "packages/core/src/production/ensure-canonical-production-plan.ts",
  "packages/core/src/production/build-canonical-production-plan.ts",
  "apps/web/app/api/projects/[id]/chapters/estimate/route.ts",
  "apps/web/app/api/projects/[id]/chapters/[chapterId]/launch/route.ts",
  "apps/web/app/api/projects/[id]/chapters/[chapterId]/route.ts",
];

const FORBIDDEN_DENSIFY_MARKERS = ["densify-premium-blueprints", "densifyBlueprintsToPremiumRange"];

describe("premium path — aucun import densification legacy (CTO)", () => {
  it.each(PREMIUM_CANONICAL_FILES_NO_DENSIFY)(
    "%s ne référence pas la densification blueprint legacy",
    (relativePath) => {
      const source = readPremiumFile(relativePath);
      const hits = FORBIDDEN_DENSIFY_MARKERS.filter((m) => source.includes(m));
      expect(
        hits,
        `${relativePath} ne doit pas importer ou citer ${FORBIDDEN_DENSIFY_MARKERS.join(", ")}`,
      ).toEqual([]);
    },
  );
});

const PREMIUM_NO_LEGACY_PIPELINE_FILES = [
  "packages/workflow/src/run-premium-v3-pipeline.ts",
  "packages/ai/src/services/premium-chapter-contract-builder.ts",
  "packages/workflow/src/passes/render-pass.ts",
  "packages/workflow/src/build-storyboard-plan-from-canonical-plan.ts",
  "packages/core/src/production/ensure-canonical-production-plan.ts",
  "packages/core/src/production/build-canonical-production-plan.ts",
  "apps/web/app/api/projects/[id]/chapters/estimate/route.ts",
  "apps/web/app/api/projects/[id]/chapters/[chapterId]/launch/route.ts",
  "apps/web/app/api/projects/[id]/chapters/[chapterId]/route.ts",
];

const FORBIDDEN_LEGACY_PIPELINE_MARKERS = [
  "from \"../legacy/",
  "from \"../../legacy/",
  "from \"@manga-ai-studio/core/legacy",
  "densify-premium-blueprints",
  "run-legacy-compatible-chapter-pipeline",
  "run-full-chapter-pipeline",
  "pipelineScenesToPages",
  "passes/image-generation-pass",
];

describe("premium hot path — aucun module pipeline legacy (phase 9)", () => {
  it.each(PREMIUM_NO_LEGACY_PIPELINE_FILES)(
    "%s ne doit pas réimporter le pipeline legacy",
    (relativePath) => {
      const source = readPremiumFile(relativePath);
      const hits = FORBIDDEN_LEGACY_PIPELINE_MARKERS.filter((m) => source.includes(m));
      expect(
        hits,
        `${relativePath} contient un marqueur legacy interdit :\n  ${hits.join("\n  ")}`,
      ).toEqual([]);
    },
  );
});

describe("premium path — composeMangaPanelPrompt interdit (P1.A)", () => {
  it("aucun fichier du chemin premium n'appelle composeMangaPanelPrompt", () => {
    const violations: string[] = [];
    for (const relativePath of PREMIUM_PATH_FILES) {
      const source = stripComments(readPremiumFile(relativePath));
      if (/composeMangaPanelPrompt\s*\(/.test(source)) {
        violations.push(relativePath);
      }
    }
    expect(
      violations,
      `[premium/prompt-composer] fichiers premium qui appellent encore composeMangaPanelPrompt :\n  ${violations.join("\n  ")}\n` +
        `  Le prompt premium doit venir EXCLUSIVEMENT de buildMinimalPanelPromptStrict.`,
    ).toEqual([]);
  });

  it("aucun fichier du chemin premium n'appelle resolveFalSceneStrategy", () => {
    const violations: string[] = [];
    for (const relativePath of PREMIUM_PATH_FILES) {
      const source = stripComments(readPremiumFile(relativePath));
      if (/resolveFalSceneStrategy\s*\(|FalSceneStrategy/.test(source)) {
        violations.push(relativePath);
      }
    }
    expect(
      violations,
      `[premium/fal-routing] fichiers premium qui utilisent encore fal-scene-strategy :\n  ${violations.join("\n  ")}\n` +
        `  Le routage FAL premium doit venir EXCLUSIVEMENT de resolveFalRenderRoute (fal-render-route-v3).`,
    ).toEqual([]);
  });
});
