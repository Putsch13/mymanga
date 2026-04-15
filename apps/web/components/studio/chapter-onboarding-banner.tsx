"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ONBOARDING_STEPS = [
  { icon: "1", title: "Brief", desc: "Décris ce qui se passe dans ce chapitre en une phrase." },
  { icon: "2", title: "Casting", desc: "Choisis quels personnages sont présents et où." },
  { icon: "3", title: "Plan", desc: "Valide le contrat narratif, puis lance la génération." },
  { icon: "4", title: "Génération", desc: "L'IA écrit et illustre. Tu relis, retouches, valides." },
];

export function ChapterOnboardingBanner({
  projectId,
  hasCharacters,
}: {
  projectId: string;
  hasCharacters: boolean;
}) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("studio-onboarding-dismissed") === "true";
  });

  if (dismissed) return null;

  return (
    <div className="relative rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
      <button
        onClick={() => {
          setDismissed(true);
          localStorage.setItem("studio-onboarding-dismissed", "true");
        }}
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-sm font-semibold">Comment créer un chapitre</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ONBOARDING_STEPS.map((step) => (
          <div key={step.title} className="rounded-lg border border-border/40 bg-background/30 p-3 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {step.icon}
            </div>
            <p className="mt-2 text-xs font-medium">{step.title}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{step.desc}</p>
          </div>
        ))}
      </div>
      {!hasCharacters && (
        <div className="flex gap-2 text-xs">
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${projectId}/characters/new`}>Créer un personnage</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/projects/${projectId}/characters`}>Voir les personnages</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
