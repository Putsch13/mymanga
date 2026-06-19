/**
 * Hook regroupant l'ensemble de l'état du wizard de création de projet.
 *
 * Sépare proprement l'état des composants d'affichage et donne accès à
 * `payload` (utile pour la submission finale).
 */
"use client";

import { useState } from "react";
import type { IntensityKey, RatingKey } from "./constants";

export type AdvancedSliders = {
  violenceLevel: number;
  romanceLevel: number;
  sensualityLevel: number;
  darknessLevel: number;
  mysteryLevel: number;
  dialogueDensity: number;
  canonStrictness: number;
};

export const ADVANCED_SLIDER_DEFAULTS: AdvancedSliders = {
  violenceLevel: 45,
  romanceLevel: 20,
  sensualityLevel: 10,
  darknessLevel: 55,
  mysteryLevel: 50,
  dialogueDensity: 55,
  canonStrictness: 85,
};

export function useWizardState() {
  const [step, setStep] = useState(1);

  const [title, setTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [description, setDescription] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("");
  const [subGenres, setSubGenres] = useState<string[]>([]);

  const [heroName, setHeroName] = useState("");
  const [heroRole, setHeroRole] = useState("");
  const [heroBrief, setHeroBrief] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryRole, setSecondaryRole] = useState("");
  const [secondaryBrief, setSecondaryBrief] = useState("");

  const [era, setEra] = useState("");
  const [theme, setTheme] = useState("");
  const [keyLocations, setKeyLocations] = useState("");

  const [tone, setTone] = useState("");
  const [format, setFormat] = useState("manga");
  const [visualStyle, setVisualStyle] = useState("");
  const [contentRating, setContentRating] = useState<RatingKey>("TEEN");
  const [intensityLayer, setIntensityLayer] = useState<IntensityKey>("TEEN");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const [violenceLevel, setViolenceLevel] = useState(
    ADVANCED_SLIDER_DEFAULTS.violenceLevel,
  );
  const [romanceLevel, setRomanceLevel] = useState(
    ADVANCED_SLIDER_DEFAULTS.romanceLevel,
  );
  const [sensualityLevel, setSensualityLevel] = useState(
    ADVANCED_SLIDER_DEFAULTS.sensualityLevel,
  );
  const [darknessLevel, setDarknessLevel] = useState(
    ADVANCED_SLIDER_DEFAULTS.darknessLevel,
  );
  const [mysteryLevel, setMysteryLevel] = useState(
    ADVANCED_SLIDER_DEFAULTS.mysteryLevel,
  );
  const [dialogueDensity, setDialogueDensity] = useState(
    ADVANCED_SLIDER_DEFAULTS.dialogueDensity,
  );
  const [canonStrictness, setCanonStrictness] = useState(
    ADVANCED_SLIDER_DEFAULTS.canonStrictness,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSubGenre(genre: string) {
    setSubGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  }

  function resetAdvancedSliders() {
    setViolenceLevel(ADVANCED_SLIDER_DEFAULTS.violenceLevel);
    setRomanceLevel(ADVANCED_SLIDER_DEFAULTS.romanceLevel);
    setSensualityLevel(ADVANCED_SLIDER_DEFAULTS.sensualityLevel);
    setDarknessLevel(ADVANCED_SLIDER_DEFAULTS.darknessLevel);
    setMysteryLevel(ADVANCED_SLIDER_DEFAULTS.mysteryLevel);
    setDialogueDensity(ADVANCED_SLIDER_DEFAULTS.dialogueDensity);
    setCanonStrictness(ADVANCED_SLIDER_DEFAULTS.canonStrictness);
  }

  return {
    step,
    setStep,
    title,
    setTitle,
    pitch,
    setPitch,
    description,
    setDescription,
    primaryGenre,
    setPrimaryGenre,
    subGenres,
    setSubGenres,
    toggleSubGenre,
    heroName,
    setHeroName,
    heroRole,
    setHeroRole,
    heroBrief,
    setHeroBrief,
    secondaryName,
    setSecondaryName,
    secondaryRole,
    setSecondaryRole,
    secondaryBrief,
    setSecondaryBrief,
    era,
    setEra,
    theme,
    setTheme,
    keyLocations,
    setKeyLocations,
    tone,
    setTone,
    format,
    setFormat,
    visualStyle,
    setVisualStyle,
    contentRating,
    setContentRating,
    intensityLayer,
    setIntensityLayer,
    showAdvancedSettings,
    setShowAdvancedSettings,
    violenceLevel,
    setViolenceLevel,
    romanceLevel,
    setRomanceLevel,
    sensualityLevel,
    setSensualityLevel,
    darknessLevel,
    setDarknessLevel,
    mysteryLevel,
    setMysteryLevel,
    dialogueDensity,
    setDialogueDensity,
    canonStrictness,
    setCanonStrictness,
    resetAdvancedSliders,
    loading,
    setLoading,
    error,
    setError,
  };
}

export type WizardState = ReturnType<typeof useWizardState>;
