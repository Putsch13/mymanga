import { Suspense } from "react";
import { DemoLabClient } from "./demo-lab-client";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DemoLabPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const project = params.project;
  const initialProject = Array.isArray(project) ? project[0] : project;

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Ouverture du labo de démo…</div>}>
      <DemoLabClient initialProject={initialProject} />
    </Suspense>
  );
}

