import OpenAI from "openai";
import type { GeneratedChapterBundle, ProjectContextForChapter, StoryboardPanel, StoryboardPage } from "../chapter/shared-types";
import { buildBundleDigest, buildContextDigest } from "./chapter-pass-digests";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ContinuitySceneReview = {
  sceneId: string;
  summary: string;
  location: string;
  characters: string[];
  panelCaptions?: string[];
  panelNarrations?: string[];
};

type ContinuityReviewPayload = {
  chapterSummary?: string;
  cliffhanger?: string;
  notes?: string[];
  scenes?: ContinuitySceneReview[];
};

function keepKnownCharacters(context: ProjectContextForChapter, names: string[], fallback: string[]) {
  const known = new Set(context.characters.map((character) => character.name));
  const filtered = names.filter((name) => known.has(name));
  return filtered.length > 0 ? filtered : fallback;
}

function applySceneReview(
  context: ProjectContextForChapter,
  bundle: GeneratedChapterBundle,
  review: ContinuityReviewPayload,
): GeneratedChapterBundle {
  const sceneMap = new Map((review.scenes ?? []).map((scene) => [scene.sceneId, scene]));

  const scriptScenes = bundle.script.scenes.map((scene) => {
    const override = sceneMap.get(scene.id);
    if (!override) return scene;
    const nextCharacters = keepKnownCharacters(context, override.characters ?? [], scene.characters);
    return {
      ...scene,
      summary: override.summary || scene.summary,
      location: override.location || scene.location,
      characters: nextCharacters,
      dialogue: scene.dialogue.map((bubble) => ({
        ...bubble,
        speaker: nextCharacters.includes(bubble.speaker) ? bubble.speaker : nextCharacters[0] ?? bubble.speaker,
      })),
    };
  });

  const storyboardPages: StoryboardPage[] = bundle.storyboard.pages.map((page, pageIndex) => {
    const scene = scriptScenes[pageIndex];
    const override = scene ? sceneMap.get(scene.id) : undefined;
    if (!scene) return page;
    const reviewedPanels: StoryboardPanel[] = page.panels.map((panel, panelIndex) => ({
      ...panel,
      characters: override ? keepKnownCharacters(context, override.characters ?? [], panel.characters) : panel.characters,
      caption: override?.panelCaptions?.[panelIndex] || panel.caption,
      narration: override?.panelNarrations?.[panelIndex] || panel.narration,
    }));
    return { ...page, panels: reviewedPanels };
  });

  const chapterSummary = review.chapterSummary?.trim() || bundle.memory.narrativeSummary;
  const cliffhanger = review.cliffhanger?.trim() || bundle.outline.cliffhanger;

  return {
    ...bundle,
    script: { scenes: scriptScenes },
    storyboard: { ...bundle.storyboard, pages: storyboardPages },
    outline: {
      ...bundle.outline,
      beats: bundle.outline.beats.map((beat, index) => ({
        ...beat,
        summary: scriptScenes[index]?.summary ?? beat.summary,
        location: scriptScenes[index]?.location ?? beat.location,
        characters: scriptScenes[index]?.characters ?? beat.characters,
      })),
      cliffhanger,
    },
    memory: {
      ...bundle.memory,
      narrativeSummary: chapterSummary,
      openLoops: Array.from(new Set([cliffhanger, ...bundle.memory.openLoops])).slice(0, 4),
    },
  };
}

export async function runChapterContinuityPass(input: {
  context: ProjectContextForChapter;
  bundle: GeneratedChapterBundle;
  chapterGoal: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
}): Promise<{ bundle: GeneratedChapterBundle; notes: string[]; usedOpenAI: boolean }> {
  const baseNotes = ["Passe continuité (canon / lieux / cast) avant génération d’images."];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { bundle: input.bundle, notes: [...baseNotes, "OpenAI absent: pass non exécuté."], usedOpenAI: false };
  }

  const model = process.env.OPENAI_CONTINUITY_MODEL?.trim() || process.env.OPENAI_DIALOGUE_MODEL || "gpt-4o-mini";
  const prompt = {
    chapterGoal: input.chapterGoal,
    selectedPlotLabel: input.selectedPlotLabel ?? "bold",
    context: buildContextDigest(input.context),
    bundle: buildBundleDigest(input.bundle),
  };

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.28,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Tu es un superviseur canon pour un manga professionnel AVANT synthèse image.
Règles strictes :
- Corrige uniquement les incohérences factuelles : noms, lieux, chronologie, présence des personnages, statuts, contradictions avec la bible et les chapitres récents.
- Ne change pas le ton ni l’arc émotionnel global ; une seconde passe s’occupera du rythme narratif.
- Chaque personnage dans une scène doit exister dans le cast fourni ; pas de nouveaux noms inventés.
- Garde les sceneId exacts (scene_1, scene_2, …). Les tableaux panelCaptions et panelNarrations doivent avoir la même longueur que les panels de la page OU être omis.
Réponds uniquement en JSON : { "chapterSummary", "cliffhanger", "notes", "scenes" } où chaque scene a sceneId, summary, location, characters, panelCaptions?, panelNarrations?.`,
        },
        {
          role: "user",
          content: `Corrige ce chapitre pour la cohérence canon (aucune phrase hors JSON) :\n${JSON.stringify(prompt)}`,
        },
      ],
      max_tokens: 3200,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as ContinuityReviewPayload;
    const nextBundle = applySceneReview(input.context, input.bundle, parsed);
    return {
      bundle: nextBundle,
      notes: [...baseNotes, ...(parsed.notes ?? []).slice(0, 10)],
      usedOpenAI: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[continuity-pass] error=${msg}`);
    return { bundle: input.bundle, notes: [...baseNotes, "Échec OpenAI : bundle d’origine conservé."], usedOpenAI: false };
  }
}
