import Link from "next/link";
import { notFound } from "next/navigation";
import { MangaBookReader } from "@/components/manga/manga-book-reader";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { prisma } from "@manga-ai-studio/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; chapterId: string }> };

export default async function MangaReadPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id: projectId, chapterId } = await params;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
  if (!project) notFound();
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!chapter) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${projectId}/chapters`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Chapitres
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Lecture · {chapter.title ?? `Chapitre ${chapter.chapterNumber}`}
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Effet livre ouvert, feuilletage par bouton, bascule texte / cases (spec §19.4). À la fin : choix de suite (§4.9).
        </p>
      </div>
      <MangaBookReader projectId={projectId} chapterId={chapterId} />
    </div>
  );
}
