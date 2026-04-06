"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

// Genres organisés par famille
const GENRE_FAMILIES = [
  {
    label: "Action / Aventure",
    genres: ["shōnen", "action", "aventure", "fantasy", "dark fantasy", "isekai"],
  },
  {
    label: "Drame / Seinen",
    genres: ["seinen", "drame", "psychologique", "thriller", "mystère", "horreur"],
  },
  {
    label: "Romance / Slice of life",
    genres: ["shōjo", "romance", "romance tragique", "slice of life", "comédie"],
  },
  {
    label: "Sci-Fi / Cyberpunk",
    genres: ["cyberpunk", "sci-fi", "post-apocalyptique", "mecha"],
  },
];

const TONE_PRESETS = ["sombre et brutal", "mélancolique", "épique", "humoristique", "romantique", "oppressant", "mystérieux"];
const VISUAL_PRESETS = [
  "encre noire détaillée, style seinen",
  "lignes fines shōnen, dynamique",
  "aquarelle douce, shōjo",
  "cyberpunk neon, Masamune Shirow",
  "horreur sombre, Junji Ito",
  "trait épuré, minimaliste",
];
const FORMAT_PRESETS = ["manga", "webtoon", "roman graphique"];
const RATING_PRESETS = ["GENERAL", "TEEN", "MATURE", "ADULT_RESTRICTED"] as const;
const INTENSITY_PRESETS = [
  { key: "GENERAL_SAFE", label: "Tout public" },
  { key: "TEEN", label: "Ado" },
  { key: "MATURE_DRAMA", label: "Mature (drame)" },
  { key: "MATURE_VISUAL", label: "Mature (visuel)" },
  { key: "ADULT_EXPLICIT", label: "Adulte explicite" },
] as const;

type IntensityKey = (typeof INTENSITY_PRESETS)[number]["key"];
type RatingKey = (typeof RATING_PRESETS)[number];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Étape 1 — Concept
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [description, setDescription] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("");
  const [subGenres, setSubGenres] = useState<string[]>([]);

  // Étape 2 — Style & ton
  const [tone, setTone] = useState("");
  const [format, setFormat] = useState("manga");
  const [visualStyle, setVisualStyle] = useState("");
  const [contentRating, setContentRating] = useState<RatingKey>("TEEN");
  const [intensityLayer, setIntensityLayer] = useState<IntensityKey>("TEEN");

  // Étape 3 — Réglages fins (optionnels)
  const [violenceLevel, setViolenceLevel] = useState(45);
  const [romanceLevel, setRomanceLevel] = useState(20);
  const [sensualityLevel, setSensualityLevel] = useState(10);
  const [darknessLevel, setDarknessLevel] = useState(55);
  const [mysteryLevel, setMysteryLevel] = useState(50);
  const [dialogueDensity, setDialogueDensity] = useState(55);
  const [canonStrictness, setCanonStrictness] = useState(85);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Label>{label}</Label>
          <span className="tabular-nums text-muted-foreground">{value}/100</span>
        </div>
        <Slider min={0} max={100} step={1} value={[value]} onValueChange={([v]) => onChange(v ?? value)} />
      </div>
    );
  }

  function toggleSubGenre(genre: string) {
    setSubGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
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
        settings: { violenceLevel, romanceLevel, sensualityLevel, darknessLevel, mysteryLevel, dialogueDensity, canonStrictness },
      }),
    });
    setLoading(false);
    if (!res.ok) { setError("Création impossible"); return; }
    const data = await res.json();
    // Rediriger vers la création du premier personnage — un chapitre sans personnage est pauvre
    router.push(`/projects/${data.project.id}/characters/new?onboarding=1`);
  }

  const canContinue = title.trim().length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Dashboard</Link>

      <div className="rounded-[2rem] border border-border/60 bg-black/20 px-6 py-6">
        <p className="text-sm font-medium text-accent">Créer un manga</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Concept → Style → Génération
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Trois étapes courtes. Pose le concept, choisis le style, lance le chapitre 1.
        </p>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-xl">Nouveau manga</CardTitle>
          <CardDescription>
            Étape {step}/3 —{" "}
            {step === 1 ? "Concept & genre" : step === 2 ? "Style & ton" : "Réglages fins (optionnel)"}
          </CardDescription>
          <div className="flex gap-2 pt-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${n <= step ? "bg-primary" : "bg-border/40"}`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">

            {/* ── ÉTAPE 1 : Concept ─────────────────────────────────────────── */}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="title">Titre *</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Les Cendres de Lyra" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pitch">Pitch (1-2 phrases)</Label>
                  <Textarea id="pitch" value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3}
                    placeholder="Dans un monde où la magie est interdite, une jeune rebelle découvre qu'elle en est la dernière gardienne." />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Ambition de série <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="Arcs prévus, thèmes profonds, fin envisagée…" />
                </div>

                <div className="space-y-2">
                  <Label>Genre principal</Label>
                  <Input
                    value={primaryGenre}
                    onChange={(e) => setPrimaryGenre(e.target.value)}
                    placeholder="Tape ou clique ci-dessous"
                  />
                  <div className="space-y-3 pt-1">
                    {GENRE_FAMILIES.map((family) => (
                      <div key={family.label}>
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{family.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {family.genres.map((genre) => {
                            const isPrimary = primaryGenre === genre;
                            const isSub = subGenres.includes(genre);
                            return (
                              <button
                                key={genre}
                                type="button"
                                onClick={() => {
                                  if (isPrimary) {
                                    setPrimaryGenre("");
                                  } else if (isSub) {
                                    setSubGenres((prev) => prev.filter((g) => g !== genre));
                                  } else if (!primaryGenre) {
                                    setPrimaryGenre(genre);
                                  } else {
                                    toggleSubGenre(genre);
                                  }
                                }}
                                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                                  isPrimary
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : isSub
                                      ? "border-primary/50 bg-primary/15 text-primary"
                                      : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                }`}
                              >
                                {genre}
                                {isPrimary ? " ★" : isSub ? " +" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(primaryGenre || subGenres.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {primaryGenre && <Badge className="bg-primary/20 text-primary border-primary/30">★ {primaryGenre}</Badge>}
                      {subGenres.map((g) => <Badge key={g} variant="outline" className="text-xs">+ {g}</Badge>)}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── ÉTAPE 2 : Style & ton ─────────────────────────────────────── */}
            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Ton narratif</Label>
                  <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Ex : sombre et brutal" />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {TONE_PRESETS.map((t) => (
                      <button key={t} type="button"
                        onClick={() => setTone(t)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          tone === t ? "border-primary bg-primary/20 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Format</Label>
                  <div className="flex flex-wrap gap-2">
                    {FORMAT_PRESETS.map((f) => (
                      <Button key={f} type="button" variant={format === f ? "default" : "outline"} size="sm" onClick={() => setFormat(f)}>{f}</Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Style visuel</Label>
                  <Input value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} placeholder="Ex : encre noire détaillée, style seinen" />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {VISUAL_PRESETS.map((v) => (
                      <button key={v} type="button"
                        onClick={() => setVisualStyle(v)}
                        className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                          visualStyle === v ? "border-primary bg-primary/20 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >{v}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Niveau de contenu</Label>
                  <div className="flex flex-wrap gap-2">
                    {RATING_PRESETS.map((r) => (
                      <Button key={r} type="button" variant={contentRating === r ? "default" : "outline"} size="sm" onClick={() => setContentRating(r)}>{r}</Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Intensité visuelle / narrative</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTENSITY_PRESETS.map(({ key, label }) => (
                      <Button key={key} type="button" variant={intensityLayer === key ? "default" : "outline"} size="sm"
                        onClick={() => setIntensityLayer(key)}>{label}</Button>
                    ))}
                  </div>
                </div>

                {(contentRating === "ADULT_RESTRICTED" || intensityLayer === "ADULT_EXPLICIT") && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-sm text-amber-200">
                    Contenu adulte : réservé aux utilisateurs vérifiés 18+. Reste cohérent avec les règles de modération.
                  </div>
                )}
              </>
            )}

            {/* ── ÉTAPE 3 : Réglages fins ───────────────────────────────────── */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Ces curseurs ajustent le ton de ton manga. Les valeurs par défaut conviennent dans la plupart des cas.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setViolenceLevel(45);
                      setRomanceLevel(20);
                      setSensualityLevel(10);
                      setDarknessLevel(55);
                      setMysteryLevel(50);
                      setDialogueDensity(55);
                      setCanonStrictness(85);
                    }}
                    className="ml-4 shrink-0 rounded-lg border border-border/50 bg-background/40 px-3 py-1 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                  >
                    Réinitialiser
                  </button>
                </div>
                <SliderField label="Violence" value={violenceLevel} onChange={setViolenceLevel} />
                <SliderField label="Romance" value={romanceLevel} onChange={setRomanceLevel} />
                <SliderField label="Sensualité" value={sensualityLevel} onChange={setSensualityLevel} />
                <SliderField label="Noirceur" value={darknessLevel} onChange={setDarknessLevel} />
                <SliderField label="Mystère" value={mysteryLevel} onChange={setMysteryLevel} />
                <SliderField label="Densité dialogues" value={dialogueDensity} onChange={setDialogueDensity} />
                <SliderField label="Fidélité à l'histoire" value={canonStrictness} onChange={setCanonStrictness} />
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2 pt-2">
              {step > 1 && (
                <Button type="button" variant="outline" className="w-full" disabled={loading}
                  onClick={() => setStep((s) => Math.max(1, s - 1))}>
                  Retour
                </Button>
              )}
              {step < 3 ? (
                <Button type="button" className="w-full" disabled={!canContinue || loading}
                  onClick={() => setStep((s) => Math.min(3, s + 1))}>
                  Continuer
                </Button>
              ) : (
                <Button type="submit" className="w-full" disabled={!canContinue || loading}>
                  {loading ? "Création…" : "Créer et lancer le chapitre 1"}
                </Button>
              )}
            </div>

            {step === 2 && (
              <p className="text-center text-xs text-muted-foreground">
                Tu peux passer l&apos;étape 3 — les réglages avancés sont optionnels.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
