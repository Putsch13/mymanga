"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * SPRINT 2 — presets archétypes manga.
 *
 * Pré-remplit en un clic les 4 profils JSON majeurs (visual, body, wardrobe,
 * speech) + les colonnes voice* canon. L'utilisateur garde la main pour
 * affiner ensuite chaque champ.
 *
 * Les valeurs sont en français côté UI (pour rester cohérent avec les
 * selects existants des composants de configuration).
 */

export interface ArchetypePresetPatch {
  visualProfile?: Record<string, unknown>;
  bodyState?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  speechProfile?: Record<string, unknown>;
  voiceRegister?: string | null;
  voiceSentenceLength?: string | null;
  voiceVocabularyStyle?: string | null;
  voiceEmotionalLeak?: number | null;
  voiceSarcasmLevel?: number | null;
  voiceAggressionLevel?: number | null;
  voiceSilenceFrequency?: number | null;
  voiceFavoriteExpressions?: string[];
  voiceForbiddenExpressions?: string[];
  /** Suggestion appliquée aussi à `roleType` quand non rempli. */
  roleType?: string;
}

export interface ArchetypePreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  patch: ArchetypePresetPatch;
}

export const ARCHETYPE_PRESETS: ArchetypePreset[] = [
  {
    id: "shonen-hero",
    label: "Héros shōnen",
    emoji: "⚔️",
    description: "Cheveux en bataille, regard direct, énergie débordante.",
    patch: {
      roleType: "Protagoniste",
      visualProfile: {
        eyeShape: "Amande",
        eyeSize: "Grands",
        hairLength: "Court",
        hairTexture: "Bouclé",
        eyebrowStyle: "Épais",
        jawline: "Marquée",
        silhouetteType: "Athlétique",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "Souriant naturel",
        typicalGaze: "Direct",
        habitualPosture: "Mains dans les poches",
      },
      bodyState: { build: "Athlétique", musculature: "Tonique", posture: "Droite" },
      wardrobeProfile: { fabricStyle: "Sportwear" },
      voiceRegister: "casual",
      voiceSentenceLength: "short",
      voiceEmotionalLeak: 0.7,
      voiceSarcasmLevel: 0.2,
      voiceAggressionLevel: 0.4,
      voiceFavoriteExpressions: ["On y va !", "Pas question d'abandonner"],
    },
  },
  {
    id: "stoic-mentor",
    label: "Mentor stoïque",
    emoji: "🍶",
    description: "Visage marqué, barbe entretenue, voix grave.",
    patch: {
      roleType: "Mentor",
      visualProfile: {
        eyeShape: "Tombant",
        eyeSize: "Moyens",
        eyebrowStyle: "Broussailleux",
        jawline: "Carrée",
        silhouetteType: "Robuste",
        perceivedAge: "Mature",
        beardPresent: true,
        beardStyle: "Barbe pleine",
        beardDensity: "Moyenne",
        mustachePresent: true,
        mustacheStyle: "Brosse",
        restingFace: "Sérieux",
        typicalGaze: "Perçant",
        habitualPosture: "Bras croisés",
      },
      bodyState: { build: "Robuste", musculature: "Définie", posture: "Droite" },
      voiceRegister: "formal",
      voiceSentenceLength: "medium",
      voiceVocabularyStyle: "sentencieux",
      voiceEmotionalLeak: 0.2,
      voiceSarcasmLevel: 0.3,
      voiceSilenceFrequency: 0.6,
      voiceFavoriteExpressions: ["Écoute bien", "Prends ton temps"],
    },
  },
  {
    id: "tsundere",
    label: "Tsundere",
    emoji: "💢",
    description: "Cheveux longs, yeux relevés, sourcils froncés par défaut.",
    patch: {
      roleType: "Rival/e amical/e",
      visualProfile: {
        eyeShape: "Relevé",
        eyeSize: "Très grands (manga)",
        eyebrowStyle: "Froncés",
        hairLength: "Long",
        hairTexture: "Lisse",
        silhouetteType: "Élancé",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "Maussade",
        typicalGaze: "Plissé / méfiant",
        typicalMimic: "Sourcil levé",
        habitualPosture: "Bras croisés",
      },
      bodyState: { build: "Svelte", posture: "Tendue" },
      voiceRegister: "casual",
      voiceSentenceLength: "short",
      voiceEmotionalLeak: 0.8,
      voiceSarcasmLevel: 0.7,
      voiceAggressionLevel: 0.5,
      voiceFavoriteExpressions: ["Tch...", "C-c'est pas pour toi !", "Hmph"],
      voiceForbiddenExpressions: ["évidemment"],
    },
  },
  {
    id: "kuudere",
    label: "Kuudere (froid·e)",
    emoji: "❄️",
    description: "Visage neutre, regard distant, voix posée.",
    patch: {
      roleType: "Allié/e silencieux/se",
      visualProfile: {
        eyeShape: "Tombant",
        eyeSize: "Moyens",
        eyebrowStyle: "Droits",
        hairLength: "Mi-long",
        silhouetteType: "Élancé",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "Distant / ailleurs",
        typicalGaze: "Vide / lointain",
        habitualPosture: "Mains derrière le dos",
      },
      bodyState: { build: "Mince", posture: "Droite" },
      voiceRegister: "neutral",
      voiceSentenceLength: "very_short",
      voiceEmotionalLeak: 0.1,
      voiceSarcasmLevel: 0.4,
      voiceSilenceFrequency: 0.8,
      voiceFavoriteExpressions: ["...", "Oui."],
    },
  },
  {
    id: "charismatic-villain",
    label: "Antagoniste charismatique",
    emoji: "🎭",
    description: "Sourire en coin, regard calculateur, allure aristocratique.",
    patch: {
      roleType: "Antagoniste",
      visualProfile: {
        eyeShape: "En amande étirée",
        eyeSize: "Moyens",
        eyebrowStyle: "Arqués",
        jawline: "Fine",
        silhouetteType: "Élancé",
        beardPresent: true,
        beardStyle: "Bouc",
        beardDensity: "Clairsemée",
        mustachePresent: true,
        mustacheStyle: "Crayon",
        restingFace: "Méprisant",
        typicalGaze: "Calculateur",
        typicalMimic: "Sourire en coin",
        habitualPosture: "Adossé nonchalamment",
        signatureGesture: "Tape lentement les doigts",
      },
      bodyState: { build: "Mince", posture: "Élégante" },
      wardrobeProfile: { fabricStyle: "Soie / costume" },
      voiceRegister: "very_formal",
      voiceSentenceLength: "long",
      voiceVocabularyStyle: "raffiné",
      voiceEmotionalLeak: 0.3,
      voiceSarcasmLevel: 0.9,
      voiceFavoriteExpressions: ["Comme c'est intéressant.", "Tout se déroule comme prévu."],
    },
  },
  {
    id: "wise-elder",
    label: "Vieux sage",
    emoji: "🧙",
    description: "Longue barbe, regard pétillant, voix posée.",
    patch: {
      roleType: "Sage / oracle",
      visualProfile: {
        eyeShape: "Tombant",
        eyeSize: "Petits",
        eyebrowStyle: "Broussailleux",
        hairLength: "Long",
        hairTexture: "Ondulé",
        jawline: "Douce",
        silhouetteType: "Courbé",
        perceivedAge: "Vieilli",
        beardPresent: true,
        beardStyle: "Longue / hirsute",
        beardDensity: "Très dense",
        beardColor: "Grise / blanche",
        sideburns: "Reliés à la barbe",
        restingFace: "Souriant naturel",
        typicalGaze: "Joueur",
        habitualPosture: "Mains derrière le dos",
      },
      bodyState: { build: "Mince", posture: "Voûtée" },
      voiceRegister: "formal",
      voiceSentenceLength: "long",
      voiceVocabularyStyle: "métaphorique",
      voiceEmotionalLeak: 0.5,
      voiceSarcasmLevel: 0.4,
    },
  },
  {
    id: "lone-warrior",
    label: "Guerrier solitaire",
    emoji: "🗡️",
    description: "Cicatrice, mâchoire dure, peu de mots.",
    patch: {
      roleType: "Combattant errant",
      visualProfile: {
        eyeShape: "Plissé / méfiant",
        eyeSize: "Moyens",
        eyebrowStyle: "Épais",
        jawline: "Marquée",
        silhouetteType: "Musclé",
        scars: "Cicatrice traversant l'œil droit",
        beardPresent: true,
        beardStyle: "Barbe de 3 jours",
        beardDensity: "Clairsemée",
        mustachePresent: false,
        restingFace: "Sévère",
        typicalGaze: "Perçant",
        habitualPosture: "Une main dans les cheveux",
      },
      bodyState: { build: "Musclé", musculature: "Définie", posture: "Tendue" },
      voiceRegister: "rough",
      voiceSentenceLength: "very_short",
      voiceEmotionalLeak: 0.2,
      voiceAggressionLevel: 0.6,
      voiceSilenceFrequency: 0.7,
    },
  },
  {
    id: "cheerful-genki",
    label: "Genki girl/boy",
    emoji: "🌟",
    description: "Yeux pétillants, cheveux colorés, énergie contagieuse.",
    patch: {
      roleType: "Sidekick énergique",
      visualProfile: {
        eyeShape: "Rond",
        eyeSize: "Très grands (manga)",
        eyebrowStyle: "Fins",
        hairTexture: "Bouclé",
        silhouetteType: "Mince",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "Souriant naturel",
        typicalGaze: "Joueur",
        typicalMimic: "Tire la langue",
        habitualPosture: "Une jambe en arrière",
      },
      bodyState: { build: "Svelte", posture: "Décontractée" },
      voiceRegister: "casual",
      voiceSentenceLength: "short",
      voiceEmotionalLeak: 0.95,
      voiceSarcasmLevel: 0.1,
      voiceFavoriteExpressions: ["Wahou !", "C'est trop génial !"],
      voiceForbiddenExpressions: ["bien sûr"],
    },
  },
  {
    id: "femme-fatale",
    label: "Femme fatale",
    emoji: "🌹",
    description: "Regard envoûtant, démarche assurée, voix grave.",
    patch: {
      roleType: "Espionne / informatrice",
      visualProfile: {
        eyeShape: "Relevé",
        eyeSize: "En amande étirée",
        eyebrowStyle: "Arqués",
        hairLength: "Long",
        silhouetteType: "Élancé",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "Souriant naturel",
        typicalGaze: "Direct",
        typicalMimic: "Sourire en coin",
        habitualPosture: "Adossé nonchalamment",
      },
      bodyState: { build: "Svelte", posture: "Élégante" },
      wardrobeProfile: { fabricStyle: "Soie", exposureLevel: "revealing" },
      voiceRegister: "neutral",
      voiceSentenceLength: "medium",
      voiceVocabularyStyle: "feutré",
      voiceEmotionalLeak: 0.4,
      voiceSarcasmLevel: 0.6,
    },
  },
  {
    id: "rough-mercenary",
    label: "Mercenaire baroudeur",
    emoji: "🪖",
    description: "Barbe négligée, posture lourde, voix éraillée.",
    patch: {
      roleType: "Mercenaire",
      visualProfile: {
        eyeShape: "Tombant",
        eyeSize: "Petits",
        eyebrowStyle: "Broussailleux",
        jawline: "Carrée",
        silhouetteType: "Robuste",
        scars: "Multiples cicatrices visage",
        beardPresent: true,
        beardStyle: "Longue / hirsute",
        beardDensity: "Dense",
        mustachePresent: true,
        mustacheStyle: "Walrus",
        sideburns: "Mutton chops",
        restingFace: "Maussade",
        typicalGaze: "Plissé / méfiant",
        habitualPosture: "Épaules tombantes",
      },
      bodyState: { build: "Massif", musculature: "Très musclée", posture: "Voûtée" },
      voiceRegister: "rough",
      voiceSentenceLength: "short",
      voiceEmotionalLeak: 0.3,
      voiceAggressionLevel: 0.7,
    },
  },
  {
    id: "scholar",
    label: "Érudit / chercheur",
    emoji: "📚",
    description: "Lunettes, dégaine soignée, vocabulaire technique.",
    patch: {
      roleType: "Spécialiste",
      visualProfile: {
        eyeShape: "Amande",
        eyeSize: "Moyens",
        eyebrowStyle: "Droits",
        jawline: "Fine",
        silhouetteType: "Mince",
        beardPresent: false,
        mustachePresent: false,
        accessories: "Lunettes fines, montre gousset",
        restingFace: "Sérieux",
        typicalGaze: "Direct",
        habitualPosture: "Mains derrière le dos",
        signatureGesture: "Ajuste ses lunettes",
      },
      bodyState: { build: "Mince", posture: "Droite" },
      wardrobeProfile: { fabricStyle: "Tweed / costume" },
      voiceRegister: "formal",
      voiceSentenceLength: "long",
      voiceVocabularyStyle: "technique",
      voiceEmotionalLeak: 0.3,
      voiceSarcasmLevel: 0.4,
    },
  },
  {
    id: "tragic-orphan",
    label: "Orphelin·e tragique",
    emoji: "🌧️",
    description: "Air doux, mèche cachant un œil, voix fragile.",
    patch: {
      roleType: "Personnage de soutien",
      visualProfile: {
        eyeShape: "Rond",
        eyeSize: "Grands",
        eyebrowStyle: "Fins",
        hairLength: "Mi-long",
        hairTexture: "Lisse",
        silhouetteType: "Mince",
        beardPresent: false,
        mustachePresent: false,
        restingFace: "Doux / rêveur",
        typicalGaze: "Fuyant",
        typicalMimic: "Lèvre mordue",
        habitualPosture: "Épaules tombantes",
      },
      bodyState: { build: "Mince", posture: "Voûtée" },
      voiceRegister: "casual",
      voiceSentenceLength: "short",
      voiceEmotionalLeak: 0.9,
      voiceSilenceFrequency: 0.7,
      voiceFavoriteExpressions: ["Pardon...", "Je vais bien."],
    },
  },
];

interface CharacterArchetypePresetsProps {
  /** Appliquer le preset = merger ses champs sur le character courant. */
  onApply: (patch: ArchetypePresetPatch) => void;
}

export function CharacterArchetypePresets({ onApply }: CharacterArchetypePresetsProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/10 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-sm font-semibold text-violet-300"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Presets archétypes manga
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Pré-remplit visage, corps, voix d&apos;un seul clic. Tu pourras affiner ensuite chaque champ.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ARCHETYPE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onApply(preset.patch)}
                className="flex h-auto flex-col items-start gap-1 px-3 py-2 text-left whitespace-normal"
                title={preset.description}
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <span aria-hidden>{preset.emoji}</span>
                  {preset.label}
                </span>
                <span className="text-[10px] text-muted-foreground line-clamp-2">{preset.description}</span>
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
