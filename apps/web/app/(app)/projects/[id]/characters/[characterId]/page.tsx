"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CharacterPayload = {
  id: string;
  name: string;
  roleType: string | null;
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
  appearance: { summary?: string };
  visualRefs: Array<{ id: string; imageUrl: string; type: string; isPrimary: boolean }>;
  relationshipsFrom: Array<{ id: string; targetCharacterId: string; relationType: string; intensity: number; note: string | null }>;
  relationshipsTo: Array<{ id: string; sourceCharacterId: string; relationType: string; intensity: number; note: string | null }>;
};

type ProjectCharacter = { id: string; name: string };

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const characterId = params.characterId as string;
  const [character, setCharacter] = useState<CharacterPayload | null>(null);
  const [projectCharacters, setProjectCharacters] = useState<ProjectCharacter[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [relationTargetId, setRelationTargetId] = useState("");
  const [relationType, setRelationType] = useState("rivalité");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [characterRes, projectCharactersRes] = await Promise.all([
        fetch(`/api/characters/${characterId}`),
        fetch(`/api/projects/${projectId}/characters`),
      ]);
      const characterJson = await characterRes.json();
      const projectCharactersJson = await projectCharactersRes.json();
      setCharacter(characterJson.character);
      setProjectCharacters(projectCharactersJson.characters ?? []);
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
        visualRefs: character.visualRefs,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(json.message ?? "Erreur de sauvegarde");
      return;
    }
    setCharacter(json.character);
    setMessage("Fiche sauvegardée.");
  }

  async function generateVisual() {
    setMessage(null);
    const res = await fetch(`/api/characters/${characterId}/generate-visual`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message ?? json.error ?? "Impossible de générer le visuel.");
      return;
    }
    setCharacter((current) =>
      current
        ? {
            ...current,
            visualRefs: [json.visualRef, ...current.visualRefs],
          }
        : current,
    );
    setMessage("Visuel généré.");
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
      setMessage("Relation ajoutée.");
      router.refresh();
    }
  }

  if (loading || !character) {
    return <p className="text-sm text-muted-foreground">Chargement de la fiche…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${projectId}/characters`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Personnages
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{character.name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{character.roleType ?? "Rôle"}</Badge>
          <Badge variant="outline">{character.status}</Badge>
          {character.canonLocked ? <Badge>canon lock</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Fiche personnage</CardTitle>
            <CardDescription>Edition canonique pour la continuité, les dialogues et les références visuelles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={character.name} onChange={(e) => setCharacter({ ...character, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Input value={character.roleType ?? ""} onChange={(e) => setCharacter({ ...character, roleType: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input
                  type="number"
                  value={character.age ?? ""}
                  onChange={(e) => setCharacter({ ...character, age: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="space-y-2">
                <Label>Etat émotionnel</Label>
                <Input
                  value={character.emotionalState ?? ""}
                  onChange={(e) => setCharacter({ ...character, emotionalState: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Biographie</Label>
              <Textarea value={character.biography ?? ""} onChange={(e) => setCharacter({ ...character, biography: e.target.value })} rows={4} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Objectif</Label>
                <Textarea value={character.objective ?? ""} onChange={(e) => setCharacter({ ...character, objective: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Peur</Label>
                <Textarea value={character.fear ?? ""} onChange={(e) => setCharacter({ ...character, fear: e.target.value })} rows={3} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Résumé visuel</Label>
              <Textarea
                value={character.appearance?.summary ?? ""}
                onChange={(e) =>
                  setCharacter({
                    ...character,
                    appearance: { ...(character.appearance ?? {}), summary: e.target.value },
                  })
                }
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Traits (virgules)</Label>
                <Input
                  value={character.traits.join(", ")}
                  onChange={(e) =>
                    setCharacter({
                      ...character,
                      traits: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Défauts</Label>
                <Input
                  value={character.flaws.join(", ")}
                  onChange={(e) =>
                    setCharacter({
                      ...character,
                      flaws: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Secrets</Label>
                <Input
                  value={character.secrets.join(", ")}
                  onChange={(e) =>
                    setCharacter({
                      ...character,
                      secrets: e.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={character.adultVerified}
                  onChange={(e) => setCharacter({ ...character, adultVerified: e.target.checked })}
                />
                Adulte explicitement vérifié
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={character.canonLocked}
                  onChange={(e) => setCharacter({ ...character, canonLocked: e.target.checked })}
                />
                Canon lock
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Sauvegarde…" : "Sauvegarder"}
              </Button>
              <Button type="button" variant="secondary" onClick={generateVisual}>
                Générer un visuel
              </Button>
            </div>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Visual refs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {character.visualRefs.length > 0 ? (
                character.visualRefs.map((ref) => (
                  <div key={ref.id} className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.imageUrl} alt="" className="h-40 w-full rounded-lg object-cover" />
                    <p className="text-xs text-muted-foreground">
                      {ref.type} {ref.isPrimary ? "· primaire" : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aucune référence. Lance une génération pour amorcer le canon visuel.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Ajouter une relation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" value={relationTargetId} onChange={(e) => setRelationTargetId(e.target.value)}>
                <option value="">Choisir un personnage</option>
                {projectCharacters
                  .filter((item) => item.id !== character.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
              <Input value={relationType} onChange={(e) => setRelationType(e.target.value)} />
              <Button type="button" variant="outline" onClick={createRelationship}>
                Créer la relation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
