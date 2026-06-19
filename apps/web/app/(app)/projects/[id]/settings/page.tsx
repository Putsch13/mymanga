import { notFound } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { settings: true },
  });
  if (!project) notFound();

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">Project Settings</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm lg:grid-cols-3">
        <div><p className="text-muted-foreground">Violence</p><p>{project.settings?.violenceLevel ?? 0}/100</p></div>
        <div><p className="text-muted-foreground">Romance</p><p>{project.settings?.romanceLevel ?? 0}/100</p></div>
        <div><p className="text-muted-foreground">Canon strictness</p><p>{project.settings?.canonStrictness ?? 0}/100</p></div>
      </CardContent>
    </Card>
  );
}
