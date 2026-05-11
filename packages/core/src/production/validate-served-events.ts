/**
 * validate-served-events — FIX-30 (MAJEUR)
 *
 * Vérifie qu'en mode premium :
 *   1. CHAQUE `requiredEvent.id` (IntentNarrativeContract.requiredEvents)
 *      est servi par AU MOINS un panel (`servedEventIds.includes(eventId)`).
 *   2. AUCUN panel marqué "speaker"/"duo"/"group" n'a `servedEventIds`
 *      vide (sinon la protection dialogue est désactivée et la QA d'intent
 *      coverage retombe sur du matching textuel imprécis).
 *
 * Le validator est destiné aux chemins premium : il throw fail-loud pour
 * forcer une régénération en amont au lieu de laisser passer un chapitre
 * sous-couverture.
 */

import type { PanelBlueprintPremium } from "../types/narrative-facts";

export interface ServedEventsValidationInput {
  blueprints: ReadonlyArray<PanelBlueprintPremium>;
  /** Liste des `requiredEvent.id` issus de l'IntentNarrativeContract. */
  requiredEventIds: ReadonlyArray<string>;
  /**
   * Si true, throw au moindre manquement. Si false, retourne uniquement
   * la liste des problèmes pour log/diagnostic.
   */
  strict?: boolean;
}

export interface ServedEventsValidationReport {
  unservedRequiredEventIds: string[];
  blueprintsMissingServedEvents: Array<{ panelId: string; reason: string }>;
}

export class PremiumServedEventsViolationError extends Error {
  override name = "PremiumServedEventsViolationError" as const;
  readonly report: ServedEventsValidationReport;
  constructor(report: ServedEventsValidationReport) {
    const parts: string[] = [];
    if (report.unservedRequiredEventIds.length > 0) {
      parts.push(
        `unservedRequiredEvents=[${report.unservedRequiredEventIds.join(",")}]`,
      );
    }
    if (report.blueprintsMissingServedEvents.length > 0) {
      parts.push(
        `blueprintsMissingServed=[${report.blueprintsMissingServedEvents
          .map((b) => `${b.panelId}:${b.reason}`)
          .join(";")}]`,
      );
    }
    super(`premium_blueprints_served_events_violation ${parts.join(" ")}`);
    this.report = report;
  }
}

/**
 * Détecte les blueprints "speaker-ish" (ceux qui ont normalement un dialogue
 * ancré et qui devraient donc déclarer servir un event narratif). On reste
 * conservateur : un panel "environment" ou "transition" peut légitimement
 * ne servir aucun event.
 */
function isSpeakerishForServedCheck(bp: PanelBlueprintPremium): boolean {
  if (bp.dialogueCarrier === "speaker_visible") return true;
  if (bp.subjectFocus === "speaker") return true;
  if (bp.subjectFocus === "duo") return true;
  if (bp.subjectFocus === "group") return true;
  if (bp.subjectFocus === "npc") return true;
  if ((bp.dialogueLinesAnchored ?? 0) > 0) return true;
  return false;
}

export function validatePremiumBlueprintsServeRequiredEvents(
  input: ServedEventsValidationInput,
): ServedEventsValidationReport {
  const { blueprints, requiredEventIds, strict = true } = input;

  const allServedIds = new Set<string>();
  const blueprintsMissingServedEvents: Array<{ panelId: string; reason: string }> = [];

  for (const bp of blueprints) {
    const served = Array.isArray(bp.servedEventIds) ? bp.servedEventIds : [];
    for (const id of served) allServedIds.add(id);

    if (isSpeakerishForServedCheck(bp) && served.length === 0) {
      blueprintsMissingServedEvents.push({
        panelId: bp.panelId,
        reason: "speaker_panel_without_served_event",
      });
    }
  }

  const unservedRequiredEventIds = requiredEventIds.filter((id) => !allServedIds.has(id));

  const report: ServedEventsValidationReport = {
    unservedRequiredEventIds,
    blueprintsMissingServedEvents,
  };

  if (
    strict
    && (report.unservedRequiredEventIds.length > 0
      || report.blueprintsMissingServedEvents.length > 0)
  ) {
    throw new PremiumServedEventsViolationError(report);
  }

  return report;
}
