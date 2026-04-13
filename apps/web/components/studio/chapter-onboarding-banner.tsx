"use client";

import Link from "next/link";
import { Users, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ChapterOnboardingBanner({
  projectId,
  hasCharacters,
}: {
  projectId: string;
  hasCharacters: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || hasCharacters) return null;

  return (
    <div className="relative rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-2">
          <p className="font-medium text-foreground">
            Étape recommandée : ajoute ton héros et les personnages du chapitre
          </p>
          <p className="text-muted-foreground text-xs">
            Le studio fonctionne sans personnages, mais l&apos;IA génère des images bien meilleures quand elle connaît tes personnages.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="default">
              <Link href={`/projects/${projectId}/characters/new`}>
                Créer un personnage
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${projectId}/characters`}>
                Voir tous les personnages
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissed(true)}
            >
              Continuer sans personnage
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
