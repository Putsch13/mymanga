"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  characterId: string;
  characterName: string;
  /** Si true, redirige vers /projects/[projectId]/characters après suppression. */
  redirectTo?: string;
  /** Style du bouton — `icon` rend une corbeille seule, `text` un bouton "Supprimer". */
  variant?: "icon" | "text";
}

/**
 * Bouton de suppression de personnage avec confirmation native + appel
 * DELETE /api/characters/[characterId] (déjà implémenté côté API).
 *
 * Conçu pour être utilisable depuis la liste (variante icon) ET depuis
 * la fiche détail (variante text).
 */
export function DeleteCharacterButton({
  characterId,
  characterName,
  redirectTo,
  variant = "icon",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Supprimer définitivement "${characterName}" ?\n\nCette action retire le personnage de tous les chapitres mais ne supprime pas les chapitres déjà générés.`,
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/characters/${characterId}`, { method: "DELETE" });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          setError(json.message ?? json.error ?? `Erreur ${res.status}`);
          return;
        }
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur réseau");
      }
    });
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        title={`Supprimer ${characterName}`}
        aria-label={`Supprimer ${characterName}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-950/30 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDelete}
        disabled={isPending}
        className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-950/30 hover:text-red-300"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Supprimer
      </Button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
