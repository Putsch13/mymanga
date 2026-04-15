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
        <div className="tooltip-content absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2">
          <p className="leading-relaxed">{text}</p>
          {example && (
            <p className="mt-2 rounded border border-white/[0.08] bg-white/[0.05] px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              Ex : {example}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
