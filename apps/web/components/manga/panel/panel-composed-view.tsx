"use client";

/**
 * Sprint 2 — Composition des panels
 *
 * Vue finale composée d'un panel manga/webtoon.
 *
 * Architecture :
 *   +------------------------------------+
 *   | PanelImage (image + états)         |
 *   |   + PanelTextOverlay (dialogue /   |
 *   |     caption / narration in-panel)|
 *   |   + PanelSfxOverlay                |
 *   |   + PanelEditControls (si edit)    |
 *   +------------------------------------+
 *   | Fallback text strip (si no image)  |
 *   +------------------------------------+
 *
 * Point d'entrée unique pour le rendu d'un panel, appelé par `manga-panel.tsx`
 * (qui reste un wrapper rétro-compatible) et directement par les nouvelles
 * vues reader/webtoon.
 */

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { TextAnchorZone, TextOverflowStrategy } from "@manga-ai-studio/core";

import type { DialogueInput } from "./bubble-compositor";
import type { ForbiddenZone, ReservedZone } from "./bubble-layout-model";
import { PanelTextOverlay } from "./panel-text-overlay";
import { PanelEditControls } from "./panel-edit-controls";
import { PanelImage } from "./panel-image";
import { PanelSfxOverlay } from "./panel-sfx-overlay";
import { composePanelTextPresentation } from "./panel-text-compositor";
import { getMangaTypography, tokenToStyle } from "@/lib/manga/manga-tokens";

/** `layoutMeta.targetAspectRatio` sémantique (PATCH 8) ou legacy `2:3`. */
function layoutTargetAspectToCssAspectRatio(raw: string | undefined | null): string {
  if (raw == null || raw === "") return "4 / 5";
  const r = raw.trim().toLowerCase();
  if (r === "portrait" || r === "2:3" || r === "2/3") return "2 / 3";
  if (r === "landscape" || r === "3:2" || r === "3/2") return "3 / 2";
  if (r === "square" || r === "1:1" || r === "1/1") return "1 / 1";
  return r.replace(":", " / ");
}

export interface PanelComposedViewProps {
  panelId: string;
  imageUrl?: string | null;
  status?: string;
  provider?: string | null;
  model?: string | null;
  error?: string | null;
  sceneImageId?: string;
  caption?: string;
  panelIndex?: number;

  dialogues: ReadonlyArray<DialogueInput>;
  narration?: string | null;
  sfx?: string | null;

  cropMode?: "contain" | "cover";
  objectPosition?: string;
  reservedTextZones?: ReadonlyArray<ReservedZone>;
  forbiddenZones?: ReadonlyArray<ForbiddenZone>;
  preferredAnchorZones?: ReadonlyArray<TextAnchorZone>;
  overflowStrategy?: TextOverflowStrategy;
  targetAspectRatio?: string;

  renderMode?: "reader" | "webtoon" | "debug" | "print";
  editable?: boolean;
  className?: string;
  style?: CSSProperties;
  /**
   * Background de fallback quand l'image est absente (mood preset).
   */
  fallbackBackground?: string;
}

export function PanelComposedView(props: PanelComposedViewProps) {
  const {
    panelId,
    imageUrl,
    status,
    provider,
    model,
    error,
    sceneImageId,
    caption,
    panelIndex,
    dialogues,
    narration,
    sfx,
    cropMode,
    objectPosition,
    reservedTextZones,
    forbiddenZones,
    preferredAnchorZones,
    overflowStrategy,
    targetAspectRatio,
    renderMode = "reader",
    editable = false,
    className,
    style,
    fallbackBackground,
  } = props;

  const [bubblesHidden, setBubblesHidden] = useState(false);
  const isWebtoon = renderMode === "webtoon";

  const textComposition = useMemo(
    () =>
      composePanelTextPresentation({
        panelId,
        dialogues,
        narration: narration ?? null,
        sfx: sfx ?? null,
        reservedTextZones,
        forbiddenZones,
        preferredAnchorZones,
        overflowStrategy,
        isWebtoon,
      }),
    [
      panelId,
      dialogues,
      narration,
      sfx,
      reservedTextZones,
      forbiddenZones,
      preferredAnchorZones,
      overflowStrategy,
      isWebtoon,
    ],
  );
  const textLayer = textComposition.layer;
  const textLayout = textComposition.textLayout;

  const hasImage = Boolean(imageUrl);
  const hasAnyText =
    textLayer.bubbles.length > 0 ||
    textLayer.captions.length > 0 ||
    textLayer.sfx.length > 0 ||
    textLayout.dialogueBoxes.length > 0 ||
    textLayout.captionBoxes.length > 0 ||
    textLayout.narrationBoxes.length > 0;

  return (
    <div
      className={`group/panel relative flex min-h-0 flex-col overflow-hidden border-2 border-stone-900 ${
        isWebtoon
          ? "rounded-[30px] border-stone-800/80 bg-stone-950 shadow-[0_24px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/5"
          : ""
      } ${className ?? ""}`}
      style={{
        background: hasImage ? undefined : fallbackBackground,
        ...style,
      }}
      aria-label={caption ?? `Panel ${(panelIndex ?? 0) + 1}`}
    >
      <div
        className={`relative overflow-hidden ${isWebtoon ? "" : "min-h-0 flex-1"}`}
        style={
          isWebtoon
            ? {
                aspectRatio: layoutTargetAspectToCssAspectRatio(targetAspectRatio),
                minHeight: "20rem",
              }
            : undefined
        }
      >
        <PanelImage
          imageUrl={imageUrl}
          status={status}
          provider={provider}
          error={error}
          sceneImageId={sceneImageId}
          caption={caption}
          panelIndex={panelIndex}
          cropMode={cropMode}
          objectPosition={objectPosition}
          isWebtoon={isWebtoon}
        />

        {hasImage && (
          <>
            <PanelTextOverlay
              dialogueBoxes={textLayout.dialogueBoxes}
              captionBoxes={textLayout.captionBoxes}
              narrationBoxes={textLayout.narrationBoxes}
              hidden={bubblesHidden}
              isWebtoon={isWebtoon}
            />
            <PanelSfxOverlay sfx={textLayer.sfx} seed={panelIndex ?? 0} isWebtoon={isWebtoon} />
          </>
        )}

        {/*
          On masque le badge "failed · provider" quand l'image existe : un panel
          rendu correctement ne doit pas afficher un statut d'échec hérité d'une
          tentative précédente. Le badge reste visible pour les statuts utiles
          (pending, planned, blocked sans image, …) et pour les variantes hors
          failed quand on veut afficher provider/model.
        */}
        {(status || provider || model) &&
         !(hasImage && (status === "failed" || status === "blocked")) && (
          <div className="pointer-events-none absolute right-1 top-1 z-20 max-w-[min(100%,11rem)] truncate rounded border border-white/10 bg-black/55 px-1 py-0.5 text-[8px] leading-tight text-stone-300 opacity-70 transition-opacity group-hover/panel:opacity-100">
            <span className="font-medium">{status ?? "?"}</span>
            {provider ? <span className="opacity-80"> · {provider}</span> : null}
          </div>
        )}
      </div>

      {editable && sceneImageId ? (
        <PanelEditControls
          sceneImageId={sceneImageId}
          bubblesHidden={bubblesHidden}
          onToggleBubbles={() => setBubblesHidden((p) => !p)}
        />
      ) : null}

      {!hasImage && hasAnyText && (
        <FallbackTextStrip
          dialogues={dialogues}
          narration={narration}
          sfx={sfx}
          isWebtoon={isWebtoon}
        />
      )}

      {hasImage &&
        textComposition.overflowStrategy === "caption_strip" &&
        textComposition.overflowDialogues.length > 0 && (
          <FallbackTextStrip
            dialogues={textComposition.overflowDialogues}
            narration={null}
            sfx={null}
            isWebtoon={isWebtoon}
          />
        )}
    </div>
  );
}

function FallbackTextStrip({
  dialogues,
  narration,
  sfx,
  isWebtoon,
}: {
  dialogues: ReadonlyArray<DialogueInput>;
  narration?: string | null;
  sfx?: string | null;
  isWebtoon: boolean;
}) {
  const hasDialogue = dialogues.length > 0;
  const typography = getMangaTypography(isWebtoon ? "webtoon" : "manga");
  const fallbackNarrationStyle = tokenToStyle(typography.fallback.narration);
  const fallbackSpeakerStyle = tokenToStyle(typography.fallback.speakerLabel);
  const fallbackDialogueStyle = tokenToStyle(typography.fallback.dialogue);
  return (
    <div
      className={`z-10 shrink-0 overflow-y-auto border-t border-stone-800 bg-stone-950/98 ${
        isWebtoon ? "max-h-none px-4 py-4 sm:px-5" : "max-h-[min(46%,9rem)] px-1.5 py-1"
      }`}
    >
      {narration && (
        <div
          className={`mb-1 rounded border border-white/15 bg-black/40 ${
            isWebtoon ? "px-3 py-2" : "px-1.5 py-0.5"
          }`}
        >
          <p className="italic text-stone-200" style={fallbackNarrationStyle}>{narration}</p>
        </div>
      )}

      {hasDialogue && (
        <div className="flex flex-col gap-1">
          {dialogues.slice(0, isWebtoon ? 5 : 3).map((d, idx) => (
            <div
              key={idx}
              className={`rounded-lg border border-stone-800 bg-white/95 shadow-sm ${
                isWebtoon ? "px-3 py-2" : "px-1.5 py-1"
              }`}
            >
              {d.speaker && (
                <p className="font-bold uppercase tracking-wide text-stone-600" style={fallbackSpeakerStyle}>
                  {d.speaker}
                </p>
              )}
              <p className="font-medium text-stone-900" style={fallbackDialogueStyle}>{d.text}</p>
            </div>
          ))}
        </div>
      )}

      {sfx && hasDialogue && (
        <span
          className="mt-0.5 block select-none text-center text-sm font-black italic text-amber-200/90"
          style={{ textShadow: "1px 1px 0 #000" }}
        >
          {sfx}
        </span>
      )}
    </div>
  );
}

export default PanelComposedView;
