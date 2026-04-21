/**
 * Chapter Shot Plan — Sprint B
 *
 * Produit un **plan narratif lisible** des 70-75 cases avant génération FAL.
 * C'est l'équivalent d'un pitch storyboard textuel que l'IA s'engage à
 * respecter pour tout le chapitre :
 *
 *   "panel 1 : wide establishing — marché bruyant à l'aube, aucun héros"
 *   "panel 2 : medium — Lyra entre par la porte ouest, silhouette de dos"
 *   "panel 3 : reaction cutaway — marchand PNJ qui tourne la tête"
 *   "panel 4 : closeup — main de Lyra effleure le médaillon"
 *   "panel 5 : wide dynamique — combat éclate, foule qui s'écarte"
 *   ...
 *
 * Utilité :
 *   - debug humain : on voit ce qui va être généré avant de dépenser 75 images
 *   - garde-fou : on bloque si le plan est monotone (ex: 60 panels héros
 *     de suite, 0 plan de coupe, 0 décor)
 *   - UI studio : permet à l'auteur de corriger le plan avant lancement
 *
 * Contrainte clé : ce module NE génère pas les blueprints. Il les observe
 * et produit un rapport human-readable + un verdict sur la fiabilité.
 */

import type {
  PanelBlueprintPremium,
  SubjectFocus,
  CutawayType,
} from "@manga-ai-studio/core";

// ─── Entrées / Sorties ────────────────────────────────────────────────────────

export interface ChapterShotPlanInput {
  projectTitle?: string | null;
  chapterTitle?: string | null;
  blueprints: ReadonlyArray<PanelBlueprintPremium>;
}

export interface ShotPlanEntry {
  panelNumber: number;
  pageNumber: number | null;
  /** Ligne narrative courte et lisible (1-liner). */
  headline: string;
  /** Catégorie lisible : "heros principal", "plan de coupe", "plan decor", "insert prop", etc. */
  category: ShotCategory;
  subjectFocus: SubjectFocus;
  shotType: string;
  cutawayType: CutawayType;
  /** Le panel est-il critique pour le contrat narratif (arme, ennemi reveal, décor clef) ? */
  contractualCritical: boolean;
  criticality: "low" | "medium" | "high" | "critical";
}

export type ShotCategory =
  | "hero_lead"           // héros sujet principal
  | "hero_duo"            // héros + secondaire partagent le cadre
  | "enemy_focus"         // plan ennemi dominant
  | "ally_focus"          // plan allié
  | "npc_focus"           // plan PNJ (témoin, marchand, foule nommée)
  | "group_or_crowd"      // plan de groupe/foule
  | "environment_wide"    // establishing / wide décor
  | "environment_insert"  // insert décor / texture
  | "prop_insert"         // insert objet
  | "reaction_cutaway"    // plan de coupe réaction
  | "aftermath"           // plan silence / conséquence
  | "dialogue_anchor"     // plan parlé neutre
  | "other";

export interface ShotPlanReliability {
  /** Score 0-1 : 1 = plan équilibré, 0 = plan monotone et cassé. */
  score: number;
  /** Le plan peut-il partir en génération ? Si false, la launch doit bloquer. */
  launchAllowed: boolean;
  /** Liste d'alertes humainement compréhensibles. */
  warnings: ShotPlanWarning[];
  /** Blocages durs qui empêchent la launch. */
  blockers: ShotPlanWarning[];
}

export interface ShotPlanWarning {
  code: string;
  message: string;
  /** "blocking" = empêche la launch. "warning" = signal mais launch ok. */
  severity: "blocking" | "warning";
}

export interface ShotPlanDistribution {
  totalPanels: number;
  byCategory: Record<ShotCategory, number>;
  heroLeadRatio: number;
  cutawayRatio: number;
  uniqueShotTypes: number;
  environmentPanels: number;
  npcPanels: number;
  propInsertPanels: number;
  reactionPanels: number;
}

export interface ChapterShotPlan {
  projectTitle: string | null;
  chapterTitle: string | null;
  entries: ShotPlanEntry[];
  distribution: ShotPlanDistribution;
  reliability: ShotPlanReliability;
  /** Rendu texte humainement lisible du plan (pour UI / logs / export). */
  humanReadable: string;
}

// ─── Catégorisation ───────────────────────────────────────────────────────────

function categorize(bp: PanelBlueprintPremium): ShotCategory {
  // Cutaway prioritaires
  if (bp.cutawayType === "prop_insert" || bp.cutawayType === "object_insert") return "prop_insert";
  if (bp.cutawayType === "environment" || bp.cutawayType === "environment_establishing") return "environment_insert";
  if (bp.cutawayType === "reaction" || bp.cutawayType === "reaction_insert") return "reaction_cutaway";
  if (bp.cutawayType === "crowd" || bp.cutawayType === "npc_group") return "group_or_crowd";
  if (bp.cutawayType === "aftermath") return "aftermath";

  // SubjectFocus principal
  switch (bp.subjectFocus) {
    case "hero":
      return "hero_lead";
    case "duo":
      return "hero_duo";
    case "enemy":
      return "enemy_focus";
    case "ally":
      return "ally_focus";
    case "npc":
      return "npc_focus";
    case "group":
      return "group_or_crowd";
    case "environment":
    case "location":
      return bp.shotType === "wide" ? "environment_wide" : "environment_insert";
    case "prop":
      return "prop_insert";
    case "reaction":
      return "reaction_cutaway";
    case "aftermath":
      return "aftermath";
    case "speaker":
      return "dialogue_anchor";
    default:
      return "other";
  }
}

// ─── Headline humainement lisible ─────────────────────────────────────────────

const CATEGORY_LABEL: Record<ShotCategory, string> = {
  hero_lead: "héros principal",
  hero_duo: "héros + second",
  enemy_focus: "ennemi",
  ally_focus: "allié",
  npc_focus: "PNJ",
  group_or_crowd: "groupe / foule",
  environment_wide: "décor wide",
  environment_insert: "décor coupe",
  prop_insert: "insert objet",
  reaction_cutaway: "coupe réaction",
  aftermath: "aftermath",
  dialogue_anchor: "plan parlé",
  other: "autre",
};

function buildHeadline(bp: PanelBlueprintPremium, category: ShotCategory): string {
  const shot = bp.shotType || "medium";
  const catLabel = CATEGORY_LABEL[category];
  const purposeTrimmed = (bp.purpose || "").trim();
  const purpose = purposeTrimmed.length > 80 ? purposeTrimmed.slice(0, 77) + "…" : purposeTrimmed;
  const contractualBadge = bp.contractualCritical ? " ★" : "";
  return `${shot} · ${catLabel}${contractualBadge} — ${purpose || "(panel sans intention explicite)"}`;
}

// ─── Distribution stats ───────────────────────────────────────────────────────

function computeDistribution(entries: ShotPlanEntry[]): ShotPlanDistribution {
  const byCategory: Record<ShotCategory, number> = {
    hero_lead: 0,
    hero_duo: 0,
    enemy_focus: 0,
    ally_focus: 0,
    npc_focus: 0,
    group_or_crowd: 0,
    environment_wide: 0,
    environment_insert: 0,
    prop_insert: 0,
    reaction_cutaway: 0,
    aftermath: 0,
    dialogue_anchor: 0,
    other: 0,
  };
  const shotSet = new Set<string>();
  let cutaways = 0;
  for (const e of entries) {
    byCategory[e.category]++;
    shotSet.add(e.shotType);
    if (
      e.category === "environment_insert" ||
      e.category === "prop_insert" ||
      e.category === "reaction_cutaway" ||
      e.category === "aftermath"
    ) {
      cutaways++;
    }
  }
  const total = entries.length;
  const heroLead = byCategory.hero_lead;
  return {
    totalPanels: total,
    byCategory,
    heroLeadRatio: total === 0 ? 0 : heroLead / total,
    cutawayRatio: total === 0 ? 0 : cutaways / total,
    uniqueShotTypes: shotSet.size,
    environmentPanels: byCategory.environment_wide + byCategory.environment_insert,
    npcPanels: byCategory.npc_focus + byCategory.group_or_crowd,
    propInsertPanels: byCategory.prop_insert,
    reactionPanels: byCategory.reaction_cutaway,
  };
}

// ─── Évaluation de fiabilité du plan ──────────────────────────────────────────

/**
 * Seuils du plan chapitre. Ces seuils sont durs : s'ils sont violés, la launch
 * est bloquée. Ils sont calibrés pour un chapitre de 50-75 panels.
 *
 * - heroLeadRatio ≤ 0.55 : au plus 55% des panels sont héros-centré
 * - cutawayRatio  ≥ 0.15 : au moins 15% des panels sont des plans de coupe
 * - environmentPanels ≥ 2 pour chapitres > 10 panels
 * - uniqueShotTypes ≥ 3 : au moins 3 types de cadrage différents
 */
export const SHOT_PLAN_THRESHOLDS = {
  MAX_HERO_LEAD_RATIO: 0.55,
  MIN_CUTAWAY_RATIO: 0.15,
  MIN_ENVIRONMENT_PANELS: 2,
  MIN_UNIQUE_SHOT_TYPES: 3,
  MIN_PANELS_FOR_FULL_CHECK: 10,
} as const;

function evaluateReliability(
  distribution: ShotPlanDistribution,
  entries: ShotPlanEntry[],
): ShotPlanReliability {
  const warnings: ShotPlanWarning[] = [];
  const blockers: ShotPlanWarning[] = [];
  const { totalPanels, heroLeadRatio, cutawayRatio, environmentPanels, uniqueShotTypes } = distribution;

  const smallPlan = totalPanels < SHOT_PLAN_THRESHOLDS.MIN_PANELS_FOR_FULL_CHECK;

  if (totalPanels === 0) {
    blockers.push({
      code: "EMPTY_PLAN",
      message: "Le plan chapitre est vide, aucun panel à générer.",
      severity: "blocking",
    });
  }

  if (heroLeadRatio > SHOT_PLAN_THRESHOLDS.MAX_HERO_LEAD_RATIO) {
    blockers.push({
      code: "HERO_OVERLOAD",
      message:
        `${Math.round(heroLeadRatio * 100)}% des panels sont centrés sur le héros (max ${Math.round(SHOT_PLAN_THRESHOLDS.MAX_HERO_LEAD_RATIO * 100)}%). ` +
        `Le chapitre ne laissera pas respirer le décor, les PNJ et les plans de coupe.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && cutawayRatio < SHOT_PLAN_THRESHOLDS.MIN_CUTAWAY_RATIO) {
    blockers.push({
      code: "MISSING_CUTAWAYS",
      message:
        `Seulement ${Math.round(cutawayRatio * 100)}% de plans de coupe (min ${Math.round(SHOT_PLAN_THRESHOLDS.MIN_CUTAWAY_RATIO * 100)}%). ` +
        `Un chapitre sans plans de coupe se lit platement.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && environmentPanels < SHOT_PLAN_THRESHOLDS.MIN_ENVIRONMENT_PANELS) {
    blockers.push({
      code: "MISSING_ENVIRONMENT",
      message:
        `Seulement ${environmentPanels} panel(s) décor (min ${SHOT_PLAN_THRESHOLDS.MIN_ENVIRONMENT_PANELS}). ` +
        `Le lecteur doit pouvoir se situer visuellement.`,
      severity: "blocking",
    });
  }

  if (!smallPlan && uniqueShotTypes < SHOT_PLAN_THRESHOLDS.MIN_UNIQUE_SHOT_TYPES) {
    blockers.push({
      code: "SHOT_MONOTONY",
      message:
        `Seulement ${uniqueShotTypes} type(s) de cadrage (min ${SHOT_PLAN_THRESHOLDS.MIN_UNIQUE_SHOT_TYPES}). ` +
        `Alterner wide, medium, closeup, insert pour casser la monotonie.`,
      severity: "blocking",
    });
  }

  // Warnings non bloquants mais utiles à l'auteur
  if (!smallPlan && distribution.reactionPanels === 0) {
    warnings.push({
      code: "NO_REACTION_PANELS",
      message:
        "Aucun plan de réaction — sans ça, on ne voit jamais l'effet des événements sur les personnages.",
      severity: "warning",
    });
  }
  if (!smallPlan && distribution.propInsertPanels === 0) {
    const hasMandatoryProps = entries.some((e) => e.category === "prop_insert" || e.contractualCritical);
    if (!hasMandatoryProps) {
      warnings.push({
        code: "NO_PROP_INSERTS",
        message: "Aucun insert d'objet — les armes / artefacts clefs ne sont jamais mis en avant.",
        severity: "warning",
      });
    }
  }
  if (!smallPlan && distribution.npcPanels === 0) {
    warnings.push({
      code: "NO_NPC_PANELS",
      message: "Aucun panel dédié aux PNJ / foule — le monde semble vide autour du héros.",
      severity: "warning",
    });
  }

  // Streaks héros consécutifs (6 panels héros d'affilée = alerte)
  const maxHeroStreak = computeMaxHeroStreak(entries);
  if (maxHeroStreak >= 6) {
    warnings.push({
      code: "HERO_STREAK",
      message: `${maxHeroStreak} panels héros consécutifs détectés — risque de monotonie visuelle.`,
      severity: "warning",
    });
  }

  // Score : 1 - 0.2 par blocker - 0.05 par warning, borné [0,1]
  const score = Math.max(0, Math.min(1, 1 - 0.2 * blockers.length - 0.05 * warnings.length));

  return {
    score,
    launchAllowed: blockers.length === 0,
    warnings,
    blockers,
  };
}

function computeMaxHeroStreak(entries: ShotPlanEntry[]): number {
  let max = 0;
  let current = 0;
  for (const e of entries) {
    if (e.category === "hero_lead") {
      current++;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}

// ─── Rendu human-readable ─────────────────────────────────────────────────────

function buildHumanReadable(plan: Omit<ChapterShotPlan, "humanReadable">): string {
  const lines: string[] = [];
  const title = [plan.projectTitle, plan.chapterTitle].filter(Boolean).join(" — ");
  if (title) lines.push(`# Shot plan : ${title}`);
  lines.push("");
  lines.push(
    `Total panels : ${plan.distribution.totalPanels}  ·  ` +
      `héros ${Math.round(plan.distribution.heroLeadRatio * 100)}%  ·  ` +
      `coupes ${Math.round(plan.distribution.cutawayRatio * 100)}%  ·  ` +
      `décor ${plan.distribution.environmentPanels}  ·  ` +
      `PNJ ${plan.distribution.npcPanels}  ·  ` +
      `inserts ${plan.distribution.propInsertPanels}  ·  ` +
      `cadrages ${plan.distribution.uniqueShotTypes}`,
  );
  lines.push("");
  for (const entry of plan.entries) {
    const page = entry.pageNumber == null ? "p?" : `p${entry.pageNumber}`;
    lines.push(`${page}:#${String(entry.panelNumber).padStart(2, "0")} · ${entry.headline}`);
  }
  if (plan.reliability.blockers.length > 0) {
    lines.push("");
    lines.push("## Blocages (launch interdite)");
    for (const b of plan.reliability.blockers) {
      lines.push(`- [${b.code}] ${b.message}`);
    }
  }
  if (plan.reliability.warnings.length > 0) {
    lines.push("");
    lines.push("## Warnings (launch ok)");
    for (const w of plan.reliability.warnings) {
      lines.push(`- [${w.code}] ${w.message}`);
    }
  }
  return lines.join("\n");
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function buildChapterShotPlan(input: ChapterShotPlanInput): ChapterShotPlan {
  const entries: ShotPlanEntry[] = input.blueprints.map((bp) => {
    const category = categorize(bp);
    return {
      panelNumber: bp.panelNumber ?? (bp.panelIndex != null ? bp.panelIndex + 1 : 0),
      pageNumber: bp.pageNumber ?? null,
      headline: buildHeadline(bp, category),
      category,
      subjectFocus: bp.subjectFocus,
      shotType: bp.shotType,
      cutawayType: bp.cutawayType,
      contractualCritical: Boolean(bp.contractualCritical),
      criticality: bp.criticality,
    };
  });

  const distribution = computeDistribution(entries);
  const reliability = evaluateReliability(distribution, entries);

  const planWithoutText: Omit<ChapterShotPlan, "humanReadable"> = {
    projectTitle: input.projectTitle ?? null,
    chapterTitle: input.chapterTitle ?? null,
    entries,
    distribution,
    reliability,
  };

  return {
    ...planWithoutText,
    humanReadable: buildHumanReadable(planWithoutText),
  };
}
