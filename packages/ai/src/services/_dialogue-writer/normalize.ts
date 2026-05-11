/**
 * Helpers de normalisation utilisés par dialogue-writer :
 *   - `uniq` / `normalizeStringArray` : assainit les listes de strings.
 *   - `normalizeSceneContinuityPayload` : projette une réponse LLM vers
 *     `SceneContinuityPayload` strict, avec fallback heuristique.
 *   - `attachPanelTextContracts` : matérialise `PanelTextContract` sur chaque
 *     case (consommé par les lecteurs / pipeline premium — PR5).
 */
import type {
  MangaPanelText,
  SceneContinuityPayload,
} from "@manga-ai-studio/core";
import { buildPanelTextContractFromFragments } from "@manga-ai-studio/core";

export function uniq(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  ];
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
}

export function attachPanelTextContracts(panels: MangaPanelText[]): MangaPanelText[] {
  return panels.map((p) => ({
    ...p,
    textContract: buildPanelTextContractFromFragments({
      panelId: p.panelId,
      dialogueLines: (p.bubbles ?? []).map((b) => ({
        line: b.text,
        speakerLabel: b.speaker ?? null,
      })),
      narration:
        Array.isArray(p.narration) && p.narration.length > 0
          ? p.narration.join("\n")
          : null,
      sfx: p.sfx ?? [],
    }),
  }));
}

export function normalizeSceneContinuityPayload(
  input: unknown,
  fallback: SceneContinuityPayload,
): SceneContinuityPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
  const record = input as Record<string, unknown>;
  return {
    source:
      record.source === "generator_structured" ||
      record.source === "heuristic_fallback"
        ? record.source
        : fallback.source,
    confidence:
      typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? Math.max(0, Math.min(1, record.confidence))
        : fallback.confidence,
    sceneEvents: Array.isArray(record.sceneEvents)
      ? record.sceneEvents
          .filter(
            (event): event is Record<string, unknown> =>
              Boolean(event) && typeof event === "object" && !Array.isArray(event),
          )
          .map((event) => ({
            eventType:
              typeof event.eventType === "string"
                ? event.eventType
                : "scene_progression",
            title:
              typeof event.title === "string" ? event.title : "Événement de scène",
            description:
              typeof event.description === "string"
                ? event.description
                : fallback.sceneEvents[0]?.description ?? "Progression de scène",
            actorNames: normalizeStringArray(event.actorNames),
            location: typeof event.location === "string" ? event.location : null,
            consequences: normalizeStringArray(event.consequences),
            objectsGained: normalizeStringArray(event.objectsGained),
            objectsLost: normalizeStringArray(event.objectsLost),
            injuriesApplied: normalizeStringArray(event.injuriesApplied),
            injuriesResolved: normalizeStringArray(event.injuriesResolved),
            relationshipChanges: normalizeStringArray(event.relationshipChanges),
            continuityFlags: normalizeStringArray(event.continuityFlags),
            irreversible: Boolean(event.irreversible),
            importance:
              event.importance === "critical" ||
              event.importance === "major" ||
              event.importance === "minor"
                ? event.importance
                : "minor",
          }))
      : fallback.sceneEvents,
    characterDeltas: Array.isArray(record.characterDeltas)
      ? record.characterDeltas
          .filter(
            (delta): delta is Record<string, unknown> =>
              Boolean(delta) && typeof delta === "object" && !Array.isArray(delta),
          )
          .map((delta) => ({
            characterName:
              typeof delta.characterName === "string"
                ? delta.characterName
                : "Personnage",
            location: typeof delta.location === "string" ? delta.location : null,
            emotionalState:
              typeof delta.emotionalState === "string"
                ? delta.emotionalState
                : null,
            objective: typeof delta.objective === "string" ? delta.objective : null,
            outfit: typeof delta.outfit === "string" ? delta.outfit : null,
            gainedItems: normalizeStringArray(delta.gainedItems),
            lostItems: normalizeStringArray(delta.lostItems),
            injuriesAdded: normalizeStringArray(delta.injuriesAdded),
            injuriesHealed: normalizeStringArray(delta.injuriesHealed),
            knowledgeGained: normalizeStringArray(delta.knowledgeGained),
            obligationsAdded: normalizeStringArray(delta.obligationsAdded),
            relationshipChanges: Array.isArray(delta.relationshipChanges)
              ? delta.relationshipChanges
                  .filter(
                    (item): item is Record<string, unknown> =>
                      Boolean(item) &&
                      typeof item === "object" &&
                      !Array.isArray(item),
                  )
                  .map((item) => ({
                    targetCharacterName:
                      typeof item.targetCharacterName === "string"
                        ? item.targetCharacterName
                        : "Autre",
                    shift: typeof item.shift === "string" ? item.shift : "shift",
                    intensityDelta:
                      typeof item.intensityDelta === "number"
                        ? item.intensityDelta
                        : undefined,
                    note: typeof item.note === "string" ? item.note : undefined,
                  }))
              : [],
          }))
      : fallback.characterDeltas,
    locationDeltas: Array.isArray(record.locationDeltas)
      ? record.locationDeltas
          .filter(
            (delta): delta is Record<string, unknown> =>
              Boolean(delta) && typeof delta === "object" && !Array.isArray(delta),
          )
          .map((delta) => ({
            locationName:
              typeof delta.locationName === "string"
                ? delta.locationName
                : fallback.locationDeltas[0]?.locationName ?? "Lieu",
            state: typeof delta.state === "string" ? delta.state : null,
            visualAnchorsAdded: normalizeStringArray(delta.visualAnchorsAdded),
            propsAdded: normalizeStringArray(delta.propsAdded),
            propsRemoved: normalizeStringArray(delta.propsRemoved),
            occupantsAdded: normalizeStringArray(delta.occupantsAdded),
            occupantsRemoved: normalizeStringArray(delta.occupantsRemoved),
            tracesAdded: normalizeStringArray(delta.tracesAdded),
            damageAdded: normalizeStringArray(delta.damageAdded),
            surveillanceAdded: normalizeStringArray(delta.surveillanceAdded),
            vegetationAdded: normalizeStringArray(delta.vegetationAdded),
            narrativeFunction:
              typeof delta.narrativeFunction === "string"
                ? delta.narrativeFunction
                : null,
          }))
      : fallback.locationDeltas,
    arcDeltas: Array.isArray(record.arcDeltas)
      ? record.arcDeltas
          .filter(
            (delta): delta is Record<string, unknown> =>
              Boolean(delta) && typeof delta === "object" && !Array.isArray(delta),
          )
          .map((delta) => ({
            arcName: typeof delta.arcName === "string" ? delta.arcName : "Arc actif",
            status: typeof delta.status === "string" ? delta.status : null,
            progression: normalizeStringArray(delta.progression),
            tensionDelta:
              typeof delta.tensionDelta === "number"
                ? delta.tensionDelta
                : undefined,
            openPromisesAdded: normalizeStringArray(delta.openPromisesAdded),
            paidPromisesAdded: normalizeStringArray(delta.paidPromisesAdded),
            blockersAdded: normalizeStringArray(delta.blockersAdded),
            blockersResolved: normalizeStringArray(delta.blockersResolved),
            currentState:
              typeof delta.currentState === "string" ? delta.currentState : null,
          }))
      : fallback.arcDeltas,
  };
}
