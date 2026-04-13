/**
 * D3 — Bibliothèque visuelle des props manga les plus communs.
 * Fournit des descripteurs de prompt optimisés pour chaque prop canonique.
 */

export interface PropVisualEntry {
  promptDescriptor: string;
  negativePrompt: string;
  category: "weapon" | "device" | "document" | "item" | "clothing" | "vehicle";
}

export const PROP_VISUAL_LIBRARY: Record<string, PropVisualEntry> = {
  // ── Armes blanches ──────────────────────────────────────────────────────────
  katana: {
    promptDescriptor: "japanese katana sword, long curved blade, ray skin tsuka handle, circular tsuba guard, lacquered saya scabbard, highly detailed manga weapon",
    negativePrompt: "broken, rusty, cartoonish, toy",
    category: "weapon",
  },
  wakizashi: {
    promptDescriptor: "japanese wakizashi short sword, curved blade, traditional handle wrapping, detailed metalwork",
    negativePrompt: "broken, toy, plastic",
    category: "weapon",
  },
  katana_dual: {
    promptDescriptor: "dual katana swords, twin curved blades, matched pair, both visible, dynamic pose",
    negativePrompt: "single sword, broken, toy",
    category: "weapon",
  },
  kunai: {
    promptDescriptor: "ninja kunai throwing knife, dark matte metal blade, ring pommel, wrapped handle, sharp point",
    negativePrompt: "toy, plastic, bright color",
    category: "weapon",
  },
  shuriken: {
    promptDescriptor: "metal shuriken throwing star, four-pointed, dark steel, sharp edges, detailed surface",
    negativePrompt: "toy, plastic, rubber",
    category: "weapon",
  },
  sword_longsword: {
    promptDescriptor: "european longsword, straight double-edged blade, crossguard, leather-wrapped grip, pommel, medieval style",
    negativePrompt: "broken, rusty, toy",
    category: "weapon",
  },
  dagger: {
    promptDescriptor: "short dagger blade, double-edged, ornate guard, leather grip, sharp point, detailed metalwork",
    negativePrompt: "toy, plastic, broken",
    category: "weapon",
  },
  lance: {
    promptDescriptor: "long spear lance, metal tip, wooden shaft, battle-worn, imposing weapon",
    negativePrompt: "toy, broken, plastic",
    category: "weapon",
  },
  bow: {
    promptDescriptor: "recurve bow, wooden construction, string taut, elegant curve, traditional archery",
    negativePrompt: "toy, plastic, broken string",
    category: "weapon",
  },
  arrow: {
    promptDescriptor: "wooden arrow, metal arrowhead, fletching feathers, nocked and ready, detailed craftsmanship",
    negativePrompt: "toy, broken, rubber",
    category: "weapon",
  },
  revolver: {
    promptDescriptor: "six-shot revolver handgun, metallic blued finish, wooden grip panels, visible cylinder, detailed mechanics",
    negativePrompt: "toy gun, broken, cartoon",
    category: "weapon",
  },
  rifle: {
    promptDescriptor: "bolt-action rifle, long barrel, wooden stock, iron sights, military grade, detailed construction",
    negativePrompt: "toy, plastic, broken",
    category: "weapon",
  },
  grenade: {
    promptDescriptor: "military fragmentation grenade, pin visible, textured surface, olive drab color, compact size",
    negativePrompt: "toy, cartoon, plastic",
    category: "weapon",
  },
  magic_wand: {
    promptDescriptor: "ornate magic wand, glowing tip, carved wood or crystal, magical energy emanating, fantasy style",
    negativePrompt: "toy, plastic, broken",
    category: "weapon",
  },
  staff: {
    promptDescriptor: "wizard staff, tall wooden or metal pole, crystal or gem at top, magical runes carved, glowing",
    negativePrompt: "toy, plain stick, broken",
    category: "weapon",
  },
  scepter: {
    promptDescriptor: "royal scepter, ornate metalwork, jeweled top, symbol of authority, detailed craftsmanship",
    negativePrompt: "toy, plain, broken",
    category: "weapon",
  },
  shield: {
    promptDescriptor: "battle shield, metal or wood construction, heraldic design, battle-worn, protective stance",
    negativePrompt: "toy, plastic, broken",
    category: "weapon",
  },
  // ── Technologie ─────────────────────────────────────────────────────────────
  laptop: {
    promptDescriptor: "open laptop computer, glowing screen with code or data, keyboard visible, modern slim design, blue light",
    negativePrompt: "closed, broken screen, old computer",
    category: "device",
  },
  smartphone: {
    promptDescriptor: "modern smartphone, touchscreen glowing, held in hand, sleek design, screen content visible",
    negativePrompt: "broken screen, old phone, flip phone",
    category: "device",
  },
  tablet: {
    promptDescriptor: "digital tablet device, large touchscreen, stylus nearby, modern design, glowing display",
    negativePrompt: "broken, old, cracked screen",
    category: "device",
  },
  earpiece: {
    promptDescriptor: "tactical earpiece communication device, small, flesh-colored or black, covert tech",
    negativePrompt: "large headphones, broken, toy",
    category: "device",
  },
  drone: {
    promptDescriptor: "small surveillance drone, four rotors, camera module, hovering, futuristic design",
    negativePrompt: "toy drone, broken, crashed",
    category: "device",
  },
  // ── Documents & objets narratifs ────────────────────────────────────────────
  grimoire: {
    promptDescriptor: "ancient magic tome grimoire, thick leather cover, glowing runes, ornate metal clasp, yellowed pages, mystical aura",
    negativePrompt: "modern book, paperback, plain cover",
    category: "document",
  },
  scroll: {
    promptDescriptor: "ancient parchment scroll, rolled paper, tied with ribbon, aged yellowed surface, handwritten text or map",
    negativePrompt: "modern paper, printed, plastic",
    category: "document",
  },
  letter: {
    promptDescriptor: "handwritten letter, folded paper, wax seal, elegant script, envelope visible",
    negativePrompt: "typed, digital, email",
    category: "document",
  },
  map: {
    promptDescriptor: "detailed fantasy or tactical map, parchment paper, hand-drawn locations, compass rose, aged appearance",
    negativePrompt: "digital map, modern, plain",
    category: "document",
  },
  wanted_poster: {
    promptDescriptor: "wanted poster, aged paper, portrait drawing, reward amount text, pinned or held",
    negativePrompt: "digital, modern, clean",
    category: "document",
  },
  // ── Objets spéciaux ─────────────────────────────────────────────────────────
  potion: {
    promptDescriptor: "glass potion vial, colorful glowing liquid, cork stopper, magical shimmer, fantasy alchemical bottle",
    negativePrompt: "empty, broken, modern bottle",
    category: "item",
  },
  capsule: {
    promptDescriptor: "futuristic capsule container, metallic surface, glowing seam, compact size, sci-fi technology",
    negativePrompt: "medical pill, broken, plain",
    category: "item",
  },
  syringe: {
    promptDescriptor: "medical syringe, glass or plastic barrel, needle tip, liquid inside, clinical appearance",
    negativePrompt: "broken, empty, cartoon",
    category: "item",
  },
  key: {
    promptDescriptor: "ornate key, metal construction, decorative bow, aged patina, important-looking, detailed teeth",
    negativePrompt: "plain key, plastic, broken",
    category: "item",
  },
  amulet: {
    promptDescriptor: "magical amulet pendant, glowing gem or symbol, chain attached, ancient design, mystical energy",
    negativePrompt: "plain jewelry, broken, toy",
    category: "item",
  },
  crystal: {
    promptDescriptor: "magical crystal gem, faceted surface, inner glow, floating energy particles, fantasy power source",
    negativePrompt: "plain rock, broken, dull",
    category: "item",
  },
  mask: {
    promptDescriptor: "dramatic mask, ornate design, worn on face or held, theatrical or ceremonial, detailed surface",
    negativePrompt: "plain mask, broken, toy",
    category: "item",
  },
  cape: {
    promptDescriptor: "flowing dramatic cape, fabric billowing in wind, attached at shoulders, heroic or villainous, detailed fabric folds",
    negativePrompt: "plain cloth, torn, static",
    category: "clothing",
  },
  armor: {
    promptDescriptor: "battle armor, metal plates, articulated joints, battle-worn scratches, imposing silhouette, detailed craftsmanship",
    negativePrompt: "toy armor, plastic, broken",
    category: "clothing",
  },
  bag: {
    promptDescriptor: "travel bag or backpack, worn leather or fabric, multiple pockets, straps visible, adventure-ready",
    negativePrompt: "empty, broken, plain",
    category: "item",
  },
  briefcase: {
    promptDescriptor: "professional briefcase, leather construction, metal clasps, handle, important documents implied",
    negativePrompt: "broken, toy, plastic",
    category: "item",
  },
};

/**
 * Retourne le descripteur de prompt pour un prop canonique.
 * Insensible à la casse et aux tirets/underscores.
 */
export function getPropVisualDescriptor(canonicalName: string): string | null {
  const normalized = canonicalName.toLowerCase().replace(/[-\s]/g, "_");
  return PROP_VISUAL_LIBRARY[normalized]?.promptDescriptor ?? null;
}

/**
 * Retourne le prompt négatif pour un prop canonique.
 */
export function getPropNegativePrompt(canonicalName: string): string | null {
  const normalized = canonicalName.toLowerCase().replace(/[-\s]/g, "_");
  return PROP_VISUAL_LIBRARY[normalized]?.negativePrompt ?? null;
}

/**
 * Enrichit un prompt de panel avec les descripteurs visuels des props requis.
 */
export function buildPropsPromptBlock(
  props: Array<{ canonicalName: string; mustBeVisible?: boolean; visibilityMode?: string }>,
): string {
  if (props.length === 0) return "";

  const parts: string[] = [];
  for (const prop of props) {
    const descriptor = getPropVisualDescriptor(prop.canonicalName);
    if (!descriptor) continue;

    const visibility = prop.visibilityMode ?? (prop.mustBeVisible ? "in_hand" : "on_body");
    let visibilityDirective = "";
    switch (visibility) {
      case "in_hand":
        visibilityDirective = `holding ${prop.canonicalName} in hand, prominently visible`;
        break;
      case "foreground_insert":
        visibilityDirective = `${prop.canonicalName} in foreground, sharp focus, close-up detail`;
        break;
      case "on_body":
        visibilityDirective = `${prop.canonicalName} worn/holstered/carried, visible on body`;
        break;
      default:
        visibilityDirective = `${prop.canonicalName} visible in scene`;
    }

    parts.push(`${visibilityDirective}: ${descriptor}`);
  }

  return parts.join("; ");
}
