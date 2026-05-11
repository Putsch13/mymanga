"use client";

/**
 * P5.2 — Bandeau d'actions du studio (résumé + boutons autofill).
 *
 * Affiche :
 *   - Le résumé chapitre (titre + summary court).
 *   - Le bouton "Complétion IA des champs manquants" (mode adaptatif `brief`
 *     ou `all_missing` selon longueur du pitch).
 *   - Le bouton "Réparer ce qui bloque" (visible uniquement si blockerItems).
 *   - Le panel `autofillResult` (confiance + champs touchés + questions).
 *   - Le message de feedback `message`.
 *
 * Pas d'état interne : tout est piloté par les props.
 */
import type { ChapterReadinessIssue } from "@manga-ai-studio/core";
import { Button } from "@/components/ui/button";
import type { AutofillMode, AutofillResult } from "./use-chapter-studio-autofill";

interface ChapterStudioActionBarProps {
  summary: { title: string; summary?: string | null };
  pitch: string;
  blockerItems: ChapterReadinessIssue[];
  autofilling: boolean;
  autofillResult: AutofillResult | null;
  message: string | null;
  onRunAutofill: (mode: AutofillMode) => void;
}

export function ChapterStudioActionBar({
  summary,
  pitch,
  blockerItems,
  autofilling,
  autofillResult,
  message,
  onRunAutofill,
}: ChapterStudioActionBarProps) {
  const trimmedPitch = pitch.trim();
  const adaptiveMode: AutofillMode = trimmedPitch.length < 5 ? "brief" : "all_missing";
  const repairMode: AutofillMode = trimmedPitch.length < 5 ? "brief" : "repair_readiness";

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold">{summary.title}</p>
        {summary.summary ? (
          <p className="mt-1 text-sm text-muted-foreground">{summary.summary}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="autofill-all-missing"
          size="sm"
          variant="outline"
          disabled={autofilling}
          onClick={() => onRunAutofill(adaptiveMode)}
        >
          {autofilling
            ? "IA en cours…"
            : trimmedPitch.length < 5
              ? "L'IA génère le brief pour moi"
              : "Complétion IA des champs manquants"}
        </Button>
        {blockerItems.length > 0 ? (
          <Button
            data-testid="autofill-repair-readiness"
            size="sm"
            variant="ghost"
            disabled={autofilling}
            onClick={() => onRunAutofill(repairMode)}
          >
            Réparer ce qui bloque
          </Button>
        ) : null}
      </div>

      {autofillResult ? (
        <div
          className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-1"
          data-testid="autofill-result"
        >
          <p className="font-medium text-foreground/80">
            Complétion IA — confiance : {Math.round(autofillResult.meta.confidence * 100)}%
          </p>
          {autofillResult.appliedFields.length > 0 ? (
            <p className="text-muted-foreground">
              L&apos;IA a complété {autofillResult.appliedFields.length} champ(s) : {autofillResult.appliedFields.join(", ")}
            </p>
          ) : null}
          {autofillResult.unresolvedQuestions.length > 0 ? (
            <div>
              <p className="text-amber-600 dark:text-amber-400 font-medium">À valider manuellement :</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                {autofillResult.unresolvedQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p data-testid="studio-message" className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
