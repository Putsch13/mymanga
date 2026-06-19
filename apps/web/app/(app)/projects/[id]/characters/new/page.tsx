"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterVisualConfig } from "@/components/characters/character-visual-config";
import { CharacterBodyConfig } from "@/components/characters/character-body-config";
import { CharacterWardrobeConfig } from "@/components/characters/character-wardrobe-config";
import { CharacterSpeechConfig } from "@/components/characters/character-speech-config";
import { CharacterCanonLocks } from "@/components/characters/character-canon-locks";
import { CharacterPreviewCard } from "@/components/characters/character-preview-card";

export default function NewCharacterPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const returnToRaw = searchParams.get("returnTo");

  // Identité
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [biography, setBiography] = useState("");
  const [age, setAge] = useState("");
  const [adultVerified, setAdultVerified] = useState(false);
  const [objective, setObjective] = useState("");
  const [fear, setFear] = useState("");
  const [trauma, setTrauma] = useState("");
  const [emotionalState, setEmotionalState] = useState("");
  const [traits, setTraits] = useState("");
  const [flaws, setFlaws] = useState("");
  const [appearance, setAppearance] = useState("");

  // Profils avancés
  const [visualProfile, setVisualProfile] = useState<Record<string, unknown>>({});
  const [bodyState, setBodyState] = useState<Record<string, unknown>>({});
  const [wardrobeProfile, setWardrobeProfile] = useState<Record<string, unknown>>({});
  const [speechProfile, setSpeechProfile] = useState<Record<string, unknown>>({});
  const [continuityProfile, setContinuityProfile] = useState<Record<string, unknown>>({});
  const [adultContentProfile] = useState<Record<string, unknown>>({});

  const [loading, setLoading] = useState(false);
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdult = adultVerified && Number(age) >= 18;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const ageNum = age ? Number(age) : undefined;

    const result = await safeFetch<{ character: { id: string } }>(`/api/projects/${id}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        roleType: roleType || undefined,
        gender: gender || undefined,
        biography: biography || undefined,
        age: ageNum,
        adultVerified,
        objective: objective || undefined,
        fear: fear || undefined,
        trauma: trauma || undefined,
        emotionalState: emotionalState || undefined,
        appearance: appearance || undefined,
        hairColor: (visualProfile.hairColor as string) || undefined,
        eyeColor: (visualProfile.eyeColor as string) || undefined,
        outfitDefault: (wardrobeProfile.defaultOutfit as string) || undefined,
        traits: traits.split(",").map((v) => v.trim()).filter(Boolean),
        flaws: flaws.split(",").map((v) => v.trim()).filter(Boolean),
        visualProfile,
        bodyState,
        wardrobeProfile,
        speechProfile,
        continuityProfile,
        adultContentProfile,
      }),
    });

    setLoading(false);
    if (result.ok) {
      const characterId = result.data.character.id;

      // Générer automatiquement le visuel si des infos visuelles sont disponibles
      const hasVisualInfo = name || appearance || (visualProfile.hairColor as string) || (visualProfile.eyeColor as string);
      if (hasVisualInfo) {
        setGeneratingVisual(true);
        // Génération en arrière-plan — on n'attend pas pour rediriger
        safeFetch(`/api/characters/${characterId}/generate-visual`, { method: "POST" })
          .catch(() => { /* silencieux — le visuel peut être généré plus tard */ });
        // Petit délai pour que la génération démarre avant la redirection
        await new Promise((r) => setTimeout(r, 800));
        setGeneratingVisual(false);
      }

      const safeReturn =
        returnToRaw
        && returnToRaw.startsWith("/")
        && !returnToRaw.startsWith("//")
        && !returnToRaw.includes("://")
          ? returnToRaw
          : null;

      if (safeReturn) {
        router.push(safeReturn);
      } else if (isOnboarding) {
        try {
          const res = await fetch(`/api/projects/${id}/chapters`, { cache: "no-store" });
          const data = (await res.json()) as { chapters?: Array<{ id: string; chapterNumber: number }> };
          const sorted = [...(data.chapters ?? [])].sort((a, b) => a.chapterNumber - b.chapterNumber);
          const first = sorted[0];
          router.push(first ? `/projects/${id}/chapters/${first.id}/edit` : `/projects/${id}/chapters/new`);
        } catch {
          router.push(`/projects/${id}/chapters`);
        }
      } else {
        router.push(`/projects/${id}/characters/${characterId}`);
      }
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="space-y-6">
      {isOnboarding && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4">
          <p className="text-sm font-medium text-foreground">Étape 2/3 — Crée ton premier personnage</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Remplis au minimum : nom, couleur de cheveux, couleur des yeux et tenue. Ces 4 champs suffisent pour générer des images cohérentes. Tu pourras enrichir la fiche plus tard.
          </p>
          <div className="mt-2 flex gap-2">
            <Link href={`/projects/${id}/chapters`} className="text-xs text-muted-foreground underline hover:text-foreground">
              Passer et ouvrir les chapitres →
            </Link>
          </div>
        </div>
      )}
      <div>
        <Link href={`/projects/${id}/characters`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Personnages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nouveau personnage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure chaque aspect pour une continuité narrative et visuelle parfaite.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Tabs defaultValue="identity">
            <TabsList className="w-full flex-wrap h-auto gap-1">
              <TabsTrigger value="identity">Identité</TabsTrigger>
              <TabsTrigger value="visual">Visage</TabsTrigger>
              <TabsTrigger value="body">Corps</TabsTrigger>
              <TabsTrigger value="wardrobe">Tenue</TabsTrigger>
              <TabsTrigger value="speech">Voix</TabsTrigger>
              <TabsTrigger value="canon">Canon</TabsTrigger>
            </TabsList>

            {/* IDENTITÉ */}
            <TabsContent value="identity">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle>Identité</CardTitle>
                  <CardDescription>Informations de base, biographie et psychologie.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Nom *</Label>
                      <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                  <div className="space-y-1.5">
                    <Label>Sexe *</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={gender === "male" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setGender("male")}
                      >
                        Homme
                      </Button>
                      <Button
                        type="button"
                        variant={gender === "female" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setGender("female")}
                      >
                        Femme
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Hyper important pour l’IA (silhouette, visage, vêtements, proportions).</p>
                  </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="role">Rôle</Label>
                      <Input id="role" value={roleType} onChange={(e) => setRoleType(e.target.value)} placeholder="Héros, antagoniste, secondaire..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="age">Âge</Label>
                      <Input id="age" type="number" min={0} max={9999} value={age} onChange={(e) => setAge(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emotion">État émotionnel actuel</Label>
                      <Input id="emotion" value={emotionalState} onChange={(e) => setEmotionalState(e.target.value)} placeholder="Glacé, euphorique, sur le fil..." />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={adultVerified}
                      onChange={(e) => setAdultVerified(e.target.checked)}
                      className="rounded"
                    />
                    <span>Adulte explicitement vérifié (18+)</span>
                    {adultVerified && Number(age) < 18 && (
                      <span className="text-xs text-red-400">⚠ Âge insuffisant</span>
                    )}
                  </label>

                  <div className="space-y-1.5">
                    <Label htmlFor="bio">Biographie</Label>
                    <Textarea id="bio" value={biography} onChange={(e) => setBiography(e.target.value)} rows={4} placeholder="Origines, passé, événements marquants..." />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="objective">Objectif</Label>
                      <Textarea id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fear">Peur principale</Label>
                      <Textarea id="fear" value={fear} onChange={(e) => setFear(e.target.value)} rows={3} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="trauma">Trauma</Label>
                    <Input id="trauma" value={trauma} onChange={(e) => setTrauma(e.target.value)} placeholder="Événement fondateur..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="appearance">Description physique générale</Label>
                    <Textarea id="appearance" value={appearance} onChange={(e) => setAppearance(e.target.value)} rows={3} placeholder="Grand, mince, regard perçant, cicatrice joue gauche..." />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="traits">Traits dominants</Label>
                      <Input id="traits" value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="loyal, impulsif, calculateur" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="flaws">Défauts</Label>
                      <Input id="flaws" value={flaws} onChange={(e) => setFlaws(e.target.value)} placeholder="orgueilleux, jaloux, brutal" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* VISAGE */}
            <TabsContent value="visual">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle>Visage & Apparence</CardTitle>
                  <CardDescription>Traits visuels précis pour la cohérence des images générées.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CharacterVisualConfig
                    value={visualProfile as Parameters<typeof CharacterVisualConfig>[0]["value"]}
                    onChange={(v) => setVisualProfile(v as Record<string, unknown>)}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* CORPS */}
            <TabsContent value="body">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle>Morphologie & État physique</CardTitle>
                  <CardDescription>Membres, blessures, état canon. Tout changement persiste.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CharacterBodyConfig
                    value={bodyState as Parameters<typeof CharacterBodyConfig>[0]["value"]}
                    onChange={(v) => setBodyState(v as Record<string, unknown>)}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* TENUE */}
            <TabsContent value="wardrobe">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle>Garde-robe</CardTitle>
                  <CardDescription>Tenues, accessoires, style vestimentaire.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CharacterWardrobeConfig
                    value={wardrobeProfile as Parameters<typeof CharacterWardrobeConfig>[0]["value"]}
                    onChange={(v) => setWardrobeProfile(v as Record<string, unknown>)}
                    isAdult={isAdult}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* VOIX */}
            <TabsContent value="speech">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle>Personnalité & Voix</CardTitle>
                  <CardDescription>Style de dialogue, manières de parler, de menacer, de séduire.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CharacterSpeechConfig
                    value={speechProfile as Parameters<typeof CharacterSpeechConfig>[0]["value"]}
                    onChange={(v) => setSpeechProfile(v as Record<string, unknown>)}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* CANON */}
            <TabsContent value="canon">
              <Card className="border-border/60 bg-card/50">
                <CardHeader>
                  <CardTitle>Verrous Canon</CardTitle>
                  <CardDescription>Traits qui ne peuvent jamais dériver sans événement narratif explicite.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CharacterCanonLocks
                    value={continuityProfile as Parameters<typeof CharacterCanonLocks>[0]["value"]}
                    onChange={(v) => setContinuityProfile(v as Record<string, unknown>)}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={loading || generatingVisual || !name || !gender} className="w-full">
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création…</>
            ) : generatingVisual ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Génération du visuel…</>
            ) : (
              "Créer le personnage"
            )}
          </Button>
        </div>

        {/* Aperçu */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Aperçu</h3>
          <CharacterPreviewCard
            name={name || "Nom du personnage"}
            roleType={roleType}
            age={age ? Number(age) : undefined}
            adultVerified={adultVerified}
            appearance={appearance}
            hairColor={(visualProfile.hairColor as string) || undefined}
            eyeColor={(visualProfile.eyeColor as string) || undefined}
            outfitDefault={(wardrobeProfile.defaultOutfit as string) || undefined}
            bodyState={bodyState}
          />
        </div>
      </form>
    </div>
  );
}
