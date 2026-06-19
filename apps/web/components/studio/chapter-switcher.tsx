"use client";

import { useRouter, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

type ChapterEntry = { id: string; chapterNumber: number; title: string | null };

type Props = {
  projectId: string;
  currentChapterId: string;
  chapters: ChapterEntry[];
};

export function ChapterSwitcher({ projectId, currentChapterId, chapters }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newChapterId = e.target.value;
    if (newChapterId === currentChapterId) return;
    // Conserver le sous-chemin actuel (edit, read, generate…)
    const suffix = pathname.split(currentChapterId)[1] ?? "";
    router.push(`/projects/${projectId}/chapters/${newChapterId}${suffix}`);
  }

  return (
    <div className="relative flex items-center">
      <select
        value={currentChapterId}
        onChange={handleChange}
        className="appearance-none rounded-lg border border-border/60 bg-background/60 pl-3 pr-7 py-1 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {chapters.map((c) => (
          <option key={c.id} value={c.id}>
            Ch. {c.chapterNumber}{c.title ? ` — ${c.title}` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-muted-foreground" />
    </div>
  );
}
