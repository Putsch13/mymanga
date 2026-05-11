/**
 * `inferSceneContinuityPayload` — fallback heuristique qui synthétise une
 * `SceneContinuityPayload` à partir de la scène, des personnages, du beat
 * structuré et de la continuité fournie. Utilisé quand OpenAI n'est pas
 * disponible OU comme socle pour la normalisation de la réponse LLM.
 */
import type {
  SceneContinuityPayload,
  StructuredArcDelta,
  StructuredCharacterDelta,
  StructuredLocationDelta,
  StructuredSceneEvent,
} from "@manga-ai-studio/core";
import type { DialogueWriterInput } from "./types";
import { uniq } from "./normalize";

export function inferSceneContinuityPayload(
  input: DialogueWriterInput,
): SceneContinuityPayload {
  const summary = `${input.sceneSummary} ${input.emotionalObjective}`.toLowerCase();
  const location = input.location ?? null;
  const mainArcName =
    input.structuredBeatPayload?.arcPromises[0]?.arcName ??
    input.continuityContext?.find((line) => /arc/i.test(line))?.slice(0, 80) ??
    "Arc actif";

  const sceneEvents: StructuredSceneEvent[] = [
    {
      eventType: "scene_progression",
      title: input.sceneSummary.slice(0, 60),
      description: input.sceneSummary,
      actorNames: input.characters.map((character) => character.name),
      location,
      consequences: [input.emotionalObjective],
      objectsGained: [],
      objectsLost: [],
      injuriesApplied: [],
      injuriesResolved: [],
      relationshipChanges: [],
      continuityFlags: ["scene_progression"],
      irreversible: false,
      importance: input.tension >= 8 ? "major" : "minor",
    },
  ];

  const characterDeltas: StructuredCharacterDelta[] = input.characters.map(
    (character) => ({
      characterName: character.name,
      location,
      emotionalState:
        character.emotionalState ?? (input.tension >= 7 ? "tension" : "focus"),
      objective: character.objective ?? input.emotionalObjective,
      outfit: null,
      gainedItems: /(gagne|obtient|ramasse|trouve|retrouve|récupère|recupere)/i.test(
        summary,
      )
        ? ["objet_à_confirmer"]
        : [],
      lostItems: /(perd|laisse tomber|abandonne|sacrifie)/i.test(summary)
        ? ["objet_perdu_à_confirmer"]
        : [],
      injuriesAdded: /(blesse|touché|touche|entaille|fracture|saigne)/i.test(summary)
        ? ["blessure_à_confirmer"]
        : [],
      injuriesHealed: /(soigne|guérit|guerit|bandage|repos)/i.test(summary)
        ? ["blessure_résolue_à_confirmer"]
        : [],
      knowledgeGained: /(découvre|comprend|réalise|apprend|devine|révélation|revelation)/i.test(
        summary,
      )
        ? [`${character.name} apprend un fait clé`]
        : [],
      obligationsAdded: [],
      relationshipChanges: [],
    }),
  );

  const locationDeltas: StructuredLocationDelta[] = [
    {
      locationName: input.location ?? "Lieu de scène",
      state: /(ruine|cassé|détruit|effondré|sang|feu|fumée)/i.test(summary)
        ? "altéré"
        : null,
      visualAnchorsAdded: uniq([
        input.location,
        /(pluie|rain)/i.test(summary) ? "pluie visible" : null,
        /(laboratoire|lab)/i.test(summary) ? "signalétique technique" : null,
        /(jardin|flowers|fleur)/i.test(summary) ? "motifs floraux" : null,
      ]),
      propsAdded: [],
      propsRemoved: [],
      occupantsAdded: input.characters.map((character) => character.name),
      occupantsRemoved: [],
      tracesAdded: /(explosion|combat|poursuite|panique|fuite)/i.test(summary)
        ? ["trace d'événement récent"]
        : [],
      damageAdded: /(explosion|cassé|détruit|effondré)/i.test(summary)
        ? ["dommages visibles"]
        : [],
      surveillanceAdded: /(caméra|camera|garde|surveillance|alarme)/i.test(summary)
        ? ["surveillance active"]
        : [],
      vegetationAdded: [],
      narrativeFunction: input.emotionalObjective,
    },
  ];

  const relationshipChanges = /(pardonne|trahit|avoue|confie|alliance|promet|protège|protege)/i.test(
    summary,
  )
    ? input.characters
        .slice(0, 2)
        .map((character, index, arr) => {
          const other = arr[(index + 1) % arr.length];
          return other
            ? {
                targetCharacterName: other.name,
                shift: input.sceneSummary.slice(0, 80),
                note: "Évolution relationnelle implicite dans la scène",
              }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];
  if (relationshipChanges.length > 0) {
    characterDeltas[0] = {
      ...characterDeltas[0],
      relationshipChanges,
    };
    sceneEvents[0].relationshipChanges = relationshipChanges.map(
      (change) =>
        `${characterDeltas[0]?.characterName} -> ${change.targetCharacterName}: ${change.shift}`,
    );
  }

  const arcDeltas: StructuredArcDelta[] = [
    {
      arcName: mainArcName,
      status: "open",
      progression: [input.sceneSummary.slice(0, 120)],
      tensionDelta: Math.max(1, Math.round(input.tension / 2)),
      openPromisesAdded:
        input.structuredBeatPayload?.arcPromises
          .filter((p) => p.stage === "setup" || p.stage === "progression")
          .map((p) => p.promise)
          .slice(0, 3) ??
        (/(promet|mystère|mystere|question|secret|attend|cherche encore)/i.test(
          summary,
        )
          ? [input.sceneSummary.slice(0, 120)]
          : []),
      paidPromisesAdded:
        input.structuredBeatPayload?.arcPromises
          .filter((p) => p.stage === "payoff" || p.stage === "twist")
          .map((p) => p.promise)
          .slice(0, 3) ??
        (/(révèle|reveal|comprend enfin|découvre enfin|obtient la réponse)/i.test(
          summary,
        )
          ? [input.sceneSummary.slice(0, 120)]
          : []),
      blockersAdded: /(bloqué|bloque|empêche|empeche|menace|impossible)/i.test(summary)
        ? [input.emotionalObjective]
        : [],
      blockersResolved: /(résout|resout|surmonte|franchit|réussit|reussit)/i.test(
        summary,
      )
        ? [input.emotionalObjective]
        : [],
      currentState: input.emotionalObjective,
    },
  ];

  return {
    source: "heuristic_fallback",
    confidence: 0.56,
    sceneEvents,
    characterDeltas,
    locationDeltas,
    arcDeltas,
  };
}
