/**
 * P5.2 — Résolution du cast (héros / NPCs / IDs) pour le launch.
 *
 * Centralise :
 *   1. lecture du `characterSelection` du snapshot (focus / locked / core / hero…)
 *   2. résolution stricte des refs vers IDs (mode premium uniquement)
 *   3. application de l'invariant héros (`applyHeroInvariant`)
 *   4. validation du `ChapterCastContract`
 *
 * Renvoie soit `{ ok: true, ...resolvedIds }` soit `{ ok: false, response }`.
 */
import { NextResponse } from "next/server";
import {
  applyHeroInvariant,
  assertValidChapterCastContract,
  buildChapterCastContract,
  ChapterCastContractError,
  resolveCharacterRefsToIds,
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import {
  buildUnresolvedCharacterLabelsPayload,
  mapCharacterLabelsToIdsSequential,
} from "@/lib/characters/resolve-character-labels";
import type { PremiumCharacterStudioRow } from "@/lib/premium-character-studio-select";

type CharRefForLabels = { id: string; name: string; displayName: string | null; roleType: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export type ResolveLaunchCastResult =
  | {
      ok: true;
      heroCharacterId: string | null;
      secondaryHeroCharacterId: string | null;
      deuteragonistCharacterId: string | null;
      focusCharacterIds: string[];
      lockedCharacterIds: string[];
      coreCastCharacterIds: string[];
    }
  | { ok: false; response: NextResponse };

export function resolveLaunchCast(args: {
  chapterId: string;
  projectId: string;
  snapshot: ChapterStudioSnapshot;
  chapterProjectCharacters: PremiumCharacterStudioRow[];
  premiumOnly: boolean;
  logBlock: (code: string, reason: string, extra?: Record<string, unknown>) => void;
}): ResolveLaunchCastResult {
  const { chapterId, projectId, snapshot, chapterProjectCharacters, premiumOnly, logBlock } = args;

  const chapterCharacterSelection = asRecord(snapshot.data.characterSelection);

  let focusCharacterIds = Array.isArray(chapterCharacterSelection.activeCharacterIds)
    ? chapterCharacterSelection.activeCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  let lockedCharacterIds = Array.isArray(chapterCharacterSelection.lockedCharacterIds)
    ? chapterCharacterSelection.lockedCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  let coreCastCharacterIds = Array.isArray(chapterCharacterSelection.coreCastCharacterIds)
    ? chapterCharacterSelection.coreCastCharacterIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  let heroCharacterId =
    typeof chapterCharacterSelection.heroCharacterId === "string"
    && chapterCharacterSelection.heroCharacterId.length > 0
      ? chapterCharacterSelection.heroCharacterId
      : null;
  let secondaryHeroCharacterId =
    typeof chapterCharacterSelection.secondaryHeroCharacterId === "string"
    && chapterCharacterSelection.secondaryHeroCharacterId.length > 0
      ? chapterCharacterSelection.secondaryHeroCharacterId
      : null;
  let deuteragonistCharacterId =
    typeof chapterCharacterSelection.deuteragonistCharacterId === "string"
    && chapterCharacterSelection.deuteragonistCharacterId.trim().length > 0
      ? chapterCharacterSelection.deuteragonistCharacterId.trim()
      : null;

  const charRefsForLabels: CharRefForLabels[] = chapterProjectCharacters.map((c) => ({
    id: c.id,
    name: c.name,
    displayName: null,
    roleType: c.roleType,
  }));

  if (premiumOnly) {
    const unresolvedCollector: string[] = [];

    if (heroCharacterId) {
      const h = resolveCharacterRefsToIds([heroCharacterId], charRefsForLabels);
      if (h.unresolved.length > 0) unresolvedCollector.push(...h.unresolved);
      else if (h.ids.length > 0) heroCharacterId = h.ids[0]!;
    }
    if (secondaryHeroCharacterId) {
      const s = resolveCharacterRefsToIds([secondaryHeroCharacterId], charRefsForLabels);
      if (s.unresolved.length > 0) unresolvedCollector.push(...s.unresolved);
      else if (s.ids.length > 0) secondaryHeroCharacterId = s.ids[0]!;
    }
    if (deuteragonistCharacterId) {
      const d = resolveCharacterRefsToIds([deuteragonistCharacterId], charRefsForLabels);
      if (d.unresolved.length > 0) unresolvedCollector.push(...d.unresolved);
      else if (d.ids.length > 0) deuteragonistCharacterId = d.ids[0]!;
    }

    const focusSan = mapCharacterLabelsToIdsSequential(focusCharacterIds, charRefsForLabels);
    unresolvedCollector.push(...focusSan.unresolvedLabels);
    focusCharacterIds = focusSan.sanitizedIds;

    const lockedSan = mapCharacterLabelsToIdsSequential(lockedCharacterIds, charRefsForLabels);
    unresolvedCollector.push(...lockedSan.unresolvedLabels);
    lockedCharacterIds = lockedSan.sanitizedIds;

    const coreSan = mapCharacterLabelsToIdsSequential(coreCastCharacterIds, charRefsForLabels);
    unresolvedCollector.push(...coreSan.unresolvedLabels);
    coreCastCharacterIds = coreSan.sanitizedIds;

    const uniqueUnresolved = [...new Set(unresolvedCollector)];
    if (uniqueUnresolved.length > 0) {
      const { suggestions } = buildUnresolvedCharacterLabelsPayload(uniqueUnresolved, charRefsForLabels);
      logBlock("CHARACTER_LABELS_UNRESOLVED", "Cast contains unresolved character labels", {
        unresolvedLabels: uniqueUnresolved,
      });
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "character_labels_unresolved",
            code: "CHARACTER_LABELS_UNRESOLVED",
            message:
              "Certains personnages du cast sont encore des noms ou des libellés non reliés à un personnage du projet. Associe-les à un personnage existant ou crée le personnage avant de lancer.",
            unresolvedLabels: uniqueUnresolved,
            suggestions,
          },
          { status: 422 },
        ),
      };
    }
  }

  if (premiumOnly && heroCharacterId) {
    const merged = applyHeroInvariant(
      {
        heroCharacterId,
        secondaryHeroCharacterId,
        activeCharacterIds: focusCharacterIds,
        coreCastCharacterIds,
        lockedCharacterIds,
      },
      heroCharacterId,
    );
    focusCharacterIds = [...(merged.activeCharacterIds ?? [])];
    lockedCharacterIds = [...(merged.lockedCharacterIds ?? [])];
    coreCastCharacterIds = [...(merged.coreCastCharacterIds ?? [])];
  }

  if (premiumOnly && heroCharacterId) {
    try {
      const castContract = buildChapterCastContract({
        chapterId,
        heroCharacterId,
        secondaryHeroCharacterId,
        activeCharacterIds: focusCharacterIds,
        characters: chapterProjectCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          roleType: c.roleType,
        })),
      });
      assertValidChapterCastContract(castContract);
    } catch (err) {
      if (err instanceof ChapterCastContractError) {
        logBlock("CAST_CONTRACT_INVALID", err.message, { issues: err.issues });
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: "chapter_cast_contract_invalid",
              code: "CAST_CONTRACT_INVALID",
              message: err.message,
              issues: err.issues,
            },
            { status: 422 },
          ),
        };
      }
      throw err;
    }
  }

  // `projectId` réservé au logging si nécessaire dans une évolution future.
  void projectId;

  return {
    ok: true,
    heroCharacterId,
    secondaryHeroCharacterId,
    deuteragonistCharacterId,
    focusCharacterIds,
    lockedCharacterIds,
    coreCastCharacterIds,
  };
}
