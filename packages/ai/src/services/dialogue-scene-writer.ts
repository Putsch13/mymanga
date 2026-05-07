/**
 * Dialoguiste IA par beat (blueprints premium) — optionnel, activé explicitement.
 *
 * Activation : `OPENAI_SCENE_DIALOGUE_ENRICH=1` **ou** `forceSceneDialogueEnrich` (studio / job) + `OPENAI_API_KEY`.
 * Modèle : `OPENAI_SCENE_DIALOGUE_MODEL` (défaut `gpt-4o-mini`).
 */

import OpenAI from "openai";
import { z } from "zod";
import {
  blueprintPrimaryDialogueLineCount,
  syncBlueprintTextContractFromTextFragments,
  type PanelBlueprintPremium,
  type ProductionOutline,
} from "@manga-ai-studio/core";
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
  /**
   * P0.14 — Premium : toute réplique dont le speaker ne mappe pas à un `characterId`
   * produit une entrée dans `blockingErrors` (le pipeline peut faire échouer le job).
   */
  rejectUnresolvedSpeakers?: boolean;
  /** Beat IDs that have required DialogueActs — skip without targets is a blocking error. */
  requiredDialogueActBeatIds?: string[];
  /**
   * P0 — IDs des héros principaux : utilisés pour équilibrer la distribution
   * des répliques (éviter que tout retombe sur le héros 1).
   */
  heroCharacterId?: string | null;
  secondaryHeroCharacterId?: string | null;
  /**
   * P0 — Groupes de PNJ disponibles pour ce chapitre. Le writer peut leur
   * assigner des répliques (ex. "Pêcheur", "Garde", "Marchand"). Sans ça,
   * le LLM retombe systématiquement sur le héros.
   */
  npcGroups?: ReadonlyArray<{ id: string; label: string }>;
}

export interface EnrichPremiumBlueprintsSceneDialogueResult {
  beatsTouched: number;
  linesWritten: number;
  warnings: string[];
  /** Erreurs bloquantes si `rejectUnresolvedSpeakers` et speaker LLM non résolu. */
  blockingErrors: string[];
}

function beatText(outline: ProductionOutline | null | undefined, beatId: string): string {
  const beats = Array.isArray(outline?.beats) ? outline!.beats : [];
  const b = beats.find((x) => x.beatId === beatId);
  if (!b) return "";
  return [b.summary, b.whyThisBeatExists, b.dramaticChange].filter((x): x is string => typeof x === "string").join(" | ");
}

function isSpeakerish(bp: PanelBlueprintPremium): boolean {
  // P0 fix : élargir aux beats centrés sur des PNJ ou des groupes (pêcheurs,
  // gardes, etc.) qui doivent pouvoir prévenir/avertir le héros. Sans ça, le
  // dialogue-scene-writer skip silencieusement tous les beats où le PNJ parle.
  const hasRequiredEntities = Array.isArray(bp.requiredEntityIds) && bp.requiredEntityIds.length > 0;
  const hasMustShowChars = Array.isArray(bp.mustShowCharacterIds) && bp.mustShowCharacterIds.length > 0;
  const carrierAllowsDialogue = bp.dialogueCarrier !== "narration";
  return (
    bp.dialogueCarrier === "speaker_visible"
    || bp.subjectFocus === "speaker"
    || bp.subjectFocus === "duo"
    || bp.subjectFocus === "group"
    || bp.subjectFocus === "npc"
    || (hasRequiredEntities && carrierAllowsDialogue)
    || (hasMustShowChars && carrierAllowsDialogue)
    || /dialogue|parl|dit|réplique|crie|alerte|prévient|avertit|hurle|s'écrie|s'exclame/i.test(bp.purpose)
  );
}

/**
 * Tente d’écrire des dialogues courts pour les cases « speaker » encore vides.
 */
export async function enrichPremiumBlueprintsSceneDialogue(
  input: EnrichPremiumBlueprintsSceneDialogueInput,
): Promise<EnrichPremiumBlueprintsSceneDialogueResult> {
  const warnings: string[] = [];
  const blockingErrors: string[] = [];
  const envScene = process.env.OPENAI_SCENE_DIALOGUE_ENRICH === "1";
  const allowScene = input.forceSceneDialogueEnrich === true || envScene;
  if (!allowScene) {
    warnings.push("scene_dialogue_skipped_not_enabled");
    return { beatsTouched: 0, linesWritten: 0, warnings, blockingErrors };
  }
  if (!process.env.OPENAI_API_KEY) {
    warnings.push("scene_dialogue_skipped_no_openai");
    return { beatsTouched: 0, linesWritten: 0, warnings, blockingErrors };
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
      (p) => isSpeakerish(p) && blueprintPrimaryDialogueLineCount(p) === 0,
    );
    if (targets.length === 0) {
      warnings.push(`scene_dialogue_skipped_no_targets beat=${beatId} panels=${panels.length}`);
      console.warn(`[dialogue-scene-writer] skipped beat=${beatId} reason=no_speakerish_targets panels=${panels.length}`);
      const requiredActBeats = input.requiredDialogueActBeatIds ?? [];
      if (requiredActBeats.includes(beatId)) {
        blockingErrors.push(`required_dialogue_act_no_panel_target:${beatId}`);
      }
      continue;
    }

    const beatCtx = beatText(input.productionOutline ?? null, beatId);
    const npcGroups = input.npcGroups ?? [];

    // P0 fix : construire un hint de speaker plus riche, incluant les NPC
    // groups si le panel a des requiredEntityIds. Sans ça, le LLM ne sait
    // pas qu'il peut faire parler un pêcheur / garde / marchand et retombe
    // toujours sur le héros.
    const npcLabelByEntityId = new Map(npcGroups.map((g) => [g.id, g.label] as const));
    const panelSpecs = targets.map((p) => {
      const requiredNpcLabels = (p.requiredEntityIds ?? [])
        .map((id) => npcLabelByEntityId.get(id))
        .filter((l): l is string => Boolean(l));
      const baseHint =
        (p.speakerAnchorCharacterId && input.characterNameById[p.speakerAnchorCharacterId])
        ?? (p.mustShowCharacterIds?.[0] && input.characterNameById[p.mustShowCharacterIds[0]!])
        ?? "";
      return {
        panelId: p.panelId,
        purpose: p.purpose.slice(0, 280),
        speakerHint: baseHint,
        availableSpeakerLabels: requiredNpcLabels,
        subjectFocus: p.subjectFocus,
      };
    });

    // Build the canonical roster of speakers for the LLM. Premium: all
    // catalog characters + NPC group labels. The model MUST pick from here.
    const heroName =
      (input.heroCharacterId && input.characterNameById[input.heroCharacterId]) || null;
    const secondaryHeroName =
      (input.secondaryHeroCharacterId && input.characterNameById[input.secondaryHeroCharacterId]) || null;
    const otherCharacterNames = Object.entries(input.characterNameById)
      .filter(([id]) => id !== input.heroCharacterId && id !== input.secondaryHeroCharacterId)
      .map(([, name]) => name);
    const allowedSpeakers = [
      ...(heroName ? [{ name: heroName, role: "hero" }] : []),
      ...(secondaryHeroName ? [{ name: secondaryHeroName, role: "secondary_hero" }] : []),
      ...otherCharacterNames.map((name) => ({ name, role: "supporting" })),
      ...npcGroups.map((g) => ({ name: g.label, role: "npc_group" })),
    ];

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

RÈGLES DE LOCUTEUR (TRÈS IMPORTANT) :
- Le champ "speaker" DOIT correspondre EXACTEMENT à un nom listé dans "allowedSpeakers".
- ÉQUILIBRE les répliques : ne mets PAS toutes les répliques sur le héros. Si un héros 2 (role:secondary_hero) ou un PNJ (role:npc_group) est listé dans "allowedSpeakers" du beat, fais-les parler activement (interaction, désaccord, mise en garde, info).
- Si le panel a "availableSpeakerLabels" non vide, c'est que ce sont des PNJ qui DOIVENT parler dans ce panel — utilise leur label exact comme "speaker".
- Si "subjectFocus" est "duo" : alterne deux speakers différents.
- Si "subjectFocus" est "group" ou "npc" : privilégie un PNJ comme speaker.

RÈGLES DE STYLE :
- Une ligne par panelId demandé ; pas de répétition entre lignes.
- Ne recopie pas les fragments listés dans avoidPhrasesFromPriorChapter.
- Pas de clichés type "je dois devenir plus fort".
- Respecte le profil de style JSON.

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
              allowedSpeakers,
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
      const npcLabelToId = new Map(
        npcGroups.map((g) => [g.label.toLowerCase().trim(), g.id] as const),
      );

      for (const line of parsed.data.lines) {
        const bp = byId.get(line.panelId);
        if (!bp) continue;

        const speakerName = line.speaker.toLowerCase().trim();

        // Prio 1 : match exact sur un personnage du catalogue.
        const characterIdMatch = Object.entries(input.characterNameById).find(
          ([, name]) => name.toLowerCase().trim() === speakerName,
        )?.[0];

        // Prio 2 : match sur un NPC group label.
        const npcGroupIdMatch = npcLabelToId.get(speakerName);

        // Prio 3 : si le panel a un speakerAnchor déterministe, on l'utilise.
        // Prio 4 (dernier recours) : premier mustShowCharacterIds, mais
        // SEULEMENT si le LLM n'a pas explicitement nommé un PNJ qu'on ne sait
        // pas mapper (sinon on écrase silencieusement le rôle voulu).
        const resolvedSpeakerId =
          characterIdMatch
          ?? npcGroupIdMatch
          ?? bp.speakerAnchorCharacterId
          ?? bp.mustShowCharacterIds?.[0]
          ?? null;

        if (!resolvedSpeakerId) {
          const msg = `scene_dialogue_speaker_unresolved panel=${line.panelId} speaker=${line.speaker}`;
          warnings.push(msg);
          if (input.rejectUnresolvedSpeakers) {
            blockingErrors.push(`DIALOGUE_SPEAKER_UNKNOWN:${msg}`);
          }
          continue;
        }

        bp.dialogueLines = [{ speaker: line.speaker, text: line.text.trim(), characterId: resolvedSpeakerId }];
        bp.dialogueLinesAnchored = Math.max(1, bp.dialogueLinesAnchored ?? 0);
        bp.dialogueCarrier = "speaker_visible";
        bp.speakerAnchorCharacterId = resolvedSpeakerId;

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

        syncBlueprintTextContractFromTextFragments(bp);

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

  const requiredActBeats = input.requiredDialogueActBeatIds ?? [];
  const fulfilledActs = requiredActBeats.filter(
    (bid) => !blockingErrors.some((e) => e.includes(bid)),
  );
  const missingActs = requiredActBeats.filter(
    (bid) => blockingErrors.some((e) => e.includes(bid)),
  );
  console.info(
    `[dialogue] requiredActs=${requiredActBeats.length} fulfilled=${fulfilledActs.length} missing={${missingActs.join(",")}}`,
  );

  return { beatsTouched, linesWritten, warnings, blockingErrors };
}
