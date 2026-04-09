/**
 * Construit un PanelContract strict avant la génération d'image.
 * Le panel n'est plus un prompt libre, c'est une spécification visuelle contrôlée.
 */

import type { PanelContract } from "@manga-ai-studio/core";
import type { StoryboardPanel } from "@manga-ai-studio/ai";

export interface PanelContractInput {
  panelId: string;
  pageNumber: number;
  panelNumber: number;
  panel: StoryboardPanel;
  sceneContext: {
    location: string;
    timeOfDay?: string;
    atmosphere?: string;
    presentCharacters: string[];
  };
  previousPanelId?: string;
  visualAnchorIds: string[];
}

/**
 * Construit un PanelContract depuis un StoryboardPanel.
 */
export async function buildPanelContract(input: PanelContractInput): Promise<PanelContract> {
  const panel = input.panel;
  const sceneText = [
    input.sceneContext.location,
    input.sceneContext.timeOfDay,
    input.sceneContext.atmosphere,
    panel.caption,
    panel.camera,
    panel.prompt,
    panel.narration,
  ]
    .filter(Boolean)
    .join(" ");

  const purpose = deducePurpose(panel);
  const shotType = deduceShotType(panel);
  const cameraAngle = deduceCameraAngle(panel);
  const requiredCharacters = panel.characters ?? [];
  const focusCharacters =
    shotType === "wide" ? requiredCharacters.slice(0, 1) : requiredCharacters.slice(0, 2);
  const mustShow = extractMustShow(panel, input.sceneContext);
  const timeOfDay = inferTimeOfDay(sceneText);
  const weather = inferWeather(sceneText);
  const environmentPrimary = inferEnvironmentPrimary(input.sceneContext.location);
  const environmentSecondary = buildEnvironmentSecondary(input.sceneContext.location, sceneText, shotType);
  const persistentSceneAnchors = buildPersistentSceneAnchors(input.sceneContext.location, sceneText);
  const mandatoryLocationSignals = buildLocationSignals(input.sceneContext.location, sceneText);
  const mustShowLocationSignals = mandatoryLocationSignals;
  const mustShowProps = mustShow.filter((item) => !mustShowLocationSignals.includes(item));
  const backgroundExtras = buildBackgroundExtras({
    shotType,
    location: input.sceneContext.location,
    atmosphere: input.sceneContext.atmosphere,
    sceneText,
  });
  const foregroundSubjects = buildForegroundSubjects(focusCharacters, shotType, input.sceneContext.location, sceneText);
  const midgroundElements = buildMidgroundElements({
    shotType,
    requiredCharacters,
    environmentSecondary,
    location: input.sceneContext.location,
    sceneText,
  });
  const backgroundElements = buildBackgroundElements({
    shotType,
    persistentSceneAnchors,
    backgroundExtras,
    location: input.sceneContext.location,
    sceneText,
  });
  const npcGroupPresence = buildNpcGroupPresence(input.sceneContext.location, sceneText, backgroundExtras);
  const mustNotShow = buildMustNotShow(shotType, input.sceneContext.location, sceneText);
  const mustAvoidPortraitIsolation =
    shotType === "wide"
    || purpose === "establishing"
    || requiredCharacters.length >= 2
    || mandatoryLocationSignals.length > 0
    || npcGroupPresence.length > 0;

  const dialogueCount =
    (panel.dialogues?.length ?? 0) + (panel.dialogue ? 1 : 0);
  const textBoxPlan: PanelContract["textBoxPlan"] = {
    narration: Boolean(panel.narration),
    dialogueCount,
    sfx: panel.sfx ? [panel.sfx] : [],
    reservedZones: determineReservedZones(shotType, dialogueCount),
  };
  const renderHints: PanelContract["renderHints"] = {
    targetAspectRatio: determineAspectRatio(shotType),
    cropMode: shotType === "closeup" || shotType === "extreme_closeup" ? "contain" : "cover",
    focalPoint: shotType === "closeup" ? { x: 0.5, y: 0.4 } : undefined,
  };

  return {
    panelId: input.panelId,
    pageNumber: input.pageNumber,
    panelNumber: input.panelNumber,
    purpose,
    shotType,
    cameraAngle,
    focusCharacters,
    requiredCharacters,
    backgroundExtras,
    environmentPrimary,
    environmentSecondary,
    environmentState: inferEnvironmentState(sceneText),
    weather,
    timeOfDay,
    foregroundSubjects,
    midgroundElements,
    backgroundElements,
    mandatoryLocationSignals,
    npcPresence: backgroundExtras.filter((item) => /(crowd|guard|merchant|client|passant|patron)/i.test(item)),
    npcGroupPresence,
    creaturePresence: backgroundExtras.filter((item) => /(creature|animal|drone|spirit|monster|bird|cat|dog)/i.test(item)),
    interactionBeat: extractInteractionBeat(sceneText, purpose),
    environmentStoryHooks: buildEnvironmentStoryHooks(sceneText, input.sceneContext.location),
    persistentSceneAnchors,
    mustShowProps,
    mustShowLocationSignals,
    mustShow,
    mustNotShow,
    mustAvoidPortraitIsolation,
    continuityFromPanelId: input.previousPanelId,
    visualAnchorIds: input.visualAnchorIds,
    textBoxPlan,
    renderHints,
  };
}

function deducePurpose(panel: StoryboardPanel): PanelContract["purpose"] {
  const desc = `${panel.caption ?? ""} ${panel.camera ?? ""} ${panel.prompt ?? ""}`.toLowerCase();
  
  if (desc.includes("wide") || desc.includes("establish") || desc.includes("location")) {
    return "establishing";
  }
  if (desc.includes("react") || desc.includes("expression") || desc.includes("face")) {
    return "reaction";
  }
  if (panel.dialogue || (panel.dialogues?.length ?? 0) > 0) {
    return "dialogue";
  }
  if (desc.includes("aftermath") || desc.includes("retomb") || desc.includes("après le choc")) {
    return "aftermath";
  }
  if (desc.includes("action") || desc.includes("fight") || desc.includes("move")) {
    return "action";
  }
  if (desc.includes("reveal") || desc.includes("show")) {
    return "reveal";
  }
  
  return "dialogue"; // Défaut
}

function deduceShotType(panel: StoryboardPanel): PanelContract["shotType"] {
  const desc = `${panel.camera ?? ""} ${panel.caption ?? ""} ${panel.prompt ?? ""}`.toLowerCase();
  if (/(wide shot|establishing|panorama|full environment|vue d'ensemble)/.test(desc)) return "wide";
  if (/(extreme close|extreme closeup|micro détail|sur les yeux)/.test(desc)) return "extreme_closeup";
  if (/(close-up|closeup|close up|portrait|gros plan)/.test(desc)) return "closeup";
  if (/(over shoulder|over-shoulder|par-dessus l'épaule|par dessus l'épaule)/.test(desc)) return "over_shoulder";
  return "medium";
}

function deduceCameraAngle(panel: StoryboardPanel): PanelContract["cameraAngle"] {
  const desc = `${panel.camera ?? ""} ${panel.caption ?? ""}`.toLowerCase();
  if (/(low angle|from below|contre-plongée|contre plongee)/.test(desc)) return "low_angle";
  if (/(high angle|from above|plongée|plongee|bird's eye)/.test(desc)) return "high_angle";
  if (/(dutch|tilted|oblique)/.test(desc)) return "dutch";
  return "eye_level";
}

function extractMustShow(
  panel: StoryboardPanel,
  sceneContext: PanelContractInput["sceneContext"],
): string[] {
  const desc = `${panel.prompt ?? ""} ${panel.caption ?? ""} ${sceneContext.location} ${sceneContext.atmosphere ?? ""}`;
  const needles = [
    "sword", "gun", "pendant", "artifact", "weapon", "book", "letter", "ring", "crown",
    "terminal", "console", "neon", "ruins", "flowers", "altar", "throne", "mask", "key",
    "mirror", "bridge", "market stall", "crowd", "rain", "fog", "blood", "vines", "lantern",
    "laboratory glass", "surveillance camera", "banner", "gate", "window", "staircase",
  ];
  const inferred = [
    /(lycée|lycee|école|ecole|school|campus)/i.test(desc) ? "school architecture" : "",
    /(cour du lycée|school courtyard|cour|playground)/i.test(desc) ? "open school courtyard" : "",
    /(élèves|eleves|students|student crowd|friends surrounding|amis autour)/i.test(desc) ? "visible students around the main action" : "",
    /(humili|ridicul|moque|raillerie)/i.test(desc) ? "public humiliation context" : "",
  ];
  return uniq([
    ...needles.filter((needle) => desc.toLowerCase().includes(needle.toLowerCase())),
    ...inferred,
  ]);
}

function determineReservedZones(
  shotType: PanelContract["shotType"],
  dialogueCount: number
): PanelContract["textBoxPlan"]["reservedZones"] {
  const zones: PanelContract["textBoxPlan"]["reservedZones"] = [];
  
  // Closeup: réserver bottom pour dialogues
  if (shotType === "closeup" || shotType === "extreme_closeup") {
    zones.push("bottom-left", "bottom-right");
  }
  
  // Wide: top pour narration
  if (shotType === "wide") {
    zones.push("top-left");
  }
  
  // Si beaucoup de dialogues, réserver center
  if (dialogueCount >= 3) {
    zones.push("center");
  }
  
  return zones;
}

function determineAspectRatio(shotType: PanelContract["shotType"]): string {
  switch (shotType) {
    case "wide":
      return "16:9";
    case "closeup":
    case "extreme_closeup":
      return "3:4";
    default:
      return "4:5";
  }
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function inferTimeOfDay(text: string) {
  if (/(night|nuit|moon|lune|soir)/i.test(text)) return "night";
  if (/(sunrise|aube|dawn|matin)/i.test(text)) return "dawn";
  if (/(sunset|crépuscule|crepuscule|soirée|coucher du soleil)/i.test(text)) return "sunset";
  return null;
}

function inferWeather(text: string) {
  if (/(rain|pluie|averse|storm|orage)/i.test(text)) return "rain";
  if (/(fog|brume|mist|brouillard)/i.test(text)) return "fog";
  if (/(snow|neige|blizzard)/i.test(text)) return "snow";
  if (/(wind|vent|gale)/i.test(text)) return "wind";
  return null;
}

function inferEnvironmentPrimary(location: string) {
  const lower = location.toLowerCase();
  if (/(ruelle|street|city|ville|quartier)/.test(lower)) return "urban streetscape";
  if (/(jardin|garden|parc)/.test(lower)) return "cultivated garden";
  if (/(lab|laboratoire|atelier)/.test(lower)) return "technical interior";
  if (/(arena|arène|ring)/.test(lower)) return "combat venue";
  if (/(forest|forêt|bois)/.test(lower)) return "natural environment";
  if (/(lycée|lycee|école|ecole|school|campus|cour du lycée)/.test(lower)) return "visible school courtyard";
  if (/(palace|palais|throne|trône)/.test(lower)) return "seat of power";
  return "story environment";
}

function inferEnvironmentState(text: string) {
  if (/(ruin|destroyed|détruit|effondré|burning|fumée|blood)/i.test(text)) return "damaged";
  if (/(calm|paisible|romantic|romantique)/i.test(text)) return "serene";
  if (/(crowd|foule|busy|agité)/i.test(text)) return "active";
  return null;
}

function buildLocationSignals(location: string, text: string) {
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

function buildPersistentSceneAnchors(location: string, text: string) {
  return uniq([
    location,
    ...(inferTimeOfDay(text) ? [`time:${inferTimeOfDay(text)}`] : []),
    ...(inferWeather(text) ? [`weather:${inferWeather(text)}`] : []),
    ...buildLocationSignals(location, text).slice(0, 3),
  ]);
}

function buildEnvironmentSecondary(
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
    /(cour du lycée|school courtyard|cour|playground)/.test(lower) ? "concrete ground, benches, school yard depth" : "",
    shotType === "wide" ? "depth layers" : "ambient background cues",
  ];
  return uniq(elements).slice(0, 5);
}

function buildBackgroundExtras(input: {
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
    /(cour du lycée|school courtyard|cour|playground)/.test(lower) ? "school building facade, windows and concrete yard" : "",
    /(humili|ridicul|moque|raillerie|bullying)/.test(lower) ? "social circle or bullying formation around the main target" : "",
  ];
  return uniq(extras).slice(0, input.shotType === "wide" ? 5 : 3);
}

function buildMustNotShow(
  shotType: PanelContract["shotType"],
  location: string,
  text: string,
) {
  const rules = ["empty background", "plain backdrop", "studio background"];
  if (shotType === "wide") rules.push("cropped environment", "isolated floating character");
  if (/(jardin|garden|flowers)/i.test(`${location} ${text}`)) rules.push("generic outdoor background");
  if (/(lab|laboratoire)/i.test(`${location} ${text}`)) rules.push("generic room without equipment");
  if (/(lycée|lycee|école|ecole|school|campus)/i.test(`${location} ${text}`)) rules.push("empty school background", "courtyard without students or campus architecture", "isolated portrait in school scene");
  return rules;
}

function extractInteractionBeat(text: string, purpose: PanelContract["purpose"]) {
  if (/(touch|grab|hold|push|ouvre|attrape|s'appuie|se confie|regarde)/i.test(text)) {
    return "environment and character interaction must remain readable";
  }
  if (/(humili|ridicul|moque|entouré de ses amis|crowd|students)/i.test(text)) {
    return "social pressure and surrounding crowd must remain visible around the protagonists";
  }
  if (purpose === "dialogue") return "spatial relation between speakers must remain clear";
  if (purpose === "action") return "movement must react to terrain and obstacles";
  return null;
}

function buildEnvironmentStoryHooks(text: string, location: string) {
  return uniq([
    /(camera|surveillance|garde|drone)/i.test(text) ? "surveillance may affect next beat" : "",
    /(ruin|détruit|effondré|danger)/i.test(text) ? "environment damage influences tension" : "",
    /(imaginaire|creature|spirit|familiar)/i.test(text) ? "fantastical presence can return later" : "",
    /(lycée|lycee|école|ecole|school|campus)/i.test(`${location} ${text}`) ? "school space and witnesses shape the social stakes" : "",
    location,
  ]).slice(0, 4);
}

function buildForegroundSubjects(
  focusCharacters: string[],
  shotType: PanelContract["shotType"],
  location: string,
  sceneText: string,
) {
  const extras = [
    shotType === "wide" ? "scene-leading spatial anchor" : "",
    /(humili|ridicul|moque|bullying)/i.test(`${location} ${sceneText}`) ? "humiliated target or aggressor formation" : "",
  ];
  return uniq([...focusCharacters, ...extras]).slice(0, 4);
}

function buildMidgroundElements(input: {
  shotType: PanelContract["shotType"];
  requiredCharacters: string[];
  environmentSecondary: string[];
  location: string;
  sceneText: string;
}) {
  return uniq([
    ...(input.shotType === "wide" ? input.requiredCharacters.slice(1, 3) : []),
    ...input.environmentSecondary.slice(0, 3),
    /(lycée|lycee|école|ecole|school|campus)/i.test(`${input.location} ${input.sceneText}`) ? "students in background" : "",
  ]).slice(0, 5);
}

function buildBackgroundElements(input: {
  shotType: PanelContract["shotType"];
  persistentSceneAnchors: string[];
  backgroundExtras: string[];
  location: string;
  sceneText: string;
}) {
  return uniq([
    ...input.persistentSceneAnchors,
    ...input.backgroundExtras,
    /(lycée|lycee|école|ecole|school|campus)/i.test(`${input.location} ${input.sceneText}`)
      ? "school building, facade, windows, concrete ground"
      : "",
  ]).slice(0, input.shotType === "wide" ? 8 : 6);
}

function buildNpcGroupPresence(location: string, sceneText: string, backgroundExtras: string[]) {
  return uniq([
    ...backgroundExtras.filter((item) => /(crowd|students|group|formation|guard|merchant|passerby|client)/i.test(item)),
    /(lycée|lycee|école|ecole|school|campus)/i.test(`${location} ${sceneText}`) ? "student background group" : "",
    /(humili|ridicul|moque|bullying)/i.test(`${location} ${sceneText}`) ? "bullying social circle" : "",
  ]);
}
