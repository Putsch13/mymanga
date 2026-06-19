/**
 * Sprint 2 — Composition des panels
 *
 * Modèle d'édition des bulles, SFX et cartouches.
 *
 * Avant ce sprint, le positionnement des bulles était purement implicite :
 * `pickSlots(count, reserved)` choisissait 6 slots fixes (top-left..bottom-right)
 * sans persistance possible — impossible pour un humain de déplacer, redimensionner
 * ou corriger une bulle.
 *
 * Ce fichier définit la structure de vérité pour une bulle/SFX/caption sur un
 * panel donné, aligné sur le TODO :
 *   bubbleId / type / text / bounds / tailAnchor / speakerId / priority /
 *   reservedZone / styleVariant / isEditable.
 *
 * Les coordonnées sont exprimées en pourcentage de la boîte du panel
 * (`0..100`) pour que le rendu soit indépendant des pixels du viewport.
 */

export type BubbleKind = "speech" | "thought" | "shout" | "caption" | "sfx";

export type BubbleStyleVariant =
  | "default"
  | "soft"        // bulle de pensée, traits pointillés
  | "shout"       // bords dentelés
  | "caption"     // rectangle narrateur
  | "sfx_bold"    // SFX gros texte sans bulle
  | "sfx_subtle"; // SFX petit texte intégré

export type BubbleTailDirection = "up" | "down" | "left" | "right" | "none";

export type ReservedZone =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/**
 * Boîte de bulle en pourcentage du panel (0..100).
 * `width` et `height` sont la taille cible ; le renderer peut grandir si le
 * texte dépasse, sauf si `lockSize: true`.
 */
export interface BubbleBounds {
  x: number;       // coin haut-gauche
  y: number;
  width: number;
  height: number;
  lockSize?: boolean;
}

/**
 * Ancre de la queue : point de contact avec le locuteur, en pourcentage du
 * panel. `direction` indique vers où part la queue depuis la bulle.
 */
export interface BubbleTailAnchor {
  x: number;
  y: number;
  direction: BubbleTailDirection;
}

export interface BubbleLayout {
  /** Identifiant stable (peut venir de la DB si persistée). */
  bubbleId: string;
  kind: BubbleKind;
  text: string;
  /** Nom du personnage locuteur (affiché au-dessus de la bulle). */
  speakerId: string | null;
  bounds: BubbleBounds;
  tailAnchor: BubbleTailAnchor | null;
  /**
   * Priorité de placement (0..100). Une bulle de priorité élevée garde sa
   * position préférée ; une bulle basse priorité peut être décalée si
   * plusieurs se chevauchent.
   */
  priority: number;
  /**
   * Zone réservée vers laquelle cette bulle est autorisée. Si le placement
   * initial entre en conflit avec une zone critique (visage, action clé),
   * on relocalise vers une `reservedZone`.
   */
  reservedZone: ReservedZone | null;
  styleVariant: BubbleStyleVariant;
  /** Vrai si l'utilisateur peut déplacer/redimensionner cette bulle. */
  isEditable: boolean;
}

/**
 * Zones dans lesquelles une bulle NE DOIT PAS être placée (visage, main
 * d'action, sujet focal). Le placeur utilise ces zones comme obstacles.
 */
export interface ForbiddenZone {
  id: string;
  label: string;
  bounds: BubbleBounds;
  /** Importance — 100 = intouchable (visage héros), 50 = préférable à éviter. */
  weight: number;
}

/**
 * Layer complet de texte pour un panel : toutes les bulles, caption et SFX.
 */
export interface PanelTextLayer {
  panelId: string;
  bubbles: BubbleLayout[];
  captions: BubbleLayout[];
  sfx: BubbleLayout[];
  forbiddenZones: ForbiddenZone[];
}

/**
 * Helpers de géométrie.
 */
export function bubbleOverlaps(a: BubbleBounds, b: BubbleBounds): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

export function bubbleOverlapArea(a: BubbleBounds, b: BubbleBounds): number {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlapX * overlapY;
}

export function isInsidePanel(bounds: BubbleBounds): boolean {
  return (
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.x + bounds.width <= 100 &&
    bounds.y + bounds.height <= 100
  );
}

/**
 * Clampe les bounds à l'intérieur du panel (marges incluses). Utile quand
 * une édition manuelle a poussé une bulle hors de la page.
 */
export function clampBoundsToPanel(
  bounds: BubbleBounds,
  margin: number = 1,
): BubbleBounds {
  const width = Math.min(bounds.width, 100 - margin * 2);
  const height = Math.min(bounds.height, 100 - margin * 2);
  return {
    ...bounds,
    x: Math.min(Math.max(margin, bounds.x), 100 - margin - width),
    y: Math.min(Math.max(margin, bounds.y), 100 - margin - height),
    width,
    height,
  };
}

/**
 * Convertit une ReservedZone (coin) en bounds approximatives (25% × 25%).
 * Utilisé par le compositeur pour préférer certaines zones.
 */
export function reservedZoneToBounds(zone: ReservedZone): BubbleBounds {
  const SIZE = 25;
  switch (zone) {
    case "top-left":
      return { x: 2, y: 2, width: SIZE, height: SIZE };
    case "top-right":
      return { x: 100 - SIZE - 2, y: 2, width: SIZE, height: SIZE };
    case "bottom-left":
      return { x: 2, y: 100 - SIZE - 2, width: SIZE, height: SIZE };
    case "bottom-right":
      return { x: 100 - SIZE - 2, y: 100 - SIZE - 2, width: SIZE, height: SIZE };
    case "center":
      return { x: 50 - SIZE / 2, y: 50 - SIZE / 2, width: SIZE, height: SIZE };
  }
}

/**
 * Vérifie qu'une bulle ne couvre pas une zone interdite (visage, action clé).
 * Retourne la somme pondérée des aires de recouvrement — 0 = placement OK.
 */
export function computeForbiddenOverlap(
  bubble: BubbleBounds,
  forbiddenZones: ReadonlyArray<ForbiddenZone>,
): number {
  let total = 0;
  for (const zone of forbiddenZones) {
    const area = bubbleOverlapArea(bubble, zone.bounds);
    total += area * (zone.weight / 100);
  }
  return total;
}
