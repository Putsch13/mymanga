import Link from "next/link";
import { notFound } from "next/navigation";
import { buildChapterReadinessReport } from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { ChapterStatusBadge } from "@/components/studio/chapter-status-badge";
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
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, projectId: id, project: { userId: user.id } },
  });
  if (!chapter) notFound();

  const studio = readChapterStudioSnapshotFromOutline({
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
  const readiness = studio.data.readinessReport ?? buildChapterReadinessReport(studio);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/30 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href={`/projects/${id}/chapters`} className="text-sm text-muted-foreground hover:text-foreground">
              ← Retour aux chapitres
            </Link>
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
