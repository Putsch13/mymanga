/**
 * Prompts LLM pour extraction du contrat visuel chapitre :
 *   - `SYSTEM_PROMPT` : règles strictes (ancrage beats, no-fantasy-générique).
 *   - `buildUserPrompt` : assemble outline + références projet.
 */

export interface ExtractChapterVisualContractInput {
  chapterId: string;
  chapterTitle: string | null;
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  productionOutline: {
    beats: Array<{
      beatId: string;
      summary?: string | null;
      whyThisBeatExists?: string | null;
      dramaticChange?: string | null;
      involvedCharacters?: string[] | null;
      environmentContext?: string[] | null;
    }>;
  } | null;
  knownCharacters: Array<{
    id: string;
    name: string;
    roleType?: string | null;
  }>;
  knownLocations?: Array<{ id?: string; name: string; aliases?: string[] }>;
  projectGenre?: string | null;
  projectTone?: string | null;
  storyBibleSummary?: string | null;
}

export const SYSTEM_PROMPT = `Tu es le directeur visuel d'un chapitre de manga.
Tu extrais un CONTRAT VISUEL LOCAL à partir du texte du chapitre (outline / intent).
Règles strictes :
- Chaque entité DOIT avoir au moins un sourceBeatId parmi les beatId fournis. Sinon n'inclus pas l'entité.
- N'invente pas de lieux ou props "fantasy génériques" : seulement ce qui est supporté par le texte.
- Les lieux / persos / props du canon projet listés en référence ne sont obligatoires QUE s'ils apparaissent explicitement dans le chapitre.
- importance "required" uniquement si l'élément est centrale à la compréhension visuelle du chapitre.
- needsClarification=true si le lieu principal reste ambigu après lecture.
- Répartis les non-humains visibles : espèces/peuples dans "species", androïdes/méchas dans "robots", chimères dans "hybrids", autres menaces dans "creatures".
Réponds UNIQUEMENT en JSON valide selon le schéma demandé (objet racine).`;

export function buildUserPrompt(
  input: ExtractChapterVisualContractInput,
  validBeatIds: string[],
): string {
  const beats = input.productionOutline?.beats ?? [];
  const beatLines = beats
    .map((b) => {
      const parts = [
        `beatId=${b.beatId}`,
        b.summary ? `summary=${b.summary}` : null,
        b.whyThisBeatExists ? `why=${b.whyThisBeatExists}` : null,
        b.dramaticChange ? `turn=${b.dramaticChange}` : null,
        b.environmentContext?.length
          ? `environment=${b.environmentContext.join(";")}`
          : null,
        b.involvedCharacters?.length
          ? `involved=${b.involvedCharacters.join(",")}`
          : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");

  const chars = input.knownCharacters
    .map((c) => `${c.id}:${c.name}${c.roleType ? ` (${c.roleType})` : ""}`)
    .join("\n");

  const locs = (input.knownLocations ?? [])
    .map(
      (l) => `${l.id ?? ""} ${l.name} ${(l.aliases ?? []).join(",")}`.trim(),
    )
    .join("\n");

  return [
    `chapterId=${input.chapterId}`,
    `title=${input.chapterTitle ?? ""}`,
    `genre=${input.projectGenre ?? ""}`,
    `tone=${input.projectTone ?? ""}`,
    "",
    "=== Résumé / intent ===",
    input.chapterSummary ?? "",
    input.chapterUserIntent ?? "",
    "",
    input.storyBibleSummary
      ? `=== Bible (extrait) ===\n${input.storyBibleSummary}\n`
      : "",
    "=== Beats (sourceBeatIds UNIQUEMENT parmi ces beatId) ===",
    beatLines || "(aucun beat)",
    "",
    `=== beatId autorisés (JSON sourceBeatIds) ===\n${JSON.stringify(validBeatIds)}`,
    "",
    "=== Personnages projet (référence id → nom) ===",
    chars || "(aucun)",
    "",
    "=== Lieux projet (référence) ===",
    locs || "(aucun)",
    "",
    "Schéma JSON racine :",
    `{ "mainLocation": null | { name, description, confidence, sourceBeatIds, importance },`,
    `  "secondaryLocations": [...],`,
    `  "characters": [{ name, role, knownCharacterId?, confidence, sourceBeatIds, importance }],`,
    `  "groups": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "species": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "robots": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "hybrids": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "creatures": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "props": [{ name, description, importance, confidence, sourceBeatIds }],`,
    `  "ambientElements": [...],`,
    `  "rejectedOrUnrelated": [{ name, reason }],`,
    `  "needsClarification": boolean`,
    `}`,
  ].join("\n");
}
