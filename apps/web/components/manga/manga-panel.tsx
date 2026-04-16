"use client";

import { useMemo } from "react";

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

type BubbleSlot = "top-left" | "top-right" | "mid-left" | "mid-right" | "bottom-left" | "bottom-right";

const SLOT_POSITIONS: Record<BubbleSlot, { x: number; y: number; tailDir: "down" | "up" }> = {
  "top-left":     { x: 4,  y: 4,  tailDir: "down" },
  "top-right":    { x: 54, y: 4,  tailDir: "down" },
  "mid-left":     { x: 3,  y: 38, tailDir: "down" },
  "mid-right":    { x: 52, y: 38, tailDir: "up" },
  "bottom-left":  { x: 4,  y: 68, tailDir: "up" },
  "bottom-right": { x: 52, y: 68, tailDir: "up" },
};

const ALL_SLOTS: BubbleSlot[] = [
  "top-left", "top-right", "mid-left", "mid-right", "bottom-left", "bottom-right",
];

type ReservedZone = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

function slotMatchesReserved(slot: BubbleSlot, reserved: ReservedZone[]): boolean {
  for (const zone of reserved) {
    if (zone === "center" && (slot === "mid-left" || slot === "mid-right")) return true;
    if (zone === "top-left" && slot === "top-left") return true;
    if (zone === "top-right" && slot === "top-right") return true;
    if (zone === "bottom-left" && slot === "bottom-left") return true;
    if (zone === "bottom-right" && slot === "bottom-right") return true;
  }
  return false;
}

function pickSlots(count: number, reserved: ReservedZone[]): BubbleSlot[] {
  const available = ALL_SLOTS.filter((s) => !slotMatchesReserved(s, reserved));
  const fallback = available.length >= count ? available : ALL_SLOTS;
  return fallback.slice(0, count);
}

function SpeechBubbleSVG({
  speaker,
  text,
  slot,
  isWebtoon,
}: {
  speaker: string;
  text: string;
  slot: BubbleSlot;
  isWebtoon: boolean;
}) {
  const pos = SLOT_POSITIONS[slot];
  const w = isWebtoon ? 44 : 42;
  const h = isWebtoon ? 28 : 24;
  const fontSize = isWebtoon ? 3.2 : 2.8;
  const speakerSize = isWebtoon ? 2.6 : 2.2;
  const rx = 3;
  const padding = 2.5;

  const tailPath =
    pos.tailDir === "down"
      ? `M${w * 0.3},${h} L${w * 0.35},${h + 5} L${w * 0.45},${h} Z`
      : `M${w * 0.55},0 L${w * 0.6},${-5} L${w * 0.7},0 Z`;

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      style={{ filter: "drop-shadow(0.8px 1.2px 1.5px rgba(0,0,0,0.45))" }}
    >
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        ry={rx}
        fill="white"
        stroke="#1c1917"
        strokeWidth={0.6}
      />
      <path d={tailPath} fill="white" stroke="#1c1917" strokeWidth={0.5} />
      {/* Re-fill the junction between rect and tail to hide the stroke overlap */}
      <rect
        x={pos.tailDir === "down" ? w * 0.28 : w * 0.53}
        y={pos.tailDir === "down" ? h - 0.5 : 0}
        width={w * 0.2}
        height={1}
        fill="white"
      />
      <foreignObject x={padding} y={padding} width={w - padding * 2} height={h - padding * 2}>
        <div
          // @ts-expect-error xmlns needed for foreignObject in SVG
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: `${fontSize}px`,
            lineHeight: 1.3,
            color: "#1c1917",
            overflow: "hidden",
            width: "100%",
            height: "100%",
          }}
        >
          {speaker && (
            <div
              style={{
                fontSize: `${speakerSize}px`,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#78716c",
                marginBottom: "1px",
              }}
            >
              {speaker}
            </div>
          )}
          <div style={{ fontWeight: 500 }}>{text}</div>
        </div>
      </foreignObject>
    </g>
  );
}

function NarrationOverlay({ text, isWebtoon }: { text: string; isWebtoon: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute left-0 right-0 top-0 z-10 border-b border-white/10 ${
        isWebtoon ? "px-5 py-3" : "px-3 py-2"
      }`}
      style={{
        background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.45) 70%, transparent 100%)",
        backdropFilter: "blur(4px)",
      }}
    >
      <p
        className={`italic text-white/90 ${
          isWebtoon ? "text-sm leading-relaxed" : "text-[11px] leading-snug"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function SfxOverlay({
  text,
  hasDialogue,
  isWebtoon,
  seed,
}: {
  text: string;
  hasDialogue: boolean;
  isWebtoon: boolean;
  seed: number;
}) {
  const rotation = ((seed * 7 + 3) % 25) - 12;

  if (hasDialogue) {
    return (
      <div className="pointer-events-none absolute bottom-3 right-3 z-10">
        <span
          className={`select-none font-black italic tracking-wider ${
            isWebtoon ? "text-xl" : "text-base"
          }`}
          style={{
            color: "#fbbf24",
            textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
            transform: `rotate(${rotation}deg)`,
            display: "inline-block",
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span
        className={`select-none font-black italic tracking-wider ${
          isWebtoon ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
        }`}
        style={{
          color: "rgba(255,255,255,0.92)",
          textShadow:
            "3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 0 12px rgba(239,68,68,0.5), 0 0 30px rgba(245,158,11,0.3)",
          transform: `rotate(${rotation}deg) scale(1.05)`,
          display: "inline-block",
        }}
      >
        {text}
      </span>
    </div>
  );
}

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
  const isPending = !imageUrl && (status === "planned" || status === "pending");
  const isFailed = !imageUrl && (status === "failed" || status === "blocked");
  const isWebtoon = renderMode === "webtoon";
  const effectiveCropMode = renderMeta?.cropMode ?? imageFit;
  const effectiveObjectPosition = renderMeta?.focalPoint
    ? `${renderMeta.focalPoint.x * 100}% ${renderMeta.focalPoint.y * 100}%`
    : objectPosition;
  const targetAspectRatio = layoutMeta?.targetAspectRatio?.replace(":", " / ") ?? "4 / 5";
  const reserved = renderMeta?.reservedTextZones ?? [];

  const allDialogues = useMemo(
    () =>
      dialogues ??
      (dialogue && speaker
        ? [{ speaker, text: dialogue }]
        : dialogue
          ? [{ speaker: "", text: dialogue }]
          : []),
    [dialogues, dialogue, speaker],
  );

  const hasDialogue = allDialogues.length > 0;

  const bubbleSlots = useMemo(
    () => pickSlots(Math.min(allDialogues.length, 6), reserved),
    [allDialogues.length, reserved],
  );

  const narrationClass =
    textScale === "micro"
      ? "text-[10px] leading-tight text-stone-200 md:text-[11px]"
      : textScale === "compact"
        ? "text-[10px] leading-tight text-stone-200 md:text-xs"
        : "text-[11px] leading-snug text-stone-200 md:text-sm";

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

  const showOverlayText = Boolean(imageUrl);

  return (
    <div
      className={`group/panel relative flex min-h-0 flex-col overflow-hidden border-2 border-stone-900 ${
        isWebtoon
          ? "rounded-[30px] border-stone-800/80 bg-stone-950 shadow-[0_24px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/5"
          : ""
      } ${className ?? ""}`}
      style={{ background: imageUrl ? undefined : bg, ...style }}
      aria-label={caption ?? `Panel ${(panelIndex ?? 0) + 1}`}
    >
      <div
        className={`relative overflow-hidden ${isWebtoon ? "" : "min-h-0 flex-1"}`}
        style={isWebtoon ? { aspectRatio: targetAspectRatio, minHeight: "20rem" } : undefined}
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
              className={`h-full w-full ${
                effectiveCropMode === "contain" ? "object-contain" : "object-cover"
              } ${isWebtoon ? "bg-stone-950" : ""}`}
              style={{ objectPosition: effectiveObjectPosition }}
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent && !parent.querySelector("[data-broken-skeleton]")) {
                  const sk = document.createElement("div");
                  sk.setAttribute("data-broken-skeleton", "1");
                  sk.className =
                    "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-900/80";
                  sk.innerHTML =
                    '<div class="h-8 w-8 rounded-full border-2 border-stone-600 border-t-stone-300 animate-spin"></div><p class="text-[10px] text-stone-500">Image expirée</p>';
                  parent.appendChild(sk);
                }
              }}
            />

            {/* --- Manga-style overlays on the image --- */}

            {narration && <NarrationOverlay text={narration} isWebtoon={isWebtoon} />}

            {sfx && (
              <SfxOverlay
                text={sfx}
                hasDialogue={hasDialogue}
                isWebtoon={isWebtoon}
                seed={panelIndex ?? 0}
              />
            )}

            {allDialogues.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {allDialogues
                  .slice(0, isWebtoon ? 6 : 4)
                  .map((d, idx) => {
                    const slot = bubbleSlots[idx % bubbleSlots.length];
                    return (
                      <SpeechBubbleSVG
                        key={idx}
                        speaker={d.speaker}
                        text={d.text}
                        slot={slot}
                        isWebtoon={isWebtoon}
                      />
                    );
                  })}
              </svg>
            )}
          </>
        ) : isPending ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stone-900">
            <div className="h-8 w-8 rounded-full border-2 border-stone-600 border-t-stone-300 animate-spin" />
            <p className="text-[10px] text-stone-500">Génération en cours…</p>
          </div>
        ) : isFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-900">
            <div className="text-2xl opacity-40">✕</div>
            <p className="text-[10px] text-stone-500">Image non disponible</p>
          </div>
        ) : null}

        {(status || provider || model) && (
          <div className="pointer-events-none absolute right-1 top-1 z-20 max-w-[min(100%,11rem)] truncate rounded border border-white/10 bg-black/55 px-1 py-0.5 text-[8px] leading-tight text-stone-300 opacity-70 transition-opacity group-hover/panel:opacity-100">
            <span className="font-medium">{status ?? "?"}</span>
            {provider ? <span className="opacity-80"> · {provider}</span> : null}
          </div>
        )}

        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
            <div className="rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs text-stone-100">
              Génération en cours…
            </div>
          </div>
        )}

        {isFailed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-3 text-center">
            <div className="w-full max-w-[220px] rounded-lg border border-red-500/20 bg-black/70 px-3 py-2 text-xs text-stone-100">
              <p className="font-semibold text-red-300">Échec de génération</p>
              {error ? <p className="mt-1 text-stone-200/80 line-clamp-3">{error}</p> : null}
              {sceneImageId && (
                <button
                  type="button"
                  className="mt-2 w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs hover:bg-white/15"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const res = await fetch(`/api/scene-images/${sceneImageId}/retry`, {
                        method: "POST",
                      });
                      const j = await res.json();
                      if (!res.ok) throw new Error(j.message ?? j.error ?? "retry_failed");
                      window.location.reload();
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Réessayer
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fallback text strip ONLY when no image (panels being generated) */}
      {!showOverlayText && (narration || hasDialogue || sfx) && (
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
              <p className={`${narrationClass} line-clamp-3`}>{narration}</p>
            </div>
          )}

          {allDialogues.length > 0 && (
            <div className="flex flex-col gap-1">
              {allDialogues.slice(0, isWebtoon ? 5 : 3).map((d, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border border-stone-800 bg-white/95 shadow-sm ${
                    isWebtoon ? "px-3 py-2" : "px-1.5 py-1"
                  }`}
                >
                  {d.speaker && <p className={speakerStripClass}>{d.speaker}</p>}
                  <p className={`${dialogueStripClass} ${isWebtoon ? "" : "line-clamp-3"}`}>
                    {d.text}
                  </p>
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
      )}
    </div>
  );
}

export default MangaPanel;
