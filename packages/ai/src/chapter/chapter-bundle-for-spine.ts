/**
 * P2.2 — Forme minimale du bundle chapitre pour `story-spine` sans importer
 * `chapter-pipeline` (casse le cycle outline → genre-director → story-spine → pipeline → outline).
 */

export type ChapterBundleForSpineOutlineBeat = {
  summary: string;
  pageRole?: string;
  structuredBeat?: {
    setupPayoffHooks?: Array<{ label?: string | null }>;
  };
};

export type ChapterBundleForSpine = {
  outline: {
    chapter_goal?: string;
    cliffhanger?: string;
    beats: ChapterBundleForSpineOutlineBeat[];
  };
  script: {
    scenes: Array<{
      id: string;
      title: string;
      summary?: string;
      tension?: number;
      characters?: string[];
      beats?: Array<{ summary: string }>;
    }>;
  };
  storyboard?: {
    pages: Array<{
      panels: Array<{
        mood?: string;
        caption?: string;
        prompt?: string;
        narration?: string;
        dialogue?: { speaker: string; text: string };
        dialogues?: Array<{ speaker: string; text: string }>;
      }>;
    }>;
  };
};
