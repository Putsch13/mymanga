/**
 * Composant slider 0..100 utilisé dans les réglages avancés du wizard.
 */
"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

export function SliderField({ label, value, onChange }: SliderFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted-foreground">{value}/100</span>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? value)}
      />
    </div>
  );
}
