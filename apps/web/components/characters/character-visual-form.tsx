"use client";

/**
 * character-visual-form — formulaire de personnage VISUEL-ONLY.
 *
 * Ne collecte QUE ce qui sert réellement à la génération d'image et à la
 * cohérence (nom, genre, rôle, âge + traits visuels). Plus de bio / trauma /
 * objectif / secrets / profil de voix dans le flux normal : ces champs
 * polluaient l'UX sans améliorer le rendu.
 *
 * Le mapping `visualFormToPayload` écrit dans les colonnes plates ET dans
 * `visualProfile` / `wardrobeProfile` avec EXACTEMENT les clés lues par
 * `resolveCharacterIdentity` (hairColor, hairStyle, eyeColor, eyeShape,
 * faceShape, skinTone, silhouetteType, scars, tattoos, defaultOutfit).
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { safeFetch } from "@/lib/safe-fetch";

export interface CharacterVisualFormValue {
  name: string;
  gender: "male" | "female" | "";
  role: string;
  age: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  eyeShape: string;
  skinTone: string;
  faceShape: string;
  build: string;
  outfit: string;
  markers: string;
}

export const EMPTY_CHARACTER_VISUAL_FORM: CharacterVisualFormValue = {
  name: "",
  gender: "",
  role: "",
  age: "",
  hairColor: "",
  hairStyle: "",
  eyeColor: "",
  eyeShape: "",
  skinTone: "",
  faceShape: "",
  build: "",
  outfit: "",
  markers: "",
};

const ROLE_OPTIONS = [
  { value: "hero", label: "Héros" },
  { value: "antagonist", label: "Antagoniste" },
  { value: "secondary", label: "Secondaire" },
  { value: "recurring_npc", label: "PNJ récurrent" },
] as const;

/** Convertit le formulaire en payload API (création ou patch). */
export function visualFormToPayload(v: CharacterVisualFormValue) {
  const clean = (s: string) => {
    const t = s.trim();
    return t.length > 0 ? t : null;
  };
  // Résumé lisible utilisé en fallback `appearance` (jamais de JSON brut).
  const appearance =
    [
      clean(v.build) ? `${v.build.trim()} build` : null,
      clean(v.skinTone) ? `${v.skinTone.trim()} skin` : null,
      clean(v.faceShape) ? `${v.faceShape.trim()} face` : null,
      clean(v.markers),
    ]
      .filter(Boolean)
      .join(", ") || null;

  const visualProfile: Record<string, string> = {};
  if (clean(v.hairColor)) visualProfile.hairColor = v.hairColor.trim();
  if (clean(v.hairStyle)) visualProfile.hairStyle = v.hairStyle.trim();
  if (clean(v.eyeColor)) visualProfile.eyeColor = v.eyeColor.trim();
  if (clean(v.eyeShape)) visualProfile.eyeShape = v.eyeShape.trim();
  if (clean(v.faceShape)) visualProfile.faceShape = v.faceShape.trim();
  if (clean(v.skinTone)) visualProfile.skinTone = v.skinTone.trim();
  if (clean(v.build)) visualProfile.silhouetteType = v.build.trim();
  // markers libres → scars (le builder lit dna.scars / vp.scars).
  if (clean(v.markers)) visualProfile.scars = v.markers.trim();

  const wardrobeProfile: Record<string, string> = {};
  if (clean(v.outfit)) wardrobeProfile.defaultOutfit = v.outfit.trim();

  return {
    name: v.name.trim(),
    gender: v.gender || undefined,
    roleType: clean(v.role) ?? undefined,
    age: v.age ? Number(v.age) : undefined,
    appearance: appearance ?? undefined,
    hairColor: clean(v.hairColor) ?? undefined,
    eyeColor: clean(v.eyeColor) ?? undefined,
    outfitDefault: clean(v.outfit) ?? undefined,
    visualProfile: Object.keys(visualProfile).length > 0 ? visualProfile : undefined,
    wardrobeProfile: Object.keys(wardrobeProfile).length > 0 ? wardrobeProfile : undefined,
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function CharacterVisualForm({
  value,
  onChange,
  projectId,
}: {
  value: CharacterVisualFormValue;
  onChange: (next: CharacterVisualFormValue) => void;
  /** Si fourni, active le bouton « Remplir par l'IA » (autofill visuel). */
  projectId?: string;
}) {
  const set = <K extends keyof CharacterVisualFormValue>(key: K, v: CharacterVisualFormValue[K]) =>
    onChange({ ...value, [key]: v });

  const [brief, setBrief] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function runAiFill() {
    if (!projectId || !value.name.trim()) {
      setAiError("Donne au moins un nom avant de demander à l'IA.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    const result = await safeFetch<{ fill: Partial<CharacterVisualFormValue> }>(
      `/api/projects/${projectId}/characters/ai-fill`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value.name.trim(),
          brief: brief.trim() || undefined,
          gender: value.gender || undefined,
          role: value.role || undefined,
        }),
      },
    );
    setAiLoading(false);
    if (!result.ok) {
      setAiError(result.error);
      return;
    }
    const f = result.data.fill ?? {};
    // L'IA NE PRÉFIXE PAS sur ce que l'utilisateur a déjà saisi (USER-WINS) :
    // on ne remplit QUE les champs vides.
    const merged: CharacterVisualFormValue = { ...value };
    (Object.keys(f) as (keyof CharacterVisualFormValue)[]).forEach((k) => {
      const incoming = (f[k] ?? "").toString().trim();
      if (incoming && !merged[k].trim()) merged[k] = incoming as never;
    });
    onChange(merged);
  }

  return (
    <div className="space-y-6">
      {/* Autofill IA */}
      {projectId ? (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Laisse l&apos;IA habiller le personnage</p>
          </div>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={2}
            placeholder="Ex : jeune samouraï taciturne, cicatrice de guerre, allure noble..."
          />
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="outline" onClick={runAiFill} disabled={aiLoading || !value.name.trim()}>
              {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Remplir par l&apos;IA
            </Button>
            <span className="text-xs text-muted-foreground">Ne remplace que les champs vides.</span>
          </div>
          {aiError ? <p className="text-xs text-red-400">{aiError}</p> : null}
        </div>
      ) : null}

      {/* Identité minimale */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nom *</Label>
          <Input value={value.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Âge</Label>
          <Input
            type="number"
            min={0}
            max={9999}
            value={value.age}
            onChange={(e) => set("age", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Sexe *</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={value.gender === "male" ? "default" : "outline"}
              size="sm"
              onClick={() => set("gender", "male")}
            >
              Homme
            </Button>
            <Button
              type="button"
              variant={value.gender === "female" ? "default" : "outline"}
              size="sm"
              onClick={() => set("gender", "female")}
            >
              Femme
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Déterminant pour l&apos;IA : silhouette, visage, proportions.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Rôle</Label>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((r) => (
              <Button
                key={r.value}
                type="button"
                variant={value.role === r.value ? "default" : "outline"}
                size="sm"
                onClick={() => set("role", r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Traits visuels */}
      <div className="space-y-4 rounded-xl border border-border/50 bg-card/30 p-4">
        <p className="text-sm font-medium">Apparence (pilote la cohérence des images)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Couleur de cheveux" value={value.hairColor} onChange={(v) => set("hairColor", v)} placeholder="noir corbeau, blond cendré..." />
          <Field label="Coupe / style de cheveux" value={value.hairStyle} onChange={(v) => set("hairStyle", v)} placeholder="mi-longs, hérissés, queue de cheval..." />
          <Field label="Couleur des yeux" value={value.eyeColor} onChange={(v) => set("eyeColor", v)} placeholder="noisette, gris acier..." />
          <Field label="Forme des yeux" value={value.eyeShape} onChange={(v) => set("eyeShape", v)} placeholder="en amande, perçants..." />
          <Field label="Teint de peau" value={value.skinTone} onChange={(v) => set("skinTone", v)} placeholder="pâle, mate, hâlée..." />
          <Field label="Forme du visage" value={value.faceShape} onChange={(v) => set("faceShape", v)} placeholder="anguleux, rond, ovale..." />
          <Field label="Morphologie / silhouette" value={value.build} onChange={(v) => set("build", v)} placeholder="athlétique, élancé, massif..." />
          <Field label="Tenue par défaut" value={value.outfit} onChange={(v) => set("outfit", v)} placeholder="manteau long noir, ceinture en cuir..." />
        </div>
        <div className="space-y-1.5">
          <Label>Marqueurs permanents (cicatrices, tatouages)</Label>
          <Textarea
            value={value.markers}
            onChange={(e) => set("markers", e.target.value)}
            rows={2}
            placeholder="Cicatrice joue gauche, tatouage tribal avant-bras droit..."
          />
          <p className="text-xs text-muted-foreground">
            Ce qui ne doit JAMAIS changer entre deux images.
          </p>
        </div>
      </div>
    </div>
  );
}
