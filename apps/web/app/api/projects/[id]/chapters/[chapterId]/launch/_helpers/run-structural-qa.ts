/**
 * run-structural-qa.ts
 *
 * QA structurelle canonique exécutée tout au début du launch (même entrée
 * que /estimate). C'est la barre « fidèle » sur le plan : le score
 * heuristique `computePremiumReadinessScore` pénalise souvent des champs
 * peu remplis après merge canonique (lieux unknown, dialogueCarrier) sans
 * invalider cette QA.
 *
 * Extraite de `route.ts` pour réduire la taille du handler. Renvoie un
 * `NextResponse` 422 si la QA échoue sur des erreurs non-rythmiques, ou
 * `{ ok: true, structuralCanonicalQaPassed }` sinon.
 */
import { NextResponse } from "next/server";
import {
  buildCanonicalProductionPlanFromPremiumBlueprints,
  type ChapterStudioSnapshot,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";

export interface RunStructuralQaInput {
  chapterId: string;
  projectId: string;
  chapter: {
    chapterNumber: number;
    title: string | null;
    project: { format: string | null };
  };
  snapshot: ChapterStudioSnapshot;
  approvedOutline: {
    summary?: unknown;
    cliffhanger?: unknown;
    beats: unknown[];
  };
  charRefsForLabels: readonly {
    id: string;
    name?: string | null;
    displayName?: string | null;
  }[];
}

export type RunStructuralQaResult =
  | {
      ok: true;
      structuralCanonicalQaPassed: boolean;
      bpStructural: PanelBlueprintPremium[] | null;
      outlineForStructuralQa: unknown;
    }
  | { ok: false; response: NextResponse };

export async function runStructuralQa(
  input: RunStructuralQaInput,
): Promise<RunStructuralQaResult> {
  const { chapterId, projectId, chapter, snapshot, approvedOutline, charRefsForLabels } = input;

  const outlineForStructuralQa =
    snapshot.data.productionOutline && typeof snapshot.data.productionOutline === "object"
      ? snapshot.data.productionOutline
      : {
          source: "approved_fallback",
          chapterGoal: typeof approvedOutline.summary === "string" ? approvedOutline.summary : "",
          cliffhanger:
            typeof approvedOutline.cliffhanger === "string" ? approvedOutline.cliffhanger : "",
          beats: approvedOutline.beats,
        };

  const bpStructural = snapshot.data.productionPlan?.panelBlueprints;
  if (!Array.isArray(bpStructural) || bpStructural.length === 0) {
    return {
      ok: true,
      structuralCanonicalQaPassed: false,
      bpStructural: null,
      outlineForStructuralQa,
    };
  }

  const fmt = chapter.project.format === "webtoon" ? "webtoon" : "manga";

  // P0 fix : fournir NPC groups (DB + VW snapshot) et catalogue personnages
  // pour re-résoudre les unresolvedCharacterRefs qui étaient figées dans le
  // snapshot estimate. Sans ça, "Groupe de pêcheurs" etc. restent unresolved
  // et la QA bloque le launch à tort.
  const npcGroupRefMap = new Map<string, { id: string; label: string }>();
  const vwNpcGroups = (
    snapshot.data.visualWorldContract as { npcGroups?: { id: string; label: string }[] } | null
  )?.npcGroups;
  if (Array.isArray(vwNpcGroups)) {
    for (const g of vwNpcGroups) {
      if (typeof g.id === "string" && g.id.length > 0) {
        npcGroupRefMap.set(g.id, { id: g.id, label: g.label ?? "" });
      }
    }
  }
  const projectNpcGroupsForQa = await prisma.npcGroup.findMany({
    where: { projectId },
    select: { id: true, label: true },
  });
  for (const g of projectNpcGroupsForQa) {
    if (!npcGroupRefMap.has(g.id)) {
      npcGroupRefMap.set(g.id, { id: g.id, label: g.label });
    }
  }
  const npcGroupRefsForStructuralQa = [...npcGroupRefMap.values()];

  const structuralPlan = buildCanonicalProductionPlanFromPremiumBlueprints({
    chapterId,
    projectId,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title ?? "",
    format: fmt,
    productionOutline: outlineForStructuralQa,
    blueprints: bpStructural as PanelBlueprintPremium[],
    knownNpcGroups: npcGroupRefsForStructuralQa,
    knownCharacters: charRefsForLabels,
  });

  if (!structuralPlan.qa.valid) {
    // Ne bloquer que sur les erreurs non-rythmiques.
    // Le repair peut transformer des panels en cutaways (prop/npc) et dépasser
    // temporairement la limite de cutaways consécutifs : c'est une violation
    // de rythme esthétique, pas un blocage de contenu.
    const allErrors = Array.isArray(structuralPlan.qa.errors) ? structuralPlan.qa.errors : [];
    const criticalErrors = allErrors.filter((e) => {
      const s = String(e ?? "").toLowerCase();
      return !s.includes("consecutive cutaway") && !s.includes("cutaway") && !s.includes("rhythm");
    });

    if (criticalErrors.length > 0) {
      console.error(
        `[launch] production_plan_structural_qa_failed chapterId=${chapterId} errors=${JSON.stringify(criticalErrors)}`,
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "plan_structural_qa_failed",
            code: "PRODUCTION_PLAN_STRUCTURAL_QA_FAILED",
            errors: criticalErrors,
          },
          { status: 422 },
        ),
      };
    }

    console.warn(
      `[launch] production_plan_structural_qa_rhythm_warning chapterId=${chapterId} errors=${JSON.stringify(allErrors)}`,
    );
  }

  return {
    ok: true,
    structuralCanonicalQaPassed: true,
    bpStructural: bpStructural as PanelBlueprintPremium[],
    outlineForStructuralQa,
  };
}
