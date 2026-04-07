"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Wand2 } from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";

type CharacterPayload = {
  id: string;
  projectId?: string;
  name: string;
  roleType: string | null;
  gender: "male" | "female" | null;
  biography: string | null;
  age: number | null;
  adultVerified: boolean;
  objective: string | null;
  fear: string | null;
  trauma: string | null;
  emotionalState: string | null;
  status: string;
  canonLocked: boolean;
  traits: string[];
  flaws: string[];
  secrets: string[];
  appearance: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  outfitDefault: string | null;
  visualProfile: Record<string, unknown>;
  bodyState: Record<string, unknown>;
  wardrobeProfile: Record<string, unknown>;
  speechProfile: Record<string, unknown>;
  continuityProfile: Record<string, unknown>;
  adultContentProfile: Record<string, unknown>;
  voiceRegister: string | null;
  voiceSentenceLength: string | null;
  voiceVocabularyStyle: string | null;
  voiceEmotionalLeak: number | null;
  voiceSarcasmLevel: number | null;
  voiceAggressionLevel: number | null;
  voiceSilenceFrequency: number | null;
  voiceFavoriteExpressions: string[];
  voiceForbiddenExpressions: string[];
  voiceForbiddenPatterns: string[];
  voiceThreatenStyle: string | null;
  voiceLieStyle: string | null;
  voiceSeductionStyle: string | null;
  voiceInnerMonologueStyle: string | null;
  voiceExamplesCanonical: Array<{ context: string; line: string; emotion?: string }>;
  voiceSpeechRules: string[];
  stableVisualDNA: Record<string, unknown>;
  stableSpeechDNA: Record<string, unknown>;
  stablePsycheDNA: Record<string, unknown>;
  canChangeHair: boolean;
  canChangeOutfitFreely: boolean;
  canChangeVisibleScars: boolean;
  canChangeSpeechRegister: boolean;
  requiresCanonApprovalFor: string[];
  visualRefs: Array<{ id: string; imageUrl: string; type: string; isPrimary: boolean }>;
  relationshipsFrom: Array<{ id: string; targetCharacterId: string; relationType: string; intensity: number; note: string | null }>;
  relationshipsTo: Array<{ id: string; sourceCharacterId: string; relationType: string; intensity: number; note: string | null }>;
};

type ProjectCharacter = { id: string; name: string };

export default function CharacterDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const characterId = params.characterId as string;
  const [character, setCharacter] = useState<CharacterPayload | null>(null);
  const [projectCharacters, setProjectCharacters] = useState<ProjectCharacter[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "error" } | null>(null);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("rivalité");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [charResult, projCharsResult] = await Promise.all([
        safeFetch<{ character: CharacterPayload }>(`/api/characters/${characterId}`),
        safeFetch<{ characters: ProjectCharacter[] }>(`/api/projects/${projectId}/characters`),
      ]);
      if (!charResult.ok) {
        setMessage({ text: charResult.error, type: "error" });
        setLoading(false);
        return;
      }
      const c = charResult.data.character;
      // Vérification d'isolation : le personnage doit appartenir au projet courant
      if (c.projectId && c.projectId !== projectId) {
        setMessage({ text: "Ce personnage n'appartient pas à ce projet.", type: "error" });
        setLoading(false);
        return;
      }
      setCharacter({
        ...c,
        visualProfile: c.visualProfile ?? {},
        bodyState: c.bodyState ?? {},
        wardrobeProfile: c.wardrobeProfile ?? {},
        speechProfile: c.speechProfile ?? {},
        continuityProfile: c.continuityProfile ?? {},
        adultContentProfile: c.adultContentProfile ?? {},
        voiceFavoriteExpressions: c.voiceFavoriteExpressions ?? [],
        voiceForbiddenExpressions: c.voiceForbiddenExpressions ?? [],
        voiceForbiddenPatterns: c.voiceForbiddenPatterns ?? [],
        voiceExamplesCanonical: c.voiceExamplesCanonical ?? [],
        voiceSpeechRules: c.voiceSpeechRules ?? [],
        stableVisualDNA: c.stableVisualDNA ?? {},
        stableSpeechDNA: c.stableSpeechDNA ?? {},
        stablePsycheDNA: c.stablePsycheDNA ?? {},
        requiresCanonApprovalFor: c.requiresCanonApprovalFor ?? [],
        gender: c.gender === "male" || c.gender === "female" ? c.gender : null,
      });
      if (projCharsResult.ok) {
        setProjectCharacters(projCharsResult.data.characters ?? []);
      }
      setLoading(false);
    }
    load();
  }, [characterId, projectId]);

  async function save() {
    if (!character) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/characters/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: character.name,
        roleType: character.roleType,
        gender: character.gender,
        biography: character.biography,
        age: character.age,
        adultVerified: character.adultVerified,
        objective: character.objective,
        fear: character.fear,
        trauma: character.trauma,
        emotionalState: character.emotionalState,
        status: character.status,
        canonLocked: character.canonLocked,
        traits: character.traits,
        flaws: character.flaws,
        secrets: character.secrets,
        appearance: character.appearance,
        hairColor: character.hairColor,
        eyeColor: character.eyeColor,
        outfitDefault: character.outfitDefault,
        visualProfile: character.visualProfile,
        bodyState: character.bodyState,
        wardrobeProfile: character.wardrobeProfile,
        speechProfile: character.speechProfile,
        continuityProfile: character.continuityProfile,
        adultContentProfile: character.adultContentProfile,
        voiceRegister: character.voiceRegister,
        voiceSentenceLength: character.voiceSentenceLength,
        voiceVocabularyStyle: character.voiceVocabularyStyle,
        voiceEmotionalLeak: character.voiceEmotionalLeak,
        voiceSarcasmLevel: character.voiceSarcasmLevel,
        voiceAggressionLevel: character.voiceAggressionLevel,
        voiceSilenceFrequency: character.voiceSilenceFrequency,
        voiceFavoriteExpressions: character.voiceFavoriteExpressions,
        voiceForbiddenExpressions: character.voiceForbiddenExpressions,
        voiceForbiddenPatterns: character.voiceForbiddenPatterns,
        voiceThreatenStyle: character.voiceThreatenStyle,
        voiceLieStyle: character.voiceLieStyle,
        voiceSeductionStyle: character.voiceSeductionStyle,
        voiceInnerMonologueStyle: character.voiceInnerMonologueStyle,
        voiceExamplesCanonical: character.voiceExamplesCanonical,
        voiceSpeechRules: character.voiceSpeechRules,
        stableVisualDNA: character.stableVisualDNA,
        stableSpeechDNA: character.stableSpeechDNA,
        stablePsycheDNA: character.stablePsycheDNA,
        canChangeHair: character.canChangeHair,
        canChangeOutfitFreely: character.canChangeOutfitFreely,
        canChangeVisibleScars: character.canChangeVisibleScars,
        canChangeSpeechRegister: character.canChangeSpeechRegister,
        requiresCanonApprovalFor: character.requiresCanonApprovalFor,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ text: json.message ?? "Erreur de sauvegarde", type: "error" });
      return;
    }
    setCharacter((prev) => prev ? { ...prev, ...json.character } : prev);
    setMessage({ text: "Fiche sauvegardée.", type: "ok" });
  }

  async function generateVisual() {
    setMessage(null);
    setGeneratingVisual(true);
    const result = await safeFetch<{ visualRef: CharacterPayload["visualRefs"][0] }>(`/api/characters/${characterId}/generate-visual`, { method: "POST" });
    setGeneratingVisual(false);
    if (!result.ok) {
      const status = result.status;
      if (status === 429) {
        setMessage({ text: `Trop de tentatives de génération. ${result.error}`, type: "error" });
        return;
      }
      if (status === 402) {
        setMessage({
          text: "Tokens insuffisants pour générer un visuel (vérifie le wallet/bypass admin illimité).",
          type: "error",
        });
        return;
      }
      if (status === 422) {
        setMessage({
          text: `Stack IA incomplète pour générer l'image. ${result.error}`,
          type: "error",
        });
        return;
      }
      setMessage({ text: `Échec génération visuel: ${result.error}`, type: "error" });
      return;
    }
    setCharacter((current) =>
      current ? { ...current, visualRefs: [result.data.visualRef, ...current.visualRefs] } : current
    );
    setMessage({ text: "Visuel généré.", type: "ok" });
  }

  async function createRelationship() {
    if (!relationTargetId || !character) return;
    const res = await fetch(`/api/projects/${projectId}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceCharacterId: character.id,
        targetCharacterId: relationTargetId,
        relationType,
        intensity: 65,
      }),
    });
    if (res.ok) {
      setMessage({ text: "Relation ajoutée.", type: "ok" });
      // Recharger la fiche pour afficher la nouvelle relation sans full-refresh
      const updated = await fetch(`/api/characters/${characterId}`);
      const json = await updated.json();
      if (json.character) {
        setCharacter((prev) => prev ? {
          ...prev,
          relationshipsFrom: json.character.relationshipsFrom ?? prev.relationshipsFrom,
          relationshipsTo: json.character.relationshipsTo ?? prev.relationshipsTo,
        } : prev);
      }
      setRelationTargetId("");
    } else {
      const json = await res.json().catch(() => ({}));
      setMessage({ text: (json as { message?: string }).message ?? "Impossible d'ajouter la relation.", type: "error" });
    }
  }

  if (loading || !character) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de la fiche…
      </div>
    );
  }

  const isAdult = character.adultVerified && (character.age ?? 0) >= 18;
  const primaryVisual = character.visualRefs.find((r) => r.isPrimary) ?? character.visualRefs[0];

  // Calcul du taux de complétion de la fiche (pour guider l'user)
  const completionScore = (() => {
    const checks = [
      Boolean(character.name),
      Boolean(character.roleType),
      Boolean(character.gender),
      Boolean(character.biography),
      Boolean(character.appearance),
      Boolean(character.hairColor),
      Boolean(character.eyeColor),
      Boolean(character.outfitDefault),
      Boolean(character.objective),
      Boolean(character.fear),
      (character.traits ?? []).length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projects/${projectId}/characters`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Personnages
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{character.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {character.roleType && <Badge variant="outline">{character.roleType}</Badge>}
            <Badge variant="outline">{character.status}</Badge>
            {character.canonLocked && <Badge className="bg-amber-900/40 text-amber-300 border-amber-700/40">🔒 Canon lock</Badge>}
            {isAdult && <Badge className="bg-rose-900/40 text-rose-300 border-rose-700/40">18+</Badge>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={generateVisual} disabled={generatingVisual}>
              {generatingVisual ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Générer visuel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Génère plusieurs visuels pour améliorer la cohérence du personnage dans les chapitres.</span>
          </div>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
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
                    <Label>Nom</Label>
                    <Input value={character.name} onChange={(e) => setCharacter({ ...character, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sexe</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={character.gender === "male" ? "default" : "outline"}
                        onClick={() => setCharacter({ ...character, gender: "male" })}
                      >
                        Homme
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={character.gender === "female" ? "default" : "outline"}
                        onClick={() => setCharacter({ ...character, gender: "female" })}
                      >
                        Femme
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Hyper important pour la cohérence visuelle IA.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rôle</Label>
                    <Input value={character.roleType ?? ""} onChange={(e) => setCharacter({ ...character, roleType: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Âge</Label>
                    <Input type="number" value={character.age ?? ""} onChange={(e) => setCharacter({ ...character, age: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>État émotionnel</Label>
                    <Input value={character.emotionalState ?? ""} onChange={(e) => setCharacter({ ...character, emotionalState: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Biographie</Label>
                  <Textarea value={character.biography ?? ""} onChange={(e) => setCharacter({ ...character, biography: e.target.value })} rows={4} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Objectif</Label>
                    <Textarea value={character.objective ?? ""} onChange={(e) => setCharacter({ ...character, objective: e.target.value })} rows={3} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Peur</Label>
                    <Textarea value={character.fear ?? ""} onChange={(e) => setCharacter({ ...character, fear: e.target.value })} rows={3} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Trauma</Label>
                  <Input value={character.trauma ?? ""} onChange={(e) => setCharacter({ ...character, trauma: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description physique générale</Label>
                  <Textarea value={character.appearance ?? ""} onChange={(e) => setCharacter({ ...character, appearance: e.target.value })} rows={3} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Traits</Label>
                    <Input value={(character.traits ?? []).join(", ")} onChange={(e) => setCharacter({ ...character, traits: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Défauts</Label>
                    <Input value={(character.flaws ?? []).join(", ")} onChange={(e) => setCharacter({ ...character, flaws: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Secrets</Label>
                    <Input value={(character.secrets ?? []).join(", ")} onChange={(e) => setCharacter({ ...character, secrets: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={character.adultVerified} onChange={(e) => setCharacter({ ...character, adultVerified: e.target.checked })} className="rounded" />
                    Adulte vérifié (18+)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={character.canonLocked} onChange={(e) => setCharacter({ ...character, canonLocked: e.target.checked })} className="rounded" />
                    Canon lock
                  </label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="visual">
            <Card className="border-border/60 bg-card/50">
              <CardHeader><CardTitle>Visage & Apparence</CardTitle></CardHeader>
              <CardContent>
                <CharacterVisualConfig
                  value={character.visualProfile as Parameters<typeof CharacterVisualConfig>[0]["value"]}
                  onChange={(v) => setCharacter({ ...character, visualProfile: v as Record<string, unknown> })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="body">
            <Card className="border-border/60 bg-card/50">
              <CardHeader><CardTitle>Morphologie & État physique</CardTitle></CardHeader>
              <CardContent>
                <CharacterBodyConfig
                  value={character.bodyState as Parameters<typeof CharacterBodyConfig>[0]["value"]}
                  onChange={(v) => setCharacter({ ...character, bodyState: v as Record<string, unknown> })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wardrobe">
            <Card className="border-border/60 bg-card/50">
              <CardHeader><CardTitle>Garde-robe</CardTitle></CardHeader>
              <CardContent>
                <CharacterWardrobeConfig
                  value={character.wardrobeProfile as Parameters<typeof CharacterWardrobeConfig>[0]["value"]}
                  onChange={(v) => setCharacter({ ...character, wardrobeProfile: v as Record<string, unknown> })}
                  isAdult={isAdult}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="speech">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Personnalité & Voix</CardTitle>
                <CardDescription>Profil de voix persistante pour cohérence des dialogues</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CharacterSpeechConfig
                  value={character.speechProfile as Parameters<typeof CharacterSpeechConfig>[0]["value"]}
                  onChange={(v) => setCharacter({ ...character, speechProfile: v as Record<string, unknown> })}
                />

                {/* DialogueVoiceProfile */}
                <div className="mt-4 space-y-3 rounded-lg border border-violet-500/30 bg-violet-950/10 p-3">
                  <h4 className="text-sm font-semibold text-violet-300">Profil de voix (Continuity Engine)</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Registre</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        value={character.voiceRegister ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceRegister: e.target.value || null })}
                      >
                        <option value="">Aucun</option>
                        <option value="very_formal">Très formel</option>
                        <option value="formal">Formel</option>
                        <option value="neutral">Neutre</option>
                        <option value="casual">Casual</option>
                        <option value="rough">Brut / Argot</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Longueur phrases</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        value={character.voiceSentenceLength ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceSentenceLength: e.target.value || null })}
                      >
                        <option value="">Aucun</option>
                        <option value="very_short">Très courtes</option>
                        <option value="short">Courtes</option>
                        <option value="medium">Moyennes</option>
                        <option value="long">Longues</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Style de vocabulaire</Label>
                    <Input
                      placeholder="ex: poétique, technique, argot..."
                      value={character.voiceVocabularyStyle ?? ""}
                      onChange={(e) => setCharacter({ ...character, voiceVocabularyStyle: e.target.value || null })}
                      className="text-xs"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Expressivité (0-1)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        placeholder="0.5"
                        value={character.voiceEmotionalLeak ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceEmotionalLeak: e.target.value ? parseFloat(e.target.value) : null })}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sarcasme (0-1)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        placeholder="0.3"
                        value={character.voiceSarcasmLevel ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceSarcasmLevel: e.target.value ? parseFloat(e.target.value) : null })}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Silence (0-1)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        placeholder="0.2"
                        value={character.voiceSilenceFrequency ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceSilenceFrequency: e.target.value ? parseFloat(e.target.value) : null })}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Expressions favorites (séparées par virgule)</Label>
                    <Textarea
                      placeholder="ex: Hmph, Tch, Bon sang..."
                      value={character.voiceFavoriteExpressions.join(", ")}
                      onChange={(e) => setCharacter({ ...character, voiceFavoriteExpressions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      className="text-xs"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-red-400">Expressions INTERDITES (séparées par virgule)</Label>
                    <Textarea
                      placeholder="ex: bien sûr, évidemment..."
                      value={character.voiceForbiddenExpressions.join(", ")}
                      onChange={(e) => setCharacter({ ...character, voiceForbiddenExpressions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      className="text-xs"
                      rows={2}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Style de menace</Label>
                      <Input
                        placeholder="ex: direct, subtil, froid"
                        value={character.voiceThreatenStyle ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceThreatenStyle: e.target.value || null })}
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Style de mensonge</Label>
                      <Input
                        placeholder="ex: omission, bold"
                        value={character.voiceLieStyle ?? ""}
                        onChange={(e) => setCharacter({ ...character, voiceLieStyle: e.target.value || null })}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="canon">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Verrous Canon</CardTitle>
                <CardDescription>Traits verrouillés et politique de changement</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CharacterCanonLocks
                  value={character.continuityProfile as Parameters<typeof CharacterCanonLocks>[0]["value"]}
                  onChange={(v) => setCharacter({ ...character, continuityProfile: v as Record<string, unknown> })}
                />

                {/* ChangePolicy */}
                <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-950/10 p-3">
                  <h4 className="text-sm font-semibold text-amber-300">Politique de changement</h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={character.canChangeHair}
                        onChange={(e) => setCharacter({ ...character, canChangeHair: e.target.checked })}
                        className="rounded"
                      />
                      <span>Peut changer de cheveux</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={character.canChangeOutfitFreely}
                        onChange={(e) => setCharacter({ ...character, canChangeOutfitFreely: e.target.checked })}
                        className="rounded"
                      />
                      <span>Peut changer de tenue librement</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={character.canChangeVisibleScars}
                        onChange={(e) => setCharacter({ ...character, canChangeVisibleScars: e.target.checked })}
                        className="rounded"
                      />
                      <span>Peut perdre des cicatrices</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={character.canChangeSpeechRegister}
                        onChange={(e) => setCharacter({ ...character, canChangeSpeechRegister: e.target.checked })}
                        className="rounded"
                      />
                      <span>Peut changer de registre de voix</span>
                    </label>
                  </div>
                </div>

                {/* StableVisualDNA preview */}
                {Object.keys(character.stableVisualDNA).length > 0 && (
                  <div className="mt-4 rounded-lg border border-stone-700 bg-stone-950/30 p-3">
                    <h4 className="mb-2 text-xs font-semibold text-stone-300">DNA visuelle stable</h4>
                    <pre className="text-[10px] text-stone-400">
                      {JSON.stringify(character.stableVisualDNA, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sidebar */}
        <div className="space-y-4">
          <CharacterPreviewCard
            name={character.name}
            roleType={character.roleType}
            age={character.age}
            adultVerified={character.adultVerified}
            appearance={character.appearance}
            hairColor={character.hairColor ?? (character.visualProfile.hairColor as string) ?? null}
            eyeColor={character.eyeColor ?? (character.visualProfile.eyeColor as string) ?? null}
            outfitDefault={character.outfitDefault ?? (character.wardrobeProfile.defaultOutfit as string) ?? null}
            bodyState={character.bodyState}
            imageUrl={primaryVisual?.imageUrl}
            isGenerating={generatingVisual}
            onRegenerate={generateVisual}
          />

          {/* Barre de complétion de la fiche */}
          <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Complétion fiche</span>
              <span className={`font-semibold tabular-nums ${completionScore >= 80 ? "text-emerald-400" : completionScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                {completionScore}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${completionScore >= 80 ? "bg-emerald-500" : completionScore >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${completionScore}%` }}
              />
            </div>
            {completionScore < 80 && (
              <p className="text-xs text-muted-foreground">
                {completionScore < 50
                  ? "Remplis au moins nom, apparence, couleur cheveux/yeux et tenue pour de bonnes images."
                  : "Ajoute objectif, peur ou traits pour enrichir les dialogues."}
              </p>
            )}
          </div>

          {/* Visual refs */}
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm">Références visuelles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {character.visualRefs.length > 0 ? (
                character.visualRefs.slice(0, 4).map((ref) => (
                  <div key={ref.id} className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.imageUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
                    <p className="text-xs text-muted-foreground">{ref.type}{ref.isPrimary ? " · primaire" : ""}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Aucune référence. Lance une génération.</p>
              )}
            </CardContent>
          </Card>

          {/* Relations */}
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm">Ajouter une relation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <select
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={relationTargetId}
                onChange={(e) => setRelationTargetId(e.target.value)}
              >
                <option value="">Choisir un personnage</option>
                {projectCharacters.filter((item) => item.id !== character.id).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <Input value={relationType} onChange={(e) => setRelationType(e.target.value)} placeholder="Type de relation" />
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={createRelationship}>
                Créer la relation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
