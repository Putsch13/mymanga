/**
 * Narrative pass — construction du document de contexte chapitre injecté en RAG.
 *
 * Extrait de narrative-pass.ts (étape 1). Compose un string ≤4200 chars résumant :
 * projet, pitch, description, genre(s), bible, personnages (top 6), mémoire récente (top 3),
 * RAG récupéré (top 4), et PNJ récurrents du projet (visuels établis).
 *
 * Pure : aucun effet de bord (pas d'I/O). La persistance RAG reste dans narrative-pass.ts.
 */

type RecurringNpcInput = {
  label: string;
  appearanceCount: number;
  shortVisualCore: string;
  outfitSignature?: string | null;
  speciesLabel?: string | null;
};

type ProjectSlice = {
  title: string;
  pitch?: string | null;
  description?: string | null;
  primaryGenre?: string | null;
  subGenres?: string[] | null;
};

type CharacterSlice = {
  name: string;
  roleType?: string | null;
  objective?: string | null;
  fear?: string | null;
};

type MemoryEntry = { narrativeSummary?: string | null };

type RagDoc = {
  title?: string | null;
  entityType?: string | null;
  content: string;
};

type StoryBibleSlice = { summary?: string | null } | null | undefined;

export function buildNpcMemoryContext(recurringNpcs: readonly RecurringNpcInput[]): string {
  if (recurringNpcs.length === 0) return "";
  const lines = recurringNpcs.map((n) =>
    `- ${n.label} (${n.appearanceCount} apparitions) : ${n.shortVisualCore}`
    + (n.outfitSignature ? ` | Tenue : ${n.outfitSignature}` : "")
    + (n.speciesLabel ? ` | Espèce : ${n.speciesLabel}` : ""),
  );
  return `\nPNJ RÉCURRENTS DU PROJET (visuels à respecter si réapparition) :\n${lines.join("\n")}`;
}

export function buildChapterContextDocument(input: {
  project: ProjectSlice;
  storyBible: StoryBibleSlice;
  characters: readonly CharacterSlice[];
  recentMemory: readonly MemoryEntry[];
  retrievedDocs: readonly RagDoc[];
  npcMemoryContext: string;
}): string {
  const { project, storyBible, characters, recentMemory, retrievedDocs, npcMemoryContext } = input;

  return [
    `Projet: ${project.title}`,
    project.pitch ? `Pitch: ${project.pitch}` : "",
    project.description ? `Description: ${project.description}` : "",
    project.primaryGenre ? `Genre: ${project.primaryGenre}` : "",
    project.subGenres?.length ? `Sous-genres: ${project.subGenres.join(", ")}` : "",
    storyBible?.summary ? `Bible: ${storyBible.summary}` : "",
    characters.length
      ? `Personnages:\n${characters
          .slice(0, 6)
          .map((character) =>
            `- ${character.name} | ${character.roleType ?? "rôle?"} | obj: ${character.objective ?? "n/a"} | peur: ${character.fear ?? "n/a"}`)
          .join("\n")}`
      : "",
    recentMemory.length
      ? `Mémoire récente:\n${recentMemory
          .map((memory) => memory.narrativeSummary)
          .filter(Boolean)
          .slice(0, 3)
          .join("\n")}`
      : "",
    retrievedDocs.length
      ? `RAG:\n${retrievedDocs
          .slice(0, 4)
          .map((doc) => `${doc.title ?? doc.entityType ?? "doc"}: ${doc.content}`)
          .join("\n")}`
      : "",
    npcMemoryContext,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4200);
}
