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
import { Switch } from "@/components/ui/switch";

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
  // Pilosité faciale (sprint configurateur)
  beardPresent?: boolean;
  beardStyle?: string;
  beardDensity?: string;
  beardColor?: string;
  mustachePresent?: boolean;
  mustacheStyle?: string;
  sideburns?: string;
  // Personnalité visuelle (mimiques, posture spontanée)
  restingFace?: string;
  typicalMimic?: string;
  typicalGaze?: string;
  habitualPosture?: string;
  signatureGesture?: string;
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

      <div className="pt-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Pilosité faciale
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
            <Label className="text-sm">Barbe</Label>
            <Switch
              checked={value.beardPresent === true}
              onCheckedChange={(v) => onChange({ ...value, beardPresent: v, beardStyle: v ? value.beardStyle : undefined, beardDensity: v ? value.beardDensity : undefined, beardColor: v ? value.beardColor : undefined })}
            />
          </div>
          {value.beardPresent ? (
            <>
              <div className="space-y-1.5">
                <Label>Style de barbe</Label>
                <Select value={value.beardStyle ?? ""} onValueChange={set("beardStyle")}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {[
                      "Barbe de 3 jours",
                      "Barbe courte",
                      "Barbe pleine",
                      "Bouc",
                      "Collier",
                      "Garibaldi",
                      "Verdi",
                      "Vandyke",
                      "Longue / hirsute",
                    ].map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Densité</Label>
                <Select value={value.beardDensity ?? ""} onValueChange={set("beardDensity")}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {["Clairsemée", "Moyenne", "Dense", "Très dense"].map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Couleur barbe</Label>
                <Input
                  value={value.beardColor ?? ""}
                  onChange={(e) => set("beardColor")(e.target.value)}
                  placeholder="Identique cheveux, plus claire, grise..."
                />
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
            <Label className="text-sm">Moustache</Label>
            <Switch
              checked={value.mustachePresent === true}
              onCheckedChange={(v) => onChange({ ...value, mustachePresent: v, mustacheStyle: v ? value.mustacheStyle : undefined })}
            />
          </div>
          {value.mustachePresent ? (
            <div className="space-y-1.5">
              <Label>Style de moustache</Label>
              <Select value={value.mustacheStyle ?? ""} onValueChange={set("mustacheStyle")}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>
                  {[
                    "Fine / discrète",
                    "Brosse",
                    "En guidon",
                    "Chevron",
                    "Walrus",
                    "Imperial",
                    "Crayon",
                  ].map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Favoris / pattes</Label>
            <Select value={value.sideburns ?? ""} onValueChange={set("sideburns")}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                {[
                  "Aucun",
                  "Courts",
                  "Moyens",
                  "Longs",
                  "Mutton chops",
                  "Reliés à la barbe",
                ].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Personnalité visuelle
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Comment le personnage se tient et regarde par défaut, sans émotion forte. Sert à le rendre reconnaissable même de loin.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Visage au repos</Label>
            <Select value={value.restingFace ?? ""} onValueChange={set("restingFace")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {[
                  "Doux / rêveur",
                  "Neutre",
                  "Sérieux",
                  "Sévère",
                  "Maussade",
                  "Endormi",
                  "Souriant naturel",
                  "Méprisant",
                  "Distant / ailleurs",
                ].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mimique typique</Label>
            <Input
              value={value.typicalMimic ?? ""}
              onChange={(e) => set("typicalMimic")(e.target.value)}
              placeholder="Sourire en coin, lèvre mordue, sourcil levé..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Regard typique</Label>
            <Select value={value.typicalGaze ?? ""} onValueChange={set("typicalGaze")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {[
                  "Direct",
                  "Fuyant",
                  "Plissé / méfiant",
                  "Perçant",
                  "Doux",
                  "Vide / lointain",
                  "Joueur",
                  "Calculateur",
                ].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Posture spontanée</Label>
            <Select value={value.habitualPosture ?? ""} onValueChange={set("habitualPosture")}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {[
                  "Bras croisés",
                  "Mains dans les poches",
                  "Une main dans les cheveux",
                  "Épaules tombantes",
                  "Dos droit / fier",
                  "Une jambe en arrière",
                  "Penché en avant",
                  "Adossé nonchalamment",
                  "Mains derrière le dos",
                ].map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <Label>Geste signature</Label>
            <Input
              value={value.signatureGesture ?? ""}
              onChange={(e) => set("signatureGesture")(e.target.value)}
              placeholder="Ajuste ses lunettes, claque la langue, fait craquer ses doigts..."
            />
            <p className="text-[11px] text-muted-foreground">
              Le geste répété qui le rend identifiable — utilisé dans les panels d&apos;action et de tension.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
