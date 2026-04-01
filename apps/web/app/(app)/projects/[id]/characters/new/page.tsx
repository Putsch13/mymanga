"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/projects/${id}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, roleType: roleType || undefined, biography: biography || undefined }),
    });
    setLoading(false);
    if (res.ok) router.push(`/projects/${id}/characters`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Link href={`/projects/${id}/characters`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Personnages
      </Link>
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Nouveau personnage</CardTitle>
          <CardDescription>Un canon pack vide est créé — tu pourras y attacher les refs visuelles.</CardDescription>
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
            <div className="space-y-2">
              <Label htmlFor="bio">Bio courte</Label>
              <Textarea id="bio" value={biography} onChange={(e) => setBiography(e.target.value)} />
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
