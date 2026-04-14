import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, Clock, ImageIcon, Loader2 } from "lucide-react";
import { MangaBookReader } from "@/components/manga/manga-book-reader";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; chapterId: string }> };

export default async function MangaReadPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id: projectId, chapterId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true, title: true },
  });
  if (!project) notFound();

  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId },
    include: {
      scenes: {
        orderBy: { sceneNumber: "asc" },
        include: {
          images: {
            orderBy: { panelNumber: "asc" },
            select: { id: true, panelNumber: true, imageUrl: true, status: true },
          },
        },
      },
    },
  });
  if (!chapter) notFound();

  const activeJob = await prisma.job.findFirst({
    where: { chapterId, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, output: true },
  });

  const allImages = chapter.scenes.flatMap((s) => s.images);
  const completedImages = allImages.filter((i) => i.status === "completed" && i.imageUrl).length;
  const totalImages = allImages.length;

  return (
    // QUAL-3 : fond noir total — le reader s'émancipe du layout /app
    <div className="-mx-4 -my-4 sm:-mx-6 min-h-screen bg-black text-white">

      {/* Header flottant minimaliste */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-4 py-2 backdrop-blur-sm sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/projects/${projectId}/chapters`}
            className="shrink-0 text-sm text-white/50 hover:text-white transition-colors"
          >
            ← Chapitres
          </Link>
          <span className="text-white/20">·</span>
          <h1 className="truncate text-sm font-medium text-white/80">
            {chapter.title ?? `Chapitre ${chapter.chapterNumber}`}
          </h1>
          <span className="hidden text-white/20 sm:inline">·</span>
          <span className="hidden text-xs text-white/40 sm:inline">{project.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeJob ? (
            <Badge variant="outline" className="gap-1.5 border-amber-500/40 text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">En cours</span>
            </Badge>
          ) : null}
          {totalImages > 0 ? (
            <Badge
              variant="outline"
              className={
                completedImages === totalImages
                  ? "gap-1.5 border-emerald-500/40 text-emerald-400"
                  : "gap-1.5 border-white/20 text-white/40"
              }
            >
              <ImageIcon className="h-3 w-3" />
              {completedImages}/{totalImages}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Avertissement si génération en cours */}
      {activeJob ? (
        <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-950/30 px-4 py-3 sm:px-6">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-400" />
          <p className="text-xs text-amber-400/80">
            Génération en cours — les panels s&apos;affichent au fur et à mesure.
          </p>
        </div>
      ) : null}

      {/* Contenu reader */}
      {chapter.scenes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
          <AlertCircle className="h-8 w-8 text-white/30" />
          <div>
            <p className="font-medium text-white/70">Ce chapitre n&apos;a pas encore été généré</p>
            <p className="mt-1 text-sm text-white/40">
              Lance la génération depuis la page du projet.
            </p>
            <Link
              href={`/projects/${projectId}/generate`}
              className="mt-4 inline-block rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors"
            >
              Générer ce chapitre →
            </Link>
          </div>
        </div>
      ) : (
        <MangaBookReader projectId={projectId} chapterId={chapterId} />
      )}
    </div>
  );
}
