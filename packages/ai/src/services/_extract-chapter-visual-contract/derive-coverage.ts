/**
 * Conversion d'un `ChapterVisualContract` en `RequiredVisualCoverage` :
 * uniquement les entités avec `importance === "required"` et confiance ≥ 0.45.
 *
 * Exporte aussi `mergeRequiredVisualCoverageWithContract` qui merge avec une
 * base existante en faisant primer le contrat chapitre sur les doublons
 * (clé = `entityType|entity`).
 */
import type { ChapterVisualContract } from "../../contracts/chapter-visual-contract";
import type { RequiredVisualCoverage } from "../required-visual-coverage";

const MIN_CONF = 0.45;

type LocationSlice = NonNullable<ChapterVisualContract["mainLocation"]>;
type CreatureSlice = ChapterVisualContract["creatures"][number];

function deriveLoc(
  out: RequiredVisualCoverage[],
  loc: LocationSlice | null,
): void {
  if (!loc || loc.importance !== "required" || loc.confidence < MIN_CONF) return;
  const bid = loc.sourceBeatIds[0];
  if (!bid) return;
  const entity = loc.name.toLowerCase().trim();
  if (!entity || entity === "unknown") return;
  out.push({
    entity,
    entityType: "location",
    sourceBeatId: bid,
    requiresDedicatedPanel: false,
    acceptedRenderModes: ["establishing_environment", "silent_transition"],
    acceptedSubjectFocuses: ["environment"],
    tokensHint: [entity, ...entity.split(/\s+/).filter((w) => w.length > 2)],
    fulfilledByPanelIds: [],
  });
}

function deriveCreature(
  out: RequiredVisualCoverage[],
  cr: CreatureSlice,
  forceKind?: CreatureSlice["kind"],
): void {
  if (cr.importance !== "required" || cr.confidence < MIN_CONF) return;
  const bid = cr.sourceBeatIds[0];
  if (!bid) return;
  const entity = cr.name.toLowerCase().trim();
  const kind = forceKind ?? cr.kind;
  const isRobot = kind === "robot";
  out.push({
    entity,
    entityType: "creature",
    sourceBeatId: bid,
    requiresDedicatedPanel: true,
    acceptedRenderModes: isRobot
      ? ["creature_reveal", "insert_object"]
      : ["creature_reveal", "threat_silhouette"],
    acceptedSubjectFocuses: ["creature", "threat"],
    tokensHint: [entity, kind, ...entity.split(/[\s-]+/).filter((w) => w.length > 2)],
    fulfilledByPanelIds: [],
  });
}

export function requiredVisualCoverageFromChapterVisualContract(
  contract: ChapterVisualContract,
): RequiredVisualCoverage[] {
  const out: RequiredVisualCoverage[] = [];

  deriveLoc(out, contract.mainLocation);
  for (const loc of contract.secondaryLocations) deriveLoc(out, loc);

  for (const ch of contract.characters) {
    if (ch.importance !== "required" || ch.confidence < MIN_CONF) continue;
    const bid = ch.sourceBeatIds[0];
    if (!bid) continue;
    const entity = (ch.knownCharacterId ?? ch.name).toLowerCase().trim();
    if (!entity) continue;
    const hints = [entity, ch.name.toLowerCase()];
    out.push({
      entity,
      entityType: "character",
      sourceBeatId: bid,
      requiresDedicatedPanel: ch.role === "main",
      acceptedRenderModes: [
        "hero_closeup",
        "dialogue_two_shot",
        "dialogue_over_shoulder",
        "reaction_closeup",
        "npc_closeup",
        "enemy_closeup",
        "group_tension",
      ],
      acceptedSubjectFocuses: ["hero", "group", "important_npc", "enemy", "reaction"],
      tokensHint: [...new Set(hints)],
      fulfilledByPanelIds: [],
    });
  }

  for (const cr of contract.species) deriveCreature(out, cr, "animal");
  for (const cr of contract.robots) deriveCreature(out, cr, "robot");
  for (const cr of contract.hybrids) deriveCreature(out, cr, "hybrid");
  for (const cr of contract.creatures) deriveCreature(out, cr);

  for (const g of contract.groups) {
    if (g.importance !== "required" || g.confidence < MIN_CONF) continue;
    if (g.kind !== "species" && g.kind !== "crowd") continue;
    const bid = g.sourceBeatIds[0];
    if (!bid) continue;
    const entity = g.name.toLowerCase().trim();
    out.push({
      entity,
      entityType: "creature",
      sourceBeatId: bid,
      requiresDedicatedPanel: false,
      acceptedRenderModes: ["group_tension", "creature_reveal"],
      acceptedSubjectFocuses: ["group", "creature"],
      tokensHint: [entity],
      fulfilledByPanelIds: [],
    });
  }

  for (const p of [...contract.props, ...contract.ambientElements]) {
    if (p.importance !== "required" || p.confidence < MIN_CONF) continue;
    const bid = p.sourceBeatIds[0];
    if (!bid) continue;
    const entity = p.name.toLowerCase().trim();
    out.push({
      entity,
      entityType: "prop",
      sourceBeatId: bid,
      requiresDedicatedPanel: false,
      acceptedRenderModes: [
        "insert_object",
        "establishing_environment",
        "surveillance_reveal",
      ],
      acceptedSubjectFocuses: ["prop", "environment"],
      tokensHint: [entity, ...entity.split(/\s+/).filter((w) => w.length > 2)],
      fulfilledByPanelIds: [],
    });
  }

  return out;
}

export function mergeRequiredVisualCoverageWithContract(
  contractCoverage: RequiredVisualCoverage[],
  base: RequiredVisualCoverage[],
): RequiredVisualCoverage[] {
  const key = (c: RequiredVisualCoverage) =>
    `${c.entityType}|${c.entity.toLowerCase().trim()}`;
  const seen = new Set<string>();
  const merged: RequiredVisualCoverage[] = [];
  for (const c of contractCoverage) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(c);
  }
  for (const c of base) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(c);
  }
  return merged;
}
