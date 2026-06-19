"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CanonDriftBanner } from "@/components/characters/canon-drift-banner";
import { detectCanonVisualDrift } from "@/lib/characters/detect-canon-visual-drift";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterVisualConfig } from "@/components/characters/character-visual-config";
import { CharacterBodyConfig } from "@/components/characters/character-body-config";
import { CharacterWardrobeConfig } from "@/components/characters/character-wardrobe-config";
import { DeleteCharacterButton } from "@/components/projects/delete-character-button";
import {
  CharacterArchetypePresets,
  type ArchetypePresetPatch,
} from "@/components/characters/character-archetype-presets";
import { Loader2, Wand2 } from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";
import type {
  CharacterPayload,
  ProjectCharacter,
  InitialVisualSnapshot,
} from "./_components/character-types";
import { useCharacterSave } from "./_components/use-character-save";
import {
  computeCharacterCompletionScore,
  isCharacterAdult,
} from "./_components/compute-character-completion";
import { IdentityTab } from "./_components/identity-tab";
import { CharacterSidebar } from "./_components/character-sidebar";
import { applyArchetypePresetPatch } from "./_components/apply-archetype-preset";

export default function CharacterDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const characterId = params.characterId as string;
  const [character, setCharacter] = useState<CharacterPayload | null>(null);
  const [initialVisualSnapshot, setInitialVisualSnapshot] = useState<InitialVisualSnapshot | null>(null);
  const [projectCharacters, setProjectCharacters] = useState<ProjectCharacter[]>([]);
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "error" } | null>(null);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("rivalité");

  const { saving, autoGenerating, save } = useCharacterSave({
    characterId,
    character,
    setCharacter,
    setMessage,
  });

  const driftResult = useMemo<ReturnType<typeof detectCanonVisualDrift>>(() => {
    if (!initialVisualSnapshot || !character) {
      return { hasDrift: false, critical: [], changedAxes: [], canCritical: [] };
    }
    return detectCanonVisualDrift(initialVisualSnapshot, {
      appearance: character.appearance,
      hairColor: character.hairColor,
      eyeColor: character.eyeColor,
      outfitDefault: character.outfitDefault,
      visualProfile: character.visualProfile,
      bodyState: character.bodyState,
      wardrobeProfile: character.wardrobeProfile,
      stableVisualDNA: character.stableVisualDNA,
    });
  }, [initialVisualSnapshot, character]);

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
      setInitialVisualSnapshot({
        appearance: c.appearance ?? null,
        hairColor: c.hairColor ?? null,
        eyeColor: c.eyeColor ?? null,
        outfitDefault: c.outfitDefault ?? null,
        visualProfile: c.visualProfile ?? {},
        bodyState: c.bodyState ?? {},
        wardrobeProfile: c.wardrobeProfile ?? {},
        stableVisualDNA: c.stableVisualDNA ?? {},
      });
      if (projCharsResult.ok) {
        setProjectCharacters(projCharsResult.data.characters ?? []);
      }
      setLoading(false);
    }
    load();
  }, [characterId, projectId]);

  function patchCharacter(patch: Partial<CharacterPayload>) {
    setCharacter((current) => (current ? { ...current, ...patch } : current));
  }

  async function generateVisual() {
    setMessage(null);
    setGeneratingVisual(true);
    const result = await safeFetch<{ visualRef: CharacterPayload["visualRefs"][0] }>(
      `/api/characters/${characterId}/generate-visual`,
      { method: "POST" },
    );
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
      current ? { ...current, visualRefs: [result.data.visualRef, ...(current.visualRefs ?? [])] } : current,
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
      const updated = await fetch(`/api/characters/${characterId}`);
      const json = await updated.json();
      if (json.character) {
        setCharacter((prev) =>
          prev
            ? {
                ...prev,
                relationshipsFrom: json.character.relationshipsFrom ?? prev.relationshipsFrom,
                relationshipsTo: json.character.relationshipsTo ?? prev.relationshipsTo,
              }
            : prev,
        );
      }
      setRelationTargetId("");
    } else {
      const json = await res.json().catch(() => ({}));
      setMessage({
        text: (json as { message?: string }).message ?? "Impossible d'ajouter la relation.",
        type: "error",
      });
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

  const isAdult = isCharacterAdult(character);
  const completionScore = computeCharacterCompletionScore(character);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/projects/${projectId}/characters`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Personnages
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{character.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {character.roleType ? <Badge variant="outline">{character.roleType}</Badge> : null}
            <Badge variant="outline">{character.status}</Badge>
            {character.canonLocked ? (
              <Badge className="bg-amber-900/40 text-amber-300 border-amber-700/40">🔒 Canon lock</Badge>
            ) : null}
            {isAdult ? (
              <Badge className="bg-rose-900/40 text-rose-300 border-rose-700/40">18+</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={generateVisual} disabled={generatingVisual || autoGenerating}>
              {generatingVisual ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Générer visuel
            </Button>
            <Button onClick={save} disabled={saving || autoGenerating}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sauvegarde…
                </>
              ) : autoGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération visuel…
                </>
              ) : (
                "Sauvegarder"
              )}
            </Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Le visuel est généré automatiquement à la première sauvegarde. Génère-en plusieurs pour
              améliorer la cohérence.
            </span>
          </div>
          <DeleteCharacterButton
            characterId={character.id}
            characterName={character.name}
            redirectTo={`/projects/${projectId}/characters`}
            variant="text"
          />
        </div>
      </div>

      {message ? (
        <p className={`text-sm ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      ) : null}

      {initialVisualSnapshot && driftResult.hasDrift ? (
        <CanonDriftBanner
          changedAxes={driftResult.changedAxes}
          critical={driftResult.critical}
          isBusy={saving || generatingVisual || autoGenerating}
          onRegenerate={async () => {
            await generateVisual();
          }}
        />
      ) : null}

      <CharacterArchetypePresets
        onApply={(patch: ArchetypePresetPatch) => {
          setCharacter((prev) => (prev ? applyArchetypePresetPatch(prev, patch) : prev));
          setMessage({
            text: "Preset appliqué — ajuste les champs et clique sur Sauvegarder.",
            type: "ok",
          });
        }}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Tabs defaultValue="identity">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="identity">Identité</TabsTrigger>
            <TabsTrigger value="visual">Visage</TabsTrigger>
            <TabsTrigger value="body">Corps</TabsTrigger>
            <TabsTrigger value="wardrobe">Tenue</TabsTrigger>
          </TabsList>

          <TabsContent value="identity">
            <IdentityTab character={character} onPatch={patchCharacter} />
          </TabsContent>

          <TabsContent value="visual">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Visage & Apparence</CardTitle>
              </CardHeader>
              <CardContent>
                <CharacterVisualConfig
                  value={character.visualProfile as Parameters<typeof CharacterVisualConfig>[0]["value"]}
                  onChange={(v) => patchCharacter({ visualProfile: v as Record<string, unknown> })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="body">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Morphologie & État physique</CardTitle>
              </CardHeader>
              <CardContent>
                <CharacterBodyConfig
                  value={character.bodyState as Parameters<typeof CharacterBodyConfig>[0]["value"]}
                  onChange={(v) => patchCharacter({ bodyState: v as Record<string, unknown> })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wardrobe">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Garde-robe</CardTitle>
              </CardHeader>
              <CardContent>
                <CharacterWardrobeConfig
                  value={character.wardrobeProfile as Parameters<typeof CharacterWardrobeConfig>[0]["value"]}
                  onChange={(v) => patchCharacter({ wardrobeProfile: v as Record<string, unknown> })}
                  isAdult={isAdult}
                />
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        <CharacterSidebar
          character={character}
          completionScore={completionScore}
          generatingVisual={generatingVisual}
          onRegenerateVisual={generateVisual}
          projectCharacters={projectCharacters}
          relationTargetId={relationTargetId}
          setRelationTargetId={setRelationTargetId}
          relationType={relationType}
          setRelationType={setRelationType}
          createRelationship={createRelationship}
        />
      </div>
    </div>
  );
}
