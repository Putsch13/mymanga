/**
 * Sanitisation du contrat visuel chapitre :
 *   - filtre les `sourceBeatIds` invalides ;
 *   - drop les entités sans aucun beat valide ou nommage incomplet ;
 *   - propose un contrat vide réutilisable comme fallback.
 */
import type { ChapterVisualContract } from "../../contracts/chapter-visual-contract";
import type { ChapterVisualContractLlm } from "./schema";

function normalizeBeatIds(ids: string[], valid: Set<string>): string[] {
  return ids.map((id) => id.trim()).filter((id) => valid.has(id));
}

export function emptyContract(needsClarification?: boolean): ChapterVisualContract {
  return {
    mainLocation: null,
    secondaryLocations: [],
    characters: [],
    groups: [],
    species: [],
    robots: [],
    hybrids: [],
    creatures: [],
    props: [],
    ambientElements: [],
    rejectedOrUnrelated: [],
    needsClarification,
  };
}

export function sanitizeContractForValidBeats(
  raw: ChapterVisualContractLlm,
  validBeatIds: Set<string>,
): ChapterVisualContract {
  const filterLoc = (
    s: ChapterVisualContractLlm["mainLocation"] | null | undefined,
  ) => {
    if (!s || !s.name.trim()) return null;
    const sourceBeatIds = normalizeBeatIds(s.sourceBeatIds, validBeatIds);
    if (sourceBeatIds.length === 0 && s.importance === "required") return null;
    return { ...s, sourceBeatIds };
  };

  const main = filterLoc(raw.mainLocation ?? null);

  const filterSlice = <T extends { name: string; sourceBeatIds: string[] }>(
    items: T[] | undefined,
  ): T[] =>
    (items ?? [])
      .map((item) => ({
        ...item,
        sourceBeatIds: normalizeBeatIds(item.sourceBeatIds, validBeatIds),
      }))
      .filter((item) => item.name.trim().length > 0 && item.sourceBeatIds.length > 0);

  return {
    mainLocation: main,
    secondaryLocations: (raw.secondaryLocations ?? [])
      .map(filterLoc)
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    characters: filterSlice(raw.characters),
    groups: filterSlice(raw.groups),
    species: filterSlice(raw.species),
    robots: filterSlice(raw.robots),
    hybrids: filterSlice(raw.hybrids),
    creatures: filterSlice(raw.creatures),
    props: filterSlice(raw.props),
    ambientElements: filterSlice(raw.ambientElements),
    rejectedOrUnrelated: raw.rejectedOrUnrelated ?? [],
    needsClarification: raw.needsClarification,
  };
}
