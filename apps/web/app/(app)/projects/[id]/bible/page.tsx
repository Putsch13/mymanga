"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function BiblePage() {
  const params = useParams();
  const id = params.id as string;
  const [summary, setSummary] = useState("");
  const [raw, setRaw] = useState("{}");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((j) => {
        const b = j.project?.storyBible;
        if (b) {
          setSummary(b.summary ?? "");
          setRaw(JSON.stringify({ worldRules: b.worldRules, lore: b.lore, themes: b.themes }, null, 2));
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    setSaving(true);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      setSaving(false);
      return;
    }
    await fetch(`/api/projects/${id}/bible`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        worldRules: (parsed.worldRules as object) ?? {},
        themes: (parsed.themes as unknown[]) ?? [],
        lore: (parsed.lore as object) ?? {},
      }),
    });
    setSaving(false);
  }

  if (loading) return <p className="text-muted-foreground text-sm">Chargement…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Bible d’univers</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          La bible alimente la memoire de continuite, la generation de chapitres et les futurs retrievers RAG. Pense-la comme le coeur canonique de ta serie.
        </p>
      </div>
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Résumé & JSON structuré</CardTitle>
          <CardDescription>worldRules, lore, themes — aligné mémoire / RAG.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Résumé</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>JSON (worldRules, lore, themes)</Label>
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono text-xs" rows={16} />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
