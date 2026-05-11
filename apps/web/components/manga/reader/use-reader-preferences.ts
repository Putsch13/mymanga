"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Préférences de lecture mémorisées localement (sprint 1).
 *
 * Avant ce hook, l'utilisateur devait reconfigurer son mode (manga/webtoon),
 * sa direction (RTL/LTR) et le mode double-page à CHAQUE ouverture du reader.
 * Désormais, on persiste l'état dans `localStorage` (par projet pour le mode
 * lecture, global pour les autres) et on hydrate après mount pour éviter
 * tout problème de SSR.
 */

export type ReaderMode = "manga" | "webtoon";

const KEY_MODE_PREFIX = "mymanga.reader.mode."; // suffixé par projectId
const KEY_RTL = "mymanga.reader.mangaRtl";
const KEY_SPREAD = "mymanga.reader.spreadMode";

function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota / private mode — ignorer */
  }
}

export interface UseReaderPreferencesInput {
  projectId: string;
  /** Format détecté côté projet ("manga" / "webtoon") — utilisé comme défaut. */
  defaultMode: ReaderMode;
  defaultRtl?: boolean;
  defaultSpread?: boolean;
}

export interface ReaderPreferences {
  readerMode: ReaderMode;
  setReaderMode: (m: ReaderMode) => void;
  mangaRtl: boolean;
  setMangaRtl: (v: boolean) => void;
  spreadMode: boolean;
  setSpreadMode: (v: boolean) => void;
  /** Marque que l'hydratation localStorage est terminée (pour skeleton initial). */
  hydrated: boolean;
}

export function useReaderPreferences({
  projectId,
  defaultMode,
  defaultRtl = true,
  defaultSpread = true,
}: UseReaderPreferencesInput): ReaderPreferences {
  const [readerMode, setReaderModeState] = useState<ReaderMode>(defaultMode);
  const [mangaRtl, setMangaRtlState] = useState<boolean>(defaultRtl);
  const [spreadMode, setSpreadModeState] = useState<boolean>(defaultSpread);
  const [hydrated, setHydrated] = useState(false);
  const lastDefaultModeRef = useRef(defaultMode);

  // Hydrate depuis localStorage une seule fois après mount pour éviter
  // tout mismatch SSR/CSR. Si rien n'est stocké, on garde les défauts.
  useEffect(() => {
    const storedMode = readLocal(`${KEY_MODE_PREFIX}${projectId}`);
    if (storedMode === "manga" || storedMode === "webtoon") {
      setReaderModeState(storedMode);
    }
    const storedRtl = readLocal(KEY_RTL);
    if (storedRtl === "true" || storedRtl === "false") {
      setMangaRtlState(storedRtl === "true");
    }
    const storedSpread = readLocal(KEY_SPREAD);
    if (storedSpread === "true" || storedSpread === "false") {
      setSpreadModeState(storedSpread === "true");
    }
    setHydrated(true);
  }, [projectId]);

  // Si le défaut serveur change (ex. format projet repassé en JSON), on
  // n'écrase JAMAIS le choix utilisateur déjà persisté. On ne se sert du
  // défaut que si rien n'était stocké.
  useEffect(() => {
    if (!hydrated) return;
    if (lastDefaultModeRef.current === defaultMode) return;
    lastDefaultModeRef.current = defaultMode;
    const storedMode = readLocal(`${KEY_MODE_PREFIX}${projectId}`);
    if (!storedMode) {
      setReaderModeState(defaultMode);
    }
  }, [defaultMode, hydrated, projectId]);

  const setReaderMode = useCallback(
    (m: ReaderMode) => {
      setReaderModeState(m);
      writeLocal(`${KEY_MODE_PREFIX}${projectId}`, m);
    },
    [projectId],
  );

  const setMangaRtl = useCallback((v: boolean) => {
    setMangaRtlState(v);
    writeLocal(KEY_RTL, String(v));
  }, []);

  const setSpreadMode = useCallback((v: boolean) => {
    setSpreadModeState(v);
    writeLocal(KEY_SPREAD, String(v));
  }, []);

  return { readerMode, setReaderMode, mangaRtl, setMangaRtl, spreadMode, setSpreadMode, hydrated };
}
