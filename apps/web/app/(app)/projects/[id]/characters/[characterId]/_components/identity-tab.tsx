"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterPayload } from "./character-types";

interface IdentityTabProps {
  character: CharacterPayload;
  onPatch: (patch: Partial<CharacterPayload>) => void;
}

/**
 * Onglet "Identité" de la fiche personnage : champs textuels (nom, sexe,
 * rôle, âge, biographie, traits, défauts…) et flags (canon lock, 18+).
 *
 * Extrait de la page principale (audit-v9) pour rester sous 500 lignes.
 */
export function IdentityTab({ character, onPatch }: IdentityTabProps) {
  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle>Identité</CardTitle>
        <CardDescription>Informations de base, biographie et psychologie.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nom</Label>
            <Input
              value={character.name}
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sexe</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={character.gender === "male" ? "default" : "outline"}
                onClick={() => onPatch({ gender: "male" })}
              >
                Homme
              </Button>
              <Button
                type="button"
                size="sm"
                variant={character.gender === "female" ? "default" : "outline"}
                onClick={() => onPatch({ gender: "female" })}
              >
                Femme
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Hyper important pour la cohérence visuelle IA.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Input
              value={character.roleType ?? ""}
              onChange={(e) => onPatch({ roleType: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Âge</Label>
            <Input
              type="number"
              value={character.age ?? ""}
              onChange={(e) => onPatch({ age: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>État émotionnel</Label>
            <Input
              value={character.emotionalState ?? ""}
              onChange={(e) => onPatch({ emotionalState: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Biographie</Label>
          <Textarea
            value={character.biography ?? ""}
            onChange={(e) => onPatch({ biography: e.target.value })}
            rows={4}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Objectif</Label>
            <Textarea
              value={character.objective ?? ""}
              onChange={(e) => onPatch({ objective: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Peur</Label>
            <Textarea
              value={character.fear ?? ""}
              onChange={(e) => onPatch({ fear: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Trauma</Label>
          <Input
            value={character.trauma ?? ""}
            onChange={(e) => onPatch({ trauma: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Description physique générale</Label>
          <Textarea
            value={character.appearance ?? ""}
            onChange={(e) => onPatch({ appearance: e.target.value })}
            rows={3}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Traits</Label>
            <Input
              value={(character.traits ?? []).join(", ")}
              onChange={(e) => onPatch({ traits: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Défauts</Label>
            <Input
              value={(character.flaws ?? []).join(", ")}
              onChange={(e) => onPatch({ flaws: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Secrets</Label>
            <Input
              value={(character.secrets ?? []).join(", ")}
              onChange={(e) => onPatch({ secrets: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={character.adultVerified}
              onChange={(e) => onPatch({ adultVerified: e.target.checked })}
              className="rounded"
            />
            Adulte vérifié (18+)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={character.canonLocked}
              onChange={(e) => onPatch({ canonLocked: e.target.checked })}
              className="rounded"
            />
            Canon lock
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
