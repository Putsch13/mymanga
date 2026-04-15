"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteChapterButton({
  projectId,
  chapterId,
  chapterTitle,
}: {
  projectId: string;
  chapterId: string;
  chapterTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/chapters/${chapterId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Supprimer &quot;{chapterTitle}&quot; ?</span>
        <Button size="sm" variant="destructive" onClick={handleDelete} disabled={loading} className="h-7 gap-1 px-2 text-xs">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Oui, supprimer"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={loading} className="h-7 px-2 text-xs">
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="h-7 w-7 p-0 text-muted-foreground/50 hover:text-destructive" title="Supprimer ce chapitre">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
