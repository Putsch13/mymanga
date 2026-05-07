/**
 * P1.3 — Lignes d’action correctrice pour erreurs launch (readiness premium / canon).
 * Logique pure : testable sans rendu React.
 */

export type LaunchFixRow = {
  message: string;
  fixLabel?: string;
  fixHref?: string;
};

const DEFAULT_PREMIUM_BLOCKED_INTRO =
  "La checklist « prêt à générer » n’est pas au vert. Corrige les points ci-dessous puis réessaie.";

export function premiumReadinessDashboardBaseMessage(payloadMessage: unknown): string {
  if (typeof payloadMessage === "string" && payloadMessage.trim().length > 0) {
    return payloadMessage;
  }
  return DEFAULT_PREMIUM_BLOCKED_INTRO;
}

export function premiumReadinessBlockedIssuesToFixRows(
  issues: Array<{
    message?: string;
    severity?: string;
    fixAction?: { label: string; href: string };
  }> | undefined,
): LaunchFixRow[] | null {
  const blocked = (issues ?? []).filter((i) => i.severity === "blocked");
  if (blocked.length === 0) return null;
  return blocked.slice(0, 12).map((i) => ({
    message: i.message ?? "Blocage",
    fixLabel: i.fixAction?.label,
    fixHref: i.fixAction?.href,
  }));
}

export function canonReadinessPremiumErrorsToFixRows(premiumErrors: unknown): LaunchFixRow[] | null {
  if (!Array.isArray(premiumErrors) || premiumErrors.length === 0) return null;
  const errs = premiumErrors as Array<{ userMessage?: string; fixAction?: { label: string; href: string } }>;
  return errs.map((e) => ({
    message: typeof e.userMessage === "string" ? e.userMessage : "Point canon",
    fixLabel: e.fixAction?.label,
    fixHref: e.fixAction?.href,
  }));
}
