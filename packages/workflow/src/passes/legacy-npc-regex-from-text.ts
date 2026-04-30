/**
 * LEGACY FALLBACK ONLY.
 * Must not be used by the premium generation path as the primary NPC source.
 * Premium must use VisualWorldContract + VisualWorldComposer (npcGroups).
 * Non-premium pipelines may still merge blueprint NPCs with regex hits from summary/beats.
 */

export type LegacyNpcGroupForCast = {
  id: string;
  label: string;
  visualDescription?: string;
  requiredInBeatIds?: string[];
};

/**
 * Patterns pour détecter les groupes humains dans le texte narratif.
 */
const NPC_GROUP_DETECTION_PATTERNS: Array<{ pattern: RegExp; label: string; visualHint?: string }> = [
  { pattern: /\bp[eê]cheurs?\b/gi, label: "pêcheurs", visualHint: "fishermen at work, fishing nets, boats" },
  { pattern: /\bmarins?\b/gi, label: "marins", visualHint: "sailors in uniform, naval attire" },
  { pattern: /\bfoule\b/gi, label: "foule", visualHint: "crowd of people, busy scene" },
  { pattern: /\bpassants?\b/gi, label: "passants", visualHint: "passersby, people walking" },
  { pattern: /\bclients?\b/gi, label: "clients", visualHint: "customers, patrons" },
  { pattern: /\bsoldats?\b/gi, label: "soldats", visualHint: "soldiers in uniform" },
  { pattern: /\bgardes?\b/gi, label: "gardes", visualHint: "guards, sentries" },
  { pattern: /\bvillageois\b/gi, label: "villageois", visualHint: "villagers, rural people" },
  { pattern: /\bmarchands?\b/gi, label: "marchands", visualHint: "merchants, traders with goods" },
  { pattern: /\bouvriers?\b/gi, label: "ouvriers", visualHint: "workers, laborers" },
  { pattern: /\benfants?\b/gi, label: "enfants", visualHint: "children playing" },
  { pattern: /\bserveurs?\b/gi, label: "serveurs", visualHint: "waiters, servers" },
  { pattern: /\bpoliciers?\b/gi, label: "policiers", visualHint: "police officers" },
  { pattern: /\bfishermen?\b/gi, label: "pêcheurs", visualHint: "fishermen at work" },
  { pattern: /\bsailors?\b/gi, label: "marins", visualHint: "sailors" },
  { pattern: /\bcrowd\b/gi, label: "foule", visualHint: "crowd of people" },
  { pattern: /\bworkers?\b/gi, label: "ouvriers", visualHint: "workers" },
  { pattern: /\bguards?\b/gi, label: "gardes", visualHint: "guards" },
  { pattern: /\bsoldiers?\b/gi, label: "soldats", visualHint: "soldiers" },
];

export function detectNpcGroupsFromText(
  texts: Array<string | null | undefined>,
): LegacyNpcGroupForCast[] {
  const combined = texts.filter(Boolean).join(" ").toLowerCase();
  const detected = new Map<string, LegacyNpcGroupForCast>();

  for (const { pattern, label, visualHint } of NPC_GROUP_DETECTION_PATTERNS) {
    if (pattern.test(combined)) {
      const groupId = `text_${label.toLowerCase().replace(/\s+/g, "_")}`;
      if (!detected.has(groupId)) {
        detected.set(groupId, {
          id: groupId,
          label,
          visualDescription: visualHint ?? "",
        });
      }
    }
  }

  return Array.from(detected.values());
}

export function mergeBlueprintAndTextNpcGroups(
  fromBlueprints: LegacyNpcGroupForCast[],
  fromText: LegacyNpcGroupForCast[],
): { merged: LegacyNpcGroupForCast[]; map: Map<string, LegacyNpcGroupForCast> } {
  const mergedNpcGroupsMap = new Map<string, LegacyNpcGroupForCast>();
  for (const g of fromBlueprints) {
    mergedNpcGroupsMap.set(g.label.toLowerCase(), g);
  }
  for (const g of fromText) {
    if (!mergedNpcGroupsMap.has(g.label.toLowerCase())) {
      mergedNpcGroupsMap.set(g.label.toLowerCase(), g);
    }
  }
  return { merged: Array.from(mergedNpcGroupsMap.values()), map: mergedNpcGroupsMap };
}
