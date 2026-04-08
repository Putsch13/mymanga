"use client";

// Types démo (legacy) + types pipeline (nouveaux)
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

const MOOD_BG: Record<string, string> = {
  // Legacy
  "night-rain": "linear-gradient(170deg, #0a0a1a 0%, #1a1040 40%, #0d0d2a 100%)",
  sanctuary: "linear-gradient(160deg, #1c1510 0%, #2a1f18 50%, #0f0c0a 100%)",
  "close-up-lyra": "linear-gradient(135deg, #1a102a 0%, #2d1545 50%, #1a0e28 100%)",
  "close-up-kael": "linear-gradient(135deg, #0a1420 0%, #162540 50%, #0a1018 100%)",
  mystical: "linear-gradient(145deg, #0d0a1f 0%, #1f1050 40%, #0d0820 100%)",
  shadow: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #050505 100%)",
  warm: "linear-gradient(150deg, #1a1510 0%, #2a2018 50%, #1a1208 100%)",
  cold: "linear-gradient(160deg, #0a0f1a 0%, #101828 50%, #080c14 100%)",
  // Pipeline
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

const MOOD_OVERLAY: Partial<Record<string, React.ReactNode>> = {
  "night-rain": (
    <div
      className="absolute inset-0 opacity-30"
      style={{
        backgroundImage:
          "repeating-linear-gradient(95deg, transparent, transparent 4px, rgba(180,200,255,0.15) 4px, transparent 5px)",
        backgroundSize: "8px 100%",
      }}
    />
  ),
  action: (
    <div
      className="absolute inset-0 opacity-20"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,50,50,0.12) 6px, transparent 8px)",
      }}
    />
  ),
  tension: (
    <div
      className="absolute inset-0 opacity-20"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,50,50,0.12) 6px, transparent 8px)",
      }}
    />
  ),
  mystical: (
    <div
      className="absolute inset-0 opacity-25"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 30%, rgba(147,51,234,0.3), transparent 50%), radial-gradient(circle at 30% 70%, rgba(79,70,229,0.2), transparent 40%)",
      }}
    />
  ),
  revelation: (
    <div
      className="absolute inset-0 opacity-25"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 30%, rgba(147,51,234,0.3), transparent 50%), radial-gradient(circle at 30% 70%, rgba(79,70,229,0.2), transparent 40%)",
      }}
    />
  ),
  sanctuary: (
    <div
      className="absolute inset-0 opacity-20"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 0%, rgba(200,160,100,0.2), transparent 50%)",
      }}
    />
  ),
  horror: (
    <div
      className="absolute inset-0 opacity-30"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)",
      }}
    />
  ),
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
  textScale?: "normal" | "compact" | "micro";
  /** @deprecated Utiliser renderMeta.cropMode à la place */
  imageFit?: "cover" | "contain";
  /** @deprecated Utiliser renderMeta.focalPoint à la place */
  objectPosition?: string;
  /** Métadonnées de rendu strict pour éviter le crop arbitraire */
  renderMeta?: {
    cropMode?: "contain" | "cover";
    focalPoint?: { x: number; y: number };
    safeArea?: { top: number; right: number; bottom: number; left: number };
    reservedTextZones?: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center">;
  };
  /** Métadonnées de layout du panel (slotType, aspectRatio, layoutTemplate) */
  layoutMeta?: {
    slotType?: "wide" | "tall" | "square" | "closeup" | "dialogue";
    targetAspectRatio?: string;
    layoutTemplate?: string;
  };
  /** Mode de rendu: reader (défaut), webtoon, debug, print */
  renderMode?: "reader" | "webtoon" | "debug" | "print";
  className?: string;
  style?: React.CSSProperties;
  panelIndex?: number;
};

export function MangaPanel({
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
  textScale = "normal",
  imageFit = "cover",
  objectPosition = "top",
  renderMeta,
  layoutMeta,
  renderMode = "reader",
  className,
  style,
  panelIndex,
}: Props) {
  const bg = MOOD_BG[mood] ?? MOOD_BG["dramatic"];
  const overlay = MOOD_OVERLAY[mood];
  const isPending = !imageUrl && (status === "planned" || status === "pending");
  const isFailed = !imageUrl && (status === "failed" || status === "blocked");

  // Déterminer le mode de crop effectif (renderMeta prioritaire)
  const effectiveCropMode = renderMeta?.cropMode ?? imageFit;
  
  // Déterminer la position de l'objet basée sur focalPoint ou objectPosition
  const effectiveObjectPosition = renderMeta?.focalPoint
    ? `${renderMeta.focalPoint.x * 100}% ${renderMeta.focalPoint.y * 100}%`
    : objectPosition;
  const isWebtoon = renderMode === "webtoon";
  const targetAspectRatio = layoutMeta?.targetAspectRatio?.replace(":", " / ") ?? "4 / 5";

  const narrationClass =
    textScale === "micro"
      ? "text-[10px] leading-tight text-stone-200 md:text-[11px]"
      : textScale === "compact"
        ? "text-[10px] leading-tight text-stone-200 md:text-xs"
        : "text-[11px] leading-snug text-stone-200 md:text-sm";

  const allDialogues = dialogues ?? (dialogue && speaker ? [{ speaker, text: dialogue }] : dialogue ? [{ speaker: "", text: dialogue }] : []);

  const hasTextStrip =
    Boolean(narration) ||
    allDialogues.length > 0 ||
    Boolean(sfx && (dialogue || narration || allDialogues.length > 0));

  const speakerStripClass =
    textScale === "micro"
      ? "text-[7px] font-bold uppercase tracking-wide text-stone-600"
      : "text-[8px] font-bold uppercase tracking-wide text-stone-600";
  const dialogueStripClass =
    textScale === "micro"
      ? "text-[9px] font-medium leading-tight text-stone-900"
      : textScale === "compact"
        ? "text-[9px] font-medium leading-tight text-stone-900"
        : "text-[10px] font-medium leading-snug text-stone-900";

  return (
    <div
      className={`group/panel relative flex min-h-0 flex-col overflow-hidden border-2 border-stone-900 ${isWebtoon ? "rounded-[28px] border-stone-800/80 bg-stone-950 shadow-[0_24px_60px_rgba(0,0,0,0.35)]" : ""} ${className ?? ""}`}
      style={{ background: imageUrl ? undefined : bg, ...style }}
      aria-label={caption ?? `Panel ${(panelIndex ?? 0) + 1}`}
    >
      {/* Zone illustration : pleine largeur, le texte n’est plus superposé ici */}
      <div
        className={`relative overflow-hidden ${isWebtoon ? "" : "min-h-0 flex-1"}`}
        style={isWebtoon ? { aspectRatio: targetAspectRatio, minHeight: "18rem" } : undefined}
      >
        {imageUrl ? (
          <>
            {effectiveCropMode === "contain" && (
              <div className="absolute inset-0 bg-gradient-to-b from-stone-900 via-stone-950 to-stone-900" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={caption ?? `Panel ${(panelIndex ?? 0) + 1}`}
              className={`h-full w-full ${effectiveCropMode === "contain" ? "object-contain" : "object-cover"} ${isWebtoon ? "bg-stone-950" : ""}`}
              style={{ objectPosition: effectiveObjectPosition }}
            />
          </>
        ) : (
          <div className="absolute inset-0">{overlay}</div>
        )}

        {/* SFX seul : reste centré sur l’image */}
        {imageUrl && sfx && !dialogue && !narration && allDialogues.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className="select-none text-2xl font-black italic tracking-wider text-white/90 drop-shadow-lg sm:text-3xl"
              style={{
                textShadow:
                  "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                transform: "rotate(-8deg) scale(1.05)",
              }}
            >
              {sfx}
            </span>
          </div>
        ) : null}

        {/* Métadonnées techniques : discrètes, ne mangent plus le haut de l’image */}
        {(status || provider || model) && (
          <div className="pointer-events-none absolute right-1 top-1 z-20 max-w-[min(100%,11rem)] truncate rounded border border-white/10 bg-black/55 px-1 py-0.5 text-[8px] leading-tight text-stone-300 opacity-70 transition-opacity group-hover/panel:opacity-100">
            <span className="font-medium">{status ?? "?"}</span>
            {provider ? <span className="opacity-80"> · {provider}</span> : null}
          </div>
        )}

        {isPending ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
            <div className="rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs text-stone-100">
              Génération en cours…
            </div>
          </div>
        ) : null}

        {isFailed ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-3 text-center">
            <div className="w-full max-w-[220px] rounded-lg border border-red-500/20 bg-black/70 px-3 py-2 text-xs text-stone-100">
              <p className="font-semibold text-red-300">Échec de génération</p>
              {error ? <p className="mt-1 text-stone-200/80 line-clamp-3">{error}</p> : null}
              {sceneImageId ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch(`/api/scene-images/${sceneImageId}/retry`, { method: "POST" });
                      const j = await res.json();
                      if (!res.ok) throw new Error(j.message ?? j.error ?? "retry_failed");
                      window.location.reload();
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Réessayer
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bande texte sous l’image : narration + bulles + SFX associés (scroll si trop long) */}
      {hasTextStrip ? (
        <div className={`z-10 shrink-0 overflow-y-auto border-t border-stone-800 bg-stone-950/98 ${isWebtoon ? "max-h-none px-4 py-3" : "max-h-[min(46%,9rem)] px-1.5 py-1"}`}>
          {narration ? (
            <div className={`mb-1 rounded border border-white/15 bg-black/40 ${isWebtoon ? "px-3 py-2" : "px-1.5 py-0.5"}`}>
              <p className={`${narrationClass} line-clamp-3`}>{narration}</p>
            </div>
          ) : null}

          {allDialogues.length > 0 ? (
            <div className="flex flex-col gap-1">
              {allDialogues.slice(0, isWebtoon ? 5 : 3).map((d, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border border-stone-800 bg-white/95 shadow-sm ${isWebtoon ? "px-3 py-2" : "px-1.5 py-1"}`}
                >
                  {d.speaker ? <p className={speakerStripClass}>{d.speaker}</p> : null}
                  <p className={`${dialogueStripClass} ${isWebtoon ? "" : "line-clamp-3"}`}>{d.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          {sfx && (dialogue || narration || allDialogues.length > 0) ? (
            <span
              className="mt-0.5 block select-none text-center text-sm font-black italic text-amber-200/90"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              {sfx}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
