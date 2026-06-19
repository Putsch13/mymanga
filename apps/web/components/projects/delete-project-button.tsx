"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteProjectButton(props: { projectId: string; projectTitle?: string | null }) {
  const router = useRouter();

  async function onDelete() {
    const ok = window.confirm(
      `Supprimer "${props.projectTitle ?? "ce projet"}" ?\n\nCette action archive le projet (il disparaît de la bibliothèque).`,
    );
    if (!ok) return;
    const res = await fetch(`/api/projects/${props.projectId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      window.alert((json as { message?: string }).message ?? "Suppression impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <Button type="button" variant="destructive" size="sm" onClick={onDelete} className="gap-1">
      <Trash2 className="h-4 w-4" />
      Supprimer
    </Button>
  );
}

