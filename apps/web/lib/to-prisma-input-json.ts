import type { Prisma } from "@manga-ai-studio/db";

/**
 * Valeur JSON sérialisable pour champs Prisma `Json` — évite `as unknown as InputJsonValue`.
 */
export function toPrismaInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
