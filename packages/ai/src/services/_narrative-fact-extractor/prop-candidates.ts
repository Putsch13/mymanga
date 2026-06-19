/**
 * Extraction des `propCandidates` à partir du texte d'un beat, en tenant
 * compte de l'inventaire courant des personnages s'il est disponible.
 */
import type { NarrativeExtractionContext } from "./types";

export function extractPropCandidatesFromText(
  text: string,
  context: NarrativeExtractionContext,
): string[] {
  const lower = text.toLowerCase();
  const candidates: string[] = [];

  // Armes ninja
  if (/(kunai|shuriken|lame|épée|katana|tanto|ninjato)/.test(lower)) {
    candidates.push(
      ...["kunai", "shuriken", "lame courte"].filter((p) => lower.includes(p)),
    );
  }
  // Armes génériques
  if (/(arme|pistolet|fusil|revolver|gun|rifle|pistol|sword|blade)/.test(lower)) {
    candidates.push("weapon");
  }
  // Tech / communication
  if (/(téléphone|phone|mobile|smartphone)/.test(lower)) candidates.push("phone");
  if (/(ordinateur|laptop|computer|pc|terminal)/.test(lower)) candidates.push("laptop");
  if (/(tablette|tablet)/.test(lower)) candidates.push("tablet");
  if (/(écouteur|oreillette|earpiece|headset)/.test(lower)) candidates.push("earpiece");
  if (/(badge|carte d'accès|access card|keycard)/.test(lower)) candidates.push("badge");
  // Médical
  if (/(bandage|pansement|dressing)/.test(lower)) candidates.push("bandage");
  if (/(seringue|syringe|injection)/.test(lower)) candidates.push("syringe");
  // Mystique
  if (/(talisman|amulette|amulet|grimoire|artefact|artifact|sceau|seal)/.test(lower)) {
    candidates.push("mystical artifact");
  }
  // Preuve / document
  if (/(dossier|document|preuve|evidence|photo|fichier|file|folder)/.test(lower)) {
    candidates.push("document/evidence");
  }
  // Inventaire personnage
  if (context.characterInventories) {
    for (const inv of Object.values(context.characterInventories)) {
      candidates.push(...inv.carried, ...inv.equipped);
    }
  }

  return [...new Set(candidates)];
}
