"use client";

/**
 * P1.6 — Bannière "Canon visuel modifié".
 *
 * Rendu autonome, réutilisable depuis la page character-edit. Affiche les
 * axes critiques modifiés et propose deux actions :
 *   - "Générer une nouvelle ref candidate" (POST /generate-visual)
 *   - "Promouvoir en primaire" (flow séparé, non-traité ici)
 *
 * Le composant ne mute RIEN par lui-même : il appelle les callbacks
 * `onRegenerate` et `onPromote` fournis par le parent.
 */

import type { VisualDriftAxis } from "@/lib/characters/detect-canon-visual-drift";

type Props = {
  critical: VisualDriftAxis[];
  changedAxes: VisualDriftAxis[];
  isBusy?: boolean;
  onRegenerate?: () => void | Promise<void>;
  onPromote?: () => void | Promise<void>;
};

const AXIS_LABELS: Record<VisualDriftAxis, string> = {
  appearance: "Apparence",
  hairColor: "Couleur cheveux",
  eyeColor: "Couleur yeux",
  outfitDefault: "Tenue par défaut",
  visualProfile: "Profil visuel",
  bodyState: "État corporel (cicatrices, prothèses...)",
  wardrobeProfile: "Garde-robe",
  stableVisualDNA: "ADN visuel stable",
};

export function CanonDriftBanner({ critical, changedAxes, isBusy, onRegenerate, onPromote }: Props) {
  if (changedAxes.length === 0) return null;
  const hasCritical = critical.length > 0;

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        hasCritical
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-slate-500/30 bg-slate-500/5 text-slate-200"
      }`}
      role="alert"
    >
      <p className="font-semibold">
        {hasCritical ? "Canon visuel modifié" : "Modifications mineures"}
      </p>
      <p className="mt-1 text-xs opacity-80">
        {hasCritical
          ? "Des traits visuels importants ont changé. Le visuel principal actuel risque de devenir incohérent."
          : "Certains champs ont été modifiés. Pensez à sauvegarder avant de générer un nouveau visuel."}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {changedAxes.map((ax) => (
          <li key={ax}>
            <span className={critical.includes(ax) ? "font-semibold" : ""}>
              • {AXIS_LABELS[ax] ?? ax}
              {critical.includes(ax) ? " (critique)" : ""}
            </span>
          </li>
        ))}
      </ul>
      {hasCritical && (onRegenerate || onPromote) && (
        <div className="mt-3 flex gap-2">
          {onRegenerate && (
            <button
              type="button"
              className="rounded bg-amber-500/20 px-3 py-1 text-xs hover:bg-amber-500/30 disabled:opacity-50"
              onClick={onRegenerate}
              disabled={isBusy}
            >
              Générer une nouvelle ref candidate
            </button>
          )}
          {onPromote && (
            <button
              type="button"
              className="rounded bg-slate-500/20 px-3 py-1 text-xs hover:bg-slate-500/30 disabled:opacity-50"
              onClick={onPromote}
              disabled={isBusy}
            >
              Promouvoir en primaire
            </button>
          )}
        </div>
      )}
    </div>
  );
}
