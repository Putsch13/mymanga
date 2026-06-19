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
 * Onglet "Identité" — VERSION VISUEL-ONLY.
 *
 * On ne garde QUE ce qui sert à l'image et à l'identification : nom, sexe,
 * rôle, âge, description physique, canon lock. Les champs narratifs (bio,
 * objectif, peur, trauma, traits, défauts, secrets) ont été retirés de l'UI :
 * ils polluaient la config perso sans améliorer le rendu.
 */
export function IdentityTab({ character, onPatch }: IdentityTabProps) {
  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <CardTitle>Identité</CardTitle>
        <CardDescription>Le minimum visuel pour un personnage stable.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nom</Label>
            <Input value={character.name} onChange={(e) => onPatch({ name: e.target.value })} />
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
            <p className="text-xs text-muted-foreground">Hyper important pour la cohérence visuelle IA.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Input value={character.roleType ?? ""} onChange={(e) => onPatch({ roleType: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Âge</Label>
            <Input
              type="number"
              value={character.age ?? ""}
              onChange={(e) => onPatch({ age: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Description physique générale</Label>
          <Textarea
            value={character.appearance ?? ""}
            onChange={(e) => onPatch({ appearance: e.target.value })}
            rows={3}
            placeholder="Grand, mince, regard perçant, cicatrice joue gauche..."
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={character.canonLocked}
            onChange={(e) => onPatch({ canonLocked: e.target.checked })}
            className="rounded"
          />
          Canon lock (gèle les traits, empêche toute dérive non voulue)
        </label>
      </CardContent>
    </Card>
  );
}
