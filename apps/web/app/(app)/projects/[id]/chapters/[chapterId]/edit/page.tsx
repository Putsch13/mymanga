import { ChapterStudioEditor } from "@/components/studio/chapter-studio-editor";

type Props = {
  params: Promise<{ id: string; chapterId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ChapterEditPage({ params }: Props) {
  const { id, chapterId } = await params;
  return <ChapterStudioEditor projectId={id} chapterId={chapterId} />;
}
