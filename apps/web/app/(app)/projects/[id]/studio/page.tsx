import { redirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";

type Props = { params: Promise<{ id: string }> };

export default async function StudioRedirectPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const lastChapter = await prisma.chapter.findFirst({
    where: { project: { id, userId: user.id } },
    orderBy: { chapterNumber: "desc" },
  });
  if (lastChapter) {
    redirect(`/projects/${id}/chapters/${lastChapter.id}/edit`);
  }
  redirect(`/projects/${id}/chapters/new`);
}
