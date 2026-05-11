"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CharacterPreviewCard } from "@/components/characters/character-preview-card";
import { resolveImageUrl } from "@/lib/images/proxy-url";
import type { CharacterPayload, ProjectCharacter } from "./character-types";

interface CharacterSidebarProps {
  character: CharacterPayload;
  completionScore: number;
  generatingVisual: boolean;
  onRegenerateVisual: () => void | Promise<void>;
  projectCharacters: ProjectCharacter[];
  relationTargetId: string;
  setRelationTargetId: (id: string) => void;
  relationType: string;
  setRelationType: (type: string) => void;
  createRelationship: () => void | Promise<void>;
}

/**
 * Sidebar de la fiche personnage : preview + complétion + références
 * visuelles + ajout de relation. Extrait de la page principale (audit-v9).
 */
export function CharacterSidebar({
  character,
  completionScore,
  generatingVisual,
  onRegenerateVisual,
  projectCharacters,
  relationTargetId,
  setRelationTargetId,
  relationType,
  setRelationType,
  createRelationship,
}: CharacterSidebarProps) {
  const primaryVisual = character.visualRefs.find((r) => r.isPrimary) ?? character.visualRefs[0];

  return (
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
        imageUrl={resolveImageUrl(primaryVisual?.imageUrl)}
        isGenerating={generatingVisual}
        onRegenerate={onRegenerateVisual}
      />

      <div className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Complétion fiche</span>
          <span
            className={`font-semibold tabular-nums ${
              completionScore >= 80
                ? "text-emerald-400"
                : completionScore >= 50
                  ? "text-amber-400"
                  : "text-red-400"
            }`}
          >
            {completionScore}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              completionScore >= 80
                ? "bg-emerald-500"
                : completionScore >= 50
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${completionScore}%` }}
          />
        </div>
        {completionScore < 80 ? (
          <p className="text-xs text-muted-foreground">
            {completionScore < 50
              ? "Remplis au moins nom, apparence, couleur cheveux/yeux et tenue pour de bonnes images."
              : "Ajoute objectif, peur ou traits pour enrichir les dialogues."}
          </p>
        ) : null}
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm">Références visuelles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {character.visualRefs.length > 0 ? (
            character.visualRefs.slice(0, 4).map((ref) => (
              <div key={ref.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveImageUrl(ref.imageUrl) ?? ref.imageUrl}
                  alt=""
                  className="h-32 w-full rounded-lg object-cover"
                />
                <p className="text-xs text-muted-foreground">
                  {ref.type}
                  {ref.isPrimary ? " · primaire" : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Aucune référence. Lance une génération.</p>
          )}
        </CardContent>
      </Card>

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
            {projectCharacters
              .filter((item) => item.id !== character.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <Input
            value={relationType}
            onChange={(e) => setRelationType(e.target.value)}
            placeholder="Type de relation"
          />
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={createRelationship}>
            Créer la relation
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
