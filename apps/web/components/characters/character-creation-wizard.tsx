"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, Loader2, Sparkles, User, Palette, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { safeFetch } from "@/lib/safe-fetch";

interface CharacterCreationWizardProps {
  projectId: string;
  onComplete?: (characterId: string) => void;
}

const ROLE_OPTIONS = [
  { value: "HERO", label: "Héros principal" },
  { value: "SECONDARY_CORE", label: "Personnage secondaire" },
  { value: "ANTAGONIST", label: "Antagoniste" },
  { value: "MENTOR", label: "Mentor" },
  { value: "SUPPORT", label: "Soutien" },
  { value: "RECURRING_NPC", label: "PNJ récurrent" },
];

const HAIR_COLOR_OPTIONS = [
  "Noir", "Brun", "Châtain", "Blond", "Roux", "Blanc", "Gris",
  "Bleu", "Violet", "Rose", "Rouge", "Vert", "Argenté",
];

const EYE_COLOR_OPTIONS = [
  "Marron", "Noisette", "Vert", "Bleu", "Gris", "Violet",
  "Rouge", "Doré", "Noir", "Hétérochromie",
];

const OUTFIT_OPTIONS = [
  "Uniforme scolaire", "Tenue de combat", "Vêtements décontractés",
  "Armure", "Kimono", "Costume moderne", "Tenue traditionnelle",
  "Vêtements déchirés/usés", "Tenue futuriste", "Cape et robe",
];

const TRAIT_CHIPS = [
  "Courageux", "Intelligent", "Impulsif", "Loyal", "Mystérieux",
  "Sarcastique", "Optimiste", "Sombre", "Protecteur", "Ambitieux",
  "Naïf", "Rusé", "Stoïque", "Charismatique", "Solitaire",
  "Curieux", "Vengeur", "Généreux", "Méfiant", "Déterminé",
];

const STEPS = [
  { id: 1, label: "Identité", icon: User },
  { id: 2, label: "Apparence", icon: Palette },
  { id: 3, label: "Personnalité", icon: Heart },
];

export function CharacterCreationWizard({ projectId, onComplete }: CharacterCreationWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape 1 : Identité
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");

  // Étape 2 : Apparence
  const [appearance, setAppearance] = useState("");
  const [hairColor, setHairColor] = useState("");
  const [eyeColor, setEyeColor] = useState("");
  const [outfit, setOutfit] = useState("");

  // Étape 3 : Personnalité
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [objective, setObjective] = useState("");
  const [fear, setFear] = useState("");

  function toggleTrait(trait: string) {
    setSelectedTraits((prev) =>
      prev.includes(trait)
        ? prev.filter((t) => t !== trait)
        : prev.length < 3
          ? [...prev, trait]
          : prev,
    );
  }

  function canProceedStep1() {
    return name.trim().length >= 2 && roleType !== "";
  }

  function canProceedStep2() {
    return hairColor !== "" && eyeColor !== "";
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const result = await safeFetch<{ character: { id: string } }>(
      `/api/projects/${projectId}/characters`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          roleType: roleType || undefined,
          gender: gender || undefined,
          age: age ? Number(age) : undefined,
          appearance: appearance || undefined,
          objective: objective || undefined,
          fear: fear || undefined,
          traits: selectedTraits,
          hairColor: hairColor || undefined,
          eyeColor: eyeColor || undefined,
          outfitDefault: outfit || undefined,
          visualProfile: {
            hairColor: hairColor || undefined,
            eyeColor: eyeColor || undefined,
          },
          wardrobeProfile: outfit ? { defaultOutfit: outfit } : {},
        }),
      },
    );

    if (!result.ok) {
      setLoading(false);
      setError(result.error ?? "Erreur lors de la création");
      return;
    }

    const characterId = result.data.character.id;

    // Générer le visuel en arrière-plan
    const hasVisualInfo = hairColor || eyeColor || appearance;
    if (hasVisualInfo) {
      setGeneratingVisual(true);
      safeFetch(`/api/characters/${characterId}/generate-visual`, { method: "POST" }).catch(() => null);
      await new Promise((r) => setTimeout(r, 600));
      setGeneratingVisual(false);
    }

    setLoading(false);

    if (onComplete) {
      onComplete(characterId);
    } else {
      router.push(`/projects/${projectId}/characters/${characterId}`);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isDone = s.id < step;
          return (
            <div key={s.id} className="flex flex-1 items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : isDone
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-border/50 text-muted-foreground"
              }`}>
                {isDone ? "✓" : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`ml-auto h-px flex-1 ${isDone ? "bg-emerald-500/30" : "bg-border/40"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Étape 1 : Identité */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Qui est ce personnage ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Les informations de base pour créer la fiche.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du personnage *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Ryūji Tanaka, Aria Voss…"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Rôle *</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRoleType(r.value)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors ${
                      roleType === r.value
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-border/60 hover:border-accent/30"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Âge</Label>
                <Input
                  id="age"
                  type="number"
                  min={1}
                  max={999}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Ex : 17"
                />
              </div>

              <div className="space-y-2">
                <Label>Genre</Label>
                <div className="flex gap-2">
                  {(["male", "female", "other"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                        gender === g
                          ? "border-accent/60 bg-accent/10 text-accent"
                          : "border-border/60 hover:border-accent/30"
                      }`}
                    >
                      {g === "male" ? "M" : g === "female" ? "F" : "Autre"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Étape 2 : Apparence */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">À quoi ressemble-t-il/elle ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ces infos servent directement à la génération d&apos;images.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Couleur de cheveux *</Label>
              <div className="flex flex-wrap gap-2">
                {HAIR_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setHairColor(c)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      hairColor === c
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-border/60 hover:border-accent/30"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Couleur des yeux *</Label>
              <div className="flex flex-wrap gap-2">
                {EYE_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEyeColor(c)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      eyeColor === c
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-border/60 hover:border-accent/30"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tenue principale</Label>
              <div className="flex flex-wrap gap-2">
                {OUTFIT_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOutfit(outfit === o ? "" : o)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      outfit === o
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-border/60 hover:border-accent/30"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appearance">Description libre (optionnel)</Label>
              <Textarea
                id="appearance"
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                placeholder="Ex : Grand, cicatrice sur la joue gauche, regard perçant…"
                rows={3}
              />
            </div>
          </div>
        </div>
      )}

      {/* Étape 3 : Personnalité */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Quelle est sa personnalité ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisis jusqu&apos;à 3 traits. Ils guident la narration IA.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Traits de caractère
                {selectedTraits.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">({selectedTraits.length}/3)</span>
                )}
              </Label>
              <div className="flex flex-wrap gap-2">
                {TRAIT_CHIPS.map((t) => {
                  const isSelected = selectedTraits.includes(t);
                  const isDisabled = !isSelected && selectedTraits.length >= 3;
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => toggleTrait(t)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                        isSelected
                          ? "border-accent/60 bg-accent/10 text-accent"
                          : "border-border/60 hover:border-accent/30"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="objective">Objectif principal</Label>
              <Input
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Ex : Venger sa famille, devenir le plus fort…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fear">Plus grande peur</Label>
              <Input
                id="fear"
                value={fear}
                onChange={(e) => setFear(e.target.value)}
                placeholder="Ex : Perdre ceux qu'il aime, la trahison…"
              />
            </div>
          </div>

          {/* Récap */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Récapitulatif</p>
            <div className="space-y-1">
              <p><span className="text-foreground">{name}</span> · {ROLE_OPTIONS.find((r) => r.value === roleType)?.label ?? roleType}</p>
              {age && <p>Âge : {age} ans · Genre : {gender === "male" ? "Masculin" : gender === "female" ? "Féminin" : "Autre"}</p>}
              {(hairColor || eyeColor) && (
                <p>Cheveux {hairColor} · Yeux {eyeColor}{outfit ? ` · ${outfit}` : ""}</p>
              )}
              {selectedTraits.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {selectedTraits.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour
          </Button>
        )}

        {step < 3 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 1 ? !canProceedStep1() : !canProceedStep2()}
            className="ml-auto gap-1.5"
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || generatingVisual}
            className="ml-auto gap-1.5"
          >
            {loading || generatingVisual ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {generatingVisual ? "Génération du visuel…" : "Création…"}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Créer le personnage
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
