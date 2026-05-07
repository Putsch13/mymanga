import { permanentRedirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";

type Props = { params: Promise<{ id: string }> };

/**
 * P1.7 — Le pipeline plein écran est déprécié : le studio chapitre (`…/edit`) est le chemin unique.
 * Réactive l’ancienne UI uniquement si `ENABLE_LEGACY_PIPELINE_PAGE=true` (debug / migration).
 */
export default async function PipelinePage({ params }: Props) {
  if (process.env.ENABLE_LEGACY_PIPELINE_PAGE === "true") {
    const { default: LegacyPipelineClient } = await import("./_legacy/pipeline-client");
    return <LegacyPipelineClient />;
  }

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
