/**
 * Types pour le rendu strict des panels manga.
 * Garantit que les images ne sont pas croppées arbitrairement.
 */

export interface PanelRenderMeta {
  /** Mode de crop: contain par défaut pour préserver l'image complète */
  cropMode?: "contain" | "cover";
  
  /** Point focal de l'image pour le positionnement intelligent */
  focalPoint?: {
    /** Position X normalisée (0-1, 0.5 = centre) */
    x: number;
    /** Position Y normalisée (0-1, 0.5 = centre) */
    y: number;
  };
  
  /** Zone sûre où le contenu important ne doit pas être coupé */
  safeArea?: {
    /** Marge supérieure en pourcentage (0-100) */
    top: number;
    /** Marge droite en pourcentage (0-100) */
    right: number;
    /** Marge inférieure en pourcentage (0-100) */
    bottom: number;
    /** Marge gauche en pourcentage (0-100) */
    left: number;
  };
  
  /** Zones réservées pour le texte, l'UI ne doit pas les utiliser */
  reservedTextZones?: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center">;
}

export type SlotType = "wide" | "tall" | "square" | "closeup" | "dialogue";

export interface PanelLayoutMeta {
  slotType?: SlotType;
  targetAspectRatio?: string;
  layoutTemplate?: string;
}

/**
 * Mode de rendu du reader
 */
export type RenderMode = "reader" | "debug" | "print";
