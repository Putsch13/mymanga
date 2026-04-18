/**
 * P5.5 — Atoms UI extraits de la page pipeline (Tooltip, SliderField).
 * Pure UI, pas de state global. Signatures strictement identiques au
 * code inline d'origine pour garantir 0 régression visuelle.
 */

"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Label } from "@/components/ui/label";

export function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        aria-label="Aide"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  helper,
  tooltip,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  helper: string;
  tooltip?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label>{label}</Label>
          {tooltip && <Tooltip text={tooltip} />}
        </div>
        <span className="text-xs text-muted-foreground">{value}/100</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <p className="text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
