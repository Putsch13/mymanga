/**
 * P5.2 — Vue webtoon : convertit les pages universelles en blocs
 * `WebtoonLazyScroll` et délègue le rendu vertical infini.
 */
"use client";

import { WebtoonLazyScroll } from "../webtoon-lazy-scroll";
import type { UniversalMangaPage } from "../manga-page-grid";
import type { RetryPanelMode } from "./use-reader-data";

export interface ReaderWebtoonViewProps {
  pages: UniversalMangaPage[];
  retryingPanel: string | null;
  onRetryPanel: (panelId: string, mode: RetryPanelMode) => void | Promise<void>;
  showDebug: boolean;
  panelQaByPanelId?: Record<string, { score?: number; reasons?: string[] }>;
}

export function ReaderWebtoonView(props: ReaderWebtoonViewProps) {
  const { pages, retryingPanel, onRetryPanel, showDebug, panelQaByPanelId } = props;

  return (
    <WebtoonLazyScroll
      pages={pages.map((page, pageIdx) => ({
        id: page.id ?? `page-${pageIdx}`,
        panels: page.panels.map((panel, panelIdx) => ({
          id: panel.id ?? `${pageIdx}-${panelIdx}`,
          imageUrl: panel.imageUrl,
          status: panel.status,
          provider: panel.provider,
          model: panel.model,
          error: panel.error,
          sceneImageId: panel.id,
          dialogue: panel.dialogue ? { speaker: panel.speaker ?? "", text: panel.dialogue } : undefined,
          dialogues: panel.dialogues,
          speaker: panel.speaker,
          narration: panel.narration,
          sfx: panel.sfx,
          caption: panel.caption,
          textScale: panel.textScale,
          renderMeta: panel.renderMeta,
          layoutMeta: panel.layoutMeta,
          mood: panel.mood,
          pageIndex: pageIdx,
        })),
      }))}
      onRetryPanel={onRetryPanel}
      retryingPanel={retryingPanel}
      showDebug={showDebug}
      panelQaByPanelId={panelQaByPanelId}
    />
  );
}
