import type { ProductionPlan } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProductionPlanCard({ plan }: { plan: ProductionPlan | null | undefined }) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">Production Plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Pages</p>
            <p>{plan?.pageCount ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Images estimées</p>
            <p>{plan?.estimatedImages ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Images cibles</p>
            <p>{plan?.targetImages ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Minimum</p>
            <p>{plan?.minimumImages ?? 55}</p>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground">Risques de compression</p>
          <ul className="mt-2 space-y-1">
            {(plan?.compressionRisks ?? []).length > 0 ? (
              plan?.compressionRisks.map((risk) => <li key={risk}>- {risk}</li>)
            ) : (
              <li>- Aucun risque majeur détecté</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
