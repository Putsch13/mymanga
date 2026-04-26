/**
 * Dialoguiste IA par beat (blueprints premium) — optionnel, activé explicitement.
 *
 * Activation : `OPENAI_SCENE_DIALOGUE_ENRICH=1` **ou** `forceSceneDialogueEnrich` (studio / job) + `OPENAI_API_KEY`.
 * Modèle : `OPENAI_SCENE_DIALOGUE_MODEL` (défaut `gpt-4o-mini`).
 */

import OpenAI from "openai";
import { z } from "zod";
import type { PanelBlueprintPremium, ProductionOutline } from "@manga-ai-studio/core";
import { getDialogueStyleProfile } from "./dialogue-style-director";
import { validateDialogueVariety } from "./dialogue-variety-guard";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lineSchema = z.object({
  panelId: z.string(),
  speaker: z.string(),
  text: z.string().max(220),
});

const responseSchema = z.object({
  lines: z.array(lineSchema).max(32),
});

export interface EnrichPremiumBlueprintsSceneDialogueInput {
  blueprints: PanelBlueprintPremium[];
  productionOutline?: ProductionOutline | null;
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  characterNameById: Record<string, string>;
  projectGenre?: string | null;
  projectTone?: string | null;
  contentRating?: string | null;
  /** Snippets normalisés (ex. chapitre n-1) à ne pas recopier — optionnel. */
  avoidDialogueSnippets?: string[] | null;
  /** Studio / job : activer même si OPENAI_SCENE_DIALOGUE_ENRICH n’est pas à 1. */
  forceSceneDialogueEnrich?: boolean;
}

function beatText(outline: ProductionOutline | null | undefined, beatId: string): string {
  const beats = Array.isArray(outline?.beats) ? outline!.beats : [];
  const b = beats.find((x) => x.beatId === beatId);
  if (!b) return "";
  return [b.summary, b.whyThisBeatExists, b.dramaticChange].filter((x): x is string => typeof x === "string").join(" | ");
}

function isSpeakerish(bp: PanelBlueprintPremium): boolean {
  return (
    bp.dialogueCarrier === "speaker_visible"
    || bp.subjectFocus === "speaker"
    || bp.subjectFocus === "duo"
    || /dialogue|parl|dit|réplique/i.test(bp.purpose)
  );
}

/**
 * Tente d’écrire des dialogues courts pour les cases « speaker » encore vides.
 */
export async function enrichPremiumBlueprintsSceneDialogue(
  input: EnrichPremiumBlueprintsSceneDialogueInput,
): Promise<{ beatsTouched: number; linesWritten: number; warnings: string[] }> {
  const warnings: string[] = [];
  const envScene = process.env.OPENAI_SCENE_DIALOGUE_ENRICH === "1";
  const allowScene = input.forceSceneDialogueEnrich === true || envScene;
  if (!allowScene) {
    warnings.push("scene_dialogue_skipped_not_enabled");
    return { beatsTouched: 0, linesWritten: 0, warnings };
  }
  if (!process.env.OPENAI_API_KEY) {
    warnings.push("scene_dialogue_skipped_no_openai");
    return { beatsTouched: 0, linesWritten: 0, warnings };
  }

  const profile = getDialogueStyleProfile({
    genre: input.projectGenre,
    tone: input.projectTone,
    contentRating: input.contentRating,
  });

  const byBeat = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of input.blueprints) {
    const arr = byBeat.get(bp.beatId) ?? [];
    arr.push(bp);
    byBeat.set(bp.beatId, arr);
  }

  let beatsTouched = 0;
  let linesWritten = 0;

  for (const [beatId, panels] of byBeat) {
    const targets = panels.filter(
      (p) => isSpeakerish(p) && (!p.dialogueLines || p.dialogueLines.length === 0),
    );
    if (targets.length === 0) continue;

    const beatCtx = beatText(input.productionOutline ?? null, beatId);
    const panelSpecs = targets.map((p) => ({
      panelId: p.panelId,
      purpose: p.purpose.slice(0, 280),
      speakerHint:
        (p.speakerAnchorCharacterId && input.characterNameById[p.speakerAnchorCharacterId])
        ?? (p.mustShowCharacterIds?.[0] && input.characterNameById[p.mustShowCharacterIds[0]!])
        ?? "",
    }));

    try {
      const model = process.env.OPENAI_SCENE_DIALOGUE_MODEL ?? "gpt-4o-mini";
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.55,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Tu es dialoguiste manga. Écris des répliques courtes en français, visuelles, sans exposer l'intrigue platement.
Règles : une ligne par panelId demandé ; pas de répétition entre lignes ; ne recopie pas les fragments listés dans avoidPhrasesFromPriorChapter ; pas de clichés type "je dois devenir plus fort" ; respecte le profil de style JSON.
Réponds uniquement avec JSON : {"lines":[{"panelId","speaker","text"}]}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              beatId,
              beatContext: beatCtx.slice(0, 1200),
              chapterSummary: (input.chapterSummary ?? "").slice(0, 600),
              userIntent: (input.chapterUserIntent ?? "").slice(0, 400),
              styleProfile: profile,
              avoidPhrasesFromPriorChapter: (input.avoidDialogueSnippets ?? []).slice(0, 40),
              panels: panelSpecs,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(raw) as unknown;
      } catch {
        warnings.push(`scene_dialogue_json beat=${beatId}`);
        continue;
      }
      const parsed = responseSchema.safeParse(rawJson);
      if (!parsed.success) {
        warnings.push(`scene_dialogue_parse beat=${beatId}`);
        continue;
      }

      const variety = validateDialogueVariety({
        panelTexts: parsed.data.lines.map((l) => ({
          panelId: l.panelId,
          text: l.text,
          speakerId: l.speaker,
          mode: "dialogue",
        })),
      });
      if (!variety.ok) {
        warnings.push(`scene_dialogue_variety beat=${beatId} issues=${variety.issues.slice(0, 3).join(";")}`);
      }

      const byId = new Map(targets.map((p) => [p.panelId, p] as const));
      for (const line of parsed.data.lines) {
        const bp = byId.get(line.panelId);
        if (!bp) continue;

        // P0.2 — Forcer TOUS les attributs speaker pour éviter no_speaker_panel_for_dialogue_beat
        bp.dialogueLines = [{ speaker: line.speaker, text: line.text.trim() }];
        bp.dialogueLinesAnchored = Math.max(1, bp.dialogueLinesAnchored ?? 0);
        bp.dialogueCarrier = "speaker_visible";

        // Résoudre le speaker character ID
        const speakerName = line.speaker.toLowerCase().trim();
        const resolvedSpeakerId =
          bp.speakerAnchorCharacterId ??
          Object.entries(input.characterNameById).find(
            ([, name]) => name.toLowerCase().trim() === speakerName,
          )?.[0] ??
          bp.mustShowCharacterIds?.[0] ??
          null;

        if (resolvedSpeakerId) {
          bp.speakerAnchorCharacterId = resolvedSpeakerId;
        }

        // Déterminer le focus selon le nombre de speakers potentiels
        const visibleCharCount = bp.mustShowCharacterIds?.length ?? 1;
        bp.subjectFocus = visibleCharCount >= 2 ? "duo" : "speaker";
        bp.mangaPanelFunction = "dialogue_speaker";

        // Assurer les zones réservées pour le texte
        if (!bp.panelTextBundle) {
          bp.panelTextBundle = {
            dialogues: bp.dialogueLines,
            narration: null,
            sfx: [],
            reservedZones: ["top_right"],
          };
        } else {
          bp.panelTextBundle.dialogues = bp.dialogueLines;
          bp.panelTextBundle.reservedZones = bp.panelTextBundle.reservedZones ?? ["top_right"];
        }

        bp.notes = [...(bp.notes ?? []), "scene_dialogue_llm", "speaker_panel_enforced"];
        linesWritten += 1;
      }
      if (parsed.data.lines.length > 0) beatsTouched += 1;
      console.info(
        `[dialogue-scene-writer] beat=${beatId} panels=${targets.length} written=${parsed.data.lines.length} variety_ok=${variety.ok}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`scene_dialogue_error beat=${beatId} msg=${msg.slice(0, 120)}`);
    }
  }

  return { beatsTouched, linesWritten, warnings };
}
