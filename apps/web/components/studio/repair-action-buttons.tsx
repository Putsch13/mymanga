"use client";

import { useState } from "react";
import { Loader2, Wrench } from "lucide-react";
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

export function RepairActionButtons({
  blockerCodes,
  context,
  onRepaired,
  variant = "inline",
}: RepairActionButtonsProps) {
  const actions = findRepairActions(blockerCodes);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (actions.length === 0) return null;

  const runAction = async (action: RepairAction) => {
    setPending(action.id);
    setError(null);
    try {
      const res = await fetch(action.endpoint(context), {
        method: action.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200) || "réparation indisponible"}`);
      }
      onRepaired?.(action.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Réparation impossible");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className={variant === "block" ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
      {actions.map((action) => (
        <div key={action.id} className={variant === "block" ? "flex flex-col gap-1" : "inline-flex"}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => runAction(action)}
            disabled={pending !== null}
            className="gap-1.5"
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
      ))}
      {error ? (
        <span className="text-xs text-red-400">{error}</span>
      ) : null}
    </div>
  );
}
