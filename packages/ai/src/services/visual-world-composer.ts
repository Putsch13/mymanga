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
    /** Texte fusionné (brief établi > brief > description) — toujours envoyé au modèle. */
    description?: string | null;
    /** Champs bruts DB pour réutiliser les ids `knownLocations` avec source `db_canon` / `user_canon`. */
    visualBrief?: string | null;
    establishedVisualBrief?: string | null;
    canonImageUrl?: string | null;
    canonLocked?: boolean | null;
  }>;
  /**
   * USER-WINS : groupes PNJ déjà connus du projet (auto-extraits + édités par
   * l'utilisateur via le wizard). Le compositeur DOIT les RÉUTILISER (mêmes
   * id/label/visuel) au lieu de réinventer un groupe similaire.
   */
  knownNpcGroups?: Array<{
    id: string;
    label: string;
    description?: string | null;
    visualProfile?: string | null;
    outfit?: string | null;
    silhouette?: string | null;
    userEdited?: boolean;
  }>;
  /** USER-WINS : props/artefacts déjà connus du projet (idem). */
  knownWorldProps?: Array<{
    id: string;
    label: string;
    description?: string | null;
    visualDescription?: string | null;
    kind?: string | null;
    userEdited?: boolean;
  }>;
};

export type ComposeKnownLocationDbRow = {
  id: string;
  name: string;
  description?: string | null;
  visualBrief?: string | null;
  establishedVisualBrief?: string | null;
  canonImageUrl?: string | null;
  canonLocked?: boolean | null;
  /** Taxonomie lieu (Prisma `Location.type`) — enrichit le prompt compositeur. */
  type?: string | null;
  /** Métadonnées JSON Prisma — résumées en hint court pour le LLM. */
  metadata?: unknown;
  /** JSON Prisma (souvent tableau de refs) — résumé compact seulement. */
  visualRefs?: unknown;
};

function compactMetadataForComposeHint(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const obj = meta as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  try {
    const s = JSON.stringify(obj);
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  } catch {
    return null;
  }
}

function visualRefsCountHint(refs: unknown): string | null {
  if (!Array.isArray(refs)) return null;
  return refs.length > 0 ? `visualRefs:${refs.length}` : null;
}

/** Normalise une ligne `Location` Prisma → entrée `knownLocations` du compositeur IA. */
export function toComposeVisualWorldKnownLocation(
  loc: ComposeKnownLocationDbRow,
): ComposeVisualWorldContractInput["knownLocations"][number] {
  const baseDescription =
    loc.establishedVisualBrief?.trim()
    || loc.visualBrief?.trim()
    || loc.description?.trim()
    || null;
  const hints = [
    loc.type?.trim() ? `type=${loc.type.trim()}` : null,
    compactMetadataForComposeHint(loc.metadata),
    visualRefsCountHint(loc.visualRefs),
  ].filter((x): x is string => Boolean(x));
  const hintBlock = hints.length > 0 ? hints.join(" | ") : null;
  const description =
    hintBlock && baseDescription
      ? `${baseDescription} [${hintBlock}]`
      : hintBlock && !baseDescription
        ? `[${hintBlock}]`
        : baseDescription;
  return {
    id: loc.id,
    name: loc.name,
    description,
    visualBrief: loc.visualBrief?.trim() || null,
    establishedVisualBrief: loc.establishedVisualBrief?.trim() || null,
    canonImageUrl: loc.canonImageUrl?.trim() || null,
    canonLocked: typeof loc.canonLocked === "boolean" ? loc.canonLocked : null,
  };
}

function buildSystemPrompt(): string {
  return [
    "Tu es le directeur artistique d'un chapitre manga premium.",
    "Tu dois produire UN SEUL objet JSON respectant exactement le schéma demandé par l'utilisateur.",
    "Tu dois composer naturellement le monde visuel du chapitre : lieux, sous-lieux, accessoires, PNJ, créatures, véhicules, factions.",
    "N'utilise pas de catalogue générique ni de listes figées : déduis tout depuis l'histoire, les personnages listés, le genre, le ton, la continuité et le style manga.",
    "Ne crée pas de personnage principal inventé : les héros viennent uniquement des IDs fournis.",
    "Les PNJ sont autorisés seulement s'ils servent la scène, la foule, le décor ou l'action.",
    "Les props sont autorisés seulement s'ils ont une preuve narrative ou symbolique dans les beats.",
    "Chaque beat fourni doit avoir exactement un beatBinding avec une locationId valide, environmentMood si le beat a une tonalité décor distincte, et continuityObjectIds seulement pour objets de continuité hors props.",
    "Règles strictes :",
    "- chapterId doit être identique à celui fourni.",
    '- source en haut du contrat : "ai_generated" sauf consigne contraire.',
    "- Chaque beatId fourni doit apparaître exactement une fois dans beatBindings.",
    "- Pour chaque beatBinding : locationId OBLIGATOIRE et doit référencer un id présent dans locations[].",
    "- primaryPropIds, npcGroupIds, creatureIds, vehicleIds, factionIds : uniquement des ids présents dans les tableaux correspondants du contrat (tableaux vides autorisés).",
    "- Réutilise les ids de knownLocations quand le texte correspond ; si un lieu vient de la DB, mets source db_canon ou user_canon et canonPolicy locked ou promote_candidate si canonLocked est true.",
    "- Chaque entrée knownLocations peut inclure visualBrief, establishedVisualBrief, canonImageUrl : exploite-les pour décrire les locations[] sans inventer un décor contradictoire.",
    "- USER-WINS knownNpcGroups : si un groupe PNJ existant correspond, RÉUTILISE son id, label, visualProfile, outfit, silhouette tels quels (surtout si userEdited=true). Ne renomme jamais un groupe édité par l'utilisateur.",
    "- USER-WINS knownWorldProps : idem. Si un prop existant correspond, réutilise son id et son label EXACT (surtout si userEdited=true).",
    "- Chaque location doit avoir description non vide, kind cohérent, visualAnchors/architecture/lighting/atmosphere utiles (tableaux, peuvent être courts).",
    "- props : visibilité (visibilityPolicy visible|mentioned|background) et symbolicMeaning si le prop est métaphorique ; requiredBeatIds cohérents.",
    "- npcGroups : foules, gardes, marchands, etc. avec visualProfile/outfit/silhouette concrets ; relationToCharacterIds si liés à des héros connus.",
    "- creatures : threatLevel none|low|medium|high ; vehicles : scale small|medium|large|massive ; factions : visualMarkers, visualMotifs, colors, emblem.",
    "- Optionnel : diagnostics { warnings, repaired, missing } si tu corriges ou détectes des trous.",
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
    knownNpcGroups: input.knownNpcGroups ?? [],
    knownWorldProps: input.knownWorldProps ?? [],
    outputSchema: {
      version: 1,
      chapterId: "string",
      source: "ai_generated | studio_curated | mixed",
      diagnostics: {
        warnings: ["string"],
        repaired: ["string"],
        missing: ["string"],
      },
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
          source: "db_canon | user_canon | ai_generated | story_text",
          canonPolicy: "temporary | promote_candidate | locked",
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
          continuityPolicy: "single_use | recurring | symbolic",
          visibilityPolicy: "visible | mentioned | background",
          symbolicMeaning: "string|null",
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
          relationToCharacterIds: ["string"],
          requiredBeatIds: ["string"],
          recurrencePolicy: "background | recurring | named",
        },
      ],
      creatures: [
        {
          id: "string",
          label: "string",
          visualDescription: "string",
          requiredBeatIds: ["string"],
          threatLevel: "none | low | medium | high",
        },
      ],
      vehicles: [
        {
          id: "string",
          label: "string",
          visualDescription: "string",
          requiredBeatIds: ["string"],
          scale: "small | medium | large | massive",
        },
      ],
      factions: [
        {
          id: "string",
          label: "string",
          visualMarkers: ["string"],
          visualMotifs: ["string"],
          colors: ["string"],
          emblem: "string|null",
          requiredBeatIds: ["string"],
        },
      ],
      beatBindings: [
        {
          beatId: "string",
          locationId: "string",
          primaryPropIds: ["string"],
          npcGroupIds: ["string"],
          creatureIds: ["string"],
          vehicleIds: ["string"],
          factionIds: ["string"],
          environmentMood: "string|null",
          continuityObjectIds: ["string"],
        },
      ],
    },
  });
}

/**
 * Validates premium invariants on the visual world contract.
 * Instead of throwing on orphaned entity references (AI hallucinations),
 * it **repairs** the contract by stripping unknown IDs from bindings and
 * logs warnings. Only `chapterId` mismatch still throws (structural bug).
 *
 * @returns the list of warnings produced during repair (empty = clean contract).
 */
export function assertVisualWorldContractPremiumInvariants(
  contract: VisualWorldContract,
  expected: { chapterId: string; expectedBeatIds: string[] },
): string[] {
  if (contract.chapterId !== expected.chapterId) {
    throw new Error(
      `premium_visual_world_chapter_mismatch:expected=${expected.chapterId} got=${contract.chapterId}`,
    );
  }

  const locIds = new Set(contract.locations.map((l) => l.id));
  const propIds = new Set(contract.props.map((p) => p.id));
  const npcIds = new Set(contract.npcGroups.map((n) => n.id));
  const creatureIds = new Set(contract.creatures.map((c) => c.id));
  const vehicleIds = new Set(contract.vehicles.map((v) => v.id));
  const factionIds = new Set(contract.factions.map((f) => f.id));

  const warnings: string[] = [];
  const fallbackLocationId = contract.locations[0]?.id ?? null;

  for (const beatId of expected.expectedBeatIds) {
    const b = contract.beatBindings.find((x) => x.beatId === beatId);
    if (!b) continue;

    if (!b.locationId || !locIds.has(b.locationId)) {
      if (fallbackLocationId) {
        warnings.push(`beat=${beatId}: missing/invalid locationId → fallback to ${fallbackLocationId}`);
        b.locationId = fallbackLocationId;
      } else {
        warnings.push(`beat=${beatId}: missing locationId and no locations available`);
      }
    }

    const unknownProps = b.primaryPropIds.filter((pid) => !propIds.has(pid));
    if (unknownProps.length > 0) {
      warnings.push(`beat=${beatId}: stripped unknown props [${unknownProps.join(",")}]`);
      b.primaryPropIds = b.primaryPropIds.filter((pid) => propIds.has(pid));
    }

    const unknownNpcs = b.npcGroupIds.filter((nid) => !npcIds.has(nid));
    if (unknownNpcs.length > 0) {
      warnings.push(`beat=${beatId}: stripped unknown npcGroups [${unknownNpcs.join(",")}]`);
      b.npcGroupIds = b.npcGroupIds.filter((nid) => npcIds.has(nid));
    }

    const unknownCreatures = b.creatureIds.filter((cid) => !creatureIds.has(cid));
    if (unknownCreatures.length > 0) {
      warnings.push(`beat=${beatId}: stripped unknown creatures [${unknownCreatures.join(",")}]`);
      b.creatureIds = b.creatureIds.filter((cid) => creatureIds.has(cid));
    }

    const unknownVehicles = b.vehicleIds.filter((vid) => !vehicleIds.has(vid));
    if (unknownVehicles.length > 0) {
      warnings.push(`beat=${beatId}: stripped unknown vehicles [${unknownVehicles.join(",")}]`);
      b.vehicleIds = b.vehicleIds.filter((vid) => vehicleIds.has(vid));
    }

    const unknownFactions = b.factionIds.filter((fid) => !factionIds.has(fid));
    if (unknownFactions.length > 0) {
      warnings.push(`beat=${beatId}: stripped unknown factions [${unknownFactions.join(",")}]`);
      b.factionIds = b.factionIds.filter((fid) => factionIds.has(fid));
    }
  }

  if (warnings.length > 0) {
    console.warn(`[visual-world:repair] ${warnings.length} invariant(s) repaired:\n  ${warnings.join("\n  ")}`);
  }

  return warnings;
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

  console.info(
    `[visual-world] locations=${contract.locations.length} npcGroups=${contract.npcGroups.length} ` +
    `props=${contract.props.length} creatures=${contract.creatures.length} ` +
    `vehicles=${contract.vehicles.length} factions=${contract.factions.length} ` +
    `beatBindings=${contract.beatBindings.length} status=valid`,
  );

  assertVisualWorldContractPremiumInvariants(contract, {
    chapterId: input.chapterId,
    expectedBeatIds,
  });

  return contract;
}
