import { Suspense } from "react";
import { ChapterInterviewStudio } from "@/components/studio/chapter-interview-studio";

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ChapterEditPage({ params }: Props) {
  const { id, chapterId } = await params;
  // Le studio conversationnel est LE parcours unique (le wizard avancé a été
  // retiré pour ne pas dédoubler les couches IA et alléger le code).
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Chargement du studio…</div>}>
      <ChapterInterviewStudio projectId={id} chapterId={chapterId} />
    </Suspense>
  );
}
