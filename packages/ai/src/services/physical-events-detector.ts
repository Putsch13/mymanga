export type DetectedPhysicalEventType =
  | "limb_lost"
  | "eye_lost"
  | "scar_added"
  | "burn_added"
  | "hair_cut"
  | "hair_color_changed"
  | "prosthetic_added"
  | "tattoo_added"
  | "bandage_added"
  | "bandage_removed"
  | "body_transformation"
  | "outfit_changed"
  | "injury_added"
  | "injury_healed";

export interface DetectedPhysicalEvent {
  type: DetectedPhysicalEventType;
  bodyPart: string;
  description: string;
  severity: "minor" | "moderate" | "major" | "permanent";
  chapterId: string;
  sceneId: string;
}

export interface DetectedBodyStateSnapshot {
  missingLimbs: Array<{ part: string; side: string; since: string }>;
  scars: Array<{ location: string; description: string; since: string }>;
  burns: Array<{ location: string; severity: string; since: string }>;
  prosthetics: Array<{ part: string; type: string; since: string }>;
  tattoos: Array<{ location: string; description: string; since: string }>;
  bandages: Array<{ location: string; since: string }>;
  hairState: {
    color: string | null;
    style: string | null;
    changedSince: string | null;
  };
  transformations: Array<{ description: string; since: string }>;
  currentInjuries: Array<{ location: string; type: string; since: string }>;
  currentOutfit: string | null;
}

interface PatternDef {
  type: DetectedPhysicalEventType;
  regex: RegExp;
  severity: DetectedPhysicalEvent["severity"];
  bodyPartExtractor: (match: RegExpMatchArray) => string;
}

const PROXIMITY_CHARS = 100;

function buildPatterns(): PatternDef[] {
  const limb = (m: RegExpMatchArray) => m[2] ?? m[0];
  const eye = () => "eye";
  const full = (m: RegExpMatchArray) => m[0];
  const fixed = (part: string) => () => part;

  return [
    // --- limb_lost ---
    { type: "limb_lost", regex: /perd\s+(son|sa|ses)\s+(bras|jambe|main|doigt|pied)/gi, severity: "permanent", bodyPartExtractor: limb },
    { type: "limb_lost", regex: /loses?\s+(his|her|their)\s+(arm|leg|hand|finger|foot)/gi, severity: "permanent", bodyPartExtractor: limb },
    { type: "limb_lost", regex: /amput[éeation]/gi, severity: "permanent", bodyPartExtractor: fixed("limb") },
    { type: "limb_lost", regex: /tranch[eéa]\s+(le|la|son|sa)\s+\w+/gi, severity: "permanent", bodyPartExtractor: (m) => m[2] ?? "limb" },
    { type: "limb_lost", regex: /sever(ed|s)?\s+(his|her|their|the)\s+(arm|leg|hand|finger|foot)/gi, severity: "permanent", bodyPartExtractor: (m) => m[3] ?? "limb" },
    { type: "limb_lost", regex: /cut\s+off\s+(his|her|their)\s+(arm|leg|hand|finger|foot)/gi, severity: "permanent", bodyPartExtractor: (m) => m[2] ?? "limb" },

    // --- eye_lost ---
    { type: "eye_lost", regex: /perd\s+(son|ses)\s+(œil|yeux)/gi, severity: "permanent", bodyPartExtractor: eye },
    { type: "eye_lost", regex: /loses?\s+(his|her|their)\s+(eye|eyes)/gi, severity: "permanent", bodyPartExtractor: eye },
    { type: "eye_lost", regex: /crève\s+(l'|son\s+)œil/gi, severity: "permanent", bodyPartExtractor: eye },
    { type: "eye_lost", regex: /eye\s+gouged/gi, severity: "permanent", bodyPartExtractor: eye },

    // --- scar_added ---
    { type: "scar_added", regex: /cicatrice\s+(sur|au|à)\s+(\w+)/gi, severity: "major", bodyPartExtractor: (m) => m[2] ?? "body" },
    { type: "scar_added", regex: /scar(red|s)?\s+(on|across|over)\s+(his|her|their)\s+(\w+)/gi, severity: "major", bodyPartExtractor: (m) => m[4] ?? "body" },
    { type: "scar_added", regex: /balafre/gi, severity: "major", bodyPartExtractor: fixed("face") },
    { type: "scar_added", regex: /entaille\s+(profonde|sur)/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "scar_added", regex: /slash\s+across\s+(his|her|their)\s+(\w+)/gi, severity: "major", bodyPartExtractor: (m) => m[2] ?? "body" },
    { type: "scar_added", regex: /marked\s+(on|across)\s+(his|her|their)\s+(\w+)/gi, severity: "major", bodyPartExtractor: (m) => m[3] ?? "body" },

    // --- burn_added ---
    { type: "burn_added", regex: /brûl(é|ée|ure|ures)/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "burn_added", regex: /burn(ed|s|t)?\s+(his|her|their|on)\s*(\w*)/gi, severity: "major", bodyPartExtractor: (m) => m[3] || "body" },
    { type: "burn_added", regex: /calcin[éeés]/gi, severity: "permanent", bodyPartExtractor: fixed("body") },
    { type: "burn_added", regex: /charred/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "burn_added", regex: /scorched/gi, severity: "major", bodyPartExtractor: fixed("body") },

    // --- hair_cut ---
    { type: "hair_cut", regex: /coup[eé]r?\s+(les|ses)\s+cheveux/gi, severity: "minor", bodyPartExtractor: fixed("hair") },
    { type: "hair_cut", regex: /hair\s+cut/gi, severity: "minor", bodyPartExtractor: fixed("hair") },
    { type: "hair_cut", regex: /shave[ds]?\s+(his|her|their)\s+(head|hair)/gi, severity: "minor", bodyPartExtractor: fixed("hair") },
    { type: "hair_cut", regex: /ras[eé]\s+(la|le|sa|son)\s+(tête|crâne)/gi, severity: "minor", bodyPartExtractor: fixed("hair") },
    { type: "hair_cut", regex: /tondu[es]?/gi, severity: "minor", bodyPartExtractor: fixed("hair") },

    // --- hair_color_changed ---
    { type: "hair_color_changed", regex: /cheveux\s+(deviennent|virent|changent)\s+(\w+)/gi, severity: "moderate", bodyPartExtractor: (m) => m[2] ?? "hair" },
    { type: "hair_color_changed", regex: /hair\s+turns?\s+(\w+)/gi, severity: "moderate", bodyPartExtractor: (m) => m[1] ?? "hair" },
    { type: "hair_color_changed", regex: /hair\s+changes?\s+color/gi, severity: "moderate", bodyPartExtractor: fixed("hair") },

    // --- prosthetic_added ---
    { type: "prosthetic_added", regex: /prothèse\s+(\w+)/gi, severity: "permanent", bodyPartExtractor: (m) => m[1] ?? "limb" },
    { type: "prosthetic_added", regex: /prosthetic\s+(\w+)/gi, severity: "permanent", bodyPartExtractor: (m) => m[1] ?? "limb" },
    { type: "prosthetic_added", regex: /bras\s+mécanique/gi, severity: "permanent", bodyPartExtractor: fixed("arm") },
    { type: "prosthetic_added", regex: /artificial\s+(arm|leg|hand|eye)/gi, severity: "permanent", bodyPartExtractor: (m) => m[1] ?? "limb" },
    { type: "prosthetic_added", regex: /mechanical\s+arm/gi, severity: "permanent", bodyPartExtractor: fixed("arm") },

    // --- tattoo_added ---
    { type: "tattoo_added", regex: /tatou(age|er)\s*(sur|au|à)?\s*(\w*)/gi, severity: "permanent", bodyPartExtractor: (m) => m[3] || "body" },
    { type: "tattoo_added", regex: /tattoo(ed|s)?\s+(on|across)?\s*(his|her|their)?\s*(\w*)/gi, severity: "permanent", bodyPartExtractor: (m) => m[4] || "body" },
    { type: "tattoo_added", regex: /marqu[eéer]+\s+(au|sur)\s+(le|la)?\s*(\w+)/gi, severity: "permanent", bodyPartExtractor: (m) => m[3] ?? "body" },
    { type: "tattoo_added", regex: /brand(ed|s)?\s+(on|into)\s+(his|her|their)\s+(\w+)/gi, severity: "permanent", bodyPartExtractor: (m) => m[4] ?? "body" },

    // --- bandage_added ---
    { type: "bandage_added", regex: /bandage[sr]?\s+(sur|au|à|le|la|son|sa)?\s*(\w*)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] || "body" },
    { type: "bandage_added", regex: /pansement\s+(sur|au|à)?\s*(\w*)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] || "body" },
    { type: "bandage_added", regex: /bandaged\s+(his|her|their)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "body" },
    { type: "bandage_added", regex: /wrapped\s+(his|her|their)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "body" },

    // --- bandage_removed ---
    { type: "bandage_removed", regex: /retire\s+(son|ses)\s+bandage/gi, severity: "minor", bodyPartExtractor: fixed("body") },
    { type: "bandage_removed", regex: /removes?\s+(his|her|their)\s+bandage/gi, severity: "minor", bodyPartExtractor: fixed("body") },
    { type: "bandage_removed", regex: /unwrapped/gi, severity: "minor", bodyPartExtractor: fixed("body") },

    // --- body_transformation ---
    { type: "body_transformation", regex: /se\s+transform[eé]/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "body_transformation", regex: /muta(tion|nt)[s]?/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "body_transformation", regex: /métamorphos[eé]/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "body_transformation", regex: /morph(ed|s|ing)/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "body_transformation", regex: /evolve[ds]?/gi, severity: "major", bodyPartExtractor: fixed("body") },
    { type: "body_transformation", regex: /awakening/gi, severity: "major", bodyPartExtractor: fixed("body") },

    // --- outfit_changed ---
    { type: "outfit_changed", regex: /enfile\s+(son|sa|ses|un|une)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "outfit" },
    { type: "outfit_changed", regex: /revêt\s+(son|sa|un|une)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "outfit" },
    { type: "outfit_changed", regex: /change\s+(de|d')\s*(tenue|vêtements|armure)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "outfit" },
    { type: "outfit_changed", regex: /puts\s+on\s+(his|her|their|a|an)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "outfit" },
    { type: "outfit_changed", regex: /wears\s+(his|her|their|a|an)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "outfit" },
    { type: "outfit_changed", regex: /dons\s+(his|her|their|a|an)\s+(\w+)/gi, severity: "minor", bodyPartExtractor: (m) => m[2] ?? "outfit" },
    { type: "outfit_changed", regex: /changes\s+outfit/gi, severity: "minor", bodyPartExtractor: fixed("outfit") },

    // --- injury_added ---
    { type: "injury_added", regex: /bless[éeures]+\s*(au|à|sur)?\s*(\w*)/gi, severity: "moderate", bodyPartExtractor: (m) => m[2] || "body" },
    { type: "injury_added", regex: /wound(ed|s)?\s+(on|in|to)?\s*(his|her|their)?\s*(\w*)/gi, severity: "moderate", bodyPartExtractor: (m) => m[4] || "body" },
    { type: "injury_added", regex: /fractur[eéés]+/gi, severity: "major", bodyPartExtractor: fixed("bone") },
    { type: "injury_added", regex: /cass[éeér]+\s+(le|la|son|sa)\s+(\w+)/gi, severity: "major", bodyPartExtractor: (m) => m[2] ?? "body" },
    { type: "injury_added", regex: /broken\s+(his|her|their)\s+(\w+)/gi, severity: "major", bodyPartExtractor: (m) => m[2] ?? "body" },
    { type: "injury_added", regex: /stab(bed|s)?\s+(in|on|through)?\s*(his|her|their)?\s*(\w*)/gi, severity: "major", bodyPartExtractor: (m) => m[4] || "body" },
    { type: "injury_added", regex: /poignard[éeés]+/gi, severity: "major", bodyPartExtractor: fixed("torso") },

    // --- injury_healed ---
    { type: "injury_healed", regex: /guéri[est]*/gi, severity: "minor", bodyPartExtractor: fixed("body") },
    { type: "injury_healed", regex: /heal(ed|s|ing)/gi, severity: "minor", bodyPartExtractor: fixed("body") },
    { type: "injury_healed", regex: /soign[éeér]+/gi, severity: "minor", bodyPartExtractor: fixed("body") },
    { type: "injury_healed", regex: /recover(ed|s|ing)/gi, severity: "minor", bodyPartExtractor: fixed("body") },
    { type: "injury_healed", regex: /rétabli[est]*/gi, severity: "minor", bodyPartExtractor: fixed("body") },
  ];
}

let cachedPatterns: PatternDef[] | null = null;
function getPatterns(): PatternDef[] {
  if (!cachedPatterns) cachedPatterns = buildPatterns();
  return cachedPatterns;
}

function isCharacterNearby(
  text: string,
  matchIndex: number,
  characterName: string
): boolean {
  const lowerText = text.toLowerCase();
  const lowerName = characterName.toLowerCase();
  const windowStart = Math.max(0, matchIndex - PROXIMITY_CHARS);
  const windowEnd = Math.min(lowerText.length, matchIndex + PROXIMITY_CHARS);
  const window = lowerText.slice(windowStart, windowEnd);
  return window.includes(lowerName);
}

export function detectPhysicalEvents(
  text: string,
  characterName: string,
  chapterId: string,
  sceneId: string
): DetectedPhysicalEvent[] {
  const events: DetectedPhysicalEvent[] = [];
  const patterns = getPatterns();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (!isCharacterNearby(text, match.index, characterName)) continue;

      events.push({
        type: pattern.type,
        bodyPart: pattern.bodyPartExtractor(match),
        description: match[0].trim(),
        severity: pattern.severity,
        chapterId,
        sceneId,
      });
    }
  }

  return events;
}

export function applyPhysicalEvents(
  currentState: DetectedBodyStateSnapshot,
  events: DetectedPhysicalEvent[]
): DetectedBodyStateSnapshot {
  const state: DetectedBodyStateSnapshot = JSON.parse(
    JSON.stringify(currentState)
  );

  for (const ev of events) {
    const since = `${ev.chapterId}/${ev.sceneId}`;

    switch (ev.type) {
      case "limb_lost":
        state.missingLimbs.push({ part: ev.bodyPart, side: ev.description, since });
        break;
      case "eye_lost":
        state.missingLimbs.push({ part: "eye", side: ev.description, since });
        break;
      case "scar_added":
        state.scars.push({ location: ev.bodyPart, description: ev.description, since });
        break;
      case "burn_added":
        state.burns.push({ location: ev.bodyPart, severity: ev.severity, since });
        break;
      case "hair_cut":
        state.hairState = { color: state.hairState.color, style: "cut", changedSince: since };
        break;
      case "hair_color_changed":
        state.hairState = { color: ev.bodyPart, style: state.hairState.style, changedSince: since };
        break;
      case "prosthetic_added":
        state.prosthetics.push({ part: ev.bodyPart, type: ev.description, since });
        break;
      case "tattoo_added":
        state.tattoos.push({ location: ev.bodyPart, description: ev.description, since });
        break;
      case "bandage_added":
        state.bandages.push({ location: ev.bodyPart, since });
        break;
      case "bandage_removed":
        state.bandages = state.bandages.filter(
          (b) => b.location.toLowerCase() !== ev.bodyPart.toLowerCase()
        );
        break;
      case "body_transformation":
        state.transformations.push({ description: ev.description, since });
        break;
      case "outfit_changed":
        state.currentOutfit = ev.description;
        break;
      case "injury_added":
        state.currentInjuries.push({ location: ev.bodyPart, type: ev.description, since });
        break;
      case "injury_healed":
        state.currentInjuries = state.currentInjuries.filter(
          (inj) => inj.location.toLowerCase() !== ev.bodyPart.toLowerCase()
        );
        break;
    }
  }

  return state;
}

export function buildBodyStatePromptConstraints(
  name: string,
  bodyState: DetectedBodyStateSnapshot
): string {
  const lines: string[] = [];

  for (const limb of bodyState.missingLimbs) {
    lines.push(`${name} is missing their ${limb.side.toUpperCase()} ${limb.part.toUpperCase()} (amputated/lost)`);
  }
  for (const scar of bodyState.scars) {
    lines.push(`${name} has a SCAR on ${scar.location}: ${scar.description}`);
  }
  for (const burn of bodyState.burns) {
    lines.push(`${name} has BURNS on ${burn.location} (${burn.severity})`);
  }
  for (const pros of bodyState.prosthetics) {
    lines.push(`${name} has a PROSTHETIC ${pros.part} (${pros.type})`);
  }
  for (const tattoo of bodyState.tattoos) {
    lines.push(`${name} has a TATTOO on ${tattoo.location}: ${tattoo.description}`);
  }
  for (const band of bodyState.bandages) {
    lines.push(`${name} has BANDAGES on ${band.location}`);
  }
  if (bodyState.hairState.color) {
    lines.push(`${name} hair color is ${bodyState.hairState.color}`);
  }
  if (bodyState.hairState.style) {
    lines.push(`${name} hair style is ${bodyState.hairState.style}`);
  }
  for (const tr of bodyState.transformations) {
    lines.push(`${name} underwent TRANSFORMATION: ${tr.description}`);
  }
  for (const inj of bodyState.currentInjuries) {
    lines.push(`${name} has an INJURY on ${inj.location}: ${inj.type}`);
  }
  if (bodyState.currentOutfit) {
    lines.push(`${name} is wearing: ${bodyState.currentOutfit}`);
  }

  return lines.join("\n");
}

const EMPTY_BODY_STATE: DetectedBodyStateSnapshot = {
  missingLimbs: [],
  scars: [],
  burns: [],
  prosthetics: [],
  tattoos: [],
  bandages: [],
  hairState: { color: null, style: null, changedSince: null },
  transformations: [],
  currentInjuries: [],
  currentOutfit: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadOrCreateBodyState(
  existingState: unknown
): DetectedBodyStateSnapshot {
  if (!isRecord(existingState)) {
    return JSON.parse(JSON.stringify(EMPTY_BODY_STATE));
  }

  const base: DetectedBodyStateSnapshot = JSON.parse(
    JSON.stringify(EMPTY_BODY_STATE)
  );

  if (Array.isArray(existingState.missingLimbs)) base.missingLimbs = existingState.missingLimbs as typeof base.missingLimbs;
  if (Array.isArray(existingState.scars)) base.scars = existingState.scars as typeof base.scars;
  if (Array.isArray(existingState.burns)) base.burns = existingState.burns as typeof base.burns;
  if (Array.isArray(existingState.prosthetics)) base.prosthetics = existingState.prosthetics as typeof base.prosthetics;
  if (Array.isArray(existingState.tattoos)) base.tattoos = existingState.tattoos as typeof base.tattoos;
  if (Array.isArray(existingState.bandages)) base.bandages = existingState.bandages as typeof base.bandages;
  if (Array.isArray(existingState.transformations)) base.transformations = existingState.transformations as typeof base.transformations;
  if (Array.isArray(existingState.currentInjuries)) base.currentInjuries = existingState.currentInjuries as typeof base.currentInjuries;

  if (isRecord(existingState.hairState)) {
    const hs = existingState.hairState;
    base.hairState = {
      color: typeof hs.color === "string" ? hs.color : null,
      style: typeof hs.style === "string" ? hs.style : null,
      changedSince: typeof hs.changedSince === "string" ? hs.changedSince : null,
    };
  }

  if (typeof existingState.currentOutfit === "string") {
    base.currentOutfit = existingState.currentOutfit;
  }

  return base;
}
