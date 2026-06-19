/**
 * P5.2 — Hook : charge la liste des chapitres du projet une fois et calcule
 * les bornes adjacentes (prev/next) du chapitre courant. Sert à la nav
 * "← Préc. / Suiv. →" du reader sans avoir à revenir au hub projet.
 */
import { useEffect, useState } from "react";

export interface ChapterNav {
  prev: string | null;
  next: string | null;
}

export function useChapterNav(projectId: string, chapterId: string): ChapterNav {
  const [chapterNav, setChapterNav] = useState<ChapterNav>({ prev: null, next: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/chapters`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.chapters) return;
        type ChapterListItem = { id: string; chapterNumber: number };
        const sorted = (j.chapters as ChapterListItem[])
          .filter((c) => typeof c.chapterNumber === "number")
          .sort((a, b) => a.chapterNumber - b.chapterNumber);
        const idx = sorted.findIndex((c) => c.id === chapterId);
        if (idx === -1) return;
        setChapterNav({
          prev: idx > 0 ? sorted[idx - 1].id : null,
          next: idx < sorted.length - 1 ? sorted[idx + 1].id : null,
        });
      })
      .catch(() => {
        /* ignore : la nav prev/next reste désactivée */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, chapterId]);

  return chapterNav;
}
