/**
 * P5.1 — Lecture tolérante du body JSON du POST /retry.
 * Extrait de retry/route.ts. Comportement inchangé :
 *   - body vide → {}
 *   - JSON invalide → {} (back-compat query string)
 *
 * Le type `RetryMode` et les champs sont déclarés localement à la route pour
 * conserver la source de vérité côté HTTP ; ici on n'impose qu'un shape brut.
 */

export type RetryBodyRaw = {
  mode?: string;
  targetCharacterId?: string;
  userPromptAdditions?: string;
  userPromptExclusions?: string;
  forceOverrides?: {
    shotType?: string;
    subjectFocus?: string;
    cameraAngle?: string;
    forcedCharacterNames?: string[];
  };
};

export async function readRetryBody<T extends RetryBodyRaw = RetryBodyRaw>(req: Request): Promise<T> {
  try {
    const clone = req.clone();
    const text = await clone.text();
    if (!text || text.trim().length === 0) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}
