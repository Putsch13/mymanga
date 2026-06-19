/**
 * P5.2 — Résolution du contexte personnages d'un retry.
 *
 * Découpé en deux étapes pour respecter les dépendances :
 *  - `createRetryCharacterResolver` : ne dépend que de la metadata + projectChars
 *    (utilisé en amont pour résoudre les LoRAs).
 *  - `buildDriftCharactersEnriched` : prend `hasCanonRef` (déduit après
 *    résolution des LoRAs + refs stables) pour annoter `canonicalReferenceAvailable`.
 *
 * Pure : pas d'I/O, pas de Prisma. Les données entrantes (projectChars,
 * panelCastData, …) doivent déjà avoir été chargées par la route.
 */
import { createProjectCharacterResolver } from "@/lib/retry/resolve-project-characters";
import type { DriftCharacterEnriched } from "@/lib/retry/compute-retry-reference-policy";

type JsonRecord = Record<string, unknown>;

type ProjectCharacter = Parameters<typeof createProjectCharacterResolver>[0]["projectChars"][number];

type PanelCastData = Parameters<typeof createProjectCharacterResolver>[0]["panelCastData"];

export interface CreateRetryCharacterResolverInput {
  metadata: JsonRecord;
  projectChars: ProjectCharacter[];
  panelCastData: PanelCastData;
  characters: string[];
}

export interface CreateRetryCharacterResolverOutput {
  metadataCharacterIds: string[];
  projectCharsById: Map<string, ProjectCharacter>;
  resolveCharacterFromName: ReturnType<typeof createProjectCharacterResolver>["resolveCharacterFromName"];
  resolvedPanelCharacterIds: Set<string>;
}

export function createRetryCharacterResolver(
  input: CreateRetryCharacterResolverInput,
): CreateRetryCharacterResolverOutput {
  const { metadata, projectChars, panelCastData, characters } = input;

  const metadataCharacterIds = Array.isArray((metadata as JsonRecord).characterIds)
    ? ((metadata as JsonRecord).characterIds as unknown[]).filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  const { projectCharsById, resolveCharacterFromName } = createProjectCharacterResolver({
    projectChars,
    panelCastData,
    metadataCharacterIds,
  });

  const resolvedPanelCharacterIds = new Set<string>();
  for (const name of characters) {
    const res = resolveCharacterFromName(name);
    if (res) resolvedPanelCharacterIds.add(res.character.id);
  }
  for (const id of metadataCharacterIds) {
    if (projectCharsById.has(id)) resolvedPanelCharacterIds.add(id);
  }
  if (panelCastData?.focus?.characterId) {
    resolvedPanelCharacterIds.add(panelCastData.focus.characterId);
  }
  for (const s of panelCastData?.supporting ?? []) {
    if (s?.characterId) resolvedPanelCharacterIds.add(s.characterId);
  }

  return {
    metadataCharacterIds,
    projectCharsById,
    resolveCharacterFromName,
    resolvedPanelCharacterIds,
  };
}

export interface BuildDriftCharactersEnrichedInput {
  projectChars: ProjectCharacter[];
  resolvedPanelCharacterIds: Set<string>;
  resolveCharacterFromName: CreateRetryCharacterResolverOutput["resolveCharacterFromName"];
  hasCanonRef: boolean;
}

export function buildDriftCharactersEnriched(
  input: BuildDriftCharactersEnrichedInput,
): DriftCharacterEnriched[] {
  const { projectChars, resolvedPanelCharacterIds, resolveCharacterFromName, hasCanonRef } = input;

  return projectChars
    .filter((pc) => resolvedPanelCharacterIds.has(pc.id))
    .map((pc) => {
      const fp = (pc.characterFingerprint as Record<string, unknown> | null) ?? {};
      const baseDc = {
        name: pc.name,
        gender: typeof fp.gender === "string" ? fp.gender : null,
        hairColor: typeof fp.hairColor === "string" ? fp.hairColor : null,
        eyeColor: typeof fp.eyeColor === "string" ? fp.eyeColor : null,
        bodyDetails: typeof fp.bodyDetails === "string" ? fp.bodyDetails : null,
        appearance: typeof fp.appearance === "string" ? fp.appearance : null,
        canonicalReferenceAvailable: hasCanonRef,
      };
      const charForFp = resolveCharacterFromName(baseDc.name)?.character;
      const fpEnriched = charForFp?.characterFingerprint && typeof charForFp.characterFingerprint === "object"
        ? (charForFp.characterFingerprint as Record<string, unknown>)
        : null;
      return {
        ...baseDc,
        hardTraits: Array.isArray(fpEnriched?.hardTraits)
          ? (fpEnriched!.hardTraits as string[]).filter((t): t is string => typeof t === "string")
          : null,
        softTraits: Array.isArray(fpEnriched?.softTraits)
          ? (fpEnriched!.softTraits as string[]).filter((t): t is string => typeof t === "string")
          : null,
      };
    });
}
