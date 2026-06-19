/**
 * Hook qui appelle `/npc-resolve` pour transformer une description libre
 * en PNJ structuré, puis fusionne le résultat avec :
 *   1. la liste de PNJ persistés (`draft.chapterEntities.npcs`)
 *   2. les PNJ résolus dans la session courante (`resolvedNpcs`).
 */
"use client";

import { useState } from "react";
import type { ChapterStudioData } from "@manga-ai-studio/core";
import type { NpcRow, ResolvedNpc } from "./types";

export interface UseNpcResolverArgs {
  projectId: string;
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}

export function useNpcResolver(args: UseNpcResolverArgs) {
  const { projectId, draft, onUpdateDraft } = args;

  const [npcRawDescription, setNpcRawDescription] = useState("");
  const [resolvingNpc, setResolvingNpc] = useState(false);
  const [npcResolveError, setNpcResolveError] = useState<string | null>(null);
  const [resolvedNpcs, setResolvedNpcs] = useState<ResolvedNpc[]>([]);

  // P0 (mai 2026) — fusionne les PNJ persistés en draft (`chapterEntities.npcs`)
  // avec ceux qu'on vient juste de résoudre dans cette session, pour que la
  // liste affichée survive au refresh et que la suppression cible la bonne source.
  const persistedNpcRows: NpcRow[] = (draft.chapterEntities?.npcs ?? []).map((n) => ({
    source: "draft",
    id: n.id,
    label: n.label,
    promptFragment: n.appearance ?? "",
    narrativeHook: n.narrativeRole ?? "",
    strategy: "draft_persisted",
  }));
  const sessionNpcRows: NpcRow[] = resolvedNpcs
    .filter(
      (r) =>
        !persistedNpcRows.some(
          (p) => p.label.trim().toLowerCase() === r.label.trim().toLowerCase(),
        ),
    )
    .map((r, idx) => ({
      source: "session",
      id: `session_${idx}`,
      label: r.label,
      promptFragment: r.promptFragment,
      narrativeHook: r.narrativeHook,
      strategy: r.strategy,
    }));
  const allNpcRows = [...persistedNpcRows, ...sessionNpcRows];

  function removeNpcRow(row: NpcRow): void {
    if (row.source === "session") {
      setResolvedNpcs((prev) => prev.filter((r) => r.label !== row.label));
      return;
    }
    const remaining = (draft.chapterEntities?.npcs ?? []).filter((n) => n.id !== row.id);
    onUpdateDraft(
      {
        ...draft,
        chapterEntities: {
          npcs: remaining,
          creatures: draft.chapterEntities?.creatures ?? [],
          props: draft.chapterEntities?.props ?? [],
          vehicles: draft.chapterEntities?.vehicles ?? [],
          factions: draft.chapterEntities?.factions ?? [],
        },
      },
      "characters",
    );
  }

  async function resolveNpc(): Promise<void> {
    if (!npcRawDescription.trim() || resolvingNpc) return;
    setResolvingNpc(true);
    setNpcResolveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/npc-resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawDescription: npcRawDescription,
          universe:
            (draft.chapterIntentContract?.understoodPitch ?? "").slice(0, 200) || "manga",
          tone: draft.chapterIntentContract?.tone?.trim() || "dramatic",
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        code?: string;
        topMatch?: {
          label: string;
          visualCues: string[];
          interactionHooks: string[];
        };
        // AUDIT COMMIT 6 — on consomme en priorité `visualPromptFragment` ;
        // `promptFragment` reste en back-compat court-terme.
        visualPromptFragment?: string;
        promptFragment?: string;
        narrativeHook?: string;
        strategy?: string;
      };
      if (!res.ok) {
        const msg =
          typeof data.message === "string" && data.message.trim().length > 0
            ? data.message
            : res.status === 503 || res.status === 502
              ? "La résolution PNJ par IA n'a pas abouti. Réessaie dans un instant ou vérifie la configuration OpenAI."
              : "La résolution PNJ a échoué.";
        setNpcResolveError(msg);
        return;
      }
      if (!data.topMatch) return;
      const resolved: ResolvedNpc = {
        label: data.topMatch.label,
        promptFragment:
          data.visualPromptFragment ??
          data.promptFragment ??
          data.topMatch.visualCues.slice(0, 2).join(", "),
        narrativeHook: data.narrativeHook ?? data.topMatch.interactionHooks[0] ?? "",
        strategy: data.strategy ?? "catalog_match",
      };
      setResolvedNpcs((prev) => [...prev, resolved]);

      // P0 (mai 2026) — persister le PNJ résolu dans le studio draft
      // (`chapterEntities.npcs`) afin qu'il survive au refresh et alimente le
      // VisualWorldContract sans rester en state local.
      const existingNpcs = draft.chapterEntities?.npcs ?? [];
      const npcId = `npc_${Math.random().toString(36).slice(2, 10)}`;
      const nextNpc = {
        id: npcId,
        label: resolved.label,
        narrativeRole: resolved.narrativeHook || null,
        appearance: resolved.promptFragment || null,
        behavior: null,
        panelMoments: [] as string[],
        recurrence: "one_shot" as const,
      };
      const alreadyPresent = existingNpcs.some(
        (n) =>
          (n.label ?? "").trim().toLowerCase() === nextNpc.label.trim().toLowerCase(),
      );
      if (!alreadyPresent) {
        onUpdateDraft(
          {
            ...draft,
            chapterEntities: {
              npcs: [...existingNpcs, nextNpc],
              creatures: draft.chapterEntities?.creatures ?? [],
              props: draft.chapterEntities?.props ?? [],
              vehicles: draft.chapterEntities?.vehicles ?? [],
              factions: draft.chapterEntities?.factions ?? [],
            },
          },
          "characters",
        );
      }

      setNpcRawDescription("");
    } catch {
      setNpcResolveError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setResolvingNpc(false);
    }
  }

  return {
    npcRawDescription,
    setNpcRawDescription,
    resolvingNpc,
    npcResolveError,
    setNpcResolveError,
    resolveNpc,
    allNpcRows,
    removeNpcRow,
  };
}
