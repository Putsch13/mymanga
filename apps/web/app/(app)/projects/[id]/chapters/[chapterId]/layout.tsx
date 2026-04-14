import Link from "next/link";
import { notFound } from "next/navigation";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { ChapterStatusBadge } from "@/components/studio/chapter-status-badge";
import { ChapterSwitcher } from "@/components/studio/chapter-switcher";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string; chapterId: string }>;
};

const chapterNav = (projectId: string, chapterId: string) => [
  { href: `/projects/${projectId}/chapters/${chapterId}`, label: "Summary" },
  { href: `/projects/${projectId}/chapters/${chapterId}/edit`, label: "Edit" },
  { href: `/projects/${projectId}/chapters/${chapterId}/generate`, label: "Generate" },
  { href: `/projects/${projectId}/chapters/${chapterId}/review`, label: "Review" },
  { href: `/projects/${projectId}/chapters/${chapterId}/read`, label: "Reader" },
];

export default async function ChapterStudioLayout({ children, params }: Props) {
  const user = await getCurrentUser();
  const { id, chapterId } = await params;

  let allChapters: Array<{ id: string; chapterNumber: number; title: string | null }> = [];
  try {
    allChapters = await prisma.chapter.findMany({
      where: { projectId: id, project: { userId: user.id } },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true, title: true },
    });
  } catch {
    // non-bloquant
  }

  let chapter: Awaited<ReturnType<typeof prisma.chapter.findFirst>> | null = null;
  try {
    chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, projectId: id, project: { userId: user.id } },
    });
  } catch (err) {
    console.error("[chapter-layout] DB error:", err instanceof Error ? err.message : err);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">Chapitre temporairement inaccessible.</p>
        <p className="text-sm text-muted-foreground">La base de données est en cours de mise à jour. Réessaie dans quelques instants.</p>
        <Link href={`/projects/${id}/chapters`} className="rounded-xl border border-border/60 px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">← Chapitres</Link>
      </div>
    );
  }

  if (!chapter) notFound();

  let studio: ReturnType<typeof readChapterStudioSnapshotFromOutline>;
  let readiness: ReturnType<typeof buildChapterReadinessReport>;
  try {
    studio = readChapterStudioSnapshotFromOutline({
      outline: chapter.outline,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      cliffhanger: chapter.cliffhanger,
      userIntent: chapter.userIntent,
      studioStatus: chapter.studioStatus,
      studioCurrentStep: chapter.studioCurrentStep,
      studioUpdatedAt: chapter.studioUpdatedAt,
      studioAutosaveVersion: chapter.studioAutosaveVersion,
      minimumImages: chapter.minimumImages,
      generatedImages: chapter.generatedImages,
      acceptedImages: chapter.acceptedImages,
      rejectedImages: chapter.rejectedImages,
      missingImages: chapter.missingImages,
      criticalPanelsCount: chapter.criticalPanelsCount,
      criticalPanelsBlocked: chapter.criticalPanelsBlocked,
      criticalPanelsMissingQa: chapter.criticalPanelsMissingQa,
      reviewBlockedReason: chapter.reviewBlockedReason,
    });
    readiness = studio.data.readinessReport ?? buildChapterReadinessReport(studio);
  } catch {
    // Données studio corrompues → continuer sans le bandeau readiness
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
          <Link href={`/projects/${id}/chapters`} className="text-sm text-muted-foreground hover:text-foreground">← Retour aux chapitres</Link>
          <h1 className="mt-2 text-3xl font-semibold">{chapter.title ?? `Chapitre ${chapter.chapterNumber}`}</h1>
          <p className="mt-1 text-xs text-amber-400/80">Données studio en cours de reconstruction…</p>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link href={`/projects/${id}/chapters`} className="text-sm text-muted-foreground hover:text-foreground">
                ← Chapitres
              </Link>
              {allChapters.length > 1 && (
                <ChapterSwitcher
                  projectId={id}
                  currentChapterId={chapterId}
                  chapters={allChapters}
                />
              )}
            </div>
            <h1 className="mt-2 text-3xl font-semibold">{chapter.title ?? `Chapitre ${chapter.chapterNumber}`}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{chapter.summary ?? chapter.userIntent ?? "Aucun résumé disponible."}</p>
          </div>
          <div className="space-y-2 text-sm">
            <ChapterStatusBadge status={studio.status} />
            <p className="text-muted-foreground">
              {readiness.imageCounts.acceptedImages}/{readiness.imageCounts.minimumImages} images acceptées
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {chapterNav(id, chapterId).map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
