/**
 * P5.2 — Liste de cases en mode "texte uniquement" pour le reader.
 *
 * Anciennement dupliquée 3 fois dans `manga-book-reader.tsx` (page simple,
 * page gauche du spread, page droite du spread). On extrait pour ne plus
 * avoir à maintenir 3 copies du même JSX (narration / dialogue / sfx + TTS).
 */
import { Pause, Volume2 } from "lucide-react";
import { cn } from "@manga-ai-studio/ui";
import type { UniversalPanel } from "../manga-page-grid";

export interface ReaderTextPanelListProps {
  panels: UniversalPanel[];
  pageNumberLabel: number;
  /** Préfixe pour générer les ids TTS (`${prefix}-${index}`). */
  ttsKeyPrefix: string;
  playingTtsId: string | null;
  playDialogue: (text: string, speaker?: string | null, id?: string) => Promise<void> | void;
  /** Layout compact (côté du spread) ou plein (page simple). */
  variant: "compact" | "full";
}

export function ReaderTextPanelList({
  panels,
  pageNumberLabel,
  ttsKeyPrefix,
  playingTtsId,
  playDialogue,
  variant,
}: ReaderTextPanelListProps) {
  const isCompact = variant === "compact";
  return (
    <div className={cn("h-full overflow-y-auto", isCompact ? "p-5" : "flex flex-col gap-3 p-6")}>
      <h3
        className={cn(
          "font-serif font-bold text-stone-200",
          isCompact ? "text-base" : "text-lg",
        )}
      >
        Page {pageNumberLabel}
      </h3>
      <div className={cn(isCompact ? "mt-3 space-y-3" : "")}>
        {panels.map((panel, i) => {
          const ttsId = `${ttsKeyPrefix}-${i}`;
          const isPlaying = playingTtsId === ttsId;
          return (
            <div
              key={i}
              className={cn(
                "relative rounded-lg border border-stone-700 bg-stone-900",
                isCompact ? "p-3" : "p-4",
              )}
            >
              {panel.narration ? (
                <p
                  className={cn(
                    "italic text-stone-400",
                    isCompact ? "mb-1 text-xs" : "mb-2 text-sm",
                  )}
                >
                  {panel.narration}
                </p>
              ) : null}
              {panel.dialogue ? (
                isCompact ? (
                  <p className="text-xs text-stone-200">
                    {panel.speaker ? (
                      <span className="font-bold text-violet-400">{panel.speaker}: </span>
                    ) : null}
                    {panel.dialogue}
                  </p>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <p className="flex-1 text-sm text-stone-200">
                      {panel.speaker ? (
                        <span className="font-bold text-violet-400">{panel.speaker}: </span>
                      ) : null}
                      {panel.dialogue}
                    </p>
                    <button
                      type="button"
                      className={cn(
                        "mt-0.5 shrink-0 rounded p-0.5 transition-colors",
                        isPlaying ? "text-violet-400" : "text-stone-400 hover:text-white",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        void playDialogue(panel.dialogue!, panel.speaker, ttsId);
                      }}
                      aria-label="Écouter ce dialogue"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              ) : null}
              {panel.sfx ? (
                <p
                  className={cn(
                    "text-center font-black italic text-red-400",
                    isCompact ? "mt-1 text-xs" : "mt-1",
                  )}
                >
                  {panel.sfx}
                </p>
              ) : null}
              {isCompact && panel.dialogue ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void playDialogue(panel.dialogue!, panel.speaker, ttsId);
                  }}
                  className="absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:text-white"
                  aria-label="Écouter"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
