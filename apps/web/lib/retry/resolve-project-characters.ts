/**
 * P5.1 — Index + resolver pour les personnages d'un projet (retry).
 *
 * Règle P0.5 : la résolution d'un personnage dans un retry se fait d'abord
 * par ID (focus / supporting / metadata.characterIds) ; le nom n'est qu'un
 * dernier recours (fallback) pour rester compatible avec les panels legacy
 * sans `characterIds`.
 *
 * Cette fabrique renvoie :
 *   - `projectCharsById`, `projectCharsByName` : Maps indexées.
 *   - `resolveCharacterFromName(name)` : closure qui applique la policy P0.5.
 *   - `normalizeCharName(n)` : normalisation partagée.
 *
 * Extrait tel quel de retry/route.ts, aucune modification de logique.
 */

export type ProjectCharacterRow = {
  id: string;
  name: string;
  [k: string]: unknown;
};

export type ResolvedCharacter<C extends ProjectCharacterRow = ProjectCharacterRow> = {
  character: C;
  resolvedBy: "focus_id" | "supporting_id" | "metadata_id" | "name_fallback";
};

export type PanelCastData = {
  focus?: { characterId: string; name: string } | null;
  supporting?: Array<{ characterId: string; name: string }>;
} | null;

export function normalizeCharName(n: string): string {
  return n.toLowerCase().trim();
}

export function createProjectCharacterResolver<C extends ProjectCharacterRow>(params: {
  projectChars: C[];
  panelCastData: PanelCastData;
  metadataCharacterIds: string[];
}) {
  const { projectChars, panelCastData, metadataCharacterIds } = params;

  const projectCharsById = new Map(projectChars.map((c) => [c.id, c]));
  const projectCharsByName = new Map(
    projectChars.map((c) => [normalizeCharName(c.name), c]),
  );

  function resolveCharacterFromName(name: string): ResolvedCharacter<C> | null {
    const norm = normalizeCharName(name);

    if (panelCastData?.focus?.characterId && normalizeCharName(panelCastData.focus.name) === norm) {
      const c = projectCharsById.get(panelCastData.focus.characterId);
      if (c) return { character: c, resolvedBy: "focus_id" };
    }
    const supporting = panelCastData?.supporting ?? [];
    for (const s of supporting) {
      if (s?.characterId && normalizeCharName(s.name) === norm) {
        const c = projectCharsById.get(s.characterId);
        if (c) return { character: c, resolvedBy: "supporting_id" };
      }
    }
    for (const id of metadataCharacterIds) {
      const c = projectCharsById.get(id);
      if (c && normalizeCharName(c.name) === norm) {
        return { character: c, resolvedBy: "metadata_id" };
      }
    }
    const byName = projectCharsByName.get(norm);
    if (byName) return { character: byName, resolvedBy: "name_fallback" };
    return null;
  }

  return {
    projectCharsById,
    projectCharsByName,
    resolveCharacterFromName,
    normalizeCharName,
  };
}
