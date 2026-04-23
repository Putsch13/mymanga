/**
 * storyboard-pass — étape 2 de la pipeline v3.
 *
 * Entrée : StoryArc + cast + locations + target panel count + style bible.
 * Sortie : StoryboardPlan (persisté dans `chapter.outline.storyboardPlanV2`).
 *
 * Le StoryboardPlan décide TOUT le découpage (pages, layouts, panels,
 * renderMode, shotType, subjectFocus, cutawayType). Le render-pass ne doit
 * plus décider la dramaturgie.
 */

import {
  runMangaEditorAgent,
  runMangaEditorAgentLlm,
  validateStoryboardPlan,
  type StoryArc,
  type StoryboardPlan,
} from "@manga-ai-studio/ai";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";
import { saveStoryboardPlan } from "../persistence/storyboard-persistence";
import {
  isPipelineV3MangaEditorLlmEnabled,
  isPipelineV3PremiumOnlyEnabled,
} from "../pipeline-feature-flags";

export interface RunStoryboardPassInput {
  storyArc: StoryArc;
  targetPanelCount?: number;
  heroCharacterIds?: string[];
  /**
   * COMMIT P9 — format éditorial du projet. Détermine la grammaire du
   * storyboard (pagination manga vs flow webtoon). OBLIGATOIRE :
   * le pipeline DOIT transmettre `project.format` au storyboard. Plus
   * de `?? "manga"` silencieux qui ignorait le choix utilisateur.
   */
  projectFormat: "manga" | "webtoon";
  /**
   * Override du flag `PIPELINE_V3_MANGA_EDITOR_LLM`. Utile pour tests.
   * Quand `true`, l'agent LLM est tenté (fallback stub si OpenAI absent).
   * Quand `false`, le stub déterministe est utilisé directement.
   */
  useLlmEditor?: boolean;
  /**
   * COMMIT D — quand `true`, les budgets éditoriaux (hero/closeup/cutaway/
   * NPC/combat/anti-répétition) deviennent bloquants au lieu de warning.
   * Par défaut, déduit de `PIPELINE_V3_PREMIUM_ONLY` (le premium est
   * strict, le shadow mode reste permissif).
   */
  strict?: boolean;
}

export interface RunStoryboardPassResult {
  storyboardPlan: StoryboardPlan;
  warnings: string[];
  blockers: string[];
}

export class PremiumStoryboardStubForbiddenError extends Error {
  constructor() {
    super(
      "premium_storyboard_stub_forbidden: PIPELINE_V3_PREMIUM_ONLY=true impose PIPELINE_V3_MANGA_EDITOR_LLM=true. " +
        "Le premium NE TOLÈRE PLUS le stub déterministe manga-editor-agent — il produit des plans mécaniques " +
        "(même cadrage en boucle, combat-poster, cutaways manquants). Active le LLM ou désactive PREMIUM_ONLY.",
    );
    this.name = "PremiumStoryboardStubForbiddenError";
  }
}

export async function runStoryboardPass(
  input: RunStoryboardPassInput,
): Promise<RunStoryboardPassResult> {
  const useLlm = input.useLlmEditor ?? isPipelineV3MangaEditorLlmEnabled();
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();

  // COMMIT P2.B — fail-hard sur stub en premium.
  // Le stub déterministe (runMangaEditorAgent) fabrique une grammaire
  // mécanique qui est l'une des causes racines des chapitres
  // "portraits en boucle / combat-poster / cutaway manquants". En
  // premium, on refuse de s'exécuter sans LLM réel.
  if (premiumOnly && !useLlm) {
    throw new PremiumStoryboardStubForbiddenError();
  }

  const editor = useLlm ? runMangaEditorAgentLlm : runMangaEditorAgent;
  const { storyboardPlan, warnings } = await editor({
    storyArc: input.storyArc,
    targetPanelCount: input.targetPanelCount,
    heroCharacterIds: input.heroCharacterIds,
    projectFormat: input.projectFormat,
  });

  // P8 — range premium STRICTE au niveau storyboard v3.
  // Un StoryboardPlan à 52 panels n'est pas un “warning UI”, c'est un plan incomplet.
  const totalPanels = (storyboardPlan.pages ?? []).reduce(
    (acc, page) => acc + (Array.isArray(page.panels) ? page.panels.length : 0),
    0,
  );
  const countBlockers: string[] = [];
  if (totalPanels < PREMIUM_PANEL_RANGE.min || totalPanels > PREMIUM_PANEL_RANGE.max) {
    countBlockers.push(
      `storyboard_plan.panel_count_out_of_range=${totalPanels} required=${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max}`,
    );
  }

  const strict = input.strict ?? premiumOnly;
  const validation = validateStoryboardPlan(storyboardPlan, {
    storyArc: input.storyArc,
    strict,
  });
  const blockers = [...(validation.ok ? [] : validation.issues), ...countBlockers];
  const allWarnings = [...warnings, ...validation.warnings];

  if (validation.ok && countBlockers.length === 0) {
    await saveStoryboardPlan(input.storyArc.chapterId, storyboardPlan);
  }

  return {
    storyboardPlan,
    warnings: allWarnings,
    blockers,
  };
}
