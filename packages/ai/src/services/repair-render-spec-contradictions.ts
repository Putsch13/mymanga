/**
 * repair-render-spec-contradictions — nettoie les contradictions
 * entre renderMode et les champs textuels du spec AVANT l'assemblage du prompt.
 *
 * Problème résolu :
 *   - renderMode=character_focus mais actionLine contient "wide establishing shot"
 *   - renderMode=reaction_closeup mais locationName/context contient "wide establishing"
 *
 * Ce pass s'exécute APRÈS buildPanelRenderSpec et AVANT buildMinimalPanelPromptStrict.
 *
 * @module repair-render-spec-contradictions
 */

import type { PanelRenderSpec } from "../contracts/panel-render-spec";

export interface RenderSpecRepairResult {
  spec: PanelRenderSpec;
  repaired: boolean;
  repairs: string[];
}

/**
 * Termes contradictoires pour character_focus / reaction_closeup / hero_closeup.
 * Ces termes ne doivent pas apparaître dans les champs textuels d'un gros plan.
 */
const WIDE_ESTABLISHING_TERMS = [
  "wide establishing shot",
  "wide establishing",
  "establishing shot",
  "wide cinematic view",
  "wide view",
  "plan large",
  "vue d'ensemble",
  "panoramic shot",
  "extreme wide",
  "very wide shot",
  "full scene overview",
  "environmental establishing",
];

/**
 * RenderModes qui sont incompatibles avec les termes "wide establishing".
 */
const CLOSEUP_RENDER_MODES = new Set<string>([
  "character_focus",
  "reaction_closeup",
  "hero_closeup",
  "npc_closeup",
  "enemy_closeup",
  "enemy_reveal",
  "creature_reveal",
  "dialogue_over_shoulder",
  "dialogue_two_shot",
  "aftermath_dialogue",
]);

/**
 * Supprime les termes "wide establishing" d'un texte.
 */
export function stripWideEstablishingTerms(text: string): string {
  let result = text;
  for (const term of WIDE_ESTABLISHING_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    result = result.replace(regex, "");
  }
  return result.replace(/\s{2,}/g, " ").replace(/,\s*,/g, ",").trim();
}

/**
 * Vérifie si un texte contient des termes "wide establishing".
 */
export function hasWideEstablishingTerms(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return WIDE_ESTABLISHING_TERMS.some((term) => lower.includes(term.toLowerCase()));
}

/**
 * Détecte si un panel est probablement un panel d'ouverture de beat.
 * Ces panels peuvent légitimement être des establishing shots.
 */
function isBeatOpeningPanel(spec: PanelRenderSpec): boolean {
  const panelId = spec.panelId ?? "";
  // Pattern: beat_X_panel_0 ou panelNumberInPage === 1
  if (/panel_0$|_p0$/.test(panelId)) return true;
  if (spec.panelNumberInPage === 1) return true;
  return false;
}

/** Champs optionnels enrichis hors du type strict PanelRenderSpec. */
function specLooseString(spec: PanelRenderSpec, key: string): string | undefined {
  const v = (spec as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Collecte tous les champs textuels du spec qui seront utilisés pour le prompt.
 */
function getTextualFields(spec: PanelRenderSpec): string {
  return [
    spec.actionLine,
    spec.emotionLine,
    spec.locationName,
    spec.dialogueIntent,
    spec.constraints?.mustShow?.join(" "),
    spec.environmentDNA?.description,
    specLooseString(spec, "promptIntent"),
    specLooseString(spec, "composition"),
    specLooseString(spec, "camera"),
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Répare un PanelRenderSpec qui a des contradictions entre renderMode et contenu textuel.
 *
 * Stratégie :
 * 1. Si c'est un panel d'ouverture de beat avec "wide establishing" → convertir en establishing_environment
 * 2. Sinon → nettoyer les termes contradictoires des champs textuels
 */
export function repairRenderSpecContradictions(spec: PanelRenderSpec): RenderSpecRepairResult {
  const repairs: string[] = [];
  let repaired = false;
  let repairedSpec = { ...spec };

  // Vérifier si le renderMode est incompatible avec wide establishing
  if (!CLOSEUP_RENDER_MODES.has(spec.renderMode)) {
    return { spec, repaired: false, repairs: [] };
  }

  const textualContent = getTextualFields(spec);
  const hasContradiction = hasWideEstablishingTerms(textualContent);

  if (!hasContradiction) {
    return { spec, repaired: false, repairs: [] };
  }

  // Cas A: Panel d'ouverture de beat → establishing_environment (enum StoryboardRenderMode)
  if (isBeatOpeningPanel(spec) && spec.renderMode === "character_focus") {
    repairedSpec = {
      ...repairedSpec,
      renderMode: "establishing_environment",
      subjectFocus: "environment",
    };
    repairs.push(`converted_to_establishing_environment (beat opening panel)`);
    repaired = true;
  }
  // Cas B: Reaction closeup ou autre closeup → nettoyer les termes
  else {
    // Nettoyer actionLine
    if (hasWideEstablishingTerms(spec.actionLine)) {
      repairedSpec.actionLine = stripWideEstablishingTerms(spec.actionLine ?? "");
      repairs.push(`cleaned_actionLine`);
      repaired = true;
    }

    // Nettoyer emotionLine
    if (hasWideEstablishingTerms(spec.emotionLine)) {
      repairedSpec.emotionLine = stripWideEstablishingTerms(spec.emotionLine ?? "");
      repairs.push(`cleaned_emotionLine`);
      repaired = true;
    }

    // Nettoyer locationName si c'est vraiment le problème
    if (hasWideEstablishingTerms(spec.locationName)) {
      repairedSpec.locationName = stripWideEstablishingTerms(spec.locationName ?? "");
      repairs.push(`cleaned_locationName`);
      repaired = true;
    }

    // Nettoyer constraints.mustShow
    if (spec.constraints?.mustShow?.some(hasWideEstablishingTerms)) {
      repairedSpec = {
        ...repairedSpec,
        constraints: {
          ...repairedSpec.constraints,
          mustShow: (spec.constraints?.mustShow ?? []).map((s) =>
            hasWideEstablishingTerms(s) ? stripWideEstablishingTerms(s) : s,
          ).filter(Boolean),
        },
      };
      repairs.push(`cleaned_mustShow`);
      repaired = true;
    }

    // Pour reaction_closeup, forcer le subjectFocus approprié
    if (spec.renderMode === "reaction_closeup" && repaired) {
      repairedSpec.subjectFocus = "reaction";
      repairs.push(`forced_subjectFocus_reaction`);
    }
  }

  return { spec: repairedSpec, repaired, repairs };
}

/**
 * Répare un batch de specs et retourne les statistiques.
 */
export function repairRenderSpecsBatch(specs: PanelRenderSpec[]): {
  specs: PanelRenderSpec[];
  repairedCount: number;
  repairs: Array<{ panelId: string; repairs: string[] }>;
} {
  const repairedSpecs: PanelRenderSpec[] = [];
  const allRepairs: Array<{ panelId: string; repairs: string[] }> = [];
  let repairedCount = 0;

  for (const spec of specs) {
    const result = repairRenderSpecContradictions(spec);
    repairedSpecs.push(result.spec);
    if (result.repaired) {
      repairedCount++;
      allRepairs.push({ panelId: spec.panelId, repairs: result.repairs });
    }
  }

  if (repairedCount > 0) {
    console.info(
      `[render-spec-contradiction-repair] fixed=${repairedCount}/${specs.length} ` +
        `repairs=${allRepairs
          .slice(0, 5)
          .map((r) => `${r.panelId}:${r.repairs.join("+")}`)
          .join(", ")}`,
    );
  }

  return { specs: repairedSpecs, repairedCount, repairs: allRepairs };
}
