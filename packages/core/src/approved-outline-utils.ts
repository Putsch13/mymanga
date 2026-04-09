import type { ApprovedChapterOutline } from "./types";
import { approvedOutlineSchema } from "./types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function buildApprovedOutlineVersion(value: Omit<ApprovedChapterOutline, "approvalVersion" | "approvedAt">) {
  const raw = stableStringify(value);
  let hash = 0;
  for (let index = 0; index < raw.length; index++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(index)) | 0;
  }
  return `ao_${Math.abs(hash).toString(36)}`;
}

export function parseApprovedOutline(value: unknown): ApprovedChapterOutline | null {
  const parsed = approvedOutlineSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
