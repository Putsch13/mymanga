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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/projects/${projectId}/chapters`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Chapitres
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {chapter.title ?? `Chapitre ${chapter.chapterNumber}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.title} · {chapter.scenes.length} scènes · {totalImages} panels · lecture manga droite vers gauche
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeJob ? (
            <Badge variant="outline" className="gap-1.5 border-amber-500/40 text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Génération en cours
            </Badge>
          ) : null}
          {totalImages > 0 ? (
            <Badge
              variant="outline"
              className={
                completedImages === totalImages
                  ? "gap-1.5 border-emerald-500/40 text-emerald-400"
                  : "gap-1.5 border-border/60 text-muted-foreground"
              }
            >
              <ImageIcon className="h-3 w-3" />
              {completedImages}/{totalImages} images
            </Badge>
          ) : null}
          {chapter.status === "ready_for_render" && !activeJob ? (
            <Badge variant="outline" className="gap-1.5 border-violet-500/40 text-violet-400">
              <Clock className="h-3 w-3" />
              Prêt à lire
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Avertissement si génération en cours */}
      {activeJob ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-950/20 p-4">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-300">Génération d&apos;images en cours</p>
            <p className="mt-0.5 text-xs text-amber-400/70">
              Les panels s&apos;affichent au fur et à mesure. Rafraîchis la page pour voir les nouvelles images.
            </p>
          </div>
        </div>
      ) : null}

      {/* Avertissement si aucune scène */}
      {chapter.scenes.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/50 p-6 text-center">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Ce chapitre n&apos;a pas encore été généré</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lance la génération depuis la page du projet pour créer les scènes et les images.
            </p>
            <Link
              href={`/projects/${projectId}/generate`}
              className="mt-3 inline-block text-sm text-accent hover:underline"
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
