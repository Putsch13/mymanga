import type { ChapterQAReport } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QAResultCard({ report }: { report: ChapterQAReport | null | undefined }) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">QA Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-muted-foreground">Score chapitre</p><p>{report ? `${Math.round(report.chapterScore * 100)}%` : "n/a"}</p></div>
          <div><p className="text-muted-foreground">Panels acceptés</p><p>{report?.acceptedPanelCount ?? 0}</p></div>
          <div><p className="text-muted-foreground">Panels rejetés</p><p>{report?.rejectedPanelCount ?? 0}</p></div>
        </div>
        <div>
          <p className="text-muted-foreground">Panels critiques manquants</p>
          <ul className="mt-2 space-y-1">
            {(report?.missingCriticalPanels ?? []).length > 0 ? (
              report?.missingCriticalPanels.map((panelId) => <li key={panelId}>- {panelId}</li>)
            ) : (
              <li>- Aucun</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
