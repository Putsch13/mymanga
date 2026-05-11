/**
 * P5.2 — Hook autofill pour le ChapterStudio.
 *
 * Encapsule l'état (`autofilling`, `autofillResult`) et 2 modes :
 *   - `runAutofill(mode)` : 'all_missing' | 'repair_readiness' | 'brief'.
 *   - `rewriteBeat(beatId, instructions)` : réécriture ciblée d'un beat (BUG-09).
 *
 * Délègue le save final via le `save` callback fourni par le composant parent.
 */
import { useCallback, useState } from "react";
import type { AutofillMeta, ChapterStudioData, ChapterStudioStep } from "@manga-ai-studio/core";

export type AutofillMode = "all_missing" | "repair_readiness" | "brief";

export interface AutofillResult {
  meta: AutofillMeta;
  appliedFields: string[];
  unresolvedQuestions: string[];
}

interface UseChapterStudioAutofillArgs {
  projectId: string;
  chapterId: string;
  draft: ChapterStudioData | null;
  activeStudioStep: ChapterStudioStep;
  save: (next: ChapterStudioData, step?: ChapterStudioStep) => Promise<void>;
  setMessage: (m: string | null) => void;
}

export interface UseChapterStudioAutofillReturn {
  autofilling: boolean;
  autofillResult: AutofillResult | null;
  setAutofillResult: (result: AutofillResult | null) => void;
  runAutofill: (mode: AutofillMode) => Promise<void>;
  rewriteBeat: (beatId: string, userInstructions: string) => Promise<void>;
}

export function useChapterStudioAutofill(
  args: UseChapterStudioAutofillArgs,
): UseChapterStudioAutofillReturn {
  const { projectId, chapterId, draft, activeStudioStep, save, setMessage } = args;
  const [autofilling, setAutofilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);

  const runAutofill = useCallback(async (mode: AutofillMode) => {
    if (!draft) return;
    setAutofilling(true);
    setAutofillResult(null);
    setMessage("Complétion IA en cours…");
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/autofill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, force: false }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "La complétion IA a échoué.");
        return;
      }
      if (json.blocked) {
        setMessage(json.blockedMessage ?? "Complétion IA impossible pour le moment.");
        return;
      }
      if (json.appliedFields?.length > 0 && json.suggestedPatch) {
        const nextDraft: ChapterStudioData = {
          ...draft,
          ...json.suggestedPatch,
          autofillMeta: json.meta,
        };
        await save(nextDraft, activeStudioStep);
        setAutofillResult({
          meta: json.meta,
          appliedFields: json.appliedFields,
          unresolvedQuestions: json.unresolvedQuestions ?? [],
        });
        setMessage(
          `L'IA a complété ${json.appliedFields.length} champ(s). À vérifier : ${json.appliedFields.join(", ")}.`,
        );
      } else {
        setMessage(json.emptyPatchReason ?? "Aucun champ vide détecté");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      const isParseError = msg.includes("did not match") || msg.includes("JSON") || msg.includes("SyntaxError");
      const isNetwork = msg.includes("fetch") || msg.includes("network") || msg.includes("Failed");
      setMessage(
        isParseError
          ? "La réponse du serveur était inattendue. Réessaie dans quelques secondes."
          : isNetwork
            ? "Erreur réseau — vérifie ta connexion et réessaie."
            : `Erreur lors de la complétion IA : ${msg}`,
      );
    } finally {
      setAutofilling(false);
    }
  }, [activeStudioStep, chapterId, draft, projectId, save, setMessage]);

  const rewriteBeat = useCallback(async (beatId: string, userInstructions: string) => {
    if (!draft || !beatId) return;
    setAutofilling(true);
    setAutofillResult(null);
    setMessage("Réécriture du temps en cours…");
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/autofill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "rewrite_beat",
          force: false,
          targetBeatId: beatId,
          userInstructions: userInstructions.length > 0 ? userInstructions : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "La réécriture du beat a échoué.");
        return;
      }
      if (json.blocked) {
        setMessage(json.blockedMessage ?? "Réécriture impossible pour le moment.");
        return;
      }
      if (json.appliedFields?.length > 0 && json.suggestedPatch) {
        const nextDraft: ChapterStudioData = {
          ...draft,
          ...json.suggestedPatch,
          autofillMeta: json.meta,
        };
        await save(nextDraft, activeStudioStep);
        setAutofillResult({
          meta: json.meta,
          appliedFields: json.appliedFields,
          unresolvedQuestions: json.unresolvedQuestions ?? [],
        });
        setMessage(`Beat réécrit. L'IA a touché : ${json.appliedFields.join(", ")}.`);
      } else {
        setMessage(json.emptyPatchReason ?? "Aucune modification retournée par l'IA.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setMessage(`Erreur lors de la réécriture : ${msg}`);
    } finally {
      setAutofilling(false);
    }
  }, [activeStudioStep, chapterId, draft, projectId, save, setMessage]);

  return {
    autofilling,
    autofillResult,
    setAutofillResult,
    runAutofill,
    rewriteBeat,
  };
}
