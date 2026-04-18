/**
 * P5.1 + P4.2 — Construction des marqueurs décor pour un retry
 * "environment" / "composition".
 *
 * Lit la Location associée à la scène et concatène :
 *   - name / type
 *   - établishedVisualBrief > visualBrief > description
 *   - metadata.architecturalFeatures[] (top 5)
 *   - metadata.palette[] (top 4)
 *
 * Retourne une chaîne type `location: Ecole Tōkai; type: school; brief; architectural markers (...); palette (...)` ou "" si la location est introuvable / null.
 */

import type { PrismaClient } from "@manga-ai-studio/db";

export async function buildLocationMarkersLine(params: {
  prisma: PrismaClient;
  locationId: string | null | undefined;
}): Promise<string> {
  if (!params.locationId) return "";
  try {
    const location = await params.prisma.location.findUnique({
      where: { id: params.locationId },
      select: {
        name: true,
        type: true,
        description: true,
        visualBrief: true,
        establishedVisualBrief: true,
        metadata: true,
      },
    }).catch(() => null);
    if (!location) return "";

    const bits: string[] = [];
    if (location.name) bits.push(`location: ${location.name}`);
    if (location.type) bits.push(`type: ${location.type}`);
    const brief = location.establishedVisualBrief ?? location.visualBrief ?? location.description ?? null;
    if (brief && brief.length > 0) bits.push(brief.slice(0, 200));
    const meta = location.metadata && typeof location.metadata === "object"
      ? location.metadata as Record<string, unknown>
      : {};
    const archFeatures = Array.isArray(meta.architecturalFeatures)
      ? (meta.architecturalFeatures as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (archFeatures.length > 0) bits.push(`architectural markers (${archFeatures.slice(0, 5).join(", ")})`);
    const palette = Array.isArray(meta.palette)
      ? (meta.palette as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    if (palette.length > 0) bits.push(`palette (${palette.slice(0, 4).join(", ")})`);
    return bits.join("; ");
  } catch (locErr) {
    console.warn(`[retry:location] failed to resolve canon for locationId=${params.locationId}: ${locErr instanceof Error ? locErr.message : locErr}`);
    return "";
  }
}
