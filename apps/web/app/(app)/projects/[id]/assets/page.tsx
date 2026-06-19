import { notFound } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ProjectAssetsPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      mediaAssets: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Assets Manager</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm lg:grid-cols-2">
          {project.mediaAssets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-border/60 p-3">
              <p className="font-medium">{asset.type}</p>
              <p className="text-muted-foreground">{asset.origin} · {asset.ownerType ?? "project"}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">{asset.publicUrl ?? asset.storageKey ?? "Aucune URL"}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
