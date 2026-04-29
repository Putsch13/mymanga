/**
 * Compositeur monde visuel chapitre (premium IA-first).
 * Produit un `VisualWorldContract` validé Zod — pas de fallback silencieux en mode strict.
 */

import OpenAI from "openai";
import {
  parseVisualWorldContract,
  type VisualWorldContract,
} from "@manga-ai-studio/core";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ComposeVisualWorldContractBeat = {
  beatId: string;
  summary: string;
  whyThisBeatExists?: string | null;
  dramaticChange?: string | null;
  involvedCharacterIds?: string[];
};

export type ComposeVisualWorldContractInput = {
  chapterId: string;
  chapterSummary?: string | null;
  chapterUserIntent?: string | null;
  projectGenre?: string | null;
  projectTone?: string | null;
  styleBibleJson?: string | null;
  beats: ComposeVisualWorldContractBeat[];
  knownCharacters: Array<{
    id: string;
    name: string;
    roleType?: string | null;
    description?: string | null;
  }>;
  knownLocations: Array<{
    id: string;
    name: string;
    description?: string | null;
  }>;
};

function buildSystemPrompt(): string {
  return [
    "Tu es le directeur artistique d'un chapitre manga premium.",
    "Tu dois produire UN SEUL objet JSON respectant exactement le schéma demandé par l'utilisateur.",
    "Règles strictes :",
    "- chapterId doit être identique à celui fourni.",
    '- source en haut du contrat : "ai_generated" sauf consigne contraire.',
    "- Chaque beatId fourni doit apparaître exactement une fois dans beatBindings.",
    "- Pour chaque beatBinding : locationId OBLIGATOIRE et doit référencer un id présent dans locations[].",
    "- primaryPropIds et npcGroupIds : uniquement des ids présents dans props[] / npcGroups[] (tableaux vides autorisés).",
    "- locations : au moins un lieu par beat si plusieurs beats ont des ambiances différentes ; réutilise les ids knownLocations quand le texte correspond.",
    "- Chaque location doit avoir description non vide, kind cohérent, visualAnchors/architecture/lighting/atmosphere utiles (tableaux, peuvent être courts).",
    "- props : objets visibles ou symboliques importants pour l'histoire ; requiredBeatIds cohérents.",
    "- npcGroups : foules, gardes, marchands, etc. avec visualProfile/outfit/silhouette concrets.",
    "- creatures, vehicles, factions : uniquement si le texte le justifie (sinon tableaux vides).",
    "- Pas de markdown, pas de commentaires : JSON brut uniquement.",
  ].join("\n");
}

function buildUserPayload(input: ComposeVisualWorldContractInput): string {
  const beatLines = input.beats.map((b) => ({
    beatId: b.beatId,
    summary: b.summary,
    whyThisBeatExists: b.whyThisBeatExists ?? "",
    dramaticChange: b.dramaticChange ?? "",
    involvedCharacterIds: b.involvedCharacterIds ?? [],
  }));

  return JSON.stringify({
    task: "compose_visual_world_contract",
    chapterId: input.chapterId,
    chapterSummary: input.chapterSummary ?? "",
    chapterUserIntent: input.chapterUserIntent ?? "",
    projectGenre: input.projectGenre ?? "",
    projectTone: input.projectTone ?? "",
    styleBible: (input.styleBibleJson ?? "").slice(0, 4000),
    beats: beatLines,
    knownCharacters: input.knownCharacters,
    knownLocations: input.knownLocations,
    outputSchema: {
      chapterId: "string",
      source: ["ai_generated", "studio_curated", "mixed"],
      locations: [
        {
          id: "string",
          label: "string",
          kind: "string",
          description: "string",
          visualAnchors: ["string"],
          architecture: ["string"],
          lighting: ["string"],
          atmosphere: ["string"],
          recurringProps: ["string"],
          negativeConstraints: ["string"],
          source: ["db_canon", "user_canon", "ai_generated", "story_text"],
          canonPolicy: ["temporary", "promote_candidate", "locked"],
        },
      ],
      props: [
        {
          id: "string",
          canonicalName: "string",
          category: "string",
          visualDescription: "string",
          ownerCharacterId: "string|null",
          locationId: "string|null",
          requiredBeatIds: ["string"],
          continuityPolicy: ["single_use", "recurring", "symbolic"],
        },
      ],
      npcGroups: [
        {
          id: "string",
          label: "string",
          role: "string",
          visualProfile: "string",
          outfit: "string",
          silhouette: "string",
          relationToLocation: "string|null",
          requiredBeatIds: ["string"],
          recurrencePolicy: ["background", "recurring", "named"],
        },
      ],
      creatures: [
        {
          id: "string",
          label: "string",
          visualDescription: "string",
          requiredBeatIds: ["string"],
        },
      ],
      vehicles: [
        {
          id: "string",
          label: "string",
          visualDescription: "string",
          requiredBeatIds: ["string"],
        },
      ],
      factions: [
        {
          id: "string",
          label: "string",
          visualMarkers: ["string"],
          requiredBeatIds: ["string"],
        },
      ],
      beatBindings: [
        {
          beatId: "string",
          locationId: "string",
          primaryPropIds: ["string"],
          npcGroupIds: ["string"],
        },
      ],
    },
  });
}

export function assertVisualWorldContractPremiumInvariants(
  contract: VisualWorldContract,
  expected: { chapterId: string; expectedBeatIds: string[] },
): void {
  if (contract.chapterId !== expected.chapterId) {
    throw new Error(
      `premium_visual_world_chapter_mismatch:expected=${expected.chapterId} got=${contract.chapterId}`,
    );
  }

  const locIds = new Set(contract.locations.map((l) => l.id));
  const propIds = new Set(contract.props.map((p) => p.id));
  const npcIds = new Set(contract.npcGroups.map((n) => n.id));

  for (const beatId of expected.expectedBeatIds) {
    const b = contract.beatBindings.find((x) => x.beatId === beatId);
    if (!b?.locationId || !locIds.has(b.locationId)) {
      throw new Error(`premium_visual_world_missing_beat_location:${beatId}`);
    }
    for (const pid of b.primaryPropIds) {
      if (!propIds.has(pid)) {
        throw new Error(`premium_visual_world_unknown_prop:${pid}@${b.beatId}`);
      }
    }
    for (const nid of b.npcGroupIds) {
      if (!npcIds.has(nid)) {
        throw new Error(`premium_visual_world_unknown_npc_group:${nid}@${b.beatId}`);
      }
    }
  }
}

/**
 * Appelle l'IA, parse Zod, puis valide les invariants premium (lieu par beat, références cohérentes).
 */
export async function composeVisualWorldContract(
  input: ComposeVisualWorldContractInput,
): Promise<VisualWorldContract> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "premium_visual_world_openai_required: OPENAI_API_KEY is required to compose the visual world in premium mode.",
    );
  }

  const expectedBeatIds = [...new Set(input.beats.map((b) => b.beatId).filter(Boolean))];
  if (expectedBeatIds.length === 0) {
    throw new Error("premium_visual_world_no_beats: at least one beat is required.");
  }

  const model = process.env.OPENAI_VISUAL_WORLD_MODEL ?? "gpt-4o-mini";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPayload(input) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.35,
    max_tokens: 8192,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("premium_visual_world_empty_response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("premium_visual_world_invalid_json");
  }

  const contract = parseVisualWorldContract(parsedJson);
  assertVisualWorldContractPremiumInvariants(contract, {
    chapterId: input.chapterId,
    expectedBeatIds,
  });

  return contract;
}
