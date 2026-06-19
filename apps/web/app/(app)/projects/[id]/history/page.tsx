import { notFound } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ProjectHistoryPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      chapters: {
        orderBy: { chapterNumber: "desc" },
        take: 20,
      },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-4">
      {project.chapters.map((chapter) => {
        const studio = readChapterStudioSnapshotFromOutline({
          outline: chapter.outline,
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title,
          chapterSummary: chapter.summary,
          cliffhanger: chapter.cliffhanger,
          userIntent: chapter.userIntent,
        });
        return (
          <Card key={chapter.id} className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="text-base">{chapter.title ?? `Chapitre ${chapter.chapterNumber}`}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Statut studio: {studio.status}</p>
              {(studio.history ?? []).length > 0 ? (
                studio.history.map((entry, index) => (
                  <p key={`${chapter.id}-${index}`}>- {entry.from} {"->"} {entry.to} ({entry.reason ?? "transition"})</p>
                ))
              ) : (
                <p>- Aucun historique studio persisté.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
