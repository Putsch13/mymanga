/**
 * Narrative pass — construction des SceneAnchor enrichis (DIAG-D / Option 1).
 *
 * Extrait de narrative-pass.ts. Pour chaque scène du bundle révisé :
 *  - projectStyleAnchor (constant, calculé une fois)
 *  - establishedLocationBrief (match nom du lieu contre knownLocations)
 *  - mainCastAnchors (apparence canonique des persos principaux présents)
 *  - recurringNpcAnchors (top-3 PNJ secondaires promus)
 *
 * Le même anchor est réutilisé pour TOUS les panels de la scène → zéro coût supplémentaire
 * à l'inférence, continuité visuelle maximisée.
 */

import {
  buildSceneAnchor,
  composeProjectStyleAnchor,
  type MainCastAnchor,
  type RecurringNpcAnchor,
  type SceneAnchor,
} from "@manga-ai-studio/ai";
import { inferSceneWeather, inferSceneTimeOfDay } from "../../pipeline-helpers";

type KnownLocation = {
  name: string;
  visualBrief?: string | null;
  establishedVisualBrief?: string | null;
};

type RawCharacter = {
  name: string;
  gender?: string | null;
  age?: number | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  appearance?: string | null;
};

type RecurringNpcInput = {
  label: string;
  shortVisualCore: string;
  outfitSignature?: string | null;
};

type Scene = {
  location: string;
  summary: string;
  purpose?: string | null;
  characters: string[];
};

type ProjectContextSlice = {
  primaryGenre?: string | null;
  tone?: string | null;
  visualStyle?: string | null;
};

function normalizeLocationName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function buildLocationBriefIndex(knownLocations: readonly KnownLocation[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const loc of knownLocations) {
    const brief = loc.establishedVisualBrief ?? loc.visualBrief ?? null;
    if (!brief) continue;
    idx.set(normalizeLocationName(loc.name), brief);
  }
  return idx;
}

function findEstablishedLocationBrief(
  sceneLocation: string,
  locationBriefByName: Map<string, string>,
): string | null {
  const normalized = normalizeLocationName(sceneLocation);
  for (const [locKey, brief] of locationBriefByName.entries()) {
    if (normalized.includes(locKey) || locKey.includes(normalized)) {
      return brief;
    }
  }
  return null;
}

function composeMainCastAnchor(
  charName: string,
  rawCharacters: readonly RawCharacter[],
): MainCastAnchor | null {
  const rc = rawCharacters.find((c) => c.name === charName);
  if (!rc) return null;
  const bits: string[] = [];
  if (rc.gender) bits.push(rc.gender);
  if (rc.age) bits.push(`~${rc.age}y`);
  if (rc.hairColor) bits.push(`${rc.hairColor} hair`);
  if (rc.eyeColor) bits.push(`${rc.eyeColor} eyes`);
  if (rc.outfitDefault) bits.push(`signature outfit: ${rc.outfitDefault}`);
  if (rc.appearance) bits.push(rc.appearance);
  if (bits.length === 0) return null;
  return {
    name: rc.name,
    shortVisualCore: bits.join(", ").slice(0, 240),
  };
}

export function buildSceneAnchorsByIndex(input: {
  scenes: readonly Scene[];
  project: ProjectContextSlice;
  knownLocations: readonly KnownLocation[];
  rawCharacters: readonly RawCharacter[];
  recurringNpcs: readonly RecurringNpcInput[];
}): Map<number, SceneAnchor> {
  const { scenes, project, knownLocations, rawCharacters, recurringNpcs } = input;

  const projectStyleAnchor = composeProjectStyleAnchor({
    genre: project.primaryGenre,
    tone: project.tone ?? null,
    visualStyle: project.visualStyle ?? null,
  });

  const locationBriefByName = buildLocationBriefIndex(knownLocations);

  const topRecurringNpcs: RecurringNpcAnchor[] = recurringNpcs.slice(0, 5).map((n) => ({
    label: n.label,
    shortVisualCore: n.shortVisualCore,
    outfitSignature: n.outfitSignature ?? null,
  }));

  const sceneAnchorByIndex = new Map<number, SceneAnchor>();
  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = scenes[idx];
    if (!scene) continue;

    const establishedLocationBrief = findEstablishedLocationBrief(
      scene.location,
      locationBriefByName,
    );

    const mainCastAnchors = scene.characters
      .slice(0, 4)
      .map((name) => composeMainCastAnchor(name, rawCharacters))
      .filter((x): x is MainCastAnchor => x !== null);

    const anchor = buildSceneAnchor({
      sceneId: `scene_${idx + 1}`,
      castLineup: scene.characters.slice(0, 4),
      location: scene.location,
      mood: scene.purpose ?? "dramatic",
      weather: inferSceneWeather(scene.summary) ?? undefined,
      timeOfDay: inferSceneTimeOfDay(scene.summary) ?? undefined,
      establishedLocationBrief,
      mainCastAnchors,
      recurringNpcAnchors: topRecurringNpcs.slice(0, 3),
      styleAnchor: projectStyleAnchor,
    });
    sceneAnchorByIndex.set(idx, anchor);
  }

  return sceneAnchorByIndex;
}
