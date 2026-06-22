/**
 * Sprint 2 — Composition des panels
 *
 * Compositeur de bulles : transforme des données brutes (dialogue[], sfx, narration,
 * reservedTextZones, bubbleOverrides) en un `PanelTextLayer` structuré, prêt
 * pour le rendu et l'édition.
 *
 * Deux modes :
 *   - automatique : place les bulles via un grille 6-slots (top/mid/bottom × left/right),
 *     en évitant les `reservedTextZones` et les `forbiddenZones` si fournies.
 *   - manuel : si `bubbleOverrides` est fourni (en DB), on respecte les bounds
 *     persistées et on ne les replace pas.
 *
 * Invariants testés :
 *   - toutes les bulles retournées restent dans [0..100] × [0..100]
 *   - aucune bulle ne couvre une `reservedTextZone` si de la place est dispo ailleurs
 *   - les overrides persistés ne sont pas écrasés
 *   - l'ordre des bulles suit l'ordre des dialogues
 */

import type { InPanelTextBox } from "@manga-ai-studio/ai";

/**
 * Coerce une valeur texte hétérogène (string, string[], {text}, Array<{text}>)
 * en string simple. Protège contre les crashes `.trim()` en prod quand
 * le backend renvoie un format inattendu.
 */
function coerceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

import {
  bubbleOverlapArea,
  clampBoundsToPanel,
  computeForbiddenOverlap,
  reservedZoneToBounds,
  type BubbleBounds,
  type BubbleKind,
  type BubbleLayout,
  type BubbleStyleVariant,
  type ForbiddenZone,
  type PanelTextLayer,
  type ReservedZone,
} from "./bubble-layout-model";

/** Bloc texte logique (remplace progressivement la notion de « bulle »). */
export type PanelTextBlockKind = "dialogue" | "caption" | "narration" | "sfx";

export type TextPlacementPreference =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "center"
  | "safe-zone";

export interface PanelTextBlock {
  kind: PanelTextBlockKind;
  text: string;
  speaker?: string | null;
  placementPreference?: TextPlacementPreference;
  safeZoneIndex?: number | null;
}

/** @deprecated Préférer {@link PanelTextBlock} côté API métier ; conservé pour le compositeur existant. */
export interface DialogueInput {
  speaker: string;
  text: string;
  kind?: BubbleKind;
}

export type PanelTextVisualVariant = "cartouche" | "bandeau" | "embedded" | "narration_box";

/**
 * Boîte de texte positionnée en coordonnées normalisées 0–100
 * (identique au modèle {@link BubbleLayout.bounds}) pour overlays client.
 */
export interface PanelTextLayoutBox {
  kind: PanelTextBlockKind;
  text: string;
  speaker?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  visualVariant: PanelTextVisualVariant;
  placementPreference?: TextPlacementPreference;
  safeZoneIndex?: number | null;
}

export interface ComposedPanelTextLayout {
  dialogueBoxes: PanelTextLayoutBox[];
  captionBoxes: PanelTextLayoutBox[];
  narrationBoxes: PanelTextLayoutBox[];
}

export interface BubbleCompositorInput {
  panelId: string;
  dialogues: ReadonlyArray<DialogueInput>;
  narration?: string | null;
  sfx?: string | null;
  reservedTextZones?: ReadonlyArray<ReservedZone>;
  forbiddenZones?: ReadonlyArray<ForbiddenZone>;
  /**
   * Overrides persistés (issus d'une édition manuelle) — s'appliquent par
   * `bubbleId`. Remplacent bounds/tailAnchor/text si fournis.
   */
  overrides?: ReadonlyMap<string, Partial<BubbleLayout>>;
  /** Échelle du texte — affecte la taille par défaut des bulles. */
  textScale?: "normal" | "compact" | "micro";
  /**
   * Mode webtoon — bulles légèrement plus grandes (lecture sur mobile).
   */
  isWebtoon?: boolean;
  /**
   * Limite dure : combien de bulles max on rend. Par défaut 6 (reader) ou
   * 8 (webtoon). Au-delà, les dialogues supplémentaires tombent dans la
   * strip de fallback textuelle (hors compositeur).
   */
  maxBubbles?: number;
}

/**
 * Slots préférés sur une grille 3×2 (head / mid / foot × left / right).
 * On émet des bounds relatives au panel (0..100).
 */
interface SlotPosition {
  bounds: BubbleBounds;
  reservedMatch: ReservedZone[];
  tailDirection: "up" | "down";
}

function getSlotGrid(isWebtoon: boolean): SlotPosition[] {
  if (isWebtoon) {
    const W = 44;
    const H = 18;
    return [
      { bounds: { x: 4, y: 2, width: W, height: H }, reservedMatch: ["top-left"], tailDirection: "down" },
      { bounds: { x: 100 - W - 4, y: 2, width: W, height: H }, reservedMatch: ["top-right"], tailDirection: "down" },
      { bounds: { x: 4, y: 24, width: W, height: H }, reservedMatch: [], tailDirection: "down" },
      { bounds: { x: 100 - W - 4, y: 24, width: W, height: H }, reservedMatch: [], tailDirection: "up" },
      { bounds: { x: 4, y: 46, width: W, height: H }, reservedMatch: ["center"], tailDirection: "down" },
      { bounds: { x: 100 - W - 4, y: 46, width: W, height: H }, reservedMatch: ["center"], tailDirection: "up" },
      { bounds: { x: 4, y: 78, width: W, height: H }, reservedMatch: ["bottom-left"], tailDirection: "up" },
      { bounds: { x: 100 - W - 4, y: 78, width: W, height: H }, reservedMatch: ["bottom-right"], tailDirection: "up" },
    ];
  }
  const W = 42;
  const H = 24;
  return [
    { bounds: { x: 4, y: 4, width: W, height: H }, reservedMatch: ["top-left"], tailDirection: "down" },
    { bounds: { x: 100 - W - 4, y: 4, width: W, height: H }, reservedMatch: ["top-right"], tailDirection: "down" },
    { bounds: { x: 3, y: 38, width: W, height: H }, reservedMatch: ["center"], tailDirection: "down" },
    { bounds: { x: 100 - W - 2, y: 38, width: W, height: H }, reservedMatch: ["center"], tailDirection: "up" },
    { bounds: { x: 4, y: 68, width: W, height: H }, reservedMatch: ["bottom-left"], tailDirection: "up" },
    { bounds: { x: 100 - W - 4, y: 68, width: W, height: H }, reservedMatch: ["bottom-right"], tailDirection: "up" },
  ];
}

function slotMatchesReserved(slot: SlotPosition, reserved: ReadonlyArray<ReservedZone>): boolean {
  for (const r of reserved) {
    if (slot.reservedMatch.includes(r)) return true;
  }
  return false;
}

function slotCost(
  slot: SlotPosition,
  reserved: ReadonlyArray<ReservedZone>,
  forbiddenZones: ReadonlyArray<ForbiddenZone>,
  occupiedSlots: ReadonlyArray<SlotPosition>,
): number {
  let cost = 0;
  if (slotMatchesReserved(slot, reserved)) cost += 1000;
  cost += computeForbiddenOverlap(slot.bounds, forbiddenZones);
  for (const occ of occupiedSlots) {
    cost += bubbleOverlapArea(slot.bounds, occ.bounds) * 10;
  }
  return cost;
}

function pickBestSlot(
  available: SlotPosition[],
  reserved: ReadonlyArray<ReservedZone>,
  forbiddenZones: ReadonlyArray<ForbiddenZone>,
  occupiedSlots: ReadonlyArray<SlotPosition>,
): SlotPosition {
  let best = available[0]!;
  let bestCost = slotCost(best, reserved, forbiddenZones, occupiedSlots);
  for (const slot of available.slice(1)) {
    const c = slotCost(slot, reserved, forbiddenZones, occupiedSlots);
    if (c < bestCost) {
      best = slot;
      bestCost = c;
    }
  }
  return best;
}

function defaultBubbleId(panelId: string, idx: number, kind: BubbleKind): string {
  return `${panelId}:${kind}:${idx}`;
}

function styleForKind(kind: BubbleKind): BubbleStyleVariant {
  switch (kind) {
    case "speech": return "default";
    case "thought": return "soft";
    case "shout": return "shout";
    case "caption": return "caption";
    case "sfx": return "sfx_bold";
  }
}

/**
 * Construit le layer texte complet (bulles + SFX + caption).
 */
export function composePanelTextLayer(input: BubbleCompositorInput): PanelTextLayer {
  const {
    panelId,
    dialogues,
    narration,
    sfx,
    reservedTextZones = [],
    forbiddenZones = [],
    overrides,
    isWebtoon = false,
  } = input;
  const maxBubbles = input.maxBubbles ?? (isWebtoon ? 8 : 6);

  const slots = getSlotGrid(isWebtoon);
  const occupied: SlotPosition[] = [];

  const bubbles: BubbleLayout[] = [];
  const truncated = dialogues.slice(0, maxBubbles);

  for (let i = 0; i < truncated.length; i++) {
    const dialogue = truncated[i]!;
    const kind: BubbleKind = dialogue.kind ?? "speech";
    const bubbleId = defaultBubbleId(panelId, i, kind);
    const override = overrides?.get(bubbleId);

    if (override?.bounds) {
      const bounds = clampBoundsToPanel(override.bounds);
      bubbles.push({
        bubbleId,
        kind,
        text: override.text ?? dialogue.text,
        speakerId: override.speakerId ?? dialogue.speaker ?? null,
        bounds,
        tailAnchor: override.tailAnchor ?? null,
        priority: override.priority ?? 50,
        reservedZone: override.reservedZone ?? null,
        styleVariant: override.styleVariant ?? styleForKind(kind),
        isEditable: override.isEditable ?? true,
      });
      continue;
    }

    const availableSlots = slots.filter((s) => !occupied.includes(s));
    if (availableSlots.length === 0) break;
    const slot = pickBestSlot(availableSlots, reservedTextZones, forbiddenZones, occupied);
    occupied.push(slot);

    const tailAnchor = {
      x: slot.bounds.x + slot.bounds.width * (slot.tailDirection === "down" ? 0.35 : 0.6),
      y: slot.bounds.y + (slot.tailDirection === "down" ? slot.bounds.height : 0),
      direction: slot.tailDirection,
    };

    bubbles.push({
      bubbleId,
      kind,
      text: dialogue.text,
      speakerId: dialogue.speaker || null,
      bounds: clampBoundsToPanel(slot.bounds),
      tailAnchor,
      priority: 50,
      reservedZone: null,
      styleVariant: styleForKind(kind),
      isEditable: true,
    });
  }

  const captions: BubbleLayout[] = [];
  const narrationText = coerceText(narration);
  if (narrationText.trim().length > 0) {
    const overrideId = `${panelId}:caption:0`;
    const override = overrides?.get(overrideId);
    const defaultBounds: BubbleBounds = { x: 2, y: 2, width: 96, height: 14 };
    captions.push({
      bubbleId: overrideId,
      kind: "caption",
      text: override?.text ?? narrationText,
      speakerId: null,
      bounds: clampBoundsToPanel(override?.bounds ?? defaultBounds),
      tailAnchor: null,
      priority: override?.priority ?? 80,
      reservedZone: "top-left",
      styleVariant: "caption",
      isEditable: override?.isEditable ?? true,
    });
  }

  const sfxLayers: BubbleLayout[] = [];
  const sfxText = coerceText(sfx);
  if (sfxText.trim().length > 0) {
    const sfxId = `${panelId}:sfx:0`;
    const override = overrides?.get(sfxId);
    const hasDialogue = bubbles.length > 0;
    // Les visages sont quasi toujours en haut-centre de la case → on place le SFX
    // en BAS (coin) pour ne pas l'écraser. sfx_bold = bandeau bas-gauche,
    // sfx_subtle = petit coin bas-droite.
    const defaultBounds: BubbleBounds = hasDialogue
      ? { x: 62, y: 82, width: 34, height: 14 }
      : { x: 6, y: 70, width: 58, height: 20 };
    sfxLayers.push({
      bubbleId: sfxId,
      kind: "sfx",
      text: override?.text ?? sfxText,
      speakerId: null,
      bounds: clampBoundsToPanel(override?.bounds ?? defaultBounds),
      tailAnchor: null,
      priority: override?.priority ?? 30,
      reservedZone: null,
      styleVariant: hasDialogue ? "sfx_subtle" : "sfx_bold",
      isEditable: override?.isEditable ?? true,
    });
  }

  return {
    panelId,
    bubbles,
    captions,
    sfx: sfxLayers,
    forbiddenZones: [...forbiddenZones],
  };
}

function bubbleKindToVisualVariant(kind: BubbleKind): PanelTextVisualVariant {
  if (kind === "thought") return "embedded";
  if (kind === "sfx") return "embedded";
  return "cartouche";
}

function boundsPercentToLayoutBox(
  kind: PanelTextBlockKind,
  text: string,
  speaker: string | null | undefined,
  bounds: BubbleBounds,
  visualVariant: PanelTextVisualVariant,
): PanelTextLayoutBox {
  return {
    kind,
    text,
    speaker: speaker ?? null,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    visualVariant,
    placementPreference: undefined,
    safeZoneIndex: null,
  };
}

/**
 * Convertit un {@link PanelTextLayer} déjà calculé en boîtes in-panel
 * (dialogue / légendes / narration). Les SFX restent dans `layer.sfx` pour
 * {@link PanelSfxOverlay} — ne pas les dupliquer ici.
 */
export function composePanelTextLayoutFromLayer(
  layer: PanelTextLayer,
  _panelWidth: number,
  _panelHeight: number,
): ComposedPanelTextLayout {
  void _panelWidth;
  void _panelHeight;
  const dialogueBoxes: PanelTextLayoutBox[] = [];
  const captionBoxes: PanelTextLayoutBox[] = [];
  for (const b of layer.bubbles) {
    if (b.kind === "caption") {
      captionBoxes.push(
        boundsPercentToLayoutBox("caption", b.text, b.speakerId, b.bounds, "bandeau"),
      );
    } else {
      dialogueBoxes.push(
        boundsPercentToLayoutBox(
          "dialogue",
          b.text,
          b.speakerId,
          b.bounds,
          bubbleKindToVisualVariant(b.kind),
        ),
      );
    }
  }
  const narrationBoxes = layer.captions.map((c) =>
    boundsPercentToLayoutBox("narration", c.text, null, c.bounds, "narration_box"),
  );
  return {
    dialogueBoxes,
    captionBoxes,
    narrationBoxes,
  };
}

/**
 * Pipeline texte in-panel : même placement que {@link composePanelTextLayer},
 * mais sortie structurée pour overlay neutre + composite Sharp (PATCH 10).
 */
export function composePanelTextLayout(
  input: BubbleCompositorInput & { panelWidth: number; panelHeight: number },
): ComposedPanelTextLayout {
  const layer = composePanelTextLayer(input);
  return composePanelTextLayoutFromLayer(layer, input.panelWidth, input.panelHeight);
}

/** Convertit des boîtes 0–100% en coordonnées page (px) pour le compositor. */
export function panelTextLayoutBoxesToPagePixels(
  boxes: ReadonlyArray<PanelTextLayoutBox>,
  panelX: number,
  panelY: number,
  panelW: number,
  panelH: number,
): InPanelTextBox[] {
  return boxes.map((b) => ({
    text: b.text,
    speaker: b.speaker ?? undefined,
    x: panelX + (b.x / 100) * panelW,
    y: panelY + (b.y / 100) * panelH,
    width: (b.width / 100) * panelW,
    height: (b.height / 100) * panelH,
    variant: b.visualVariant,
  }));
}

/**
 * Fusion d'overrides utilisateur avec les valeurs persistées. `null`
 * explicite => clear override (reviens au placement auto).
 */
export function mergeBubbleOverride(
  previous: Partial<BubbleLayout> | null,
  patch: Partial<BubbleLayout>,
): Partial<BubbleLayout> {
  const out: Partial<BubbleLayout> = { ...(previous ?? {}) };
  for (const key of Object.keys(patch) as Array<keyof BubbleLayout>) {
    const v = patch[key];
    if (v === null) {
      delete out[key];
    } else if (v !== undefined) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/**
 * Convertit tous les reserved zones en forbidden zones implicites (avec
 * weight=40 — modérément à éviter). Utile quand le builder n'a pas fourni
 * de `forbiddenZones` explicites (visage détecté).
 */
export function reservedZonesToForbiddenZones(
  reserved: ReadonlyArray<ReservedZone>,
): ForbiddenZone[] {
  return reserved.map((zone, idx) => ({
    id: `reserved-${zone}-${idx}`,
    label: `reserved ${zone}`,
    bounds: reservedZoneToBounds(zone),
    weight: 40,
  }));
}
