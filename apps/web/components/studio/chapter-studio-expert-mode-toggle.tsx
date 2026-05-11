"use client";

/**
 * P5.2 — Toggle "Mode expert" / "Mode simplifié" du ChapterStudio.
 *
 * Quand le mode simplifié est actif, certains champs avancés (controls de
 * créativité, contrats avancés…) sont masqués pour réduire la surcharge
 * cognitive du nouvel utilisateur.
 */
interface ChapterStudioExpertModeToggleProps {
  expertMode: boolean;
  onToggle: () => void;
}

export function ChapterStudioExpertModeToggle({
  expertMode,
  onToggle,
}: ChapterStudioExpertModeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
          expertMode
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border/50 bg-background/30 text-muted-foreground hover:border-border"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${expertMode ? "bg-accent" : "bg-muted-foreground/40"}`} />
        {expertMode ? "Mode expert" : "Mode simplifié"}
      </button>
      {!expertMode ? (
        <span className="text-[11px] text-muted-foreground/60">Champs avancés masqués</span>
      ) : null}
    </div>
  );
}
