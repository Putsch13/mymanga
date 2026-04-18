/**
 * P5.2 — Hook TTS du reader.
 *
 * Encapsule :
 * - l'état courant (`playingTtsId`),
 * - la gestion de l'audio HTMLAudioElement (pause auto si re-trigger),
 * - l'appel `/api/tts` (POST JSON) avec truncation à 500 chars,
 * - le cleanup à l'unmount (pause + revoke du Blob URL).
 *
 * L'API publique est identique à la version inline : `playDialogue`
 * se toggle pour l'id courant, et accepte un `speaker` (mappé côté
 * serveur sur la voix du rôle).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UseReaderTtsResult = {
  playingTtsId: string | null;
  playDialogue: (text: string, speaker?: string | null, id?: string) => Promise<void>;
};

export function useReaderTts(): UseReaderTtsResult {
  const [playingTtsId, setPlayingTtsId] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  const playDialogue = useCallback(
    async (text: string, speaker?: string | null, id?: string) => {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      const ttsId = id ?? text.slice(0, 20);
      if (playingTtsId === ttsId) {
        setPlayingTtsId(null);
        return;
      }
      setPlayingTtsId(ttsId);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 500), roleType: speaker ?? undefined }),
        });
        if (!res.ok) {
          setPlayingTtsId(null);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        audio.onended = () => {
          setPlayingTtsId(null);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setPlayingTtsId(null);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } catch {
        setPlayingTtsId(null);
      }
    },
    [playingTtsId],
  );

  useEffect(() => {
    return () => {
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
    };
  }, []);

  return { playingTtsId, playDialogue };
}
