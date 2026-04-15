/**
 * Pure utility helpers for the chapter pipeline.
 * Extracted from run-full-chapter-pipeline.ts for testability.
 */

export function extractSceneFactions(text: string) {
  const normalized = text.toLowerCase();
  const factions = [
    "guilde", "guild", "armée", "army", "rebelles", "rebels",
    "survivors", "survivants", "corporation", "ordre", "clan",
  ];
  return factions.filter((item) => normalized.includes(item));
}

export function inferSceneWeather(text: string) {
  const normalized = text.toLowerCase();
  if (/(pluie|rain|orage|storm)/.test(normalized)) return "rain";
  if (/(neige|snow|blizzard)/.test(normalized)) return "snow";
  if (/(poussière|dust|cendres|ash)/.test(normalized)) return "dust";
  if (/(brouillard|mist|fog)/.test(normalized)) return "mist";
  return null;
}

export function inferSceneTimeOfDay(text: string) {
  const normalized = text.toLowerCase();
  if (/(nuit|night|moon)/.test(normalized)) return "night";
  if (/(aube|dawn|sunrise)/.test(normalized)) return "dawn";
  if (/(soir|sunset|crépuscule|coucher du soleil)/.test(normalized)) return "sunset";
  return "day";
}

export function isHttpImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function isAlreadyStableStorageUrl(url: string) {
  const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseBase && url.startsWith(supabaseBase)) return true;
  return false;
}

export function isDataUrl(url: string) {
  return url.startsWith("data:image/");
}

export function looksLikeBflDelivery(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.startsWith("delivery-") && u.hostname.endsWith(".bfl.ai");
  } catch {
    return false;
  }
}

export function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
