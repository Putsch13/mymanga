import type {
  PanelBlueprintOrigin,
  PanelBlueprintPremium,
  PanelBlueprintProvenance,
} from "../types/narrative-facts";

/** Rapport de contrôle qualité « chaque case → règle / verrou » (boucle produit). */
export type PanelTraceabilityReport = {
  panelCount: number;
  /** Fraction de panels avec bloc `provenance` */
  provenanceCoverage: number;
  byOrigin: Partial<Record<PanelBlueprintOrigin, number>>;
  /** Focus acteur (héros / speaker / duo) sans aucune ref personnage sur le blueprint */
  panelsMissingCharacterLock: number;
  /** environmentVisualDna absent ou lieu explicitement inconnu */
  panelsWeakLocationBinding: number;
  /** Dialogue porteur speaker_visible sans `speakerAnchorCharacterId` */
  panelsDialogueAnchorMismatch: number;
  /** `requiredNpcCount` > 0 mais aucun `npcVisualDna` */
  panelsNpcContractVsDnaMismatch: number;
};

function fnv1a32Hex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Digest stable de l’outline de production (beats + fil narratif).
 * Utilisé comme ancrage « mémoire narrative » sur chaque panel.
 */
export function computeNarrativeMemoryDigestFromOutline(outline: unknown): string {
  try {
    const o = outline && typeof outline === "object" && !Array.isArray(outline) ? (outline as Record<string, unknown>) : {};
    const beats = Array.isArray(o.beats) ? o.beats : [];
    const beatParts = beats.slice(0, 64).map((b) => {
      const br = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
      const id = typeof br.beatId === "string" ? br.beatId : "";
      const sum = typeof br.summary === "string" ? br.summary : typeof br.title === "string" ? br.title : "";
      return `${id}:${sum}`;
    });
    const payload = [
      typeof o.chapterGoal === "string" ? o.chapterGoal : "",
      typeof o.cliffhanger === "string" ? o.cliffhanger : "",
      typeof o.source === "string" ? o.source : "",
      ...beatParts,
    ].join("\u001e");
    return fnv1a32Hex(payload);
  } catch {
    return "00000000";
  }
}

function hasCharacterVisualLock(bp: PanelBlueprintPremium): boolean {
  const ids = [
    ...(bp.mustShowCharacterIds ?? []),
    ...(bp.requiredCharacterIds ?? []),
  ].filter(Boolean);
  if (ids.length > 0) return true;
  return Array.isArray(bp.characterVisualDna) && bp.characterVisualDna.length > 0;
}

function isWeakLocation(bp: PanelBlueprintPremium): boolean {
  const env = bp.environmentVisualDna as { locationName?: string } | null | undefined;
  if (!env || typeof env.locationName !== "string") return true;
  const n = env.locationName.trim().toLowerCase();
  return n.length === 0 || n === "unknown" || n === "story-consistent setting";
}

/**
 * Synthèse pour logs launch / telemetry et futures passes QA image.
 */
export function buildPanelTraceabilityReport(blueprints: PanelBlueprintPremium[]): PanelTraceabilityReport {
  const panelCount = blueprints.length;
  if (panelCount === 0) {
    return {
      panelCount: 0,
      provenanceCoverage: 1,
      byOrigin: {},
      panelsMissingCharacterLock: 0,
      panelsWeakLocationBinding: 0,
      panelsDialogueAnchorMismatch: 0,
      panelsNpcContractVsDnaMismatch: 0,
    };
  }
  const withProv = blueprints.filter((b) => b.provenance != null).length;
  const byOrigin: Partial<Record<PanelBlueprintOrigin, number>> = {};
  for (const bp of blueprints) {
    const o = bp.provenance?.origin;
    if (o) byOrigin[o] = (byOrigin[o] ?? 0) + 1;
  }
  const actorish = new Set<PanelBlueprintPremium["subjectFocus"]>(["hero", "speaker", "duo", "group"]);
  let panelsMissingCharacterLock = 0;
  let panelsWeakLocationBinding = 0;
  let panelsDialogueAnchorMismatch = 0;
  let panelsNpcContractVsDnaMismatch = 0;
  for (const bp of blueprints) {
    if (actorish.has(bp.subjectFocus) && !hasCharacterVisualLock(bp)) {
      panelsMissingCharacterLock += 1;
    }
    if (isWeakLocation(bp)) panelsWeakLocationBinding += 1;
    if (
      bp.dialogueCarrier === "speaker_visible"
      && (bp.dialogueLines?.length ?? 0) > 0
      && !bp.speakerAnchorCharacterId
    ) {
      panelsDialogueAnchorMismatch += 1;
    }
    if (
      typeof bp.requiredNpcCount === "number"
      && bp.requiredNpcCount > 0
      && (!Array.isArray(bp.npcVisualDna) || bp.npcVisualDna.length === 0)
    ) {
      panelsNpcContractVsDnaMismatch += 1;
    }
  }
  return {
    panelCount,
    provenanceCoverage: withProv / panelCount,
    byOrigin,
    panelsMissingCharacterLock,
    panelsWeakLocationBinding,
    panelsDialogueAnchorMismatch,
    panelsNpcContractVsDnaMismatch,
  };
}

/**
 * Attache ou complète `provenance.narrativeMemoryDigest` sur chaque blueprint.
 * Les plans sans provenance reçoivent un bloc `retrofit_inferred` minimal (anciens chapitres).
 */
export function hydratePanelProvenanceOnBlueprints(
  blueprints: PanelBlueprintPremium[],
  opts: { narrativeMemoryDigest: string },
): PanelBlueprintPremium[] {
  const digest = opts.narrativeMemoryDigest.trim() || "00000000";
  return blueprints.map((bp) => {
    const existing = bp.provenance;
    if (existing) {
      return {
        ...bp,
        provenance: {
          ...existing,
          narrativeMemoryDigest: digest,
        },
      };
    }
    return {
      ...bp,
      provenance: {
        origin: "retrofit_inferred",
        canonicalPanelId: bp.panelId,
        canonicalBeatId: bp.beatId,
        narrativeMemoryDigest: digest,
        appliedRules: ["retrofit_missing_at_hydrate"],
      },
    };
  });
}
