import { notFound } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { buildCharacterCanonFromCharacter, buildProjectCanonFromProject } from "@/lib/chapter-studio";
import { CanonLockBadge } from "@/components/studio/canon-lock-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function ProjectCanonPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      settings: true,
      stylePacks: { orderBy: { version: "desc" }, take: 1 },
      storyBible: true,
      characters: {
        include: {
          visualRefs: { include: { mediaAsset: true }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!project) notFound();

  const projectCanon = buildProjectCanonFromProject({
    visualStyle: project.visualStyle,
    tone: project.tone,
    settings: project.settings,
    bible: project.storyBible
      ? {
          summary: project.storyBible.summary,
          themes: project.storyBible.themes,
          worldRules: project.storyBible.worldRules,
          lockedCanon: project.storyBible.lockedCanon,
        }
      : null,
    stylePack: project.stylePacks[0]
      ? {
          renderFamily: project.stylePacks[0].renderFamily,
          lineWeight: project.stylePacks[0].lineWeight,
          shadingMode: project.stylePacks[0].shadingMode,
          contrastProfile: project.stylePacks[0].contrastProfile,
          anatomyBias: project.stylePacks[0].anatomyBias,
          backgroundDensity: project.stylePacks[0].backgroundDensity,
          cameraLanguage: project.stylePacks[0].cameraLanguage,
          negativeConstraints: project.stylePacks[0].negativeConstraints,
        }
      : null,
  });

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Project Canon</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm lg:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Art style canon</p>
            <p>{projectCanon.artStyleCanon.join(" · ") || "Aucun"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Règles du monde</p>
            <p>{projectCanon.worldRules.join(" · ") || "Aucune"}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {project.characters.map((character) => {
          const canon = buildCharacterCanonFromCharacter({
            id: character.id,
            name: character.name,
            roleType: character.roleType,
            appearance: character.appearance,
            hairColor: character.hairColor,
            eyeColor: character.eyeColor,
            outfitDefault: character.outfitDefault,
            visualProfile: character.visualProfile,
            wardrobeProfile: character.wardrobeProfile,
            stableVisualDNA: character.stableVisualDNA,
            canonLocked: character.canonLocked,
            visualRefs: character.visualRefs,
          });
          return (
            <Card key={character.id} className="border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  {character.name}
                  <CanonLockBadge strength={canon.lockStrength} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>{canon.mustKeep.join(" · ") || "Traits à préciser."}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
