/**
 * LAY-1 — Dramatic Layout Resolver
 * Calcule dynamiquement le template de mise en page d'une page manga
 * selon l'intensité dramatique du beat.
 *
 * P1-4 : les DONNÉES de layout (table CSS + areas/weights/ratios) sont
 * désormais dans `@manga-ai-studio/core` (`page-layout-configs.ts`) pour
 * être partagées avec le composant client `MangaPageGrid` sans duplication.
 */

import {
  PAGE_LAYOUT_CONFIGS as SHARED_PAGE_LAYOUT_CONFIGS,
  computePanelPixelPositions as sharedComputePanelPixelPositions,
  type PageLayoutTemplate as SharedPageLayoutTemplate,
  type PanelPixelPosition,
} from "@manga-ai-studio/core";

export type PageLayoutTemplate = SharedPageLayoutTemplate;

export interface PanelSizeSpec {
  panelIndex: number;
  gridArea: string;           // lettre CSS area (a–h)
  aspectRatio: string;        // "1:1" | "16:9" | "3:4" | "2:1" | "4:3"
  isHero: boolean;            // panel principal de la page
  weight: number;             // 0-1, proportion de la page
}

export interface PageLayoutDecision {
  template: PageLayoutTemplate;
  panelCount: number;
  panelSizes: PanelSizeSpec[];
  isFullWidth: boolean;
  isDoublePage: boolean;
  dramaticWeight: number;     // 0-1
  cssGridTemplate: string;
  cssGridAreas: string;
}

type PageRole =
  | "establishing"
  | "escalation"
  | "confrontation"
  | "revelation"
  | "aftermath"
  | "cliffhanger"
  | "dialogue"
  | "action"
  | "transition";

export interface BeatLayoutHints {
  pageRole: PageRole;
  emotionalDelta: number;     // -3 à +3
  cutawayType?: string | null;
  subjectFocus?: string | null;
  panelCount?: number;        // suggestion du storyboard
}

export interface ChapterPositionHints {
  isFirst: boolean;
  isLast: boolean;
  beatIndex: number;
  totalBeats: number;
}

// ─── Configs CSS Grid par template ────────────────────────────────────────────
// Ré-export depuis `@manga-ai-studio/core` (source of truth partagée client/serveur).

export const PAGE_LAYOUT_CONFIGS = SHARED_PAGE_LAYOUT_CONFIGS;
export const computePanelPixelPositions = sharedComputePanelPixelPositions;
export type { PanelPixelPosition };

// ─── Résolution principale ─────────────────────────────────────────────────────

function buildDecision(template: PageLayoutTemplate, dramaticWeight: number): PageLayoutDecision {
  const config = PAGE_LAYOUT_CONFIGS[template];
  return {
    template,
    panelCount: config.areas.length,
    panelSizes: config.areas.map((area, idx) => ({
      panelIndex: idx,
      gridArea: area,
      aspectRatio: config.defaultAspectRatios[idx] ?? "3:4",
      isHero: config.panelWeights[idx] === Math.max(...config.panelWeights),
      weight: config.panelWeights[idx] ?? 0.25,
    })),
    isFullWidth: template === "splash",
    isDoublePage: template === "double_spread",
    dramaticWeight,
    cssGridTemplate: config.cssGridTemplate,
    cssGridAreas: config.cssGridAreas,
  };
}

/**
 * Résout le meilleur template de layout pour un beat donné.
 * Prend en compte le rôle narratif, le delta émotionnel et la position dans le chapitre.
 */
export function resolvePageLayout(
  beat: BeatLayoutHints,
  chapterPosition: ChapterPositionHints,
): PageLayoutDecision {
  const absDelta = Math.abs(beat.emotionalDelta);

  // Ouverture du chapitre = establishing shot cinématique
  if (chapterPosition.isFirst) {
    return buildDecision("cinematic_bar", 0.4);
  }

  // Dernier beat = cliffhanger → splash ou double_spread selon intensité
  if (chapterPosition.isLast || beat.pageRole === "cliffhanger") {
    if (absDelta >= 2) return buildDecision("double_spread", 0.9);
    return buildDecision("splash", 0.85);
  }

  // Révélation forte = splash ou focus_closeup
  if (beat.pageRole === "revelation") {
    if (absDelta >= 2) return buildDecision("splash", 0.9);
    return buildDecision("focus_closeup", 0.7);
  }

  // Combat / confrontation intense = action_strip
  if (beat.pageRole === "confrontation" || beat.pageRole === "action") {
    if (absDelta >= 2) return buildDecision("action_strip", 0.85);
    return buildDecision("asymmetric_hero", 0.65);
  }

  // Escalade = asymmetric_hero
  if (beat.pageRole === "escalation") {
    return buildDecision("asymmetric_hero", 0.6);
  }

  // Aftermath = focus_closeup (réaction émotionnelle)
  if (beat.pageRole === "aftermath") {
    return buildDecision("focus_closeup", 0.5);
  }

  // Dialogue = grid_2x2 (calme, posé)
  if (beat.pageRole === "dialogue") {
    return buildDecision("grid_2x2", 0.3);
  }

  // Transition = cinematic_bar ou vertical_strip
  if (beat.pageRole === "transition") {
    return buildDecision("cinematic_bar", 0.35);
  }

  // Montage rapide si panel count élevé suggéré
  if ((beat.panelCount ?? 0) >= 7) {
    return buildDecision("montage_rapid", 0.5);
  }

  // Establishing shot (environnement pur)
  if (beat.subjectFocus === "environment" || beat.cutawayType === "environment") {
    return buildDecision("cinematic_bar", 0.4);
  }

  // Default : alterner grid_2x3 / grid_2x2 selon la position dans le chapitre
  const progress = chapterPosition.beatIndex / Math.max(1, chapterPosition.totalBeats - 1);
  if (progress > 0.7) {
    // Fin de chapitre : panels plus dramatiques
    return buildDecision("grid_2x3", 0.55);
  }
  return buildDecision(chapterPosition.beatIndex % 2 === 0 ? "grid_2x3" : "grid_2x2", 0.4);
}

/**
 * Convertit un layoutMeta.layoutTemplate (string legacy) en PageLayoutTemplate.
 * Assure la compatibilité avec les anciens layouts A-F.
 */
export function legacyLayoutToTemplate(legacy: string | null | undefined): PageLayoutTemplate {
  const map: Record<string, PageLayoutTemplate> = {
    A: "action_strip",
    B: "asymmetric_hero",
    C: "grid_2x2",
    D: "grid_2x3",
    E: "focus_closeup",
    F: "grid_2x2",
    splash: "splash",
    action_strip: "action_strip",
    asymmetric_hero: "asymmetric_hero",
    cinematic_bar: "cinematic_bar",
    focus_closeup: "focus_closeup",
    grid_2x2: "grid_2x2",
    grid_2x3: "grid_2x3",
    montage_rapid: "montage_rapid",
    vertical_strip: "vertical_strip",
    double_spread: "double_spread",
  };
  return (legacy && map[legacy]) || "grid_2x3";
}
