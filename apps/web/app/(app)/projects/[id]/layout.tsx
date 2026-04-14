import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { ChapterStatusBadge } from "@/components/studio/chapter-status-badge";
import { buildChapterStudioListItem } from "@/lib/chapter-studio";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

const projectNav = (id: string) => [
  { href: `/projects/${id}`, label: "Overview" },
  { href: `/projects/${id}/bible`, label: "Bible" },
  { href: `/projects/${id}/characters`, label: "Characters" },
  { href: `/projects/${id}/canon`, label: "Canon" },
  { href: `/projects/${id}/chapters`, label: "Chapters" },
  { href: `/projects/${id}/assets`, label: "Assets" },
  { href: `/projects/${id}/settings`, label: "Settings" },
  { href: `/projects/${id}/history`, label: "History" },
];

export default async function ProjectStudioLayout({ children, params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;

  let project: Awaited<ReturnType<typeof prisma.project.findFirst>> & {
    chapters: Awaited<ReturnType<typeof prisma.chapter.findMany>>;
  } | null = null;

  try {
    project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        chapters: {
          orderBy: { chapterNumber: "desc" },
          take: 1,
        },
      },
    });
  } catch (err) {
    console.error("[project-layout] DB error:", err instanceof Error ? err.message : err);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">Projet temporairement inaccessible.</p>
        <p className="text-sm text-muted-foreground">La base de données est en cours de mise à jour. Réessaie dans quelques instants.</p>
        <Link href="/dashboard" className="rounded-xl border border-border/60 px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground">← Dashboard</Link>
      </div>
    );
  }

  if (!project) notFound();

  let currentChapter: ReturnType<typeof buildChapterStudioListItem> | null = null;
  try {
    currentChapter = project.chapters[0]
      ? buildChapterStudioListItem({
          id: project.chapters[0].id,
          chapterNumber: project.chapters[0].chapterNumber,
          title: project.chapters[0].title,
          status: project.chapters[0].status,
          summary: project.chapters[0].summary,
          cliffhanger: project.chapters[0].cliffhanger,
          outline: project.chapters[0].outline,
          studioStatus: project.chapters[0].studioStatus,
          studioCurrentStep: project.chapters[0].studioCurrentStep,
          studioUpdatedAt: project.chapters[0].studioUpdatedAt,
          studioAutosaveVersion: project.chapters[0].studioAutosaveVersion,
          minimumImages: project.chapters[0].minimumImages,
          generatedImages: project.chapters[0].generatedImages,
          acceptedImages: project.chapters[0].acceptedImages,
          rejectedImages: project.chapters[0].rejectedImages,
          missingImages: project.chapters[0].missingImages,
          criticalPanelsCount: project.chapters[0].criticalPanelsCount,
          criticalPanelsBlocked: project.chapters[0].criticalPanelsBlocked,
          criticalPanelsMissingQa: project.chapters[0].criticalPanelsMissingQa,
          reviewBlockedReason: project.chapters[0].reviewBlockedReason,
        })
      : null;
  } catch {
    currentChapter = null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-2xl border border-border/60 bg-card/30 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
          <h1 className="mt-2 text-2xl font-semibold">{project.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{project.pitch ?? "Aucun pitch défini."}</p>
        </div>
        <nav className="space-y-1">
          {projectNav(id).map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        {currentChapter ? (
          <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
            <p className="text-muted-foreground">Chapitre actif</p>
            <p className="mt-1 font-medium">{currentChapter.title ?? `Chapitre ${currentChapter.chapterNumber}`}</p>
            <div className="mt-2">
              <ChapterStatusBadge status={currentChapter.studioStatus} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              QA {currentChapter.readinessReport.imageCounts.acceptedImages}/{currentChapter.readinessReport.imageCounts.minimumImages} images acceptées
            </p>
          </div>
        ) : null}
      </aside>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
