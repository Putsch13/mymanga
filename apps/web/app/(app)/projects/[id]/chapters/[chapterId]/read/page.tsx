import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, BookOpen, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { MangaBookReader } from "@/components/manga/manga-book-reader";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";
import { Badge } from "@/components/ui/badge";
import { getStableImageUrl } from "@/lib/images/get-stable-image-url";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { PREMIUM_PANEL_RANGE } from "@manga-ai-studio/core";

export const dynamic = "force-dynamic";

// COMMIT E — suppression du hardcode `TARGET_IMAGES_PER_CHAPTER = 75`.
// Source unique : `PREMIUM_PANEL_RANGE` (min=70, target=72, max=75).
// Le reader affiche la cible produit (target) comme référence, et utilise
// le min comme plancher de "chapitre prêt".
const PREMIUM_PANEL_TARGET = PREMIUM_PANEL_RANGE.target;
const PREMIUM_PANEL_MIN = PREMIUM_PANEL_RANGE.min;

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ read?: string }>;
};

export default async function MangaReadPage({ params, searchParams }: Props) {
  // CRASH-1 : wrapper de sécurité
  try {
    return await renderReadPage(params, searchParams);
  } catch (err) {
    console.error("[read-page] crash:", err);
    const { id: projectId } = await params;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <AlertCircle className="h-8 w-8 text-white/30" />
        <div className="text-center">
          <p className="text-lg font-medium text-white/80">Ce chapitre est en cours de chargement.</p>
          <p className="mt-1 text-sm text-white/40">Réessaie dans quelques secondes.</p>
          <Link
            href={`/projects/${projectId}/chapters`}
            className="mt-4 inline-block rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors"
          >
            ← Retour aux chapitres
          </Link>
        </div>
      </div>
    );
  }
}

async function renderReadPage(params: Props["params"], searchParamsP: Props["searchParams"]) {
  const user = await getCurrentUser();
  const { id: projectId, chapterId } = await params;
  const searchParams = await searchParamsP;
  const immersive = searchParams.read === "1";

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
            select: { id: true, panelNumber: true, imageUrl: true, persistedUrl: true, status: true },
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
  // P0.4 : helper centralisé remplace `img.persistedUrl ?? img.imageUrl` partout.
  const completedImages = allImages.filter((i) => i.status === "completed" && getStableImageUrl(i) !== null).length;
  const totalImages = allImages.length;
  // COMMIT E — on utilise la cible produit (target=72) comme dénominateur
  // d'affichage quand le storyboard natif est plus court, sinon le total
  // réel. Fini le hardcode 75.
  const targetImages = Math.max(PREMIUM_PANEL_TARGET, totalImages);
  const coverImage = allImages.find((i) => getStableImageUrl(i) !== null && i.status === "completed");
  // P0.5 : signer/proxifier la cover pour que les buckets privés fonctionnent.
  const rawCoverUrl = getStableImageUrl(coverImage);
  const coverUrl = rawCoverUrl ? await signSupabaseUrlIfNeeded(rawCoverUrl) : null;

  // READ-PREMIUM : mode immersif — reader plein écran direct
  if (immersive) {
    if (chapter.scenes.length === 0) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
          <AlertCircle className="h-8 w-8 text-white/30" />
          <p className="text-lg font-medium text-white/80">Ce chapitre n&apos;a pas encore été généré.</p>
          <Link
            href={`/projects/${projectId}/generate`}
            className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors"
          >
            Générer ce chapitre →
          </Link>
        </div>
      );
    }
    return (
      <div className="-mx-4 -my-4 sm:-mx-6 min-h-screen bg-black text-white">
        <MangaBookReader
          projectId={projectId}
          chapterId={chapterId}
          autoFullscreen
          exitHref={`/projects/${projectId}/chapters/${chapterId}/read`}
          targetImages={PREMIUM_PANEL_TARGET}
        />
      </div>
    );
  }

  // READ-PREMIUM : hero de lancement
  // COMMIT E — on utilise PREMIUM_PANEL_MIN comme plancher "prêt" (le
  // chapitre est lisible dès que le storyboard natif est couvert), et
  // PREMIUM_PANEL_TARGET comme cible d'affichage.
  const readyRatio = targetImages > 0 ? completedImages / targetImages : 0;
  const readyEnough = completedImages >= Math.min(PREMIUM_PANEL_MIN, totalImages) && totalImages > 0;
  const isUnderTarget = totalImages < PREMIUM_PANEL_MIN;

  return (
    <div className="-mx-4 -my-4 sm:-mx-6 relative min-h-screen overflow-hidden bg-black text-white">
      {coverUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 blur-2xl scale-110"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black" />
        </>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-950/30 via-black to-black" />
      )}

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-6 sm:px-8">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/projects/${projectId}/chapters`}
            className="text-sm text-white/50 transition-colors hover:text-white"
          >
            ← Chapitres
          </Link>
          <span className="text-xs text-white/30">{project.title}</span>
        </div>

        {/* Hero */}
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 text-center">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
              Chapitre {chapter.chapterNumber}
            </p>
            <h1 className="text-balance font-serif text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              {chapter.title ?? `Chapitre ${chapter.chapterNumber}`}
            </h1>
            {chapter.summary ? (
              <p className="mx-auto max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                {chapter.summary}
              </p>
            ) : null}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge
              variant="outline"
              className={
                isUnderTarget
                  ? "gap-1.5 border-red-500/50 bg-red-950/30 text-red-300"
                  : readyEnough
                    ? "gap-1.5 border-emerald-500/50 bg-emerald-950/30 text-emerald-300"
                    : "gap-1.5 border-white/20 bg-white/5 text-white/70"
              }
            >
              <ImageIcon className="h-3 w-3" />
              {completedImages}/{PREMIUM_PANEL_TARGET} cases
            </Badge>
            {totalImages > 0 && totalImages !== completedImages ? (
              <Badge variant="outline" className="gap-1.5 border-white/10 bg-white/5 text-white/50">
                {totalImages} planifiées
              </Badge>
            ) : null}
            {activeJob ? (
              <Badge variant="outline" className="gap-1.5 border-amber-500/40 bg-amber-950/30 text-amber-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Génération en cours
              </Badge>
            ) : null}
            {readyEnough && !activeJob ? (
              <Badge variant="outline" className="gap-1.5 border-violet-500/50 bg-violet-950/30 text-violet-200">
                <Sparkles className="h-3 w-3" />
                Premium
              </Badge>
            ) : null}
          </div>

          {/* Progress bar */}
          {totalImages > 0 ? (
            <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all duration-700 ${
                  readyEnough ? "bg-emerald-400" : "bg-violet-500"
                }`}
                style={{ width: `${Math.min(100, readyRatio * 100)}%` }}
              />
            </div>
          ) : null}

          {/* CTA */}
          <div className="flex flex-col items-center gap-3">
            {chapter.scenes.length === 0 ? (
              <Link
                href={`/projects/${projectId}/generate`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black shadow-2xl shadow-white/20 transition-all hover:scale-105 hover:shadow-white/40"
              >
                <Sparkles className="h-5 w-5" />
                Générer ce chapitre
              </Link>
            ) : (
              <Link
                href={`/projects/${projectId}/chapters/${chapterId}/read?read=1`}
                className="group inline-flex items-center gap-3 rounded-full bg-white px-10 py-5 text-lg font-semibold text-black shadow-2xl shadow-white/20 transition-all hover:scale-105 hover:shadow-white/40"
              >
                <BookOpen className="h-6 w-6 transition-transform group-hover:translate-x-0.5" />
                Lire le manga
              </Link>
            )}
            <p className="text-xs text-white/40">
              {readerModeHint(completedImages, PREMIUM_PANEL_TARGET)}
            </p>
          </div>

          {chapter.cliffhanger ? (
            <div className="mt-2 max-w-lg rounded-2xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
                Cliffhanger
              </p>
              <p className="mt-1 text-sm text-white/75">{chapter.cliffhanger}</p>
            </div>
          ) : null}
        </div>

        {/* Footer secondary actions */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-white/40">
          <Link
            href={`/projects/${projectId}/chapters/${chapterId}`}
            className="transition-colors hover:text-white"
          >
            Studio
          </Link>
          <span>·</span>
          <Link
            href={`/projects/${projectId}/chapters/${chapterId}/review`}
            className="transition-colors hover:text-white"
          >
            Review
          </Link>
          <span>·</span>
          <Link
            href={`/projects/${projectId}/chapters`}
            className="transition-colors hover:text-white"
          >
            Tous les chapitres
          </Link>
        </div>
      </div>
    </div>
  );
}

function readerModeHint(completed: number, target: number): string {
  if (completed === 0) return "Lecture paginée style manga imprimé · Appuie pour commencer";
  if (completed < target) return `Génération en cours — ${completed}/${target} cases prêtes`;
  return "Lecture immersive plein écran · Flèches ou swipe pour tourner";
}
