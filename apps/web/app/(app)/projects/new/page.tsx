"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, pitch, primaryGenre: primaryGenre || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Création impossible");
      return;
    }
    const data = await res.json();
    router.push(`/projects/${data.project.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
        ← Dashboard
      </Link>
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-2xl">Nouveau projet</CardTitle>
          <CardDescription>Un style pack v1 et les réglages par défaut sont créés automatiquement.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titre</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pitch">Pitch</Label>
              <Textarea id="pitch" value={pitch} onChange={(e) => setPitch(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="genre">Genre principal</Label>
              <Input
                id="genre"
                value={primaryGenre}
                onChange={(e) => setPrimaryGenre(e.target.value)}
                placeholder="dark fantasy, seinen…"
              />
            </div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Création…" : "Créer le projet"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
