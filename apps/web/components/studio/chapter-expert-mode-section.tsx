"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Conteneur repliable pour le mode expert.
 * Masqué par défaut — l'utilisateur peut finir un chapitre sans l'ouvrir.
 */
export function ChapterExpertModeSection({
  children,
  label = "Mode expert",
  defaultOpen = false,
}: {
  children: React.ReactNode;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20" data-testid="expert-mode-section">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        data-testid="expert-mode-toggle"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-xs rounded-full border border-border/60 px-2 py-0.5 uppercase tracking-widest">
            Expert
          </span>
          {label}
        </span>
        <span className="text-xs text-muted-foreground/60">{open ? "▲ Réduire" : "▼ Développer"}</span>
      </button>

      {open ? (
        <div className="border-t border-border/30 px-4 pb-4 pt-3 space-y-4" data-testid="expert-mode-content">
          {children}
        </div>
      ) : null}
    </div>
  );
}
