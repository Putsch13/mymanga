/**
 * page-qa-pass — audit page par page à partir du StoryboardPlan.
 *
 * Vérifie :
 *   - alternance de plans (pas 3 pages identiques d'affilée)
 *   - dialogues cohérents (si page dramaticRole=dialogue_tension, au
 *     moins un panel a du dialogue_two_shot ou dialogue_over_shoulder)
 *   - progression lisible (pas de saut de pageNumber)
 *   - pas de 3 pages full closeup héros
 *   - P0.5: capacité du layout (pas plus de panels que le layout permet)
 */

import type { StoryboardPlan } from "@manga-ai-studio/ai";
import type { StoryboardPage } from "@manga-ai-studio/ai/contracts";
import { PAGE_LAYOUT_CONFIGS, type PageLayoutTemplate } from "@manga-ai-studio/core";

export interface PageQaResult {
  pageNumber: number;
  ok: boolean;
  issues: string[];
  warnings: string[];
}

export interface PageQaPassOutput {
  results: PageQaResult[];
  okCount: number;
  failCount: number;
}

export async function runPageQaPass(plan: StoryboardPlan): Promise<PageQaPassOutput> {
  const results: PageQaResult[] = [];
  const pages = plan.pages ?? [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const prev = pages[i - 1];
    const prevPrev = pages[i - 2];
    const issues: string[] = [];
    const warnings: string[] = [];

    if (prev && prev.pageNumber + 1 !== page.pageNumber) {
      issues.push(`page_number_jump_from_${prev.pageNumber}_to_${page.pageNumber}`);
    }

    if (isHeroCloseupPage(page) && isHeroCloseupPage(prev) && isHeroCloseupPage(prevPrev)) {
      warnings.push("three_consecutive_hero_closeup_pages");
    }

    if (page.dramaticRole === "dialogue_tension") {
      const hasDialoguePanel = page.panels.some(
        (p) => p.renderMode === "dialogue_two_shot" || p.renderMode === "dialogue_over_shoulder",
      );
      if (!hasDialoguePanel) warnings.push("dialogue_tension_page_without_dialogue_panel");
    }

    if (page.panels.length === 0) issues.push("page_has_no_panels");

    // P0.5 — Contrôle de capacité : pas plus de panels que le layout permet
    const layoutTemplate = page.layoutTemplate as PageLayoutTemplate;
    const layoutConfig = PAGE_LAYOUT_CONFIGS[layoutTemplate];
    if (!layoutConfig) {
      issues.push(`unknown_layout_template=${page.layoutTemplate}`);
    } else if (page.panels.length > layoutConfig.areas.length) {
      issues.push(
        `page_panel_count_exceeds_layout_capacity=${page.panels.length}/${layoutConfig.areas.length}:${page.layoutTemplate}`,
      );
    }

    results.push({ pageNumber: page.pageNumber, ok: issues.length === 0, issues, warnings });
  }

  return {
    results,
    okCount: results.filter((r) => r.ok).length,
    failCount: results.filter((r) => !r.ok).length,
  };
}

function isHeroCloseupPage(page: StoryboardPage | undefined): boolean {
  if (!page) return false;
  const heroCloseups = page.panels.filter(
    (p) => p.renderMode === "hero_closeup" || p.subjectFocus === "hero",
  ).length;
  return heroCloseups >= Math.ceil(page.panels.length * 0.75);
}
