import type { ChapterNarrativeContract } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function NarrativeContractCard({ contract }: { contract: ChapterNarrativeContract | null | undefined }) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">Narrative Contract</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Objectif émotionnel</p>
          <p>{contract?.emotionalGoal ?? "À définir"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Conflit central</p>
          <p>{contract?.centralConflict ?? "À définir"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">État héros début</p>
          <p>{contract?.heroStateAtStart ?? "À définir"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">État héros fin</p>
          <p>{contract?.heroStateAtEnd ?? "À définir"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Question de chapitre</p>
          <p>{contract?.chapterQuestion ?? "À définir"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Fin attendue</p>
          <p>{contract?.endingMode ?? "À définir"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
