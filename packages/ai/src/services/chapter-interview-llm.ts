/**
 * chapter-interview-llm.ts — interviewer IA CONVERSATIONNEL (vrai dialogue).
 *
 * Remplace la checklist déterministe (`planInterviewQuestions`) par un LLM qui
 * LIT toute la conversation et pose les prochaines questions les plus utiles,
 * en s'adaptant à ce que l'auteur vient de dire (vraies relances, pas une liste
 * figée). Il sait s'arrêter quand il a de quoi écrire un chapitre cohérent.
 *
 * Robustesse : renvoie `null` si pas de clé OpenAI ou réponse invalide →
 * l'appelant retombe sur le planificateur déterministe (jamais de blocage).
 */
import OpenAI from "openai";
import type { ChapterIntentContract } from "@manga-ai-studio/core";
import type {
  InterviewPlan,
  InterviewQuestion,
  InterviewQuestionKind,
  InterviewQuestionSeverity,
} from "./chapter-interview-planner";

const VALID_KINDS: InterviewQuestionKind[] = [
  "main_event", "stakes", "era", "location", "npcs",
  "creatures", "props", "emotional_goal", "cliffhanger", "tone",
];
const VALID_SEVERITIES: InterviewQuestionSeverity[] = ["critical", "recommended", "optional"];

export interface InterviewLlmInput {
  messages: { role: "user" | "assistant"; content: string }[];
  contract: ChapterIntentContract;
  knownCharacterNames: string[];
  resolvedNpcNames: string[];
  maxQuestions: number;
}

function coerceQuestion(raw: unknown, index: number): InterviewQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const question = typeof r.question === "string" ? r.question.trim() : "";
  if (question.length < 4) return null;
  const kind = (VALID_KINDS as string[]).includes(String(r.kind))
    ? (r.kind as InterviewQuestionKind)
    : "main_event";
  const severity = (VALID_SEVERITIES as string[]).includes(String(r.severity))
    ? (r.severity as InterviewQuestionSeverity)
    : "recommended";
  const examples = Array.isArray(r.examples)
    ? r.examples.filter((e): e is string => typeof e === "string" && e.trim().length > 0).slice(0, 4)
    : [];
  return {
    id: `llm_q_${index + 1}`,
    kind,
    targetField: "plotGoal",
    severity,
    question,
    why: typeof r.why === "string" ? r.why.trim() : "",
    examples,
  };
}

const SYSTEM_PROMPT = `Tu es un co-créateur de manga qui interviewe l'auteur pour construire UN chapitre, comme un vrai dialogue (pas un questionnaire figé).

RÈGLES :
- Lis TOUTE la conversation. Rebondis sur ce que l'auteur vient de dire (vraies relances : "tu as parlé d'un port — qui le contrôle ?").
- Pose 1 à 3 questions MAX par tour, naturelles, en français, jamais robotiques.
- Ne redemande JAMAIS ce qui est déjà connu (persos, infos déjà données).
- Vise l'essentiel pour un chapitre cohérent : événement principal, enjeu/danger, époque, lieu, PNJ/créatures clés, émotion de fin.
- Tu as un BUDGET de ~10 questions au total sur toute l'interview. Ne noie pas l'auteur.
- Dès que tu as de quoi écrire un chapitre qui tient debout, mets "ready": true et arrête de demander l'accessoire.

Réponds UNIQUEMENT en JSON :
{
  "ready": boolean,
  "questions": [
    { "kind": "main_event|stakes|era|location|npcs|creatures|props|emotional_goal|cliffhanger|tone",
      "severity": "critical|recommended|optional",
      "question": "la question, naturelle",
      "why": "pourquoi tu demandes (court)",
      "examples": ["exemple cliquable 1", "exemple 2"] }
  ]
}
Si ready=true et qu'il ne manque rien d'important, "questions" peut être vide.`;

export async function planInterviewQuestionsLlm(
  input: InterviewLlmInput,
): Promise<InterviewPlan | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model =
    process.env.OPENAI_INTERVIEW_MODEL?.trim()
    || process.env.OPENAI_NARRATIVE_MODEL?.trim()
    || "gpt-4o-mini";

  const known = {
    personnages: input.knownCharacterNames,
    pnj_resolus: input.resolvedNpcNames,
    deja_compris: {
      evenement: input.contract.plotGoal || input.contract.understoodPitch || "",
      epoque: input.contract.era || "",
      lieu: input.contract.setting || "",
      lieux: input.contract.requiredLocations || [],
      pnj: input.contract.requiredNpcs || [],
      creatures: input.contract.requiredCreatures || [],
      props: input.contract.requiredProps || [],
      emotion: input.contract.emotionalGoal || "",
      enjeux: input.contract.mustInclude || [],
    },
  };

  const convo = input.messages
    .map((m) => `${m.role === "user" ? "AUTEUR" : "TOI"}: ${m.content}`)
    .join("\n");

  try {
    const openai = new OpenAI({ apiKey });
    const res = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `CONVERSATION JUSQU'ICI :\n${convo || "(vide — c'est le tout début)"}\n\n`
            + `DÉJÀ CONNU (ne pas redemander) :\n${JSON.stringify(known, null, 2)}\n\n`
            + `Pose au maximum ${input.maxQuestions} question(s) pour ce tour.`,
        },
      ],
    });
    const content = res.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as { ready?: unknown; questions?: unknown };

    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions = rawQuestions
      .map((q, i) => coerceQuestion(q, i))
      .filter((q): q is InterviewQuestion => q !== null)
      .slice(0, input.maxQuestions);

    const ready = parsed.ready === true || questions.length === 0;
    const criticalRemaining = questions.filter((q) => q.severity === "critical").length;
    // Progression heuristique : combien de champs clés sont remplis.
    const filled = [
      known.deja_compris.evenement, known.deja_compris.epoque, known.deja_compris.lieu,
      known.deja_compris.emotion,
    ].filter((s) => typeof s === "string" && s.trim().length > 0).length;
    const arrFilled = [
      known.deja_compris.pnj.length, known.deja_compris.enjeux.length,
    ].filter((n) => n > 0).length;
    const completion = ready ? 1 : Math.min(0.95, (filled + arrFilled) / 6);

    return { questions, ready, criticalRemaining, completion };
  } catch (err) {
    console.error("[interview-llm] failed, fallback to deterministic", err instanceof Error ? err.message : err);
    return null;
  }
}
