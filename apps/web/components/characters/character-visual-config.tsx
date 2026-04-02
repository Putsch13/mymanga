"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VisualProfile {
  faceShape?: string;
  skinTone?: string;
  eyeShape?: string;
  eyeColor?: string;
  eyeSize?: string;
  eyebrowStyle?: string;
  hairStyle?: string;
  hairLength?: string;
  hairTexture?: string;
  hairColor?: string;
  noseStyle?: string;
  mouthStyle?: string;
  jawline?: string;
  scars?: string;
  tattoos?: string;
  accessories?: string;
  perceivedAge?: string;
  silhouetteType?: string;
}

interface Props {
  value: VisualProfile;
  onChange: (v: VisualProfile) => void;
}

export function CharacterVisualConfig({ value, onChange }: Props) {
  const set = (key: keyof VisualProfile) => (v: string) =>
    onChange({ ...value, [key]: v || undefined });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Visage & Apparence
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Forme du visage</Label>
          <Select value={value.faceShape ?? ""} onValueChange={set("faceShape")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Ovale", "Rond", "Carré", "Cœur", "Allongé", "Triangulaire"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Teint</Label>
          <Input value={value.skinTone ?? ""} onChange={(e) => set("skinTone")(e.target.value)} placeholder="Pâle, mat, foncé, olivâtre..." />
        </div>
        <div className="space-y-1.5">
          <Label>Couleur des yeux</Label>
          <Input value={value.eyeColor ?? ""} onChange={(e) => set("eyeColor")(e.target.value)} placeholder="Gris acier, ambre, violet..." />
        </div>
        <div className="space-y-1.5">
          <Label>Forme des yeux</Label>
          <Select value={value.eyeShape ?? ""} onValueChange={set("eyeShape")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Amande", "Rond", "En amande étirée", "Tombant", "Relevé", "Monolid"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Taille des yeux</Label>
          <Select value={value.eyeSize ?? ""} onValueChange={set("eyeSize")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Petits", "Moyens", "Grands", "Très grands (manga)"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Style sourcils</Label>
          <Select value={value.eyebrowStyle ?? ""} onValueChange={set("eyebrowStyle")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Fins", "Épais", "Droits", "Arqués", "Froncés", "Broussailleux"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Couleur cheveux</Label>
          <Input value={value.hairColor ?? ""} onChange={(e) => set("hairColor")(e.target.value)} placeholder="Noir corbeau, blond platine..." />
        </div>
        <div className="space-y-1.5">
          <Label>Coupe cheveux</Label>
          <Input value={value.hairStyle ?? ""} onChange={(e) => set("hairStyle")(e.target.value)} placeholder="Court, long, undercut, mèches..." />
        </div>
        <div className="space-y-1.5">
          <Label>Longueur cheveux</Label>
          <Select value={value.hairLength ?? ""} onValueChange={set("hairLength")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Rasé", "Très court", "Court", "Mi-long", "Long", "Très long"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Texture cheveux</Label>
          <Select value={value.hairTexture ?? ""} onValueChange={set("hairTexture")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Lisse", "Ondulé", "Bouclé", "Crépu", "Raide"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Mâchoire</Label>
          <Select value={value.jawline ?? ""} onValueChange={set("jawline")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Fine", "Marquée", "Large", "Carrée", "Douce"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Silhouette générale</Label>
          <Select value={value.silhouetteType ?? ""} onValueChange={set("silhouetteType")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Mince", "Athlétique", "Musclé", "Robuste", "Élancé", "Enveloppé", "Courbé"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cicatrices visibles</Label>
          <Input value={value.scars ?? ""} onChange={(e) => set("scars")(e.target.value)} placeholder="Cicatrice joue gauche, marque brûlure..." />
        </div>
        <div className="space-y-1.5">
          <Label>Tatouages</Label>
          <Input value={value.tattoos ?? ""} onChange={(e) => set("tattoos")(e.target.value)} placeholder="Dragon bras gauche, kanji nuque..." />
        </div>
        <div className="space-y-1.5">
          <Label>Accessoires fixes</Label>
          <Input value={value.accessories ?? ""} onChange={(e) => set("accessories")(e.target.value)} placeholder="Boucles d'oreilles, lunettes, bandeau..." />
        </div>
        <div className="space-y-1.5">
          <Label>Âge perçu</Label>
          <Input value={value.perceivedAge ?? ""} onChange={(e) => set("perceivedAge")(e.target.value)} placeholder="Juvénile, mature, vieilli..." />
        </div>
      </div>
    </div>
  );
}
