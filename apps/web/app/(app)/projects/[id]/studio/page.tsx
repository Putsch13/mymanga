"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { RENDERING_MODES } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function StudioImagePage() {
  const params = useParams();
  const projectId = params.id as string;
  const [mode, setMode] = useState<(typeof RENDERING_MODES)[number]>("PANEL_DRAFT");
  const [prompt, setPrompt] = useState("cinematic manga panel, two characters in rain, dramatic ink shadows");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        prompt,
        contentIntensityLayer: "GENERAL_SAFE",
        hasCanonReferences: true,
        projectId,
      }),
    });
    const j = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(j.error ?? j.reason ?? JSON.stringify(j));
      return;
    }
    setResult(j.imageUrl);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Studio image</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Routage automatique + débit tokens. Sans <code className="text-accent">FAL_KEY</code>, mock placeholder.
        </p>
      </div>
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Génération</CardTitle>
          <CardDescription>FLUX schnell via fal quand la clé est présente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <select
              className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value as (typeof RENDERING_MODES)[number])}
            >
              {RENDERING_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <Button onClick={generate} disabled={loading}>
            {loading ? "Génération…" : "Générer (débit tokens)"}
          </Button>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {result ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Résultat</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result} alt="generated" className="max-h-[480px] rounded-lg border border-border object-contain" />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
