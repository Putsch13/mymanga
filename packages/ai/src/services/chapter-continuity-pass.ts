import OpenAI from "openai";
import type { GeneratedChapterBundle, ProjectContextForChapter, StoryboardPanel, StoryboardPage } from "../chapter-pipeline";

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

function buildContextDigest(context: ProjectContextForChapter) {
  return {
    project: {
      title: context.project.title,
      pitch: context.project.pitch,
      description: context.project.description ?? null,
      primaryGenre: context.project.primaryGenre,
      subGenres: context.project.subGenres ?? [],
      tone: context.project.tone,
      visualStyle: context.project.visualStyle ?? null,
      intensityLayer: context.project.intensityLayer ?? null,
    },
    settings: context.settings ?? null,
    stylePack: context.stylePack ?? null,
    storyBible: context.storyBible?.summary
      ? {
          summary: context.storyBible.summary,
          themes: context.storyBible.themes ?? [],
        }
      : null,
    focusedCharacters: context.characters.slice(0, 5).map((character) => ({
      name: character.name,
      role: character.roleType,
      objective: character.objective,
      fear: character.fear,
      emotionalState: character.emotionalState,
      status: character.status,
      biography: character.biography,
    })),
    recentChapters: context.recentChapters.slice(0, 3),
    recentMemory: context.recentMemory.slice(0, 3),
    retrievedDocs: context.retrievedDocs.slice(0, 4).map((doc) => ({
      title: doc.title,
      entityType: doc.entityType,
      content: doc.content.slice(0, 500),
    })),
  };
}

function buildBundleDigest(bundle: GeneratedChapterBundle) {
  return {
    outline: bundle.outline,
    script: {
      scenes: bundle.script.scenes.map((scene) => ({
        id: scene.id,
        summary: scene.summary,
        location: scene.location,
        characters: scene.characters,
        dialogue: scene.dialogue.slice(0, 10),
      })),
    },
    storyboard: {
      pages: bundle.storyboard.pages.map((page) => ({
        pageNumber: page.pageNumber,
        layout: page.layout,
        panels: page.panels.map((panel) => ({
          panelNumber: panel.panelNumber,
          caption: panel.caption,
          narration: panel.narration ?? null,
          characters: panel.characters,
          mood: panel.mood,
        })),
      })),
    },
    memory: bundle.memory,
  };
}

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
  const baseNotes = ["Continuity pass appliqué avant génération d’images."];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { bundle: input.bundle, notes: [...baseNotes, "OpenAI absent: pass limité au fallback."], usedOpenAI: false };
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
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Tu fais une passe de continuité sur un chapitre manga avant génération d'images. Tu dois corriger seulement ce qui nuit à la cohérence canon, aux personnages, aux lieux, à la chronologie et à la logique émotionnelle. Réponds uniquement en JSON avec les clés chapterSummary, cliffhanger, notes, scenes. Chaque scene doit garder le même sceneId et proposer summary, location, characters, panelCaptions, panelNarrations.",
        },
        {
          role: "user",
          content: `Relis et corrige ce chapitre pour qu'il reste cohérent de bout en bout:\n${JSON.stringify(prompt)}`,
        },
      ],
      max_tokens: 2200,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as ContinuityReviewPayload;
    const nextBundle = applySceneReview(input.context, input.bundle, parsed);
    return {
      bundle: nextBundle,
      notes: [...baseNotes, ...(parsed.notes ?? []).slice(0, 8)],
      usedOpenAI: true,
    };
  } catch {
    return { bundle: input.bundle, notes: [...baseNotes, "Le pass IA a échoué, bundle initial conservé."], usedOpenAI: false };
  }
}
