/**
 * P5.2 — Hydratation continuité + preflights (canon pack & DNA panneau).
 *
 * Centralise toute la phase "préparation des blueprints pour la pipeline" :
 *   1. Hydrate les blueprints avec character / environment / prop / npc DNA si
 *      le mode strict premium continuity est actif.
 *   2. Bloque le launch si les CanonPack héros / deutéragoniste sont incomplets.
 *   3. Bloque le launch si le `computePanelContinuityPreflights` détecte des
 *      panneaux dont la DNA personnage ou décor manque (false-positives évités
 *      quand le `VisualWorldContract` n'a pas de locations).
 *
 * Renvoie soit `{ ok: true, bpForContinuity }` soit `{ ok: false, response }`.
 */
import { NextResponse } from "next/server";
import {
  canonPackPreflightBlockingReasons,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  logNarrative,
  logPreflight,
  visualWorldContractSchema,
  type ChapterStudioSnapshot,
  type PanelBlueprintPremium,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";
import {
  premiumCharacterStudioSelect,
  toCharacterRowsForDnaHydration,
  type PremiumCharacterStudioRow,
} from "@/lib/premium-character-studio-select";
import { buildCharacterCanonFromCharacter } from "@/lib/chapter-studio/character-canon";
import { computeCanonPackScore } from "@/lib/characters/compute-canon-pack-score";

export type PrepareContinuityBlueprintsResult =
  | { ok: true; bpForContinuity: unknown }
  | { ok: false; response: NextResponse };

export async function prepareContinuityBlueprints(args: {
  projectId: string;
  chapterId: string;
  snapshot: ChapterStudioSnapshot;
  chapterProjectCharacters: PremiumCharacterStudioRow[];
  strictPremiumContinuity: boolean;
  coProtagonistCharacterIds: string[];
  logBlock: (code: string, reason: string, extra?: Record<string, unknown>) => void;
}): Promise<PrepareContinuityBlueprintsResult> {
  const {
    projectId,
    chapterId,
    snapshot,
    chapterProjectCharacters,
    strictPremiumContinuity,
    coProtagonistCharacterIds,
    logBlock,
  } = args;

  const bpRaw = snapshot.data.productionPlan?.panelBlueprints;
  let bpForContinuity: unknown = bpRaw;

  if (Array.isArray(bpForContinuity) && bpForContinuity.length > 0 && strictPremiumContinuity) {
    const charsForHydration = chapterProjectCharacters.length > 0
      ? chapterProjectCharacters
      : await prisma.character.findMany({
        where: { projectId },
        select: premiumCharacterStudioSelect,
      });
    const canonList = snapshot.data.characterCanons ?? [];
    const canonMap = new Map(canonList.map((c) => [c.characterId, c] as const));

    bpForContinuity = hydrateBlueprintsWithCharacterDna({
      blueprints: bpForContinuity as PanelBlueprintPremium[],
      characters: toCharacterRowsForDnaHydration(charsForHydration),
      characterCanonsById: canonMap,
      strict: true,
      ...(coProtagonistCharacterIds.length > 0
        ? { coProtagonistCharacterIds: coProtagonistCharacterIds as readonly string[] }
        : {}),
    });

    const vwLaunch = visualWorldContractSchema.safeParse(snapshot.data.visualWorldContract);
    if (vwLaunch.success) {
      bpForContinuity = hydrateBlueprintsWithEnvironmentDna({
        blueprints: bpForContinuity as PanelBlueprintPremium[],
        visualWorld: vwLaunch.data,
        strict: true,
      });
      bpForContinuity = hydrateBlueprintsWithPropDna({
        blueprints: bpForContinuity as PanelBlueprintPremium[],
        visualWorld: vwLaunch.data,
        strict: true,
      });
      bpForContinuity = hydrateBlueprintsWithNpcDna({
        blueprints: bpForContinuity as PanelBlueprintPremium[],
        visualWorld: vwLaunch.data,
        strict: true,
      });
    }
  }

  // CanonPack preflight (héros / deutéragoniste).
  //
  // IMPORTANT : on recalcule hasCanonPack + canonPackCompleteness depuis la DB
  // (`chapterProjectCharacters`), pas depuis le snapshot JSON du chapitre. Sinon
  // après édition fiche perso le studio autosave peut ne pas avoir réécrit
  // `outline.characterCanons` avant le POST launch → faux blocages « incomplet ».
  const canonListForCheck = snapshot.data.characterCanons ?? [];
  if (strictPremiumContinuity && canonListForCheck.length > 0) {
    let rowsForCanon = chapterProjectCharacters;
    if (rowsForCanon.length === 0) {
      rowsForCanon = await prisma.character.findMany({
        where: { projectId },
        select: premiumCharacterStudioSelect,
      });
    }
    const rowById = new Map(rowsForCanon.map((c) => [c.id, c]));
    const minCompleteness = 0.7;
    const canonPackChecks = canonListForCheck.map((canon) => {
      const tier = canon.importanceTier;
      const roleType =
        tier === "MAIN_HERO"
          ? "hero"
          : tier === "SECONDARY_CORE"
            ? "deuteragonist"
            : (canon.role ?? "supporting");
      const dbRow = rowById.get(canon.characterId);
      if (dbRow) {
        const live = buildCharacterCanonFromCharacter(dbRow);
        return {
          characterId: canon.characterId,
          roleType,
          hasCanonPack: Boolean(live.hasCanonPack),
          canonPackCompleteness:
            typeof live.canonPackCompleteness === "number" ? live.canonPackCompleteness : 0,
        };
      }
      return {
        characterId: canon.characterId,
        roleType,
        hasCanonPack: canon.hasCanonPack === true,
        canonPackCompleteness:
          typeof canon.canonPackCompleteness === "number" ? canon.canonPackCompleteness : 0,
      };
    });
    const canonPackBlockers = canonPackPreflightBlockingReasons(canonPackChecks, {
      minCompleteness,
    });
    if (canonPackBlockers.length > 0) {
      const canonPackDiagnostics = canonPackBlockers.map((reason) => {
        const characterId = reason.startsWith("canon_pack_incomplete:")
          ? reason.slice("canon_pack_incomplete:".length)
          : reason;
        const row = rowById.get(characterId);
        if (!row) {
          return {
            characterId,
            name: null as string | null,
            score: null as number | null,
            missing: ["personnage introuvable dans le projet"] as string[],
          };
        }
        const scoreResult = computeCanonPackScore({
          name: row.name,
          roleType: row.roleType,
          gender: row.gender,
          biography: row.biography,
          objective: row.objective,
          appearance: row.appearance,
          hairColor: row.hairColor,
          eyeColor: row.eyeColor,
          outfitDefault: row.outfitDefault,
          voiceRegister: row.voiceRegister,
          voiceVocabularyStyle: row.voiceVocabularyStyle,
          stableVisualDNA: row.stableVisualDNA,
          stableSpeechDNA: row.stableSpeechDNA,
          stablePsycheDNA: row.stablePsycheDNA,
          activeVisualRefCount: (row.visualRefs ?? []).length,
        });
        return {
          characterId,
          name: row.name,
          score: scoreResult.score,
          missing: scoreResult.missing,
          hasCanonPackRow: Boolean(row.canonPack),
        };
      });
      logNarrative({
        domain: "canon-pack",
        level: "error",
        message: `canon_pack_blockers count=${canonPackBlockers.length}`,
        data: { blockers: canonPackBlockers.join(",") },
      });
      logBlock(
        "CANON_PACK_INCOMPLETE",
        "Premium hero/deuteragonist CanonPack incomplete",
        { canonPackBlockers, canonPackDiagnostics },
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "canon_pack_incomplete",
            code: "CANON_PACK_INCOMPLETE",
            message:
              "Le pack canonique d'un personnage principal est incomplet. "
              + "Complète la fiche personnage dans le studio pour éviter la dérive visuelle, puis relance.",
            canonPackBlockers,
            canonPackDiagnostics,
            canonPackMinCompleteness: minCompleteness,
          },
          { status: 422 },
        ),
      };
    }
  }

  // Continuity DNA preflight (post intent-coverage; keeps the full original logic).
  if (Array.isArray(bpForContinuity) && bpForContinuity.length > 0 && strictPremiumContinuity) {
    const vwForPreflight = visualWorldContractSchema.safeParse(snapshot.data.visualWorldContract);
    const hasVwLocations = vwForPreflight.success
      && Array.isArray(vwForPreflight.data.locations)
      && vwForPreflight.data.locations.length > 0;

    const continuityPreflights = computePanelContinuityPreflights(
      bpForContinuity as PanelBlueprintPremium[],
      {
        strictEnvironmentLocationBinding: hasVwLocations,
        strictCharacterDnaBinding: strictPremiumContinuity,
        strictPropVisualBinding: hasVwLocations,
      },
    );
    const continuityBlockers = continuityPreflightBlockingReasons(continuityPreflights);
    logPreflight({
      blockers: continuityBlockers.length,
      dominantReason: continuityBlockers[0]?.split(":")[1],
    });
    if (continuityBlockers.length > 0) {
      logBlock(
        "PREMIUM_CONTINUITY_PREFLIGHT_FAILED",
        "Premium continuity preflight failed (character or environment visual DNA)",
        { continuityBlockers },
      );
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "premium_continuity_preflight_failed",
            code: "PREMIUM_CONTINUITY_PREFLIGHT_FAILED",
            message:
              "Le preflight continuité premium a échoué : DNA personnage incomplet et/ou décor (environmentVisualDna) manquant là où le plan l’exige. "
              + "Consulte continuityBlockers, complète le plan dans le studio, puis relance.",
            continuityBlockers,
            continuityPreflightBlockingCount: continuityBlockers.length,
          },
          { status: 422 },
        ),
      };
    }
  }

  // `chapterId` réservé pour de futurs logs corrélés.
  void chapterId;

  return { ok: true, bpForContinuity };
}
