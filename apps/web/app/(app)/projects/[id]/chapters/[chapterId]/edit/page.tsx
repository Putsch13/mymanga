import { Suspense } from "react";
import { ChapterStudioEditor } from "@/components/studio/chapter-studio-editor";
import { ChapterInterviewStudio } from "@/components/studio/chapter-interview-studio";

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ChapterEditPage({ params, searchParams }: Props) {
  const { id, chapterId } = await params;
  const { mode } = await searchParams;
  // Refonte UX : la vue conversationnelle est le parcours par défaut.
  // `?mode=advanced` rouvre l'éditeur wizard historique (filet le temps
  // de valider le conversationnel sur de vraies générations).
  const advanced = mode === "advanced";

  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Chargement du studio…</div>}>
      {advanced ? (
        <ChapterStudioEditor projectId={id} chapterId={chapterId} />
      ) : (
        <ChapterInterviewStudio projectId={id} chapterId={chapterId} />
      )}
    </Suspense>
  );
}
