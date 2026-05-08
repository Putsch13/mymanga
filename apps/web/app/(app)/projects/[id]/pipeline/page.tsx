import { permanentRedirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";

type Props = { params: Promise<{ id: string }> };

/**
 * P1.7 + Sprint 1 (TASK-1.1) — Le pipeline plein écran est mort.
 * Le studio chapitre (`…/edit`) est le chemin canonique unique.
 * On garde uniquement la redirection vers le premier chapitre du projet
 * (ou la création si aucun chapitre n'existe encore).
 */
export default async function PipelinePage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const first = await prisma.chapter.findFirst({
    where: { projectId: id, project: { userId: user.id } },
    orderBy: { chapterNumber: "asc" },
    select: { id: true },
  });
  if (first) {
    permanentRedirect(`/projects/${id}/chapters/${first.id}/edit`);
  }
  permanentRedirect(`/projects/${id}/chapters/new`);
}
