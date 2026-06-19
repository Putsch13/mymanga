import { permanentRedirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";

type Props = { params: Promise<{ id: string }> };

/** P1.7 — Ancienne route projet/generate → studio chapitre moderne. */
export default async function GenerateRedirectPage({ params }: Props) {
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
