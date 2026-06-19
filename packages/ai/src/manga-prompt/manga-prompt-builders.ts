/**
 * manga-prompt-builders.ts
 *
 * Helpers purs de construction de fragments de prompt manga
 * (dark genre, props requis, character description, style resolver,
 * environment lock, prompt preset inference, NPC memory block).
 *
 * Extrait de `manga-prompt-composer.ts` (audit-v9, < 500 lignes/fichier).
 */

import { getPropVisualDescriptor } from "../services/prop-visual-library";
import { getStylePreset } from "../style-presets";
import type { CharacterRef, ComposedPrompt, PanelPromptInput, StylePackRef } from "./manga-prompt-types";

// QUAL-1 : Vocabulaire gore spécifique par sous-genre dark
export function buildDarkGenreBlock(genre: string | null | undefined, layer: string): string | null {
  if (layer !== "MATURE_DRAMA" && layer !== "MATURE_VISUAL" && layer !== "ADULT_EXPLICIT") return null;

  const g = (genre ?? "").toLowerCase();

  if (/gore|guro|splatter/.test(g)) {
    return "dark gore manga style, visceral wounds stylized, blood splatter ink rendering, seinen splatter aesthetic, intense violence rendered in ink, horror manga composition";
  }
  if (/horror|horreur/.test(g)) {
    return "dark horror manga, junji ito inspired atmosphere, oppressive shadows, distorted anatomy horror style, unsettling composition, psychological horror visual, twisted surreal space";
  }
  if (/seinen|dark|grimdark/.test(g)) {
    return "dark seinen manga, gritty realistic style, heavy cross-hatching shadows, brutal atmosphere, visceral drama, damaged world aesthetic";
  }
  if (/post.?apo|apocalypse|wasteland/.test(g)) {
    return "post-apocalyptic manga aesthetic, ruined world, desolate atmosphere, survival dark tone, gritty environmental detail";
  }
  if (/military|militaire|war|guerre/.test(g)) {
    return "military manga style, tactical combat panel, weapon detail, war damage, realistic injuries manga rendering";
  }

  return "dark manga style, mature seinen aesthetic, intense dramatic shadows, adult drama visual";
}

// URGENCE 4 : Construire le bloc d'accessoires requis
// P0.4 — Formule le prompt en attribuant les props au bon propriétaire
export function buildRequiredPropsBlock(
  props: NonNullable<NonNullable<PanelPromptInput["requiredProps"]>>,
): string {
  if (!props.length) return "";

  const visibleProps = props.filter((p) => p.mustBeVisible !== false);
  if (!visibleProps.length) return "";

  const parts = visibleProps.map((p) => {
    const visualDescriptor = getPropVisualDescriptor(p.canonicalName) ?? p.canonicalName;
    const owner = p.ownerCategory ?? "unassigned";

    const ownerPrefix = (() => {
      switch (owner) {
        case "guard":
          return "guards carrying";
        case "enemy":
          return "enemy wielding";
        case "npc":
          return "NPC holding";
        case "ambient":
          return "";
        case "hero":
          return "protagonist with";
        default:
          return "";
      }
    })();

    switch (p.visibilityMode) {
      case "in_hand":
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} in hand, prominently visible, sharp focus`
          : `holding ${visualDescriptor} in hand, prominently visible, sharp focus`;
      case "foreground_insert":
        return `${visualDescriptor} in foreground, extreme close-up detail, sharp focus`;
      case "used_in_action":
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} actively, visible in action pose`
          : `using ${visualDescriptor} actively, visible in action pose`;
      case "on_body":
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} holstered/worn, clearly visible`
          : `${visualDescriptor} worn/holstered, clearly visible on character`;
      case "aftermath_trace":
        return `${visualDescriptor} visible on ground, aftermath detail`;
      default:
        return ownerPrefix
          ? `${ownerPrefix} ${visualDescriptor} clearly visible in scene`
          : `${visualDescriptor} clearly visible in scene`;
    }
  });

  return parts.join(", ");
}

export function describeCharacter(c: CharacterRef, mode: "full" | "supporting" = "full"): string {
  const parts: string[] = [`[${c.name}]`];

  // En mode "supporting" (le perso N'EST PAS le focus du panel), on retire le lock fort,
  // les tiers, et tous les hard_traits. Sinon le hero "hard_lock, tier main_hero, continuity strict"
  // écrase le NPC focus et Flux rend toujours le hero.
  if (mode === "supporting") {
    const normalizedGender = c.gender?.trim().toLowerCase();
    if (normalizedGender === "male") parts.push("male");
    else if (normalizedGender === "female") parts.push("female");
    if (c.hairColor) parts.push(`${c.hairColor} hair`);
    if (c.outfitDefault) parts.push(c.outfitDefault);
    parts.push("secondary / background role, not the subject of this panel");
    return parts.join(", ");
  }

  if (c.lockStrength && c.lockStrength !== "NONE") {
    parts.push(`lock ${c.lockStrength.toLowerCase()}`);
  }
  if (c.importanceTier) {
    parts.push(`tier ${c.importanceTier.toLowerCase()}`);
  }
  if (c.continuityBudget && c.continuityBudget !== "none") {
    parts.push(`continuity ${c.continuityBudget}`);
  }

  // CREATURE-3 : description anatomique prioritaire pour les entités non-humaines
  const entityKind = c.entityKind?.trim().toLowerCase();
  if (entityKind && entityKind !== "human" && entityKind !== "named_npc" && entityKind !== "") {
    const creatureStyleHints: Record<string, string> = {
      monster: "large imposing creature, terrifying anatomy, detailed manga monster design",
      creature: "fantastical creature, unique anatomy, manga creature design",
      animal: "animal manga style, detailed anatomy",
      spirit: "ethereal ghostly form, translucent, spiritual energy",
      construct: "mechanical robot body, metallic surface, visible joints",
      dragon: "massive dragon, detailed scales, powerful wings",
      demon: "dark demon, menacing horns, supernatural menace",
      beast: "powerful beast, wild anatomy, raw ferocity",
    };
    const styleHint = creatureStyleHints[entityKind] ?? `${entityKind} creature, detailed anatomy`;
    if (c.speciesLabel) parts.push(c.speciesLabel);
    parts.push(styleHint);
    if (c.appearance) parts.push(c.appearance);
    if (c.bodyDetails) parts.push(c.bodyDetails);
    if (c.hardTraits && c.hardTraits.length > 0) {
      parts.push(`MUST HAVE: ${c.hardTraits.slice(0, 4).join(", ")}`);
    }
    parts.push("manga creature art style, detailed anatomy, consistent design");
    return parts.join(", ");
  }

  const normalizedGender = c.gender?.trim().toLowerCase();
  if (normalizedGender === "male") parts.push("male, adult man");
  else if (normalizedGender === "female") parts.push("female, adult woman");

  if (c.visualSignatureText) parts.push(c.visualSignatureText);

  if (c.appearance) parts.push(c.appearance);

  if (!c.visualSignatureText) {
    if (c.hairColor) parts.push(`${c.hairColor} hair`);
    if (c.eyeColor) parts.push(`${c.eyeColor} eyes`);
    if (c.outfitDefault) parts.push(c.outfitDefault);
  }

  if (c.bodyDetails) parts.push(c.bodyDetails);
  if (c.wardrobeDetails) parts.push(c.wardrobeDetails);
  if (c.recurringMemory) parts.push(c.recurringMemory);

  if (c.hardTraits && c.hardTraits.length > 0) {
    parts.push(`HARD LOCK: ${c.hardTraits.slice(0, 5).join(", ")}`);
  } else if (c.fingerprint?.hardTraits && c.fingerprint.hardTraits.length > 0) {
    parts.push(`HARD LOCK: ${c.fingerprint.hardTraits.slice(0, 5).join(", ")}`);
  }

  return parts.join(", ");
}

export function resolveVisualStyle(
  stylePack?: StylePackRef | null,
  stylePresetSlug?: string | null,
): string {
  // DIFF-3 : un preset renseigné prend la priorité sur le stylePack libre
  // (le preset est considéré comme une intention explicite utilisateur).
  const preset = getStylePreset(stylePresetSlug ?? null);
  const parts: string[] = [];

  if (preset) {
    parts.push(preset.visualStyle);
    if (stylePack?.anatomyBias) parts.push(`anatomy bias ${stylePack.anatomyBias}`);
    if (stylePack?.backgroundDensity) parts.push(`background density ${stylePack.backgroundDensity}`);
    if (stylePack?.cameraLanguage) parts.push(`camera language ${stylePack.cameraLanguage}`);
    parts.push("manga panel");
    return parts.join(", ");
  }

  if (!stylePack) return "detailed manga art, professional manga panel";
  if (stylePack.visualStyle) parts.push(stylePack.visualStyle);
  else if (stylePack.description) parts.push(stylePack.description);
  else if (stylePack.name) parts.push(`${stylePack.name} style`);
  if (stylePack.anatomyBias) parts.push(`anatomy bias ${stylePack.anatomyBias}`);
  if (stylePack.backgroundDensity) parts.push(`background density ${stylePack.backgroundDensity}`);
  if (stylePack.cameraLanguage) parts.push(`camera language ${stylePack.cameraLanguage}`);
  parts.push("manga panel");
  return parts.join(", ");
}

export function sanitizeSectionText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/,+/g, ",").trim();
}

export function buildEnvironmentLock(input: PanelPromptInput): string {
  const pieces: string[] = [];
  const lower =
    `${input.location} ${input.action} ${input.environmentHint ?? ""} ${input.sceneContext ?? ""}`.toLowerCase();
  if (/(lycée|lycee|école|ecole|school|campus)/.test(lower)) {
    pieces.push("school courtyard or campus architecture must stay readable");
    pieces.push("students visible in background or around the conflict");
    pieces.push("no generic outdoor backdrop");
  }
  if (/(humili|ridicul|moque|crowd|students|foule)/.test(lower)) {
    pieces.push("social crowd reaction must be visible around the protagonists");
  }
  if (/(wide|establishing)/.test((input.camera ?? "").toLowerCase())) {
    pieces.push("full environment visible with clear foreground, midground and background");
  }
  return pieces.join(" | ");
}

export function inferPromptPreset(input: PanelPromptInput): NonNullable<ComposedPrompt["fal"]>["preset"] {
  const lower = `${input.action} ${input.sceneContext ?? ""} ${input.dialogueHint ?? ""}`.toLowerCase();
  if (/(fight|combat|battle|duel|impact|strike|kick|punch)/.test(lower)) return "combat_clash";
  if (/(aftermath|retomb|apres le choc|after the hit)/.test(lower)) return "combat_aftermath";
  if (/(rage|furie|berserk|scream)/.test(lower)) return "rage_closeup";
  if (/(crowd|foule|public|students reacting)/.test(lower)) return "crowd_reaction";
  if (/(entry|apparition|entr[ée]e|arrive)/.test(lower)) return "hero_entry_panel";
  if (/(wide|establishing)/.test((input.camera ?? "").toLowerCase())) return "establishing_location";
  if (input.dialogueHint) return "dialogue_tension";
  return "story_panel";
}

export function buildNpcMemoryBlock(
  recurringNpcs: Array<{ label: string; shortVisualCore: string; speciesLabel?: string | null }>,
): string {
  if (recurringNpcs.length === 0) return "";
  return (
    `\n=== PERSONNAGES SECONDAIRES RÉCURRENTS ===\n` +
    `Ces PNJ ont déjà été établis visuellement. Leurs traits DOIVENT être cohérents si ils réapparaissent.\n` +
    recurringNpcs
      .map((n) => `• ${n.label}${n.speciesLabel ? ` (${n.speciesLabel})` : ""} : ${n.shortVisualCore}`)
      .join("\n") +
    `\n=== FIN MÉMOIRE NPC ===\n`
  );
}

/**
 * SUPPRIMÉ (audit hardening H5) — `buildCompositionDirective` injectait
 * des blocs prose FR longs et parfois contradictoires. Conservé en no-op
 * pour ne pas casser l'API legacy.
 */
export function buildCompositionDirective(_blueprint: { subjectFocus: string; heroCenterAllowed?: boolean }): string {
  return "";
}
