import type { PropertyValidationResult, SceneBlueprint } from "./types";

function ok(property: string, message: string): PropertyValidationResult {
  return { ok: true, property, message };
}

function fail(property: string, message: string): PropertyValidationResult {
  return { ok: false, property, message };
}

export function validateBackgroundPresenceWhenRequired(scene: SceneBlueprint): PropertyValidationResult {
  if (scene.composition.shotType === "wide" && scene.environment.backgroundElements.length === 0) {
    return fail("background_presence", "Wide shot sans arrière-plan lisible.");
  }
  if (scene.styleContext.environmentRichness >= 60 && scene.environment.mustShowLocationSignals.length < 2) {
    return fail("background_presence", "Richesse décor élevée mais trop peu de signaux de lieu.");
  }
  return ok("background_presence", "Décor présent quand requis.");
}

export function validateLocationToneStyleCoherence(scene: SceneBlueprint): PropertyValidationResult {
  const text = [
    scene.environment.primaryLocation,
    scene.styleContext.universe,
    scene.styleContext.tone,
    scene.styleContext.visualStyle,
    ...scene.environment.mustShowLocationSignals,
  ]
    .join(" ")
    .toLowerCase();
  const mismatch =
    scene.styleContext.universe.toLowerCase().includes("cyber") && text.includes("medieval")
    || scene.styleContext.universe.toLowerCase().includes("romance") && text.includes("biohazard");
  return mismatch
    ? fail("location_tone_style", "Le lieu et les signaux d’environnement dérivent hors univers/ton.")
    : ok("location_tone_style", "Lieu / ton / style restent compatibles.");
}

export function validateNpcFactionWorldCoherence(scene: SceneBlueprint): PropertyValidationResult {
  if (scene.cast.npcPresence.length === 0) {
    return ok("npc_world", "Pas de PNJ procédural à valider.");
  }
  if (!scene.constraints.decision.accepted) {
    return fail("npc_world", `Des contraintes dures ont rejeté la sélection PNJ: ${scene.constraints.decision.hardFailures.join(", ")}`);
  }
  return ok("npc_world", "PNJ cohérents avec le monde et les contraintes.");
}

export function validateEnvironmentInteraction(scene: SceneBlueprint): PropertyValidationResult {
  const hooks = [
    scene.composition.interactionBeat,
    ...scene.procedural.selectedLocations.primary.flatMap((item) => item.interactionHooks),
    ...scene.procedural.selectedCreatures.primary.flatMap((item) => item.interactionHooks),
  ].filter(Boolean);
  return hooks.length === 0
    ? fail("environment_interaction", "Aucune interaction environnementale réelle détectée.")
    : ok("environment_interaction", "L’environnement influence l’action.");
}

export function validateStylePackFidelity(scene: SceneBlueprint): PropertyValidationResult {
  const hasStyleSignal = Boolean(scene.styleContext.visualStyle || scene.styleContext.renderFamily || scene.styleContext.cameraLanguage);
  return hasStyleSignal
    ? ok("style_pack_fidelity", "La fidélité au style pack reste pilotée.")
    : fail("style_pack_fidelity", "Le style pack effectif n’est pas assez présent dans le blueprint.");
}

export function validateLoreGuardrails(scene: SceneBlueprint): PropertyValidationResult {
  const loreViolations = scene.constraints.hard.filter((rule) => rule.toLowerCase().includes("avoid:"));
  return loreViolations.length > 0
    ? fail("lore_guardrails", loreViolations.join(" | "))
    : ok("lore_guardrails", "Pas de dérive lore détectée dans les contraintes dures.");
}

export function runPropertyValidators(scene: SceneBlueprint): PropertyValidationResult[] {
  return [
    validateBackgroundPresenceWhenRequired(scene),
    validateLocationToneStyleCoherence(scene),
    validateNpcFactionWorldCoherence(scene),
    validateEnvironmentInteraction(scene),
    validateStylePackFidelity(scene),
    validateLoreGuardrails(scene),
  ];
}
