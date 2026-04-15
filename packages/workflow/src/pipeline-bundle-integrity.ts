import type { generateChapterBundle } from "@manga-ai-studio/ai";

type PipelineBundle = Awaited<ReturnType<typeof generateChapterBundle>>;

export function syncVisualsAfterNarrativePass(bundle: PipelineBundle): PipelineBundle {
  const pages = bundle.storyboard.pages;
  const scenes = bundle.script.scenes;
  const beats = bundle.outline.beats;

  const ROLE_CAMERAS: Record<string, string[]> = {
    establishing: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    escalation: ["medium shot", "over-the-shoulder shot", "close-up on face", "low angle shot", "medium shot", "extreme close-up on eyes"],
    confrontation: ["medium shot", "close-up on face", "low angle dynamic shot", "extreme close-up on eyes", "over-the-shoulder shot", "dutch angle shot"],
    revelation: ["medium shot", "slow zoom close-up", "extreme close-up shocked eyes", "wide shot consequences", "over-the-shoulder shot", "high angle distant shot"],
    aftermath: ["wide establishing shot", "medium shot", "close-up on face", "medium shot", "wide shot", "medium shot"],
    cliffhanger: ["medium shot", "close-up on face", "low angle shot", "extreme close-up on eyes", "silhouette shot", "dramatic wide shot"],
  };

  const updatedPages = pages.map((page, pageIndex) => {
    const scene = scenes[pageIndex];
    const beat = beats[pageIndex];
    if (!scene || !beat) return page;

    const beatRaw = beat as Record<string, unknown>;
    const role = (typeof beatRaw.pageRole === "string" ? beatRaw.pageRole : "escalation") as string;
    const roleCams = ROLE_CAMERAS[role] ?? ROLE_CAMERAS.escalation;

    const updatedPanels = page.panels.map((panel, panelIndex) => {
      const camera = roleCams[panelIndex] ?? roleCams[panelIndex % roleCams.length] ?? "medium shot";
      return { ...panel, camera };
    });

    return { ...page, panels: updatedPanels };
  });

  return {
    ...bundle,
    storyboard: { ...bundle.storyboard, pages: updatedPages },
  };
}

export function enforceBundleIntegrity(bundle: PipelineBundle): { bundle: PipelineBundle; notes: string[] } {
  const notes: string[] = [];
  const scenes = [...bundle.script.scenes];
  const pages = [...bundle.storyboard.pages];

  const alignedCount = Math.min(scenes.length, pages.length);
  if (scenes.length !== pages.length) {
    notes.push(`alignment_fixed: scenes=${scenes.length} pages=${pages.length} => ${alignedCount}`);
  }

  const safeScenes = scenes.slice(0, alignedCount);
  const safePages = pages.slice(0, alignedCount).map((page, pageIndex) => {
    const scene = safeScenes[pageIndex];
    const originalPanels = Array.isArray(page.panels) ? page.panels : [];
    const normalizedPanels = originalPanels
      .slice(0, 6)
      .map((panel, panelIndex) => {
        const speaker = panel.dialogue?.speaker?.trim();
        const normalizedCharacters = [...new Set((panel.characters ?? []).filter(Boolean))];
        if (speaker && !/narrateur|narration/i.test(speaker)) {
          const hasSpeaker = normalizedCharacters.some((c) => c.toLowerCase() === speaker.toLowerCase());
          if (!hasSpeaker) normalizedCharacters.push(speaker);
        }
        return {
          ...panel,
          panelNumber: panelIndex + 1,
          sceneId: scene?.id ?? panel.sceneId,
          characters: normalizedCharacters.length > 0 ? normalizedCharacters : (scene?.characters ?? []),
        };
      });

    if (normalizedPanels.length < 4 && scene) {
      notes.push(`panel_floor_applied: page=${pageIndex + 1}`);
      while (normalizedPanels.length < 4) {
        const fallbackPanel = normalizedPanels[normalizedPanels.length - 1] ?? normalizedPanels[0];
        if (fallbackPanel) {
          normalizedPanels.push({
            ...fallbackPanel,
            panelNumber: normalizedPanels.length + 1,
            caption: `${scene.summary}`,
            dialogue: undefined,
            narration: scene.summary,
          });
        } else {
          normalizedPanels.push({
            panelNumber: normalizedPanels.length + 1,
            sceneId: scene.id,
            beatId: `fallback_${pageIndex + 1}_${normalizedPanels.length + 1}`,
            caption: scene.summary,
            prompt: scene.summary,
            negativePrompt: "",
            camera: "medium shot",
            characters: scene.characters.slice(0, 2),
            mood: "dramatic",
            narration: scene.summary,
            textScale: "normal",
          });
        }
      }
    }

    return {
      ...page,
      pageNumber: pageIndex + 1,
      panels: normalizedPanels,
    };
  });

  return {
    bundle: {
      ...bundle,
      script: { ...bundle.script, scenes: safeScenes },
      storyboard: {
        ...bundle.storyboard,
        pageCount: safePages.length,
        pages: safePages,
      },
    },
    notes,
  };
}
