"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  findRepairActions,
  type RepairAction,
  type RepairContext,
} from "@/lib/studio/repair-actions";

interface RepairActionButtonsProps {
  blockerCodes: string[];
  context: RepairContext;
  onRepaired?: (actionId: string) => void;
  variant?: "inline" | "block";
}

type ActionState = { body: Record<string, unknown> | null; disabled: boolean };

export function RepairActionButtons({
  blockerCodes,
  context,
  onRepaired,
  variant = "inline",
}: RepairActionButtonsProps) {
  const router = useRouter();
  const actions = findRepairActions(blockerCodes);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Memoize buildBody per action so we don't recompute it twice per render.
  // Recomputed only when context object reference changes.
  const actionStates = useMemo<Record<string, ActionState>>(() => {
    const map: Record<string, ActionState> = {};
    for (const a of actions) {
      const body = a.buildBody ? a.buildBody(context) : {};
      map[a.id] = { body, disabled: body === null };
    }
    return map;
  }, [actions, context]);

  if (actions.length === 0) return null;

  const runAction = async (action: RepairAction) => {
    setPending(action.id);
    setError(null);
    setSuccess(null);
    try {
      const body = actionStates[action.id]?.body ?? null;
      if (body === null) {
        throw new Error("Donnée manquante pour cette réparation. Complète l'intention/le héros avant.");
      }
      const res = await fetch(action.endpoint(context), {
        method: action.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => "");
        let userMessage = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string };
          userMessage = parsed.message ?? parsed.error ?? userMessage;
        } catch {
          if (text) userMessage = text.slice(0, 200);
        }
        throw new Error(userMessage);
      }
      setSuccess(action.label);
      onRepaired?.(action.id);
      // Refresh server components so the readiness dashboard re-evaluates the
      // newly persisted state (e.g. INTENT_CONTRACT_REQUIRED disappears).
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Réparation impossible");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={variant === "block" ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
      {actions.map((action) => {
        const state = actionStates[action.id];
        const disabled = pending !== null || (state?.disabled ?? true);
        return (
          <div key={action.id} className={variant === "block" ? "flex flex-col gap-1" : "inline-flex"}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => runAction(action)}
              disabled={disabled}
              className="gap-1.5"
              title={state?.disabled ? "Donnée manquante (intention, héros…)" : undefined}
            >
              {pending === action.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wrench className="h-3.5 w-3.5" />
              )}
              {action.label}
            </Button>
            {variant === "block" ? (
              <span className="text-[11px] text-muted-foreground">{action.description}</span>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <span className="text-xs text-red-400">{error}</span>
      ) : null}
      {success && !error ? (
        <span className="inline-flex items-center gap-1 text-xs text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          {success} — appliqué
        </span>
      ) : null}
    </div>
  );
}
