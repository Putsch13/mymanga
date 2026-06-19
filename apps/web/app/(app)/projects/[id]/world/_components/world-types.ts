/**
 * Types partagés par les cartes éditables de la page Monde Vivant.
 * Centralisés ici pour éviter les duplications entre la page et chaque
 * composant carte (NPC, Prop, Location).
 */

export interface NpcGroup {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  visualProfile: string | null;
  outfit: string | null;
  silhouette: string | null;
  source: string;
  userEdited: boolean;
  appearanceCount: number;
}

export interface WorldProp {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  visualDescription: string | null;
  kind: string;
  narrativeWeight: string;
  source: string;
  userEdited: boolean;
  appearanceCount: number;
}

export interface ProjectLocation {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  visualBrief: string | null;
  establishedVisualBrief: string | null;
  canonImageUrl: string | null;
  canonLocked: boolean;
}

export const PROP_KINDS: Array<{ value: WorldProp["kind"]; label: string }> = [
  { value: "weapon", label: "Arme" },
  { value: "artefact", label: "Artefact" },
  { value: "tool", label: "Outil" },
  { value: "accessory", label: "Accessoire" },
  { value: "vehicle", label: "Véhicule" },
  { value: "other", label: "Autre" },
];

export const NARRATIVE_WEIGHTS: Array<{ value: WorldProp["narrativeWeight"]; label: string }> = [
  { value: "key", label: "Pivot" },
  { value: "recurring", label: "Récurrent" },
  { value: "one_shot", label: "Ponctuel" },
];
