"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SpeechProfile {
  politenessLevel?: number;
  sentenceLength?: string;
  vocabularyStyle?: string;
  emotionalLeak?: number;
  sarcasmLevel?: number;
  aggressionLevel?: number;
  seductionStyle?: string;
  favoriteExpressions?: string[];
  silenceFrequency?: number;
  innerMonologueStyle?: string;
  threatenStyle?: string;
  lieStyle?: string;
}

interface Props {
  value: SpeechProfile;
  onChange: (v: SpeechProfile) => void;
}

function SliderField({ label, value, onChange, min = 0, max = 10 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{value}/{max}</span>
      </div>
      <Slider min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

export function CharacterSpeechConfig({ value, onChange }: Props) {
  const set = (key: keyof SpeechProfile) => (v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Personnalité & Voix (legacy)
      </h3>
      <p className="text-xs text-muted-foreground">
        Profil ancien (sliders 0–10). Pour les nouveaux personnages, le bloc « Profil de voix
        (Continuity Engine) » plus bas a la priorité dans la génération de dialogues.
      </p>

      {/* Sliders */}
      <div className="grid gap-5 sm:grid-cols-2">
        <SliderField label="Politesse" value={value.politenessLevel ?? 5} onChange={set("politenessLevel")} />
        <SliderField label="Sarcasme" value={value.sarcasmLevel ?? 0} onChange={set("sarcasmLevel")} />
        <SliderField label="Agressivité" value={value.aggressionLevel ?? 0} onChange={set("aggressionLevel")} />
        <SliderField label="Fuite émotionnelle" value={value.emotionalLeak ?? 5} onChange={set("emotionalLeak")} />
        <SliderField label="Fréquence des silences" value={value.silenceFrequency ?? 3} onChange={set("silenceFrequency")} />
      </div>

      {/* Sélecteurs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Longueur des phrases</Label>
          <Select value={value.sentenceLength ?? "medium"} onValueChange={set("sentenceLength")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[
                { v: "very_short", l: "Très courtes (1-3 mots)" },
                { v: "short", l: "Courtes (3-6 mots)" },
                { v: "medium", l: "Moyennes" },
                { v: "long", l: "Longues" },
              ].map(({ v, l }) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Style vocabulaire</Label>
          <Select value={value.vocabularyStyle ?? ""} onValueChange={set("vocabularyStyle")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Soutenu", "Courant", "Familier", "Argotique", "Technique", "Poétique", "Vulgaire"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Champs libres */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Style de séduction</Label>
          <Input value={value.seductionStyle ?? ""} onChange={(e) => set("seductionStyle")(e.target.value)} placeholder="Sous-entendu, direct, froid..." />
        </div>
        <div className="space-y-1.5">
          <Label>Style de menace</Label>
          <Input value={value.threatenStyle ?? ""} onChange={(e) => set("threatenStyle")(e.target.value)} placeholder="Calme et glacial, explosif..." />
        </div>
        <div className="space-y-1.5">
          <Label>Style de mensonge</Label>
          <Input value={value.lieStyle ?? ""} onChange={(e) => set("lieStyle")(e.target.value)} placeholder="Sourire, détournement, silence..." />
        </div>
        <div className="space-y-1.5">
          <Label>Monologue intérieur</Label>
          <Input value={value.innerMonologueStyle ?? ""} onChange={(e) => set("innerMonologueStyle")(e.target.value)} placeholder="Analytique, émotionnel, dissocié..." />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Expressions favorites</Label>
          <Input
            value={(value.favoriteExpressions ?? []).join(", ")}
            onChange={(e) => set("favoriteExpressions")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="Hmm, Intéressant, Tsk..."
          />
          <p className="text-xs text-muted-foreground">Séparer par des virgules</p>
        </div>
      </div>
    </div>
  );
}
