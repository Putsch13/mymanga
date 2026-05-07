/**
 * P2.3 — Erreurs génération premium : codes stables + message utilisateur + action correctrice.
 */

import { isHeroRole } from "@manga-ai-studio/core";

export type GenerationErrorSeverity = "warning" | "blocked";

export type GenerationError = {
  code: string;
  severity: GenerationErrorSeverity;
  userMessage: string;
  technicalMessage?: string;
  fixAction?: {
    label: string;
    href: string;
  };
};

export const PREMIUM_GENERATION_ERROR_CODES = [
  "HERO_VISUAL_LOCK_MISSING",
  "CAST_CONTRACT_INVALID",
  "INTENT_CONFIDENCE_TOO_LOW",
  "LOCATION_CANON_REQUIRED",
  "VISUAL_WORLD_CONTRACT_FAILED",
  "DIALOGUE_SPEAKER_UNKNOWN",
  "PANEL_TEXT_DESYNC",
  "CREATURE_COVERAGE_MISSING",
  "PROP_COVERAGE_MISSING",
  "LEGACY_FALLBACK_FORBIDDEN",
] as const;

export type PremiumGenerationErrorCode = (typeof PREMIUM_GENERATION_ERROR_CODES)[number];

export function isPremiumGenerationErrorCode(code: string): code is PremiumGenerationErrorCode {
  return (PREMIUM_GENERATION_ERROR_CODES as readonly string[]).includes(code);
}

export function generationErrorFromCode(
  code: PremiumGenerationErrorCode,
  opts?: { technicalMessage?: string; href?: string; projectId?: string; chapterId?: string },
): GenerationError {
  const base = (projectId?: string, chapterId?: string) =>
    projectId && chapterId ? `/projects/${projectId}/chapters/${chapterId}/edit` : undefined;

  const href = opts?.href ?? base(opts?.projectId, opts?.chapterId);

  const catalog: Record<
    PremiumGenerationErrorCode,
    Pick<GenerationError, "userMessage" | "severity"> & { fixLabel?: string }
  > = {
    HERO_VISUAL_LOCK_MISSING: {
      severity: "blocked",
      userMessage: "Ton héros n’a pas encore de verrouillage visuel stable.",
      fixLabel: "Générer la référence héros",
    },
    CAST_CONTRACT_INVALID: {
      severity: "blocked",
      userMessage: "Le casting du chapitre est incomplet ou incohérent (héros, actifs, verrous).",
      fixLabel: "Corriger le cast",
    },
    INTENT_CONFIDENCE_TOO_LOW: {
      severity: "blocked",
      userMessage: "L’intention du chapitre n’est pas assez claire pour lancer en premium.",
      fixLabel: "Affiner l’intention",
    },
    LOCATION_CANON_REQUIRED: {
      severity: "blocked",
      userMessage: "Au moins un décor principal canonique est requis.",
      fixLabel: "Définir les décors",
    },
    VISUAL_WORLD_CONTRACT_FAILED: {
      severity: "blocked",
      userMessage: "Le contrat monde visuel est absent ou invalide.",
      fixLabel: "Synchroniser le monde visuel",
    },
    DIALOGUE_SPEAKER_UNKNOWN: {
      severity: "blocked",
      userMessage: "Une bulle référence un speaker non résolu.",
      fixLabel: "Associer les répliques aux personnages",
    },
    PANEL_TEXT_DESYNC: {
      severity: "blocked",
      userMessage: "Le texte des cases n’est pas aligné sur le contrat source.",
      fixLabel: "Vérifier le script",
    },
    CREATURE_COVERAGE_MISSING: {
      severity: "blocked",
      userMessage: "Une créature exigée par l’intention n’apparaît pas dans le plan ou le monde visuel.",
      fixLabel: "Ajouter la créature au plan",
    },
    PROP_COVERAGE_MISSING: {
      severity: "blocked",
      userMessage: "Un objet clé demandé n’est pas couvert par le plan ou les props.",
      fixLabel: "Ajouter l’objet au plan",
    },
    LEGACY_FALLBACK_FORBIDDEN: {
      severity: "blocked",
      userMessage: "Le mode premium n’accepte pas le repli sur des chemins legacy.",
      fixLabel: "Voir la checklist premium",
    },
  };

  const row = catalog[code];
  return {
    code,
    severity: row.severity,
    userMessage: row.userMessage,
    technicalMessage: opts?.technicalMessage,
    fixAction:
      href && row.fixLabel
        ? {
            label: row.fixLabel,
            href,
          }
        : undefined,
  };
}

/** Violations canon studio (launch) → erreurs premium lisibles (P1.3 / P2.3). */
export function canonViolationsToPremiumErrors(
  violations: Array<{
    characterId: string;
    characterName: string;
    roleType: string | null;
    reason: string;
    severity?: string;
  }>,
  opts: { projectId: string; chapterId: string },
): GenerationError[] {
  const blocking = violations.filter((v) => v.severity !== "warning");
  const out: GenerationError[] = [];
  for (const v of blocking) {
    const code: PremiumGenerationErrorCode = isHeroRole(v.roleType) ? "HERO_VISUAL_LOCK_MISSING" : "CAST_CONTRACT_INVALID";
    out.push(
      generationErrorFromCode(code, {
        projectId: opts.projectId,
        chapterId: opts.chapterId,
        technicalMessage: `${v.characterName} (${v.characterId}): ${v.reason}`,
      }),
    );
  }
  return out.slice(0, 8);
}
