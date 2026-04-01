"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewCharacterPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [name, setName] = useState("");
  const [roleType, setRoleType] = useState("");
  const [biography, setBiography] = useState("");
  const [age, setAge] = useState("");
  const [adultVerified, setAdultVerified] = useState(false);
  const [objective, setObjective] = useState("");
  const [fear, setFear] = useState("");
  const [emotionalState, setEmotionalState] = useState("");
  const [appearanceSummary, setAppearanceSummary] = useState("");
  const [traits, setTraits] = useState("");
  const [flaws, setFlaws] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/projects/${id}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        roleType: roleType || undefined,
        biography: biography || undefined,
        age: age ? Number(age) : undefined,
        adultVerified,
        objective: objective || undefined,
        fear: fear || undefined,
        emotionalState: emotionalState || undefined,
        appearanceSummary: appearanceSummary || undefined,
        traits: traits
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        flaws: flaws
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) router.push(`/projects/${id}/characters/${data.character.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Link href={`/projects/${id}/characters`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Personnages
      </Link>
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Nouveau personnage</CardTitle>
          <CardDescription>Crée une vraie base canonique : rôle, objectif, peur, visuel et état émotionnel.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rôle (héros, antagoniste…)</Label>
              <Input id="role" value={roleType} onChange={(e) => setRoleType(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="age">Âge</Label>
                <Input id="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <label className="flex items-end gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={adultVerified} onChange={(e) => setAdultVerified(e.target.checked)} />
                Adulte explicitement vérifié
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio courte</Label>
              <Textarea id="bio" value={biography} onChange={(e) => setBiography(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="objective">Objectif</Label>
              <Textarea id="objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fear">Peur principale</Label>
              <Textarea id="fear" value={fear} onChange={(e) => setFear(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emotion">Etat émotionnel actuel</Label>
              <Input id="emotion" value={emotionalState} onChange={(e) => setEmotionalState(e.target.value)} placeholder="sur le fil, glacé, euphorique..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appearance">Résumé visuel</Label>
              <Textarea id="appearance" value={appearanceSummary} onChange={(e) => setAppearanceSummary(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="traits">Traits dominants</Label>
              <Input id="traits" value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="loyal, impulsif, calculateur" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flaws">Défauts</Label>
              <Input id="flaws" value={flaws} onChange={(e) => setFlaws(e.target.value)} placeholder="orgueilleux, jaloux, brutal" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Canon pack créé automatiquement</Badge>
              <Badge variant="outline">Galerie visuelle générable ensuite</Badge>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Création…" : "Créer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
