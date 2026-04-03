"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const GENRE_PRESETS = ["dark fantasy", "seinen", "thriller", "horreur", "romance tragique", "cyberpunk"];
const FORMAT_PRESETS = ["manga", "webtoon", "roman graphique", "script uniquement"];
const RATING_PRESETS = ["GENERAL", "TEEN", "MATURE", "ADULT_RESTRICTED"] as const;
const INTENSITY_PRESETS = ["GENERAL_SAFE", "TEEN", "MATURE_DRAMA", "MATURE_VISUAL", "ADULT_EXPLICIT", "RESTRICTED_BLOCKED_VISUAL"] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [description, setDescription] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("");
  const [subGenres, setSubGenres] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  const [format, setFormat] = useState("manga");
  const [visualStyle, setVisualStyle] = useState("");
  const [contentRating, setContentRating] = useState<(typeof RATING_PRESETS)[number]>("TEEN");
  const [intensityLayer, setIntensityLayer] = useState<(typeof INTENSITY_PRESETS)[number]>("TEEN");
  const [violenceLevel, setViolenceLevel] = useState(45);
  const [romanceLevel, setRomanceLevel] = useState(20);
  const [sensualityLevel, setSensualityLevel] = useState(10);
  const [darknessLevel, setDarknessLevel] = useState(55);
  const [mysteryLevel, setMysteryLevel] = useState(50);
  const [dialogueDensity, setDialogueDensity] = useState(55);
  const [canonStrictness, setCanonStrictness] = useState(85);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSubGenre(genre: string) {
    setSubGenres((current) => (current.includes(genre) ? current.filter((value) => value !== genre) : [...current, genre]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        pitch,
        description,
        primaryGenre: primaryGenre || undefined,
        subGenres,
        tone,
        format,
        visualStyle,
        contentRating,
        intensityLayer,
        settings: {
          violenceLevel,
          romanceLevel,
          sensualityLevel,
          darknessLevel,
          mysteryLevel,
          dialogueDensity,
          canonStrictness,
        },
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Création impossible");
      return;
    }
    await res.json();
    router.push("/lab");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
        ← Dashboard
      </Link>
      <div className="rounded-[2rem] border border-border/60 bg-black/20 px-6 py-6">
        <p className="text-sm font-medium text-accent">Créer un manga</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">On va au plus simple : univers, ton, puis génération du chapitre 1.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          Le but n&apos;est pas de remplir une usine à gaz. Tu poses le concept, le style et l&apos;intensité, puis on t&apos;envoie directement vers le labo
          pour lancer le premier chapitre avec tes crédits de départ.
        </p>
      </div>
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-2xl">Nouveau manga</CardTitle>
          <CardDescription>Parcours court : concept de série, identité créative, puis paramètres avancés seulement si tu en as besoin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={step === 1 ? "default" : "outline"}>1. Concept</Badge>
              <Badge variant={step === 2 ? "default" : "outline"}>2. Style</Badge>
              <Badge variant={step === 3 ? "default" : "outline"}>3. Réglages avancés</Badge>
            </div>

            {step === 1 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="title">Titre</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pitch">Pitch vendeur</Label>
                  <Textarea id="pitch" value={pitch} onChange={(e) => setPitch(e.target.value)} rows={4} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Ambition de série</Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Genre principal</Label>
                  <Input
                    id="genre"
                    value={primaryGenre}
                    onChange={(e) => setPrimaryGenre(e.target.value)}
                    placeholder="dark fantasy, seinen…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sous-genres</Label>
                  <div className="flex flex-wrap gap-2">
                    {GENRE_PRESETS.map((genre) => (
                      <Button key={genre} type="button" variant={subGenres.includes(genre) ? "default" : "outline"} size="sm" onClick={() => toggleSubGenre(genre)}>
                        {genre}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tone">Ton narratif</Label>
                  <Input id="tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="tragique, mélancolique, brutal..." />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <div className="flex flex-wrap gap-2">
                    {FORMAT_PRESETS.map((preset) => (
                      <Button key={preset} type="button" variant={format === preset ? "default" : "outline"} size="sm" onClick={() => setFormat(preset)}>
                        {preset}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visualStyle">Style visuel principal</Label>
                  <Input
                    id="visualStyle"
                    value={visualStyle}
                    onChange={(e) => setVisualStyle(e.target.value)}
                    placeholder="gothic detailed ink, noir et blanc seinen..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Niveau d&apos;accès</Label>
                  <div className="flex flex-wrap gap-2">
                    {RATING_PRESETS.map((rating) => (
                      <Button key={rating} type="button" variant={contentRating === rating ? "default" : "outline"} size="sm" onClick={() => setContentRating(rating)}>
                        {rating}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Intensité visuelle / narrative</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTENSITY_PRESETS.map((layer) => (
                      <Button key={layer} type="button" variant={intensityLayer === layer ? "default" : "outline"} size="sm" onClick={() => setIntensityLayer(layer)}>
                        {layer}
                      </Button>
                    ))}
                  </div>
                </div>
                {(contentRating === "ADULT_RESTRICTED" || intensityLayer === "ADULT_EXPLICIT") ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-sm text-amber-200">
                    Le contenu adulte doit rester explicitement assumé, réservé aux adultes vérifiés et cohérent avec les règles de modération.
                  </div>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                {[
                  ["Violence", violenceLevel, setViolenceLevel],
                  ["Romance", romanceLevel, setRomanceLevel],
                  ["Sensualité", sensualityLevel, setSensualityLevel],
                  ["Noirceur", darknessLevel, setDarknessLevel],
                  ["Mystère", mysteryLevel, setMysteryLevel],
                  ["Densité dialogues", dialogueDensity, setDialogueDensity],
                  ["Canon strictness", canonStrictness, setCanonStrictness],
                ].map(([label, value, setter]) => (
                  <div key={label as string} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Label>{label as string}</Label>
                      <span className="text-muted-foreground">{value as number}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={value as number}
                      onChange={(e) => (setter as (next: number) => void)(Number(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={step === 1 || loading} className="w-full" onClick={() => setStep((current) => Math.max(1, current - 1))}>
                Retour
              </Button>
              {step < 3 ? (
                <Button type="button" disabled={loading || !title.trim()} className="w-full" onClick={() => setStep((current) => Math.min(3, current + 1))}>
                  Continuer
                </Button>
              ) : (
                  <Button type="submit" disabled={loading || !title.trim()} className="w-full">
                  {loading ? "Création…" : "Créer le projet et ouvrir le labo"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
