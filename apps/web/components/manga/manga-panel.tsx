"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * `MangaPanel` est désormais un thin wrapper rétro-compatible autour de
 * `PanelComposedView`. Les responsabilités ont été déplacées :
 *   - image + retry UI → `panel/panel-image.tsx`
 *   - narration → `panel/panel-caption-overlay.tsx`
 *   - SFX → `panel/panel-sfx-overlay.tsx`
 *   - bulles → `panel/panel-bubble-overlay.tsx` (alimentées par `bubble-compositor`)
 *   - edit controls → `panel/panel-edit-controls.tsx`
 *   - orchestration → `panel/panel-composed-view.tsx`
 *
 * L'API publique (mood, imageUrl, renderMode, renderMeta, layoutMeta,
 * editable, etc.) est préservée pour ne pas casser les 2 consommateurs
 * existants (`webtoon-lazy-scroll.tsx`, `manga-page-grid.tsx`).
 */

import type { CSSProperties } from "react";
import type { ReadingDirection, TextAnchorZone, TextOverflowStrategy } from "@manga-ai-studio/core";

import type { ReservedZone } from "./panel/bubble-layout-model";
import { PanelComposedView } from "./panel/panel-composed-view";

export type PanelMoodLegacy =
  | "night-rain"
  | "sanctuary"
  | "close-up-lyra"
  | "close-up-kael"
  | "action"
  | "mystical"
  | "shadow"
  | "warm"
  | "dramatic"
  | "cold";

export type PanelMoodPipeline =
  | "action"
  | "tension"
  | "emotion"
  | "revelation"
  | "calm"
  | "horror"
  | "romance"
  | "comedy"
  | "dramatic";

export type AnyPanelMood = PanelMoodLegacy | PanelMoodPipeline;

/**
 * Fonds de fallback utilisés uniquement quand un panel n'a pas encore
 * d'image. Les gradients sont conservés à l'identique pour continuité visuelle.
 */
const MOOD_BG: Record<string, string> = {
  "night-rain": "linear-gradient(170deg, #0a0a1a 0%, #1a1040 40%, #0d0d2a 100%)",
  sanctuary: "linear-gradient(160deg, #1c1510 0%, #2a1f18 50%, #0f0c0a 100%)",
  "close-up-lyra": "linear-gradient(135deg, #1a102a 0%, #2d1545 50%, #1a0e28 100%)",
  "close-up-kael": "linear-gradient(135deg, #0a1420 0%, #162540 50%, #0a1018 100%)",
  mystical: "linear-gradient(145deg, #0d0a1f 0%, #1f1050 40%, #0d0820 100%)",
  shadow: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #050505 100%)",
  warm: "linear-gradient(150deg, #1a1510 0%, #2a2018 50%, #1a1208 100%)",
  cold: "linear-gradient(160deg, #0a0f1a 0%, #101828 50%, #080c14 100%)",
  action: "linear-gradient(135deg, #1a0a0a 0%, #3a1515 40%, #0a0a0a 100%)",
  tension: "linear-gradient(170deg, #0a0a1a 0%, #1a1040 40%, #0d0d2a 100%)",
  emotion: "linear-gradient(135deg, #1a102a 0%, #2d1545 50%, #1a0e28 100%)",
  revelation: "linear-gradient(145deg, #0d0a1f 0%, #1f1050 40%, #0d0820 100%)",
  calm: "linear-gradient(150deg, #1a1510 0%, #2a2018 50%, #1a1208 100%)",
  horror: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #050505 100%)",
  romance: "linear-gradient(150deg, #1a0a10 0%, #2a1520 50%, #1a0810 100%)",
  comedy: "linear-gradient(150deg, #1a1510 0%, #2a2018 50%, #1a1208 100%)",
  dramatic: "linear-gradient(135deg, #1a0520 0%, #300a30 40%, #0a0010 100%)",
};

type Props = {
  mood: AnyPanelMood;
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  sceneImageId?: string;
  dialogue?: string;
  dialogues?: Array<{ speaker: string; text: string }>;
  speaker?: string;
  narration?: string;
  sfx?: string;
  caption?: string;
  /** @deprecated n'est plus exploité par le compositeur (échelle auto) */
  textScale?: "normal" | "compact" | "micro";
  /** @deprecated Utiliser renderMeta.cropMode à la place */
  imageFit?: "cover" | "contain";
  /** @deprecated Utiliser renderMeta.focalPoint à la place */
  objectPosition?: string;
  renderMeta?: {
    cropMode?: "contain" | "cover";
    focalPoint?: { x: number; y: number };
    safeArea?: { top: number; right: number; bottom: number; left: number };
    reservedTextZones?: Array<ReservedZone>;
  };
  layoutMeta?: {
    slotType?: "wide" | "tall" | "square" | "closeup" | "dialogue";
    targetAspectRatio?: string;
    layoutTemplate?: string;
  };
  textMeta?: {
    preferredAnchorZones?: TextAnchorZone[];
    overflowStrategy?: TextOverflowStrategy;
    overlayReadingDirection?: ReadingDirection;
  };
  renderMode?: "reader" | "webtoon" | "debug" | "print";
  className?: string;
  style?: CSSProperties;
  panelIndex?: number;
  /**
   * Active l'UI d'édition au niveau du panel (toggle bulles, redraw, etc.).
   * Désactivé par défaut : reader et webtoon restent en lecture seule.
   */
  editable?: boolean;
};

export function MangaPanel(props: Props) {
  const {
    mood,
    imageUrl,
    status,
    provider,
    model,
    error,
    sceneImageId,
    dialogue,
    dialogues,
    speaker,
    narration,
    sfx,
    caption,
    imageFit = "cover",
    objectPosition = "top",
    renderMeta,
    layoutMeta,
    textMeta,
    renderMode = "reader",
    className,
    style,
    panelIndex,
    editable = false,
  } = props;

  const allDialogues =
    dialogues ??
    (dialogue && speaker
      ? [{ speaker, text: dialogue }]
      : dialogue
        ? [{ speaker: "", text: dialogue }]
        : []);

  const cropMode = renderMeta?.cropMode ?? imageFit;
  const focalPosition = renderMeta?.focalPoint
    ? `${renderMeta.focalPoint.x * 100}% ${renderMeta.focalPoint.y * 100}%`
    : objectPosition;

  const panelId = sceneImageId ?? `panel-${panelIndex ?? 0}`;

  return (
    <PanelComposedView
      panelId={panelId}
      imageUrl={imageUrl}
      status={status}
      provider={provider}
      model={model}
      error={error}
      sceneImageId={sceneImageId}
      caption={caption}
      panelIndex={panelIndex}
      dialogues={allDialogues}
      narration={narration}
      sfx={sfx}
      cropMode={cropMode}
      objectPosition={focalPosition}
      reservedTextZones={renderMeta?.reservedTextZones}
      preferredAnchorZones={textMeta?.preferredAnchorZones}
      overflowStrategy={textMeta?.overflowStrategy}
      targetAspectRatio={layoutMeta?.targetAspectRatio}
      renderMode={renderMode}
      editable={editable}
      className={className}
      style={style}
      fallbackBackground={MOOD_BG[mood] ?? MOOD_BG["dramatic"]}
    />
  );
}

export default MangaPanel;
