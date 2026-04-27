"use client";

/**
 * PremiumRunAuditPanel
 *
 * P1.17 — Panneau d'observabilité pour les runs premium.
 *
 * Affiche:
 *   - generationRunId
 *   - hashes des contrats
 *   - scores de qualité
 *   - statuts panel par panel
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface PanelAuditData {
  panelId: string;
  panelNumber: number;
  sourceBeatId: string | null;
  narrativeRole: string | null;
  microAction: string | null;
  requiredCharacters: string[];
  requiredProps: string[];
  requiredNpcGroups: string[];
  textContract: {
    hasText: boolean;
    dialogueCount: number;
    hasNarration: boolean;
    hasSfx: boolean;
  } | null;
  finalPrompt: string | null;
  promptHash: string | null;
  imageStatus: string;
  qaStatus: string | null;
  blockers: string[];
  stableImageUrl: string | null;
}

interface AuditData {
  chapterId: string;
  generationRunId: string | null;
  approvedOutlineHash: string | null;
  productionPlanHash: string | null;
  chapterGenerationContractHash: string | null;
  panelCountExpected: number;
  panelCountRendered: number;
  panelCountValidated: number;
  scores: {
    storyExtraction: number;
    storyboard: number;
    promptContract: number;
    characterCanon: number;
    dialogue: number;
    visionQa: number;
  };
  fallbackCount: number;
  qaUnavailableCount: number;
  manualReviewCount: number;
  panels: PanelAuditData[];
}

interface PremiumRunAuditPanelProps {
  chapterId: string;
  className?: string;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const percentage = Math.round(score * 100);
  const color =
    percentage >= 90
      ? "bg-green-500"
      : percentage >= 70
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono">{percentage}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    completed: "bg-green-500",
    validated: "bg-blue-500",
    pending: "bg-yellow-500",
    failed: "bg-red-500",
    qa_unavailable: "bg-orange-500",
    manual_review: "bg-purple-500",
  };

  return (
    <Badge className={cn("text-white", variants[status] ?? "bg-gray-500")}>
      {status}
    </Badge>
  );
}

export function PremiumRunAuditPanel({
  chapterId,
  className,
}: PremiumRunAuditPanelProps) {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAuditData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/internal/premium-run-audit/${chapterId}`
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch: ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchAuditData();
  }, [chapterId]);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <p className="text-destructive">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Premium Run Audit</span>
          {data.generationRunId && (
            <Badge variant="outline" className="font-mono text-xs">
              {data.generationRunId.slice(0, 8)}...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            <TabsTrigger value="panels">Panels ({data.panels.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Contract Hashes</p>
                <div className="space-y-1 font-mono text-xs">
                  <p>
                    Outline:{" "}
                    {data.approvedOutlineHash?.slice(0, 12) ?? "N/A"}...
                  </p>
                  <p>
                    Plan:{" "}
                    {data.productionPlanHash?.slice(0, 12) ?? "N/A"}...
                  </p>
                  <p>
                    Contract:{" "}
                    {data.chapterGenerationContractHash?.slice(0, 12) ?? "N/A"}...
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Panel Status</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold">{data.panelCountExpected}</p>
                    <p className="text-xs text-muted-foreground">Expected</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.panelCountRendered}</p>
                    <p className="text-xs text-muted-foreground">Rendered</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.panelCountValidated}</p>
                    <p className="text-xs text-muted-foreground">Validated</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-500">
                  {data.fallbackCount}
                </p>
                <p className="text-xs text-muted-foreground">AI Fallbacks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-500">
                  {data.qaUnavailableCount}
                </p>
                <p className="text-xs text-muted-foreground">QA Unavailable</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-500">
                  {data.manualReviewCount}
                </p>
                <p className="text-xs text-muted-foreground">Manual Review</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scores" className="space-y-4 mt-4">
            <ScoreBar label="Story Extraction" score={data.scores.storyExtraction} />
            <ScoreBar label="Storyboard" score={data.scores.storyboard} />
            <ScoreBar label="Prompt Contract" score={data.scores.promptContract} />
            <ScoreBar label="Character Canon" score={data.scores.characterCanon} />
            <ScoreBar label="Dialogue" score={data.scores.dialogue} />
            <ScoreBar label="Vision QA" score={data.scores.visionQa} />
          </TabsContent>

          <TabsContent value="panels" className="mt-4">
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Characters</TableHead>
                    <TableHead>Text</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>QA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.panels.map((panel) => (
                    <TableRow key={panel.panelId}>
                      <TableCell className="font-mono">
                        {panel.panelNumber}
                      </TableCell>
                      <TableCell className="text-xs">
                        {panel.narrativeRole ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {panel.microAction ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {panel.requiredCharacters.join(", ") || "-"}
                      </TableCell>
                      <TableCell>
                        {panel.textContract ? (
                          <span className="text-xs">
                            {panel.textContract.dialogueCount > 0 && `${panel.textContract.dialogueCount} dlg`}
                            {panel.textContract.hasNarration && " + narr"}
                            {panel.textContract.hasSfx && " + sfx"}
                            {!panel.textContract.hasText && "silent"}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={panel.imageStatus} />
                      </TableCell>
                      <TableCell>
                        {panel.qaStatus ? (
                          <StatusBadge status={panel.qaStatus} />
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
