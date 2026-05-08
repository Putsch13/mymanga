"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FieldTooltip } from "@/components/ui/field-tooltip";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

// Genres avec emoji pour l'affichage visuel
const GENRE_CARDS = [
  { emoji: "⚔️", label: "Shōnen", value: "shōnen" },
  { emoji: "🌆", label: "Seinen", value: "seinen" },
  { emoji: "💕", label: "Romance", value: "shōjo" },
  { emoji: "🌀", label: "Isekai", value: "isekai" },
  { emoji: "⚙️", label: "Mecha", value: "mecha" },
  { emoji: "🔮", label: "Horreur", value: "horreur" },
  { emoji: "🏃", label: "Sport", value: "sport" },
  { emoji: "🏥", label: "Médical", value: "médical" },
  { emoji: "🗡️", label: "Fantasy", value: "fantasy" },
  { emoji: "🔬", label: "Sci-Fi", value: "sci-fi" },
  { emoji: "🕵️", label: "Mystère", value: "mystère" },
  { emoji: "💀", label: "Dark / Gore", value: "dark fantasy" },
];

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
    label: "Sci-Fi / Cyberpunk / Sport",
    genres: ["cyberpunk", "sci-fi", "post-apocalyptique", "mecha", "sport", "médical"],
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
// Sprint 1 — Reader refacto : on ne garde que les formats officiellement
// supportés par le reader. "roman graphique" était proposé mais sans aucun
// chemin de lecture dédié (tombait en manga par défaut). Pour éviter la
// confusion produit, on le retire du preset. Les projets existants avec
// `format="roman graphique"` en DB continuent de fonctionner (le reader
// les lit comme du manga) mais on ne l'expose plus à la création.
//
// ARCH-3 — Le format "simple" (storyboard rapide, 1 panel/page, style
// sketch/aquarelle) est désormais supporté nativement par le pipeline.
const FORMAT_PRESETS = ["manga", "webtoon", "simple"] as const;
const FORMAT_LABELS: Record<(typeof FORMAT_PRESETS)[number], string> = {
  manga: "manga",
  webtoon: "webtoon",
  simple: "simple (storyboard)",
};
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
    if (!res.ok) { setLoading(false); setError("Création impossible"); return; }
    const data = await res.json();
    const projectId = data.project.id as string;

    // Créer automatiquement le chapitre 1 et rediriger vers le studio
    const chapterRes = await fetch(`/api/projects/${projectId}/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Chapitre 1",
        userIntent: pitch || undefined,
        studioDraft: {
          intent: {
            chapterNumber: 1,
            workingTitle: "Chapitre 1",
            shortPitch: pitch || "",
            arcPosition: "",
            emotionalGoal: "",
            mainConflict: "",
            endingMode: null,
            arcImportance: null,
          },
        },
      }),
    });
    setLoading(false);
    if (!chapterRes.ok) {
      // Si la création du chapitre échoue, rediriger quand même vers le projet
      router.push(`/projects/${projectId}`);
      return;
    }
    const chapterData = await chapterRes.json();
    const chapterId = chapterData.chapter.id as string;
    router.push(`/projects/${projectId}/chapters/${chapterId}/edit?onboarding=1&firstChapter=1`);
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
            {step === 1 ? "Étape 1/3 — Ton concept & genre" : step === 2 ? "Étape 2/3 — Style visuel & ton" : "Étape 3/3 — Réglages fins (optionnel)"}
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
                  <div className="flex items-center gap-1">
                    <Label htmlFor="title">Titre *</Label>
                    <FieldTooltip
                      text="Le titre public de ton manga. Il apparaît sur le projet et peut évoluer."
                      example="Les Cendres de Lyra"
                    />
                  </div>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Les Cendres de Lyra" required />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="pitch">Pitch (1-2 phrases)</Label>
                    <FieldTooltip
                      text="En une ou deux phrases, résume l’accroche et le conflit central de l’histoire."
                      example="Dans une cité flottante, une apprentie ingénieure découvre que les dieux sont une imposture."
                    />
                  </div>
                  <Textarea id="pitch" value={pitch} onChange={(e) => setPitch(e.target.value)} rows={3}
                    placeholder="Dans un monde où la magie est interdite, une jeune rebelle découvre qu'elle en est la dernière gardienne." />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Ambition de série <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="Arcs prévus, thèmes profonds, fin envisagée…" />
                </div>

                <div className="space-y-3">
                  <Label>Genre principal</Label>
                  {/* Grid visuelle de genres avec emoji */}
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {GENRE_CARDS.map(({ emoji, label, value }) => {
                      const isPrimary = primaryGenre === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPrimaryGenre(isPrimary ? "" : value)}
                          className={`card-manga flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                            isPrimary
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          <span className="text-xl">{emoji}</span>
                          <span className="text-xs font-medium leading-tight">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Ou saisie libre */}
                  <Input
                    value={primaryGenre}
                    onChange={(e) => setPrimaryGenre(e.target.value)}
                    placeholder="Autre genre… (saisie libre)"
                    className="mt-1"
                  />
                  {/* Sous-genres */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-medium text-muted-foreground">Sous-genres (optionnel)</p>
                    {GENRE_FAMILIES.map((family) => (
                      <div key={family.label}>
                        <p className="mb-1 text-[11px] text-muted-foreground/60">{family.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {family.genres.map((genre) => {
                            const isSub = subGenres.includes(genre) && primaryGenre !== genre;
                            return (
                              <button
                                key={genre}
                                type="button"
                                onClick={() => {
                                  if (genre === primaryGenre) return;
                                  toggleSubGenre(genre);
                                }}
                                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                                  isSub
                                    ? "border-primary/50 bg-primary/15 text-primary"
                                    : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                }`}
                              >
                                {genre}{isSub ? " ✓" : ""}
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
                  <div className="flex items-center gap-1">
                    <Label>Ton narratif</Label>
                    <FieldTooltip
                      text="L’ambiance générale des dialogues et de la narration (sérieux, léger, oppressant…)."
                      example="Sombre et brutal / Mélancolique et poétique"
                    />
                  </div>
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
                      <Button
                        key={f}
                        type="button"
                        variant={format === f ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFormat(f)}
                      >
                        {FORMAT_LABELS[f]}
                      </Button>
                    ))}
                  </div>
                  {format === "simple" ? (
                    <p className="text-xs text-muted-foreground">
                      Mode storyboard rapide : 1 case par page, style sketch
                      à l’aquarelle, sous-titres sous l’image. Idéal pour
                      brainstormer avant la version finale.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label>Style visuel</Label>
                    <FieldTooltip
                      text="Les références visuelles pour guider la génération d’images (trait, encrage, références d’artistes…)."
                      example="Encre noire détaillée, style seinen / Aquarelle douce, shōjo"
                    />
                  </div>
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
                {/* Récap du projet */}
                <div className="rounded-xl border border-border/50 bg-card/30 p-4 space-y-1.5">
                  <p className="text-sm font-medium">{title || "Sans titre"}</p>
                  {primaryGenre && <p className="text-xs text-muted-foreground">Genre : {primaryGenre}{subGenres.length > 0 ? ` + ${subGenres.join(", ")}` : ""}</p>}
                  {tone && <p className="text-xs text-muted-foreground">Ton : {tone}</p>}
                  {format && <p className="text-xs text-muted-foreground">Format : {format}</p>}
                  {pitch && <p className="text-xs text-muted-foreground line-clamp-2 italic">&ldquo;{pitch}&rdquo;</p>}
                </div>
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
              <button
                type="button"
                onClick={onSubmit as unknown as React.MouseEventHandler}
                disabled={!canContinue || loading}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1 disabled:opacity-40"
              >
                Passer les réglages avancés et créer directement →
              </button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
