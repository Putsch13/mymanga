"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

export function FieldTooltip({ text, example }: { text: string; example?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors focus:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="Aide"
        tabIndex={0}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-border/60 bg-popover px-4 py-3 text-xs text-popover-foreground shadow-xl">
          <p className="leading-relaxed">{text}</p>
          {example && (
            <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 font-mono leading-relaxed text-muted-foreground">
              Ex : {example}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
