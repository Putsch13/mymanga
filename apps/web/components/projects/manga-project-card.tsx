"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Pencil, Loader2 } from "lucide-react";

interface MangaProjectCardProps {
  project: {
    id: string;
    title: string;
    slug: string;
    primaryGenre: string | null;
    contentRating: string;
    status: string;
    _count: { chapters: number; characters: number };
    chapters: Array<{ id: string; chapterNumber: number; status: string }>;
  };
  coverImageUrl?: string | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  generating: { label: "En cours", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  draft: { label: "Brouillon", className: "bg-stone-500/15 text-stone-400 border-stone-500/30" },
  completed: { label: "Terminé", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  ready_for_render: { label: "Prêt", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
};

export function MangaProjectCard({ project, coverImageUrl }: MangaProjectCardProps) {
  const lastChapter = project.chapters[0];
  const isGenerating = lastChapter?.status === "generating";
  const isInProgress = isGenerating || lastChapter?.status === "draft" || lastChapter?.status === "ready_for_render";
  const statusInfo = lastChapter ? (STATUS_BADGE[lastChapter.status] ?? STATUS_BADGE.draft) : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-200 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
      {/* Cover image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-violet-950/40 via-stone-900 to-rose-950/30">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt={project.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl opacity-15 select-none">
            🎌
          </div>
        )}

        {/* Status badge overlay */}
        {statusInfo && (
          <div className="absolute left-2 top-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}>
              {isGenerating && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {statusInfo.label}
            </span>
          </div>
        )}

        {/* Genre badge */}
        {project.primaryGenre && (
          <div className="absolute right-2 top-2">
            <Badge variant="outline" className="border-white/10 bg-black/40 text-[10px] text-white/70 backdrop-blur-sm">
              {project.primaryGenre}
            </Badge>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight">{project.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {project._count.chapters} chap · {project._count.characters} perso
        </p>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          {lastChapter ? (
            <Button asChild size="sm" className="h-7 flex-1 text-xs">
              <Link href={`/projects/${project.id}/chapters/${lastChapter.id}/read`}>
                <BookOpen className="mr-1 h-3 w-3" />
                Lire
              </Link>
            </Button>
          ) : null}
          <Button
            asChild
            size="sm"
            variant="outline"
            className={`h-7 text-xs ${lastChapter ? "" : "flex-1"}`}
          >
            <Link href={`/projects/${project.id}/chapters/new`}>
              <Pencil className="mr-1 h-3 w-3" />
              {isInProgress ? "Continuer" : "Créer"}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
