"use client";

import type React from "react";
import {
  PAGE_LAYOUT_CONFIGS,
  getReaderLayoutDescriptor,
  type PageLayoutTemplate,
  type ReadingDirection,
} from "@manga-ai-studio/core";

import { MangaPanel } from "./manga-panel";
import { AREA_NAMES, LAYOUT_STYLES } from "./_manga-page-grid/layouts";
import { pickPanelImageFit } from "./_manga-page-grid/panel-fit";
import { demoPageToUniversal } from "./_manga-page-grid/pipeline-to-pages";
import type {
  DemoMangaPage,
  UniversalMangaPage,
} from "./_manga-page-grid/types";

export type {
  DemoMangaPage,
  DemoPanel,
  ExtendedLayoutTemplate,
  PipelinePanel,
  PipelineScene,
  UniversalMangaPage,
  UniversalPanel,
} from "./_manga-page-grid/types";
export {
  demoPageToUniversal,
  flattenPagesToPanels,
  pipelineScenesToPages,
} from "./_manga-page-grid/pipeline-to-pages";

type Props = {
  page: UniversalMangaPage | DemoMangaPage;
  readingDirection?: ReadingDirection;
};

function isDemoPage(page: UniversalMangaPage | DemoMangaPage): page is DemoMangaPage {
  // DemoMangaPage panels ont un champ `size` et un `id`
  return "panels" in page && page.panels.length > 0 && "size" in page.panels[0]!;
}

export function MangaPageGrid({ page, readingDirection }: Props) {
  const universal: UniversalMangaPage = isDemoPage(page)
    ? demoPageToUniversal(page)
    : (page as UniversalMangaPage);

  // LAY-2 : résolution du layout — priorité aux nouveaux templates
  const extTemplate = universal.layoutTemplate;
  const resolvedReadingDirection = readingDirection ?? universal.readingDirection ?? "ltr";
  const baseTemplate =
    extTemplate && !String(extTemplate).endsWith("_rtl")
      ? (extTemplate as PageLayoutTemplate)
      : undefined;
  const dynamicDescriptor = baseTemplate
    ? getReaderLayoutDescriptor(baseTemplate, resolvedReadingDirection)
    : null;
  const dynamicConfig =
    dynamicDescriptor ??
    (extTemplate && PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]
      ? {
          templateId: extTemplate,
          readingDirection: resolvedReadingDirection,
          cssGridAreas:
            PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.cssGridAreas,
          cssGridTemplate:
            PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.cssGridTemplate,
          areas: PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.areas,
          panelWeights:
            PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!.panelWeights,
          defaultAspectRatios:
            PAGE_LAYOUT_CONFIGS[extTemplate as keyof typeof PAGE_LAYOUT_CONFIGS]!
              .defaultAspectRatios,
        }
      : null);
  const layoutStyle: React.CSSProperties = dynamicConfig
    ? {
        display: "grid",
        gridTemplateAreas: dynamicConfig.cssGridAreas,
        gridTemplate: dynamicConfig.cssGridTemplate,
        gap: "3px",
      }
    : (LAYOUT_STYLES[universal.layout] ?? LAYOUT_STYLES.A);
  const orderedAreas = dynamicConfig?.areas ?? AREA_NAMES;
  const slotByPanelId = new Map(
    (universal.panelSlots ?? []).map((slot) => [slot.panelId ?? `panel-${slot.order}`, slot.area]),
  );
  const renderedPanels = universal.panels.map((panel, i) => {
    const area =
      (panel.id ? slotByPanelId.get(panel.id) : undefined) ??
      universal.panelSlots?.[i]?.area ??
      orderedAreas[i] ??
      "a";
    const { fit, position } = pickPanelImageFit(panel);
    return (
      <MangaPanel
        key={panel.id ?? `panel-${i}`}
        mood={panel.mood}
        imageUrl={panel.imageUrl}
        status={panel.status}
        provider={panel.provider}
        model={panel.model}
        error={panel.error}
        sceneImageId={panel.id}
        dialogue={panel.dialogue}
        dialogues={panel.dialogues}
        speaker={panel.speaker}
        narration={panel.narration}
        sfx={panel.sfx}
        caption={panel.caption}
        textScale={panel.textScale}
        renderMeta={panel.renderMeta}
        layoutMeta={panel.layoutMeta}
        textMeta={panel.textMeta}
        imageFit={fit}
        objectPosition={position}
        panelIndex={i}
        className="min-h-0"
        style={{ gridArea: area }}
      />
    );
  });

  return (
    <div
      className="h-full w-full bg-stone-900"
      style={{
        ...layoutStyle,
        padding: "3px",
        aspectRatio: "2 / 3",
        maxHeight: "100%",
        minHeight: 0,
      }}
    >
      {renderedPanels}
    </div>
  );
}
