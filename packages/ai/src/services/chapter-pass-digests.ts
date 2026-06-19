import type { GeneratedChapterBundle, ProjectContextForChapter } from "../chapter/shared-types";

export function buildContextDigest(context: ProjectContextForChapter) {
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
    focusedCharacters: context.characters.slice(0, 8).map((character) => ({
      name: character.name,
      role: character.roleType,
      objective: character.objective,
      fear: character.fear,
      emotionalState: character.emotionalState,
      status: character.status,
      biography: character.biography,
      traits: character.traits?.slice(0, 4),
      flaws: character.flaws?.slice(0, 3),
      appearance: character.appearance,
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

export function buildBundleDigest(bundle: GeneratedChapterBundle) {
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
          dialogue: panel.dialogue ?? null,
          characters: panel.characters,
          mood: panel.mood,
        })),
      })),
    },
    memory: bundle.memory,
  };
}

/** Digest plus riche pour la passe narrative (rythme, dialogues). */
export function buildBundleDigestForNarrative(bundle: GeneratedChapterBundle) {
  const base = buildBundleDigest(bundle);
  return {
    ...base,
    script: {
      scenes: bundle.script.scenes.map((scene) => ({
        id: scene.id,
        summary: scene.summary,
        location: scene.location,
        characters: scene.characters,
        dialogue: scene.dialogue.slice(0, 14),
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
          dialogue: panel.dialogue ?? null,
          characters: panel.characters,
          mood: panel.mood,
        })),
      })),
    },
    outline: {
      ...bundle.outline,
      beats: bundle.outline.beats.map((b) => ({
        id: b.id,
        summary: b.summary,
        tension: b.tension,
        characters: b.characters,
        location: b.location,
        purpose: b.purpose,
      })),
    },
  };
}
