import { Suspense } from "react";
import { DemoReaderClient } from "./demo-reader-client";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DemoReaderPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const readOne = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Ouverture de la démo reader…</div>}>
      <DemoReaderClient
        custom={readOne("custom") === "1"}
        customProjectTitle={readOne("title")}
        customChapterTitle={readOne("chapterTitle")}
        customTone={readOne("tone")}
        customIntent={readOne("intent")}
      />
    </Suspense>
  );
}
