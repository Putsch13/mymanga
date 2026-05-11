/**
 * Construit et persiste les scene states (continuity engine).
 *
 * Extrait depuis `narrative-pass.ts` pour réduire la taille du gros legacy
 * et isoler la responsabilité "snapshot scène + validation kernel + events".
 *
 * Les inputs / outputs sont volontairement larges (`unknown`) pour ne pas
 * imposer un re-typage du legacy : ils correspondent aux structures Prisma
 * et bundle déjà manipulées par la pass.
 */

import { prisma, type Prisma } from "@manga-ai-studio/db";
import {
  applySceneEventsToKernel,
  buildSceneSnapshot,
  buildSceneState,
  deriveSceneEvents,
  persistSceneState,
  persistValidatedSceneContinuity,
  validateSceneSnapshotAgainstKernel,
} from "@manga-ai-studio/continuity";
import type { SceneBlueprint } from "@manga-ai-studio/world";
import { asRecord } from "../../pipeline-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRecord = any;

export interface SceneContinuityEngineInput {
  chapterId: string;
  chapterNumber: number;
  projectId: string;
  scenes: LooseRecord[];
  beats: LooseRecord[];
  previousCharacterStates: LooseRecord;
  continuityKernel: LooseRecord;
  rawCharacters: LooseRecord[];
  sceneBlueprintsByScene: Map<number, SceneBlueprint[]>;
}

export interface SceneContinuityEngineResult {
  validatedSceneSnapshots: LooseRecord[];
  kernelValidationWarnings: string[];
  continuityKernel: LooseRecord;
  /**
   * FIX-8 (MOD) — Scènes pour lesquelles le `ChapterScene` Prisma n'a
   * pas été trouvé. Avant ce TODO, ces scènes étaient silencieusement
   * skippées (`continue`) sans warning ni piste de diagnostic upstream.
   */
  skippedSceneNumbers: number[];
}

export async function runSceneContinuityEngine(
  input: SceneContinuityEngineInput,
): Promise<SceneContinuityEngineResult> {
  const {
    chapterId,
    chapterNumber,
    projectId,
    scenes,
    beats,
    previousCharacterStates,
    rawCharacters,
    sceneBlueprintsByScene,
  } = input;

  let continuityKernel = input.continuityKernel;
  const validatedSceneSnapshots: LooseRecord[] = [];
  const kernelValidationWarnings: string[] = [];
  const skippedSceneNumbers: number[] = [];

  console.log(`[pipeline] Building scene states for ${scenes.length} scenes`);

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    if (!scene) continue;

    const beat = beats[index];
    const sceneNumber = index + 1;
    const sceneDbRecord = await prisma.chapterScene.findFirst({
      where: { chapterId, sceneNumber },
    });
    if (!sceneDbRecord) {
      // FIX-8 (MOD) — Loud-warning + traçage upstream au lieu d'un
      // `continue` silencieux. Si une scène disparaît du record DB
      // alors qu'elle est encore dans le bundle narratif, il faut le
      // savoir pour diagnostiquer le désync.
      console.warn(
        `[continuity-engine] sceneNumber=${sceneNumber} not found in DB for chapter=${chapterId} — skipping snapshot`,
      );
      skippedSceneNumbers.push(sceneNumber);
      continue;
    }

    const sceneStateData = await buildSceneState(prisma, {
      projectId,
      chapterId,
      sceneId: sceneDbRecord.id,
      sceneNumber: index + 1,
      scene: {
        title: scene.title,
        summary: scene.summary,
        location: scene.location,
        characters: scene.characters,
        beat: {
          location: beat?.location,
          characters: beat?.characters,
          turn: (beat as { turn?: string })?.turn,
        },
      },
      characterStatesFromCanon: previousCharacterStates,
    });

    await persistSceneState(prisma, {
      projectId,
      chapterId,
      sceneId: sceneDbRecord.id,
      sceneNumber: index + 1,
      sceneStateData,
    });

    // F03/F04: Physical events detection & body state persistence
    try {
      const { detectPhysicalEvents, applyPhysicalEvents, loadOrCreateBodyState } =
        await import("@manga-ai-studio/ai");
      const sceneText = [
        scene.summary,
        ...(scene.dialogue ?? []).map((d: LooseRecord) => d.text ?? d.line ?? ""),
      ]
        .filter(Boolean)
        .join(" ");
      for (const charName of scene.characters ?? []) {
        const charRecord = rawCharacters.find((c: LooseRecord) => c.name === charName);
        if (!charRecord) continue;
        const events = detectPhysicalEvents(sceneText, charName, chapterId, sceneDbRecord.id);
        if (events.length > 0) {
          const currentBodyState = loadOrCreateBodyState(charRecord.bodyState);
          const updatedBodyState = applyPhysicalEvents(currentBodyState, events);
          await prisma.character.update({
            where: { id: charRecord.id },
            data: { bodyState: updatedBodyState as LooseRecord },
          });
          charRecord.bodyState = updatedBodyState as LooseRecord;
          console.log(
            `[pipeline:physical-events] ${charName}: ${events
              .map((e) => `${e.type}(${e.bodyPart})`)
              .join(", ")}`,
          );
        }
      }
    } catch (physErr) {
      console.warn(
        `[pipeline:physical-events] detection failed (non-blocking): ${
          physErr instanceof Error ? physErr.message : physErr
        }`,
      );
    }

    const sceneSnapshot = buildSceneSnapshot({
      kernel: continuityKernel,
      chapterId,
      chapterNumber,
      sceneId: sceneDbRecord.id,
      sceneNumber: index + 1,
      title: scene.title,
      summary: scene.summary,
      dramaticGoal: sceneStateData.dramaticGoal,
      location: scene.location,
      sceneStateData,
      // FIX-2 (CRITIQUE) : la Map est indexée par sceneNumber (1-based),
      // pas par index (0-based). `index + 1` correspond au sceneNumber.
      sceneBlueprints: sceneBlueprintsByScene.get(index + 1) ?? [],
      continuityPayload: scene.continuityPayload,
      participantNames: scene.characters,
    });

    const continuityValidation = validateSceneSnapshotAgainstKernel({
      kernel: continuityKernel,
      sceneSnapshot,
    });
    const sceneEvents = continuityValidation.accepted
      ? deriveSceneEvents({ kernel: continuityKernel, sceneSnapshot })
      : [];

    if (continuityValidation.issues.length > 0) {
      console.warn(
        `[continuity-kernel] scene=${sceneDbRecord.id} accepted=${continuityValidation.accepted} issues=${continuityValidation.issues
          .map((issue: LooseRecord) => issue.message)
          .join(" | ")}`,
      );
    }
    kernelValidationWarnings.push(
      ...continuityValidation.issues.map((issue: LooseRecord) => issue.message),
      ...continuityValidation.warnings,
    );

    const sceneMeta = asRecord(sceneDbRecord.metadata);
    await prisma.chapterScene.update({
      where: { id: sceneDbRecord.id },
      data: {
        metadata: {
          ...sceneMeta,
          sceneSnapshot,
          continuityValidation,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (continuityValidation.accepted) {
      await persistValidatedSceneContinuity(prisma, {
        projectId,
        chapterId,
        chapterNumber,
        sceneId: sceneDbRecord.id,
        sceneNumber: index + 1,
        sceneSnapshot,
        validation: continuityValidation,
        events: sceneEvents,
      });
      continuityKernel = applySceneEventsToKernel(continuityKernel, sceneSnapshot, sceneEvents);
      validatedSceneSnapshots.push(sceneSnapshot);
    } else {
      // FIX-1 (CRITIQUE) : ne JAMAIS pousser un snapshot rejeté dans
      // `validatedSceneSnapshots` — il serait propagé au chapter snapshot
      // puis dans `persistChapterMemory`, polluant le canon des chapitres
      // suivants (ex: Lux porte un objet déjà perdu). Le nom du tableau
      // l'exige littéralement : "validated".
      console.warn(
        `[continuity-kernel] scene=${sceneDbRecord.id} REJECTED — not included in chapter snapshot`,
        continuityValidation.issues.map((issue: LooseRecord) => issue.message),
      );
    }
  }

  return {
    validatedSceneSnapshots,
    kernelValidationWarnings,
    continuityKernel,
    skippedSceneNumbers,
  };
}
