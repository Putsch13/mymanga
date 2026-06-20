"use client";

/**
 * ChapterInterviewStudio — vue conversationnelle de configuration de chapitre.
 *
 * L'auteur configure ses persos (ailleurs), puis discute ici : l'IA pose des
 * questions ciblées (que se passe-t-il, époque, décors, PNJ, créatures…),
 * compile l'intention en back (POST /interview) et remplit un canevas de
 * config en temps réel. Quand les questions critiques sont traitées, le
 * bouton « Générer » enchaîne estimate → approved-outline (persistance) →
 * launch : l'IA auto-approuve le plan pour rendre le chapitre launch-ready.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { launchChapterGeneration } from "@/lib/studio/launch-chapter-generation";

type QuestionKind =
  | "main_event" | "stakes" | "era" | "location" | "npcs" | "creatures"
  | "props" | "emotional_goal" | "cliffhanger" | "tone";

interface InterviewQuestion {
  id: string;
  kind: QuestionKind;
  severity: "critical" | "recommended" | "optional";
  question: string;
  why: string;
  examples: string[];
}

interface InterviewPlan {
  questions: InterviewQuestion[];
  ready: boolean;
  criticalRemaining: number;
  completion: number;
}

interface Canvas {
  characters: string[];
  era: string;
  setting: string;
  locations: string[];
  npcs: string[];
  creatures: string[];
  props: string[];
  events: string[];
  plotGoal: string;
  emotionalGoal: string;
  tone: string;
  confidenceScore: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SEVERITY_STYLE: Record<InterviewQuestion["severity"], string> = {
  critical: "border-red-500/40 bg-red-500/5",
  recommended: "border-amber-500/40 bg-amber-500/5",
  optional: "border-border bg-muted/30",
};

interface EstimatePreviewBeat {
  id?: string;
  summary?: string;
  characters?: string[];
  location?: string;
  pageRole?: string;
  turn?: string;
  emotionalDelta?: number;
}

/**
 * Construit un `approvedOutline` VALIDE (cf. approvedOutlineSchema) depuis la
 * réponse /estimate. Tous les champs requis sont garantis avec des fallbacks
 * (summary ≥10, location ≥1, turn ≥1…) pour que /approved-outline ne rejette
 * jamais le plan auto-approuvé du flux conversationnel.
 */
function buildApprovedOutlineFromEstimate(estData: unknown): Record<string, unknown> | null {
  if (!estData || typeof estData !== "object") return null;
  const d = estData as Record<string, unknown>;
  const bundle = (d.bundle ?? {}) as Record<string, unknown>;
  const outline = (bundle.outline ?? {}) as Record<string, unknown>;

  // Source des beats, par ordre de préférence : previewBeats → productionOutline.beats
  // → un beat synthétique depuis le chapter_goal. On ne renvoie JAMAIS null tant
  // qu'il y a une intention : le plan canonique côté serveur fera le reste.
  let rawBeats: EstimatePreviewBeat[] = Array.isArray(d.previewBeats)
    ? (d.previewBeats as EstimatePreviewBeat[])
    : [];
  if (rawBeats.length === 0) {
    const po = (d.productionOutline ?? {}) as Record<string, unknown>;
    const poBeats = Array.isArray(po.beats) ? (po.beats as Record<string, unknown>[]) : [];
    rawBeats = poBeats.map((b, i) => ({
      id: typeof b.beatId === "string" ? b.beatId : `beat_${i + 1}`,
      summary: typeof b.summary === "string" ? b.summary : "",
      characters: Array.isArray(b.involvedCharacterLabels) ? (b.involvedCharacterLabels as string[]) : [],
      location: Array.isArray(b.environmentContext) ? String(b.environmentContext[0] ?? "") : "",
      pageRole: typeof b.narrativeFunction === "string" ? b.narrativeFunction : "escalation",
      turn: typeof b.dramaticChange === "string" ? b.dramaticChange : "progression",
      emotionalDelta: 0,
    }));
  }
  if (rawBeats.length === 0) {
    const goal = typeof outline.chapter_goal === "string" ? outline.chapter_goal : "";
    if (goal.trim().length >= 3) {
      rawBeats = [{ id: "beat_1", summary: goal, characters: [], location: "", pageRole: "escalation", turn: "progression", emotionalDelta: 0 }];
    }
  }
  if (rawBeats.length === 0) return null;

  const pad = (s: string, min: number, filler: string) =>
    s.trim().length >= min ? s.trim() : (s.trim() + " " + filler).trim().padEnd(min, ".");

  const fallbackLocation =
    rawBeats.find((b) => (b.location ?? "").trim())?.location?.trim() || "Lieu principal";

  const beats = rawBeats.slice(0, 24).map((b, i) => ({
    id: (b.id && b.id.trim()) || `beat_${i + 1}`,
    summary: pad(b.summary ?? "", 10, "Progression de la scène."),
    characters: Array.isArray(b.characters) ? b.characters.filter((c) => typeof c === "string" && c.trim()) : [],
    location: (b.location && b.location.trim()) || fallbackLocation,
    pageRole: (b.pageRole && b.pageRole.trim()) || "escalation",
    turn: (b.turn && b.turn.trim()) || "progression",
    emotionalDelta: Math.max(-3, Math.min(3, Math.round(Number(b.emotionalDelta ?? 0)) || 0)),
  }));

  const summarySrc = typeof outline.chapter_goal === "string" ? outline.chapter_goal : "";
  const cliffSrc = typeof outline.cliffhanger === "string" ? outline.cliffhanger : "";

  return {
    summary: pad(summarySrc, 10, "Déroulé du chapitre."),
    cliffhanger: pad(cliffSrc, 3, "À suivre."),
    beats,
    approvedAt: new Date().toISOString(),
    approvalVersion: typeof d.previewVersion === "string" && d.previewVersion ? d.previewVersion : `auto_${Date.now()}`,
    source: "estimate_preview",
  };
}

export function ChapterInterviewStudio({
  projectId,
  chapterId,
}: {
  projectId: string;
  chapterId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answeredKinds, setAnsweredKinds] = useState<QuestionKind[]>([]);
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const callInterview = useCallback(
    async (nextMessages: ChatMessage[], nextAnswered: QuestionKind[]) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/chapters/${chapterId}/interview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: nextMessages, answeredKinds: nextAnswered }),
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? `Erreur ${res.status}`);
          return;
        }
        setPlan(data.plan as InterviewPlan);
        setCanvas(data.canvas as Canvas);
        // L'assistant résume sa prochaine fournée de questions.
        const qs = (data.plan as InterviewPlan).questions;
        if (qs.length > 0) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: qs.map((q) => q.question).join("\n") },
          ]);
        } else if ((data.plan as InterviewPlan).ready) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "La configuration est complète. Tu peux générer le chapitre — ou ajouter encore des détails.",
            },
          ]);
        }
      } catch {
        setError("Connexion impossible. Réessaie.");
      } finally {
        setBusy(false);
      }
    },
    [projectId, chapterId],
  );

  // Amorçage : première fournée de questions.
  useEffect(() => {
    void callInterview([], []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    // Les questions actuellement affichées sont considérées traitées par ce tour.
    const nextAnswered = [
      ...new Set([...answeredKinds, ...(plan?.questions.map((q) => q.kind) ?? [])]),
    ];
    setMessages(nextMessages);
    setAnsweredKinds(nextAnswered);
    setInput("");
    void callInterview(nextMessages, nextAnswered);
  }, [input, busy, messages, answeredKinds, plan, callInterview]);

  const handleGenerate = useCallback(async () => {
    setLaunching(true);
    setError(null);
    setLaunchMsg(null);
    try {
      // 1. Estimate : l'IA construit le plan (beats, panels, monde visuel).
      const est = await fetch(`/api/projects/${projectId}/chapters/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      const estData = await est.json().catch(() => null);
      if (!est.ok) {
        setError(`[1/3 ESTIMATE] ${estData?.message ?? estData?.error ?? `échec ${est.status}`}`);
        return;
      }

      // 2. Auto-approbation : on transforme l'estimate en approvedOutline et on
      // le PERSISTE via /approved-outline (chemin testé qui rend le chapitre
      // launch-ready : productionPlan + visualWorldContract + cast). Sans cette
      // étape, le launch premium voit un chapitre "vide" → premium_readiness_blocked.
      const approvedOutline = buildApprovedOutlineFromEstimate(estData);
      if (!approvedOutline) {
        setError(
          "[2/3 PLAN] L'IA n'a pas pu construire un plan exploitable depuis l'estimate "
          + `(previewBeats absents). Décris au moins l'événement + un lieu dans l'interview.`,
        );
        return;
      }
      const approve = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/approved-outline`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvedOutline }),
        },
      );
      if (!approve.ok) {
        const d = await approve.json().catch(() => null);
        setError(`[2/3 PERSIST] ${d?.message ?? d?.error ?? `échec ${approve.status}`}`);
        return;
      }

      // 3. Lancer la génération (pipeline v3). Throw en cas de refus (fail-closed).
      await launchChapterGeneration({ projectId, chapterId });
      setLaunchMsg("Génération lancée ! Suis la progression dans l'onglet de génération.");
    } catch (err) {
      setError(`[3/3 LAUNCH] ${err instanceof Error ? err.message : "lancement impossible"}`);
    } finally {
      setLaunching(false);
    }
  }, [projectId, chapterId]);

  const completionPct = Math.round((plan?.completion ?? 0) * 100);

  return (
    <div className="flex h-full min-h-[600px] gap-4 p-4">
      {/* Colonne chat */}
      <div className="flex flex-1 flex-col rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Studio conversationnel</h2>
          <p className="text-xs text-muted-foreground">
            Réponds à l&apos;IA — elle construit ton chapitre au fur et à mesure.
          </p>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted whitespace-pre-line"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && <div className="text-xs text-muted-foreground">L&apos;IA réfléchit…</div>}
        </div>

        {/* Questions actuelles (sans réponses pré-mâchées : vrai dialogue). */}
        {plan && plan.questions.length > 0 && (
          <div className="space-y-2 border-t px-4 py-3">
            {plan.questions.map((q) => (
              <div key={q.id} className={`rounded-md border p-2 ${SEVERITY_STYLE[q.severity]}`}>
                <p className="text-sm font-medium">{q.question}</p>
                {q.why ? <p className="mt-0.5 text-xs text-muted-foreground">{q.why}</p> : null}
              </div>
            ))}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={launching}
              className="w-full rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {launching ? "L'IA finalise et génère…" : "✨ Je te laisse finir — l'IA complète le reste et génère"}
            </button>
          </div>
        )}

        {error && <p className="px-4 text-xs text-red-500">{error}</p>}
        {launchMsg && <p className="px-4 text-xs text-emerald-500">{launchMsg}</p>}

        <div className="flex gap-2 border-t p-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Écris ta réponse… (Entrée pour envoyer)"
            rows={2}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !input.trim()}
            className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>
      </div>

      {/* Colonne canevas de config */}
      <aside className="flex w-80 flex-col rounded-lg border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Configuration</h2>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{completionPct}% prêt</p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
          <CanvasRow label="Personnages" values={canvas?.characters} empty="Configurés à l'étape Personnages" />
          <CanvasRow label="Époque" values={canvas?.era ? [canvas.era] : []} empty="À préciser" />
          <CanvasRow label="Décor" values={canvas?.setting ? [canvas.setting] : []} empty="À préciser" />
          <CanvasRow label="Lieux" values={canvas?.locations} empty="—" />
          <CanvasRow label="PNJ" values={canvas?.npcs} empty="Aucun" />
          <CanvasRow label="Créatures" values={canvas?.creatures} empty="Aucune" />
          <CanvasRow label="Objets clés" values={canvas?.props} empty="Aucun" />
          <CanvasRow label="Action" values={canvas?.plotGoal ? [canvas.plotGoal] : []} empty="À préciser" />
          <CanvasRow label="Événements" values={canvas?.events} empty="—" />
          <CanvasRow label="Émotion" values={canvas?.emotionalGoal ? [canvas.emotionalGoal] : []} empty="—" />
        </div>

        <div className="border-t p-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!plan?.ready || launching}
            className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {launching ? "Lancement…" : plan?.ready ? "Générer le chapitre" : `Encore ${plan?.criticalRemaining ?? "…"} question(s)`}
          </button>
        </div>
      </aside>
    </div>
  );
}

function CanvasRow({
  label,
  values,
  empty,
}: {
  label: string;
  values: string[] | undefined;
  empty: string;
}) {
  const has = values && values.length > 0;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {has ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {values!.map((v) => (
            <span key={v} className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs">
              {v}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-0.5 text-xs italic text-muted-foreground/70">{empty}</p>
      )}
    </div>
  );
}
