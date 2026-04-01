"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const enums = {
  renderFamily: ["manga", "anime", "semi_realistic", "gothic", "horror", "western"],
  lineWeight: ["fine", "medium", "heavy"],
  shadingMode: ["cel_shading", "ink_bw", "hatching", "painterly"],
  contrastProfile: ["soft", "dramatic", "brutal"],
  anatomyBias: ["stylized", "grounded", "realistic"],
  backgroundDensity: ["low", "medium", "high"],
  cameraLanguage: ["cinematic", "manga_dynamic", "intimate", "horror_claustrophobic"],
} as const;

export default function StylePackPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [data, setData] = useState<Record<string, string>>({});
  const [neg, setNeg] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const defaults = {
      renderFamily: "manga",
      lineWeight: "medium",
      shadingMode: "ink_bw",
      contrastProfile: "dramatic",
      anatomyBias: "stylized",
      backgroundDensity: "medium",
      cameraLanguage: "manga_dynamic",
    };
    fetch(`/api/projects/${projectId}/style-pack`)
      .then((r) => r.json())
      .then((j) => {
        if (j.stylePack) {
          const sp = j.stylePack;
          setData({
            renderFamily: sp.renderFamily ?? defaults.renderFamily,
            lineWeight: sp.lineWeight ?? defaults.lineWeight,
            shadingMode: sp.shadingMode ?? defaults.shadingMode,
            contrastProfile: sp.contrastProfile ?? defaults.contrastProfile,
            anatomyBias: sp.anatomyBias ?? defaults.anatomyBias,
            backgroundDensity: sp.backgroundDensity ?? defaults.backgroundDensity,
            cameraLanguage: sp.cameraLanguage ?? defaults.cameraLanguage,
          });
          setNeg(Array.isArray(sp.negativeConstraints) ? sp.negativeConstraints.join("\n") : "");
        } else {
          setData(defaults);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function save() {
    setSaving(true);
    const negativeConstraints = neg
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    await fetch(`/api/projects/${projectId}/style-pack`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, negativeConstraints }),
    });
    setSaving(false);
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Chargement du style pack…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Projet
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Style pack</h1>
        <p className="text-muted-foreground mt-1 text-sm">Paramètres injectés dans PromptComposer v2 — moins de dérive.</p>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Paramètres DA</CardTitle>
          <CardDescription>Choix alignés sur le schéma Prisma / spec CTO.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(Object.keys(enums) as (keyof typeof enums)[]).map((key) => (
            <div key={key} className="space-y-2">
              <Label>{key}</Label>
              <select
                className="flex h-10 w-full rounded-lg border border-border bg-background/80 px-3 text-sm"
                value={data[key] ?? ""}
                onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
              >
                {enums[key].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Separator className="bg-border" />
          <div className="space-y-2">
            <Label>Negative constraints (une par ligne)</Label>
            <textarea
              className="min-h-[100px] w-full rounded-lg border border-border bg-background/80 px-3 py-2 text-sm"
              value={neg}
              onChange={(e) => setNeg(e.target.value)}
              placeholder="extra fingers&#10;wrong eye color"
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
