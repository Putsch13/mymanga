"use client";

import type { PanelMood } from "@/lib/demo-data";

const MOOD_BG: Record<PanelMood, string> = {
  "night-rain":
    "linear-gradient(170deg, #0a0a1a 0%, #1a1040 40%, #0d0d2a 100%)",
  sanctuary:
    "linear-gradient(160deg, #1c1510 0%, #2a1f18 50%, #0f0c0a 100%)",
  "close-up-lyra":
    "linear-gradient(135deg, #1a102a 0%, #2d1545 50%, #1a0e28 100%)",
  "close-up-kael":
    "linear-gradient(135deg, #0a1420 0%, #162540 50%, #0a1018 100%)",
  action:
    "linear-gradient(135deg, #1a0a0a 0%, #3a1515 40%, #0a0a0a 100%)",
  mystical:
    "linear-gradient(145deg, #0d0a1f 0%, #1f1050 40%, #0d0820 100%)",
  shadow:
    "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #050505 100%)",
  warm:
    "linear-gradient(150deg, #1a1510 0%, #2a2018 50%, #1a1208 100%)",
  dramatic:
    "linear-gradient(135deg, #1a0520 0%, #300a30 40%, #0a0010 100%)",
  cold:
    "linear-gradient(160deg, #0a0f1a 0%, #101828 50%, #080c14 100%)",
};

const MOOD_OVERLAY: Partial<Record<PanelMood, React.ReactNode>> = {
  "night-rain": (
    <div className="absolute inset-0 opacity-30" style={{
      backgroundImage: "repeating-linear-gradient(95deg, transparent, transparent 4px, rgba(180,200,255,0.15) 4px, transparent 5px)",
      backgroundSize: "8px 100%",
    }} />
  ),
  action: (
    <div className="absolute inset-0 opacity-20" style={{
      backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,50,50,0.12) 6px, transparent 8px)",
    }} />
  ),
  mystical: (
    <div className="absolute inset-0 opacity-25" style={{
      backgroundImage: "radial-gradient(circle at 50% 30%, rgba(147,51,234,0.3), transparent 50%), radial-gradient(circle at 30% 70%, rgba(79,70,229,0.2), transparent 40%)",
    }} />
  ),
  sanctuary: (
    <div className="absolute inset-0 opacity-20" style={{
      backgroundImage: "radial-gradient(circle at 50% 0%, rgba(200,160,100,0.2), transparent 50%)",
    }} />
  ),
};

type Props = {
  mood: PanelMood;
  dialogue?: string;
  speaker?: string;
  narration?: string;
  sfx?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function MangaPanel({ mood, dialogue, speaker, narration, sfx, className, style }: Props) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden border-2 border-stone-900 ${className ?? ""}`}
      style={{ background: MOOD_BG[mood], ...style }}
    >
      {MOOD_OVERLAY[mood]}

      <div className="relative z-10 flex flex-1 flex-col justify-end p-2">
        {sfx && !dialogue && !narration ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="select-none text-3xl font-black italic tracking-wider text-white/90 drop-shadow-lg md:text-4xl"
              style={{
                textShadow: "2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
                transform: "rotate(-8deg) scale(1.1)",
              }}
            >
              {sfx}
            </span>
          </div>
        ) : null}

        {narration ? (
          <div className="mb-1 rounded border border-white/20 bg-black/70 px-2 py-1">
            <p className="text-[10px] leading-tight text-stone-200 md:text-xs">{narration}</p>
          </div>
        ) : null}

        {dialogue ? (
          <div className="relative">
            <div className="rounded-xl border-2 border-stone-900 bg-white px-2 py-1.5 shadow-md">
              {speaker ? (
                <p className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-stone-500 md:text-[9px]">{speaker}</p>
              ) : null}
              <p className="text-[10px] font-medium leading-tight text-stone-900 md:text-xs">{dialogue}</p>
            </div>
            <div
              className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b-2 border-r-2 border-stone-900 bg-white"
              aria-hidden
            />
          </div>
        ) : null}

        {sfx && (dialogue || narration) ? (
          <span
            className="mt-1 block select-none text-center text-lg font-black italic text-white/80 md:text-xl"
            style={{ textShadow: "1px 1px 0 #000, -1px -1px 0 #000" }}
          >
            {sfx}
          </span>
        ) : null}
      </div>
    </div>
  );
}
