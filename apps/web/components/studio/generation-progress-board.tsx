import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function GenerationProgressBoard(props: {
  title?: string;
  progress: number;
  currentStep?: string | null;
  stats?: {
    total?: number;
    completed?: number;
    failed?: number;
    pending?: number;
  } | null;
}) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">{props.title ?? "Generation Progress"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={props.progress} />
        <p className="text-sm text-muted-foreground">{props.currentStep ?? "En attente..."}</p>
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <div><p className="text-muted-foreground">Total</p><p>{props.stats?.total ?? 0}</p></div>
          <div><p className="text-muted-foreground">Générées</p><p>{props.stats?.completed ?? 0}</p></div>
          <div><p className="text-muted-foreground">Échecs</p><p>{props.stats?.failed ?? 0}</p></div>
          <div><p className="text-muted-foreground">En attente</p><p>{props.stats?.pending ?? 0}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
