"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BodyState {
  leftArmPresent?: boolean;
  rightArmPresent?: boolean;
  leftLegPresent?: boolean;
  rightLegPresent?: boolean;
  leftEyePresent?: boolean;
  rightEyePresent?: boolean;
  height?: string;
  build?: string;
  shoulderWidth?: string;
  hipWidth?: string;
  chestSize?: string;
  buttSize?: string;
  musculature?: string;
  silhouette?: string;
  posture?: string;
  perceivedAllure?: string;
  scarsCurrent?: string[];
  prosthetics?: string[];
  currentInjuries?: string[];
}

interface Props {
  value: BodyState;
  onChange: (v: BodyState) => void;
}

function BoolField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function CharacterBodyConfig({ value, onChange }: Props) {
  const set = (key: keyof BodyState) => (v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-6">
      {/* Morphologie */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Morphologie
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Taille</Label>
            <Input value={value.height ?? ""} onChange={(e) => set("height")(e.target.value)} placeholder="1m75, grand, petit..." />
          </div>
          <div className="space-y-1.5">
            <Label>Carrure</Label>
            <Select value={value.build ?? ""} onValueChange={set("build")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {["Mince", "Svelte", "Athlétique", "Musclé", "Robuste", "Massif", "Enveloppé"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Largeur épaules</Label>
            <Select value={value.shoulderWidth ?? ""} onValueChange={set("shoulderWidth")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {["Étroites", "Moyennes", "Larges", "Très larges"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Musculature</Label>
            <Select value={value.musculature ?? ""} onValueChange={set("musculature")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {["Aucune", "Légère", "Tonique", "Définie", "Très musclée"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Poitrine</Label>
            <Select value={value.chestSize ?? ""} onValueChange={set("chestSize")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {["flat", "small", "medium", "full", "voluptuous"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Posture</Label>
            <Select value={value.posture ?? ""} onValueChange={set("posture")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {["Droite", "Voûtée", "Décontractée", "Tendue", "Menaçante", "Élégante"].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* État physique — membres */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          État physique — Membres & Organes
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <BoolField label="Bras gauche présent" checked={value.leftArmPresent !== false} onChange={(v) => set("leftArmPresent")(v)} />
          <BoolField label="Bras droit présent" checked={value.rightArmPresent !== false} onChange={(v) => set("rightArmPresent")(v)} />
          <BoolField label="Jambe gauche présente" checked={value.leftLegPresent !== false} onChange={(v) => set("leftLegPresent")(v)} />
          <BoolField label="Jambe droite présente" checked={value.rightLegPresent !== false} onChange={(v) => set("rightLegPresent")(v)} />
          <BoolField label="Œil gauche présent" checked={value.leftEyePresent !== false} onChange={(v) => set("leftEyePresent")(v)} />
          <BoolField label="Œil droit présent" checked={value.rightEyePresent !== false} onChange={(v) => set("rightEyePresent")(v)} />
        </div>
      </div>

      {/* Marques permanentes */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Marques permanentes
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cicatrices actuelles</Label>
            <Input
              value={(value.scarsCurrent ?? []).join(", ")}
              onChange={(e) => set("scarsCurrent")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="Cicatrice joue, brûlure dos..."
            />
            <p className="text-xs text-muted-foreground">Séparer par des virgules</p>
          </div>
          <div className="space-y-1.5">
            <Label>Prothèses</Label>
            <Input
              value={(value.prosthetics ?? []).join(", ")}
              onChange={(e) => set("prosthetics")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="Bras gauche mécanique, jambe droite..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Blessures actives</Label>
            <Input
              value={(value.currentInjuries ?? []).join(", ")}
              onChange={(e) => set("currentInjuries")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
              placeholder="Blessure épaule, côte cassée..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
