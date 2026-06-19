"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterPreviewCard } from "@/components/characters/character-preview-card";
import {
  CharacterVisualForm,
  EMPTY_CHARACTER_VISUAL_FORM,
  visualFormToPayload,
  type CharacterVisualFormValue,
} from "@/components/characters/character-visual-form";

export default function NewCharacterPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const returnToRaw = searchParams.get("returnTo");

  const [form, setForm] = useState<CharacterVisualFormValue>(EMPTY_CHARACTER_VISUAL_FORM);
  const [loading, setLoading] = useState(false);
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = visualFormToPayload(form);
    const result = await safeFetch<{ character: { id: string } }>(`/api/projects/${id}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const characterId = result.data.character.id;

    // Génère le visuel en arrière-plan dès qu'on a le minimum (nom + genre).
    if (form.name && form.gender) {
      setGeneratingVisual(true);
      safeFetch(`/api/characters/${characterId}/generate-visual`, { method: "POST" }).catch(() => {
        /* silencieux — le visuel peut être (re)généré depuis la fiche */
      });
      await new Promise((r) => setTimeout(r, 800));
      setGeneratingVisual(false);
    }

    const safeReturn =
      returnToRaw && returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") && !returnToRaw.includes("://")
        ? returnToRaw
        : null;

    if (safeReturn) {
      router.push(safeReturn);
    } else {
      // On retombe TOUJOURS sur la liste des persos (l'étape dédiée), pour
      // enchaîner facilement (ajouter un autre perso ou lancer l'interview).
      router.push(`/projects/${id}/characters`);
    }
  }

  return (
    <div className="space-y-6">
      {isOnboarding && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4">
          <p className="text-sm font-medium text-foreground">Crée ton héros (ou ton antagoniste)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Remplis au minimum nom + sexe + cheveux + yeux + tenue. Ces champs suffisent pour des images
            cohérentes. Tu pourras en ajouter d&apos;autres juste après.
          </p>
        </div>
      )}
      <div>
        <Link href={`/projects/${id}/characters`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Personnages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nouveau personnage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uniquement le visuel : ce qui garantit un personnage stable d&apos;un panel à l&apos;autre.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Fiche visuelle</CardTitle>
              <CardDescription>Identité minimale + traits d&apos;apparence pour l&apos;IA.</CardDescription>
            </CardHeader>
            <CardContent>
              <CharacterVisualForm value={form} onChange={setForm} />
            </CardContent>
          </Card>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={loading || generatingVisual || !form.name || !form.gender} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Création…
              </>
            ) : generatingVisual ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Génération du visuel…
              </>
            ) : (
              "Créer le personnage"
            )}
          </Button>
        </div>

        {/* Aperçu */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Aperçu</h3>
          <CharacterPreviewCard
            name={form.name || "Nom du personnage"}
            roleType={form.role}
            age={form.age ? Number(form.age) : undefined}
            adultVerified={false}
            appearance={[form.build, form.skinTone, form.markers].filter(Boolean).join(", ")}
            hairColor={form.hairColor || undefined}
            eyeColor={form.eyeColor || undefined}
            outfitDefault={form.outfit || undefined}
            bodyState={{}}
          />
        </div>
      </form>
    </div>
  );
}
