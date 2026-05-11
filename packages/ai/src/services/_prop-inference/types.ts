/**
 * Types partagés du moteur d'inférence de props.
 */
import type { PropNarrativeRole, PropVisibilityMode } from "@manga-ai-studio/core";

export type UniverseType =
  | "ninja"
  | "cyberpunk"
  | "post_apo"
  | "school_life"
  | "mecha"
  | "fantasy"
  | "military"
  | "medical"
  | "urban"
  | "generic";

export interface PropTemplate {
  canonicalName: string;
  aliases: string[];
  category: string;
  narrativeRole: PropNarrativeRole;
  defaultVisibilityMode: PropVisibilityMode;
  triggers: string[];
  confidence: number;
}
