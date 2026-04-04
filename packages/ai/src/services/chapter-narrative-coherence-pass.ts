import OpenAI from "openai";
import type { GeneratedChapterBundle, ProjectContextForChapter } from "../chapter-pipeline";
import { buildBundleDigestForNarrative, buildContextDigest } from "./chapter-pass-digests";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type PanelStoryFix = {
  sceneId: string;
  panelNumber: number;
  caption?: string | null;
  narration?: string | null;
  dialogue?: { speaker: string; text: string } | null;
};

type SceneArcTweak = {
  sceneId: string;
  summary?: string;
};

type BeatPatch = {
  beatIndex: number;
  summary?: string;
  purpose?: string;
};

type NarrativePayload = {
  notes?: string[];
  cliffhanger?: string;
  chapterSummary?: string;
  sceneArcTweaks?: SceneArcTweak[];
  outlineBeatPatches?: BeatPatch[];
  panelStoryFixes?: PanelStoryFix[];
};

function applyNarrativeReview(bundle: GeneratedChapterBundle, review: NarrativePayload): GeneratedChapterBundle {
  let next: GeneratedChapterBundle = { ...bundle };

  if (review.chapterSummary?.trim()) {
    next = {
      ...next,
      memory: { ...next.memory, narrativeSummary: review.chapterSummary.trim() },
    };
  }

  if (review.cliffhanger?.trim()) {
    const c = review.cliffhanger.trim();
    next = {
      ...next,
      outline: { ...next.outline, cliffhanger: c },
      memory: {
        ...next.memory,
        openLoops: Array.from(new Set([c, ...next.memory.openLoops])).slice(0, 5),
      },
    };
  }

  const sceneMap = new Map((review.sceneArcTweaks ?? []).map((s) => [s.sceneId, s]));
  const scriptScenes = next.script.scenes.map((scene) => {
    const tw = sceneMap.get(scene.id);
    if (!tw?.summary?.trim()) return scene;
    return { ...scene, summary: tw.summary.trim() };
  });

  const beatPatches = new Map((review.outlineBeatPatches ?? []).map((p) => [p.beatIndex, p]));
  const beats = next.outline.beats.map((beat, idx) => {
    const p = beatPatches.get(idx);
    if (!p) return beat;
    return {
      ...beat,
      ...(p.summary?.trim() ? { summary: p.summary.trim() } : {}),
      ...(p.purpose?.trim() ? { purpose: p.purpose.trim() } : {}),
    };
  });

  const panelFixes = review.panelStoryFixes ?? [];
  const storyboardPages = next.storyboard.pages.map((page, pageIndex) => {
    const scene = scriptScenes[pageIndex];
    if (!scene) return page;
    const fixesForScene = panelFixes.filter((f) => f.sceneId === scene.id);
    if (!fixesForScene.length) return page;

    const newPanels = page.panels.map((panel) => {
      const fix = fixesForScene.find((f) => f.panelNumber === panel.panelNumber);
      if (!fix) return panel;

      let dialogue = panel.dialogue;
      if (fix.dialogue !== undefined) {
        if (fix.dialogue === null || (!fix.dialogue.text?.trim() && !fix.dialogue.speaker?.trim())) {
          dialogue = undefined;
        } else {
          dialogue = {
            speaker: fix.dialogue.speaker?.trim() || panel.dialogue?.speaker || "",
            text: fix.dialogue.text?.trim() || "",
          };
        }
      }

      return {
        ...panel,
        ...(fix.caption !== undefined && fix.caption !== null ? { caption: fix.caption } : {}),
        ...(fix.narration !== undefined
          ? { narration: fix.narration === null || fix.narration === "" ? undefined : fix.narration }
          : {}),
        dialogue,
      };
    });

    return { ...page, panels: newPanels };
  });

  return {
    ...next,
    script: { scenes: scriptScenes },
    storyboard: { ...next.storyboard, pages: storyboardPages },
    outline: { ...next.outline, beats },
  };
}

export async function runChapterNarrativeCoherencePass(input: {
  context: ProjectContextForChapter;
  bundle: GeneratedChapterBundle;
  chapterGoal: string;
  selectedPlotLabel?: "safe" | "bold" | "shock";
}): Promise<{ bundle: GeneratedChapterBundle; notes: string[]; usedOpenAI: boolean }> {
  const baseNotes = ["Passe cohérence narrative (rythme, causalité, cliffhanger)."];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { bundle: input.bundle, notes: [...baseNotes, "OpenAI absent : passe ignorée."], usedOpenAI: false };
  }

  const model = process.env.OPENAI_NARRATIVE_MODEL?.trim() || process.env.OPENAI_CONTINUITY_MODEL?.trim() || process.env.OPENAI_DIALOGUE_MODEL || "gpt-4o-mini";

  const prompt = {
    chapterGoal: input.chapterGoal,
    selectedPlotLabel: input.selectedPlotLabel ?? "bold",
    context: buildContextDigest(input.context),
    bundle: buildBundleDigestForNarrative(input.bundle),
  };

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.32,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Tu es un éditeur scénariste senior pour manga (qualité édition Shōnen/Seinen).
Le canon vient d’être verrouillé : tu ne réintroduis pas de nouveaux personnages ni lieux impossibles.
Ta mission : rendre l’histoire impeccable pour le lecteur.
- Causalité : chaque page découle logiquement de la précédente ; pas de saut motivationnel gratuit.
- Arc du chapitre : montée, pivot, pay-off partiel ; le cliffhanger doit être préparé.
- Voix : le dialogue doit sonner “manga”, concis ; pas d’exposition lourde en balloons si le visage peut le porter.
- Panels : si une légende, narration ou bulle est faible ou redondante, propose un correctif ciblé.
Limite les corrections : au plus 14 entrées dans panelStoryFixes (les cas les plus utiles seulement).
Réponds en JSON uniquement :
{
  "notes": string[],
  "chapterSummary": string | null,
  "cliffhanger": string | null,
  "sceneArcTweaks": [{ "sceneId": string, "summary": string } ],
  "outlineBeatPatches": [{ "beatIndex": number, "summary": string?, "purpose": string? } ],
  "panelStoryFixes": [{ "sceneId": string, "panelNumber": number, "caption"?: string, "narration"?: string | null, "dialogue"?: { "speaker": string, "text": string } | null }]
}
Utilise scene_1, scene_2, … et les panelNumber existants. Pour retirer une narration ou bulle, mets null.`,
        },
        {
          role: "user",
          content: `Peaufine la narration de ce chapitre (JSON seul) :\n${JSON.stringify(prompt)}`,
        },
      ],
      max_tokens: 3600,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as NarrativePayload;
    const fixes = (parsed.panelStoryFixes ?? []).slice(0, 14);
    const nextBundle = applyNarrativeReview(input.bundle, { ...parsed, panelStoryFixes: fixes });
    return {
      bundle: nextBundle,
      notes: [...baseNotes, ...(parsed.notes ?? []).slice(0, 12)],
      usedOpenAI: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[narrative-coherence-pass] error=${msg}`);
    return { bundle: input.bundle, notes: [...baseNotes, "Échec OpenAI : narrative pass ignorée."], usedOpenAI: false };
  }
}
