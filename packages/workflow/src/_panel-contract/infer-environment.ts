import type { PanelContract } from "@manga-ai-studio/core";
import { uniq } from "./utils";

export function inferTimeOfDay(text: string) {
  if (/(night|nuit|moon|lune|soir)/i.test(text)) return "night";
  if (/(sunrise|aube|dawn|matin)/i.test(text)) return "dawn";
  if (/(sunset|crépuscule|crepuscule|soirée|coucher du soleil)/i.test(text)) return "sunset";
  return null;
}

export function inferWeather(text: string) {
  if (/(rain|pluie|averse|storm|orage)/i.test(text)) return "rain";
  if (/(fog|brume|mist|brouillard)/i.test(text)) return "fog";
  if (/(snow|neige|blizzard)/i.test(text)) return "snow";
  if (/(wind|vent|gale)/i.test(text)) return "wind";
  return null;
}

export function inferEnvironmentPrimary(location: string) {
  const lower = location.toLowerCase();
  if (/(ruelle|street|city|ville|quartier)/.test(lower)) return "urban streetscape";
  if (/(jardin|garden|parc)/.test(lower)) return "cultivated garden";
  if (/(lab|laboratoire|atelier)/.test(lower)) return "technical interior";
  if (/(arena|arène|ring)/.test(lower)) return "combat venue";
  if (/(forest|forêt|bois)/.test(lower)) return "natural environment";
  if (/(palace|palais|throne|trône)/.test(lower)) return "seat of power";
  return "story environment";
}

export function inferEnvironmentState(text: string) {
  if (/(ruin|destroyed|détruit|effondré|burning|fumée|blood)/i.test(text)) return "damaged";
  if (/(calm|paisible|romantic|romantique)/i.test(text)) return "serene";
  if (/(crowd|foule|busy|agité)/i.test(text)) return "active";
  return null;
}

export function buildLocationSignals(location: string, text: string) {
  const lower = `${location} ${text}`.toLowerCase();
  const signals = [
    /(ruelle|street|city|ville|quartier|neon)/.test(lower) ? "architectural street signals" : "",
    /(jardin|garden|flowers|allée|greenhouse)/.test(lower) ? "botanical garden signals" : "",
    /(lab|laboratoire|console|glass|biohazard)/.test(lower) ? "scientific props and signage" : "",
    /(arena|arène|ring|crowd|stands)/.test(lower) ? "arena stands and spectators" : "",
    /(forest|forêt|trees|clairière)/.test(lower) ? "forest canopy and ground texture" : "",
    /(lycée|lycee|école|ecole|school|campus)/.test(lower) ? "school buildings, windows and campus circulation" : "",
    /(cour du lycée|school courtyard|cour|playground)/.test(lower) ? "school courtyard ground markings and gathering space" : "",
  ];
  return uniq(signals);
}

export function buildPersistentSceneAnchors(location: string, text: string) {
  return uniq([
    location,
    ...(inferTimeOfDay(text) ? [`time:${inferTimeOfDay(text)}`] : []),
    ...(inferWeather(text) ? [`weather:${inferWeather(text)}`] : []),
    ...buildLocationSignals(location, text).slice(0, 3),
  ]);
}

export function buildEnvironmentSecondary(
  location: string,
  text: string,
  shotType: PanelContract["shotType"],
) {
  const lower = `${location} ${text}`.toLowerCase();
  const elements = [
    /(ruelle|street|city|ville)/.test(lower) ? "layered buildings" : "",
    /(neon|cyber|enseigne)/.test(lower) ? "neon signage" : "",
    /(jardin|garden|flowers|rose|blossom)/.test(lower) ? "flowers and foliage" : "",
    /(lab|laboratoire|glass|console)/.test(lower) ? "scientific equipment" : "",
    /(arena|arène|ring)/.test(lower) ? "spectator tiers" : "",
    /(forest|forêt|wood)/.test(lower) ? "dense vegetation" : "",
    /(lycée|lycee|école|ecole|school|campus)/.test(lower) ? "campus facade, windows and corridors" : "",
    /(cour du lycée|school courtyard|cour|playground)/.test(lower) ? "yard depth with students and benches" : "",
    shotType === "wide" ? "depth layers" : "ambient background cues",
  ];
  return uniq(elements).slice(0, 5);
}

export function buildBackgroundExtras(input: {
  shotType: PanelContract["shotType"];
  location: string;
  atmosphere?: string;
  sceneText: string;
}) {
  const lower = `${input.location} ${input.atmosphere ?? ""} ${input.sceneText}`.toLowerCase();
  const extras = [
    input.shotType === "wide" ? "readable layered background" : "",
    /(market|marché|arena|arène|taverne|bar)/.test(lower) ? "ambient crowd silhouettes" : "",
    /(guard|garde|surveillance|prison)/.test(lower) ? "guard presence" : "",
    /(drone|cyber|neon)/.test(lower) ? "hovering drones" : "",
    /(garden|jardin|romance|flowers)/.test(lower) ? "falling petals" : "",
    /(forest|forêt|creature|monster|imaginaire)/.test(lower) ? "creature silhouettes in depth" : "",
    /(lab|laboratoire)/.test(lower) ? "blinking control lights" : "",
    /(lycée|lycee|école|ecole|school|campus)/.test(lower) ? "students in depth and campus traffic" : "",
    /(cour du lycée|school courtyard|cour|playground)/.test(lower) ? "yard architecture and student groups" : "",
    /(humili|ridicul|moque|raillerie)/.test(lower) ? "witnessing crowd reacting to the scene" : "",
  ];
  return uniq(extras).slice(0, input.shotType === "wide" ? 5 : 3);
}

export function buildMustNotShow(
  shotType: PanelContract["shotType"],
  location: string,
  text: string,
) {
  const rules = ["empty background", "plain backdrop", "studio background"];
  if (shotType === "wide") rules.push("cropped environment", "isolated floating character");
  if (/(jardin|garden|flowers)/i.test(`${location} ${text}`)) rules.push("generic outdoor background");
  if (/(lab|laboratoire)/i.test(`${location} ${text}`)) rules.push("generic room without equipment");
  if (/(lycée|lycee|école|ecole|school|campus)/i.test(`${location} ${text}`)) rules.push("empty school background", "courtyard without students or campus architecture");
  return rules;
}

export function buildEnvironmentStoryHooks(text: string, location: string) {
  return uniq([
    /(camera|surveillance|garde|drone)/i.test(text) ? "surveillance may affect next beat" : "",
    /(ruin|détruit|effondré|danger)/i.test(text) ? "environment damage influences tension" : "",
    /(imaginaire|creature|spirit|familiar)/i.test(text) ? "fantastical presence can return later" : "",
    location,
  ]).slice(0, 4);
}
