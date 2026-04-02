"use client";

import type { BubbleType } from "@manga-ai-studio/core";
import { cn } from "@manga-ai-studio/ui";

interface MangaBubbleProps {
  text: string;
  bubbleType: BubbleType;
  speaker?: string;
  emotion?: string;
  className?: string;
}

const BUBBLE_STYLES: Record<BubbleType, string> = {
  speech:
    "bg-white text-black border-2 border-black rounded-2xl px-3 py-1.5 shadow-md text-sm font-medium leading-tight",
  thought:
    "bg-white/90 text-black border-2 border-black/60 rounded-full px-3 py-1.5 shadow-sm text-sm italic leading-tight",
  whisper:
    "bg-white/70 text-black/70 border border-black/40 rounded-xl px-2 py-1 text-xs italic leading-tight",
  shout:
    "bg-yellow-100 text-black border-[3px] border-black rounded-none px-3 py-1.5 shadow-lg text-sm font-black uppercase tracking-wide leading-tight",
  inner_monologue:
    "bg-slate-900/80 text-slate-100 border border-slate-500/60 rounded-xl px-3 py-1.5 text-xs italic leading-tight",
  narration_box:
    "bg-amber-50 text-black border-l-4 border-amber-500 px-3 py-1.5 rounded-none text-xs font-medium leading-snug",
  radio:
    "bg-zinc-800 text-green-400 border border-green-500/50 rounded-sm px-2 py-1 text-xs font-mono leading-tight",
  demonic_voice:
    "bg-red-950/90 text-red-200 border-2 border-red-700/70 rounded-lg px-3 py-1.5 text-sm font-bold italic leading-tight shadow-red-900/50 shadow-lg",
  sfx: "bg-transparent text-yellow-300 text-xl font-black uppercase tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none",
};

const BUBBLE_LABELS: Record<BubbleType, string> = {
  speech: "",
  thought: "💭",
  whisper: "~",
  shout: "!!",
  inner_monologue: "…",
  narration_box: "",
  radio: "📻",
  demonic_voice: "👁",
  sfx: "",
};

export function MangaBubble({ text, bubbleType, speaker, className }: MangaBubbleProps) {
  const label = BUBBLE_LABELS[bubbleType];

  if (bubbleType === "sfx") {
    return (
      <span className={cn(BUBBLE_STYLES.sfx, className)}>
        {text}
      </span>
    );
  }

  if (bubbleType === "narration_box") {
    return (
      <div className={cn(BUBBLE_STYLES.narration_box, className)}>
        {text}
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block max-w-[160px]", className)}>
      {speaker && bubbleType === "speech" && (
        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-black/50">
          {speaker}
        </span>
      )}
      <div className={cn(BUBBLE_STYLES[bubbleType])}>
        {label && <span className="mr-1 opacity-60">{label}</span>}
        {text}
      </div>
    </div>
  );
}
