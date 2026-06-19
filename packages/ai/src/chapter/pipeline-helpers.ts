/**
 * pipeline-helpers.ts
 *
 * Helpers purs du chapter-pipeline (normalisation contrôle créatif,
 * extraction casting, plot options, templates de page-role). Extrait de
 * `chapter-pipeline.ts` (audit-v9).
 */

import {
  isAntagonistRole,
  isHeroRole,
} from "@manga-ai-studio/core";
import { creativityControlsSchema, type CreativityControls } from "@manga-ai-studio/world";
import type { ProjectContextForChapter, PanelMood } from "./shared-types";

export type PageRoleKey =
  | "establishing"
  | "escalation"
  | "confrontation"
  | "revelation"
  | "aftermath"
  | "cliffhanger";

export type PanelBlueprint = {
  panelId: string;
  action: string;
  mood: PanelMood;
  characters: string[];
};

export const STD_NEGATIVE =
  "blurry, deformed hands, extra limbs, wrong hair color, inconsistent outfit, bad anatomy, watermark, text overlay, low quality, duplicate character";

export function normalizeCreativityControls(input: Partial<CreativityControls> | undefined): CreativityControls {
  return creativityControlsSchema.parse(input ?? {});
}

export function describeCreativityProfile(input: CreativityControls) {
  const novelty = input.noveltyLevel >= 70 ? "variations plus audacieuses" : input.noveltyLevel <= 35 ? "variations très maîtrisées" : "variations équilibrées";
  const canon = input.worldStrictness >= 85 ? "canon verrouillé" : input.worldStrictness <= 45 ? "canon plus souple" : "canon surveillé";
  const environment = input.environmentRichness >= 75 ? "décors plus riches" : "décors plus fonctionnels";
  const npc = input.npcVariety >= 70 ? "présence PNJ plus variée" : "présence PNJ contenue";
  return `${novelty}, ${canon}, ${environment}, ${npc}`;
}

export function takeNames(context: ProjectContextForChapter, count: number) {
  const focusSet = new Set((context.focusCharacterIds ?? []).filter(Boolean));
  const prioritized = [...context.characters].sort((a, b) => {
    const aFocused = focusSet.has(a.id) ? 1 : 0;
    const bFocused = focusSet.has(b.id) ? 1 : 0;
    if (aFocused !== bFocused) return bFocused - aFocused;
    const aRole = isHeroRole(a.roleType) ? 1 : isAntagonistRole(a.roleType) ? 2 : 3;
    const bRole = isHeroRole(b.roleType) ? 1 : isAntagonistRole(b.roleType) ? 2 : 3;
    return aRole - bRole;
  });
  return prioritized.slice(0, count).map((c) => c.name);
}

export function extractCharactersFromText(context: ProjectContextForChapter, text: string, fallback: string[]): string[] {
  const lowered = text.toLowerCase();
  const matched = context.characters
    .filter((character) => lowered.includes(character.name.toLowerCase()))
    .map((character) => character.name);
  return matched.length > 0 ? matched : fallback;
}

export function mergeCharactersFromBeat(
  context: ProjectContextForChapter,
  beatCharacters: string[] | undefined,
  beatSummary: string,
  fallback: string[],
): string[] {
  const fromBeat = [...new Set((beatCharacters ?? []).map((name) => name.trim()).filter(Boolean))];
  if (fromBeat.length > 0) return fromBeat;
  return extractCharactersFromText(context, beatSummary, fallback);
}

export function shouldKeepSingleLocation(userIntent: string, beats: Array<{ location: string }>) {
  const transitionHints = /(plus tard|ensuite|puis|après|change de lieu|quitte|rejoint|traverse|retourne à|retourne au|retourne en)/i;
  if (transitionHints.test(userIntent)) return false;
  const distinct = [...new Set(beats.map((b) => b.location.trim().toLowerCase()).filter(Boolean))];
  return distinct.length <= 2;
}

export function stretchToCount<T>(items: T[], count: number, fallbackFactory: (index: number) => T): T[] {
  if (items.length >= count) return items.slice(0, count);
  const next = [...items];
  for (let i = items.length; i < count; i++) {
    next.push(fallbackFactory(i));
  }
  return next;
}

export function reinforceIntentEntityCoverage(
  beats: Array<{ characters: string[]; summary: string; turn: string; pageRole: string }>,
  intentEntityHints: Array<{ name: string; recurrencePolicy?: string | null; roleHint?: string | null }>,
) {
  if (intentEntityHints.length === 0 || beats.length === 0) return;
  for (const entity of intentEntityHints) {
    const targetIndexes = entity.recurrencePolicy === "story_locked" || entity.recurrencePolicy === "recurring"
      ? [...new Set([0, Math.floor(beats.length / 2), Math.max(0, beats.length - 2)])]
      : [0];
    for (const index of targetIndexes) {
      const beat = beats[index];
      if (!beat) continue;
      if (!beat.characters.includes(entity.name)) {
        beat.characters = [...beat.characters, entity.name];
      }
      if (!beat.summary.toLowerCase().includes(entity.name.toLowerCase())) {
        beat.summary = `${beat.summary} ${entity.name} joue un rôle concret dans cette étape.`;
      }
      if (
        entity.roleHint &&
        !beat.turn.toLowerCase().includes(entity.name.toLowerCase()) &&
        (beat.pageRole === "revelation" || beat.pageRole === "cliffhanger" || index === 0)
      ) {
        beat.turn = `${beat.turn} ${entity.name} intervient (${entity.roleHint}).`;
      }
    }
  }
}

export function buildDynamicPlotOptions(input: {
  userIntent: string;
  mainCast: string[];
  previousSummary: string | null;
  previousCliffhanger: string | null;
  creativityControls: CreativityControls;
  outline: {
    summary: string;
    cliffhanger: string;
    beats: Array<{ summary: string; turn?: string; location?: string; pageRole?: string }>;
  };
}) {
  const [hero = "Le héros", second = "un allié"] = input.mainCast;
  const firstBeat = input.outline.beats[0];
  const middleBeat = input.outline.beats.find((b) => b.pageRole === "confrontation" || b.pageRole === "revelation") ?? input.outline.beats[1];
  const lastBeat = input.outline.beats[input.outline.beats.length - 1];
  const previousAnchor = input.previousCliffhanger ?? input.previousSummary ?? "les événements récents";
  const environmentHint = input.creativityControls.environmentRichness >= 70 ? "avec un décor plus incarné" : "dans un cadre lisible";
  const npcHint = input.creativityControls.npcVariety >= 70 ? "et une pression de foule plus variée" : "en gardant les présences secondaires sous contrôle";
  const canonHint = input.creativityControls.worldStrictness >= 85 ? "sans dévier du canon établi" : "avec un peu plus de latitude sur l'ambiance";

  return [
    {
      id: "safe",
      title: "Progression logique",
      label: "safe" as const,
      summary: `Après ${previousAnchor}, ${hero} suit ${firstBeat?.turn?.toLowerCase() ?? "une piste concrète"} à ${firstBeat?.location ?? "un lieu clé"} ${environmentHint} pour faire avancer ${input.userIntent.slice(0, 80)} ${canonHint}.`,
    },
    {
      id: "bold",
      title: "Accélération émotionnelle",
      label: "bold" as const,
      summary: `${hero} et ${second} se heurtent autour de ${middleBeat?.summary?.slice(0, 90) ?? input.userIntent.slice(0, 90)}, ce qui force une décision risquée et plus intime, ${npcHint}.`,
    },
    {
      id: "shock",
      title: "Rupture dramatique",
      label: "shock" as const,
      summary: `Le chapitre pousse vers ${lastBeat?.turn?.toLowerCase() ?? input.outline.cliffhanger.toLowerCase()} et transforme ${input.outline.cliffhanger.toLowerCase()} en vraie ouverture de saga, avec ${input.creativityControls.noveltyLevel >= 70 ? "une rupture plus inattendue" : "une montée plus contrôlée"}.`,
    },
  ];
}

export const PAGE_ROLE_TEMPLATES: Record<PageRoleKey, (ctx: { mainA: string; mainB: string; location: string; summary: string; purpose: string; turn: string }) => string[]> = {
  establishing: (c) => [
    `Plan large narratif : ${c.summary} Décor lisible de ${c.location}.`,
    `${c.mainA} capte un détail concret du lieu qui soutient : ${c.summary}`,
    `${c.mainA} entre dans le lieu, posture et expression lisibles.`,
    `Un élément de l'environnement annonce la suite : ${c.turn}`,
    `Narration visuelle : le regard de ${c.mainA} se pose sur un indice.`,
    `Transition douce vers l'action : ${c.mainA} s'approche de ${c.mainB}.`,
  ],
  escalation: (c) => [
    `${c.summary} La tension devient concrète entre ${c.mainA} et ${c.mainB}.`,
    `Un échange de regards chargé de tension autour de ${c.purpose}.`,
    `${c.mainA} réalise quelque chose : ${c.turn}`,
    `La pression monte : un détail concret aggrave la situation.`,
    `${c.mainB} réagit violemment ou émotionnellement.`,
    `Point de non-retour : ${c.mainA} doit agir maintenant.`,
  ],
  confrontation: (c) => [
    `${c.summary} Face à face clair : ${c.mainA} contre ${c.mainB}.`,
    `Champ/contre-champ : expressions opposées, enjeux lisibles.`,
    `Action : ${c.mainA} fait un geste décisif. ${c.turn}`,
    `Impact : la conséquence est immédiate et visuelle.`,
    `${c.mainB} encaisse ou riposte. Le rapport de force bascule.`,
    `Respiration : un silence après l'impact, poussière ou souffle.`,
  ],
  revelation: (c) => [
    `Moment de silence : case sombre ou vide, suspense.`,
    `Zoom lent : un détail change tout — ${c.turn}`,
    `Réaction choc de ${c.mainA} : expression extrême, yeux écarquillés.`,
    `Plan large conséquence : l'ampleur de la révélation apparaît.`,
    `${c.mainB} comprend aussi. Regard échangé, chargé de sens.`,
    `Narration intérieure de ${c.mainA} sur ce que ça change.`,
  ],
  aftermath: (c) => [
    `Calme après la tempête : ${c.location} sous un nouveau jour.`,
    `${c.mainA} fait le point, expression fatiguée ou déterminée.`,
    `Dialogue posé entre ${c.mainA} et ${c.mainB} sur ce qui vient de se passer.`,
    `Un geste simple (soigner, ranger, marcher) montre l'état intérieur.`,
    `${c.turn} — une nouvelle perspective émerge.`,
    `Transition : le regard se porte vers l'horizon ou la prochaine étape.`,
  ],
  cliffhanger: (c) => [
    `${c.summary} L'accélération devient irréversible.`,
    `${c.mainA} fait face à une dernière décision — ${c.purpose}.`,
    `Montée : chaque case rapproche du point de rupture.`,
    `${c.turn} — le retournement frappe.`,
    `Image symbolique : ombre, lumière ou silhouette — impact maximal.`,
    `Dernière case : question ouverte, le lecteur DOIT tourner la page.`,
  ],
};
