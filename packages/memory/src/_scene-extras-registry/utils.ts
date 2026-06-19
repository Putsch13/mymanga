import type { SceneExtraSource } from "@manga-ai-studio/core";

export const NPC_PROMOTION_THRESHOLD = 2;

export const LEGACY_ARCHETYPE_LABELS: Record<string, string> = {
  bartender: "Barman",
  client: "Client",
  guard: "Garde",
  server: "Serveur",
  merchant: "Marchand",
  passerby: "Passant",
  crowd: "Foule / figurants",
  other: "PNJ",
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stableToken(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function normalizeLocationKey(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isSceneExtraSource(v: unknown): v is SceneExtraSource {
  return v === "ai_generated" || v === "db_canon" || v === "legacy";
}
