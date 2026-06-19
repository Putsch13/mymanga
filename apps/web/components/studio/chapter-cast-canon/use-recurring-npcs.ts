/**
 * Hook qui charge et rafraîchit la liste des PNJ récurrents du projet.
 *
 * Expose aussi `promoteNpc` pour transformer un PNJ récurrent en personnage
 * du projet (via `/promote`).
 */
"use client";

import { useEffect, useState } from "react";
import type { RecurringNpc } from "./types";

export function useRecurringNpcs(projectId: string) {
  const [npcs, setNpcs] = useState<RecurringNpc[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/recurring-npcs`)
      .then((r) => r.json())
      .then((data: { npcs?: RecurringNpc[] }) => setNpcs(data.npcs ?? []))
      .catch(() => {
        /* fail silently; non-blocking UI */
      });
  }, [projectId]);

  async function promoteNpc(stableNpcId: string, currentLabel: string): Promise<void> {
    const name = window.prompt("Nom de ce personnage dans la série :", currentLabel);
    if (!name) return;
    const res = await fetch(
      `/api/projects/${projectId}/recurring-npcs/${stableNpcId}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    if (data.success) {
      const updated = (await fetch(`/api/projects/${projectId}/recurring-npcs`).then((r) =>
        r.json(),
      )) as { npcs?: RecurringNpc[] };
      setNpcs(updated.npcs ?? []);
    }
  }

  return { npcs, promoteNpc };
}
