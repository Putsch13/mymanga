/**
 * P5.1 — Extraction de la résolution des LoRA actifs pour un panel en retry.
 *
 * Avant : ~80 lignes inline dans `route.ts` mélangeant fetch DB + iteration
 * sur panelCast + résolution par nom fallback.
 *
 * Après : helper pur (sauf fetch DB initial) qui :
 *   1. Charge les LoraAttachment actifs du projet.
 *   2. Construit `loraByCharId` (map ID -> descriptor LoRA).
 *   3. Ordonne les candidats `focus → supporting → characters[]` pour
 *      protéger les personnages critiques en cas de cap.
 *   4. Résout chaque nom via `resolveCharacterFromName` (ID-first).
 *   5. Applique le plafond `RETRY_MAX_PANEL_LORAS` (default 2 — limite
 *      actuelle IP-Adapter fal).
 *
 * Signature volontairement concrète (pas de generic) : les types des
 * dépendances sont connus côté route.
 */

import type { PrismaClient } from "@manga-ai-studio/db";
import type { ResolvedCharacter, ProjectCharacterRow } from "@/lib/retry/resolve-project-characters";

export type PanelLora = { url: string; triggerWord: string; scale: number };

export type ResolvePanelLorasInput = {
  prisma: PrismaClient;
  projectId: string;
  characters: string[];
  panelCastData: {
    focus?: { characterId: string; name: string } | null;
    supporting?: Array<{ characterId: string; name: string }>;
  } | null;
  resolveCharacterFromName: (name: string) => ResolvedCharacter<ProjectCharacterRow> | null;
  panelId: string;
};

export type ResolvedPanelLoras = {
  panelLoras: PanelLora[];
  castOrderedNames: string[];
  loraByCharId: Map<string, PanelLora>;
};

export async function resolvePanelLoras(input: ResolvePanelLorasInput): Promise<ResolvedPanelLoras> {
  const { prisma, projectId, characters, panelCastData, resolveCharacterFromName, panelId } = input;

  const loraAttachments = await prisma.loraAttachment.findMany({
    where: { projectId, enabled: true },
    include: { lora: true },
  });
  const loraByCharId = new Map<string, PanelLora>();
  for (const att of loraAttachments) {
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const loraUrl = typeof meta.loraUrl === "string" ? meta.loraUrl : null;
    const triggerWord = typeof meta.triggerWord === "string" ? meta.triggerWord : att.lora.name;
    if (loraUrl && att.characterId && att.lora.status === "active") {
      loraByCharId.set(att.characterId, { url: loraUrl, triggerWord, scale: att.weight });
    }
  }

  const maxPanelLoras = Math.max(
    1,
    Number.parseInt(process.env.RETRY_MAX_PANEL_LORAS ?? "", 10) || 2,
  );
  const castOrderedNames = panelCastData
    ? [panelCastData.focus?.name, ...(panelCastData.supporting ?? []).map((m) => m.name)].filter((n): n is string => Boolean(n))
    : characters;
  const loraSourceNames = castOrderedNames.length > 0 ? castOrderedNames : characters;

  const panelLoras = loraSourceNames
    .map((name) => {
      const res = resolveCharacterFromName(name);
      if (!res) {
        console.warn(`[retry:resolution] name="${name}" resolved_by=miss panel=${panelId}`);
        return undefined;
      }
      console.info(`[retry:resolution] name="${name}" resolved_by=${res.resolvedBy} id=${res.character.id}`);
      return loraByCharId.get(res.character.id);
    })
    .filter((l): l is PanelLora => Boolean(l))
    .slice(0, maxPanelLoras);

  return { panelLoras, castOrderedNames, loraByCharId };
}
