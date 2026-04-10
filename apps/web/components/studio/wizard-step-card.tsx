"use client";

import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WizardStepCard(props: {
  title: string;
  description: string;
  state: "done" | "current" | "blocked";
}) {
  const Icon = props.state === "done" ? CheckCircle2 : props.state === "current" ? Circle : AlertTriangle;
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </CardContent>
    </Card>
  );
}
