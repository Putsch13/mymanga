/**
 * Hooks utilitaires pour le board de progression :
 * - `useElapsed` — compteur de secondes depuis le début du polling.
 * - `useEta` — estimation du temps restant à partir du % de progression.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function useElapsed(active: boolean, resetKey: string): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [active]);

  return elapsed;
}

export function formatElapsed(elapsed: number): { mins: number; secs: number } {
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return { mins, secs };
}

/**
 * ARCH-6 — On attend au moins 8s + 5% de progression pour éviter les
 * estimations explosives au démarrage. Plafonné à 30 min pour rester crédible.
 */
export function useEta(args: {
  isWorking: boolean;
  elapsed: number;
  progressPct: number;
}): { etaSeconds: number | null; etaLabel: string | null } {
  const { isWorking, elapsed, progressPct } = args;

  const etaSeconds = useMemo(() => {
    if (!isWorking) return null;
    if (elapsed < 8) return null;
    if (progressPct <= 5) return null;
    if (progressPct >= 100) return 0;
    const ratio = progressPct / 100;
    const totalEstimate = elapsed / ratio;
    const remaining = totalEstimate - elapsed;
    if (!Number.isFinite(remaining) || remaining < 0) return null;
    return Math.min(Math.round(remaining), 30 * 60);
  }, [isWorking, elapsed, progressPct]);

  const etaLabel = useMemo(() => {
    if (etaSeconds == null) return null;
    if (etaSeconds < 30) return "moins de 30 s";
    if (etaSeconds < 90) return "~1 min";
    const m = Math.round(etaSeconds / 60);
    return `~${m} min`;
  }, [etaSeconds]);

  return { etaSeconds, etaLabel };
}
