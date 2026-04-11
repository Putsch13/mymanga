"use client";

import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WizardStepCard(props: {
  title: string;
  description: string;
  state: "done" | "current" | "blocked";
  badge?: string | null;
}) {
  const Icon = props.state === "done" ? CheckCircle2 : props.state === "current" ? Circle : AlertTriangle;
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {props.title}
          </span>
          {props.badge ? (
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {props.badge}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </CardContent>
    </Card>
  );
}
