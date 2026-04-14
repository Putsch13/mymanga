/**
 * LAY-1 — Dramatic Layout Resolver
 * Calcule dynamiquement le template de mise en page d'une page manga
 * selon l'intensité dramatique du beat.
 */

export type PageLayoutTemplate =
  | "splash"           // 1 panel pleine page — beat révélation, ouverture chapitre
  | "double_spread"    // 2 panels sur double page — action climax
  | "grid_2x2"         // 4 panels égaux — dialogue posé
  | "grid_2x3"         // 6 panels — rythme standard
  | "action_strip"     // 1 grand + 4 petits en strip — combat
  | "asymmetric_hero"  // 1 grand gauche + 2 petits droite — focus héros
  | "cinematic_bar"    // 3 panels horizontaux panoramiques — paysage / révélation lieu
  | "focus_closeup"    // 1 très grand + 2 petits réaction — émotion
  | "montage_rapid"    // 8 petits panels — flash-back / time-lapse
  | "vertical_strip";  // 3 panels verticaux — chase / chute

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

export const PAGE_LAYOUT_CONFIGS: Record<PageLayoutTemplate, {
  cssGridTemplate: string;
  cssGridAreas: string;
  areas: string[];
  panelWeights: number[];
  defaultAspectRatios: string[];
}> = {
  splash: {
    cssGridTemplate: "1fr",
    cssGridAreas: `"a"`,
    areas: ["a"],
    panelWeights: [1],
    defaultAspectRatios: ["3:4"],
  },
  double_spread: {
    cssGridTemplate: "1fr 1fr",
    cssGridAreas: `"a b"`,
    areas: ["a", "b"],
    panelWeights: [0.5, 0.5],
    defaultAspectRatios: ["3:4", "3:4"],
  },
  grid_2x2: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr",
    cssGridAreas: `"a b" "c d"`,
    areas: ["a", "b", "c", "d"],
    panelWeights: [0.25, 0.25, 0.25, 0.25],
    defaultAspectRatios: ["1:1", "1:1", "1:1", "1:1"],
  },
  grid_2x3: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a b c" "d e f"`,
    areas: ["a", "b", "c", "d", "e", "f"],
    panelWeights: [0.167, 0.167, 0.167, 0.167, 0.167, 0.167],
    defaultAspectRatios: ["3:4", "3:4", "3:4", "3:4", "3:4", "3:4"],
  },
  action_strip: {
    cssGridTemplate: "1.5fr 1fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a a b" "a a c" "d e f"`,
    areas: ["a", "b", "c", "d", "e", "f"],
    panelWeights: [0.40, 0.15, 0.15, 0.10, 0.10, 0.10],
    defaultAspectRatios: ["4:3", "3:4", "3:4", "1:1", "1:1", "1:1"],
  },
  asymmetric_hero: {
    cssGridTemplate: "1.2fr 1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a a b" "a a c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.50, 0.25, 0.25],
    defaultAspectRatios: ["3:4", "1:1", "1:1"],
  },
  cinematic_bar: {
    cssGridTemplate: "1fr 1fr 1fr / 1fr",
    cssGridAreas: `"a" "b" "c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.33, 0.34, 0.33],
    defaultAspectRatios: ["16:9", "16:9", "16:9"],
  },
  focus_closeup: {
    cssGridTemplate: "1.5fr 1fr / 1fr 1fr",
    cssGridAreas: `"a a" "b c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.60, 0.20, 0.20],
    defaultAspectRatios: ["2:1", "1:1", "1:1"],
  },
  montage_rapid: {
    cssGridTemplate: "1fr 1fr / 1fr 1fr 1fr 1fr",
    cssGridAreas: `"a b c d" "e f g h"`,
    areas: ["a", "b", "c", "d", "e", "f", "g", "h"],
    panelWeights: Array(8).fill(0.125),
    defaultAspectRatios: Array(8).fill("3:4"),
  },
  vertical_strip: {
    cssGridTemplate: "1fr / 1fr 1fr 1fr",
    cssGridAreas: `"a b c"`,
    areas: ["a", "b", "c"],
    panelWeights: [0.33, 0.34, 0.33],
    defaultAspectRatios: ["1:2", "1:2", "1:2"],
  },
};

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
