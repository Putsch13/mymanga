"use client";

import type { ChapterReadinessIssue } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StudioInlineIssues({
  title,
  issues,
  tone = "warning",
  emptyLabel,
  testIdPrefix,
  onAction,
}: {
  title: string;
  issues: ChapterReadinessIssue[];
  tone?: "warning" | "neutral";
  emptyLabel?: string | null;
  testIdPrefix?: string | null;
  onAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
}) {
  if (issues.length === 0 && !emptyLabel) return null;

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {issues.length > 0 ? issues.map((issue) => (
          <div
            key={issue.id}
            className={`flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between ${
              tone === "warning"
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-border/60 bg-background/30"
            }`}
          >
            <div className="space-y-1">
              <p className="font-medium">{issue.message}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{issue.step.replaceAll("_", " ")}</p>
            </div>
            <Button
              data-testid={testIdPrefix ? `${testIdPrefix}-${issue.id}` : undefined}
              type="button"
              variant={tone === "warning" ? "secondary" : "outline"}
              onClick={() => void onAction(issue)}
            >
              {issue.ctaLabel ?? "Corriger"}
            </Button>
          </div>
        )) : (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {emptyLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
