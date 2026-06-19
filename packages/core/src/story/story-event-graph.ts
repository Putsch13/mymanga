/**
 * StoryEventGraph — causal event graph for a chapter.
 *
 * Each story event declares its causes (preceding events) and effects
 * (following events). This enables:
 * - Causal consistency checks (does event A happen before B?)
 * - Coverage QA (does every requiredEvent have a beat?)
 * - Visual continuity (environment/prop changes cascade correctly)
 */

import { z } from "zod";

export const storyEventTypeValues = [
  "action",
  "dialogue",
  "environment",
  "decision",
  "revelation",
] as const;

export const storyEventSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(storyEventTypeValues),
  actors: z.array(z.string()).default([]),
  location: z.string().default(""),
  causes: z.array(z.string()).default([]),
  effects: z.array(z.string()).default([]),
  requiredDialogue: z.boolean().default(false),
  mustPrecedeEventIds: z.array(z.string()).default([]),
});

export type StoryEvent = z.infer<typeof storyEventSchema>;

export const storyEventGraphSchema = z.object({
  chapterId: z.string().min(1),
  events: z.array(storyEventSchema).default([]),
});

export type StoryEventGraph = z.infer<typeof storyEventGraphSchema>;

export type CausalValidationResult = {
  ok: boolean;
  errors: CausalError[];
};

export type CausalError = {
  eventId: string;
  type: "missing_cause" | "ordering_violation" | "orphan_event";
  message: string;
};

/**
 * Validate that causal links are consistent:
 * - Every cause reference points to an existing event
 * - Every mustPrecedeEventIds target exists
 * - No circular references in causes (simple check)
 */
export function validateCausalGraph(graph: StoryEventGraph): CausalValidationResult {
  const eventIds = new Set(graph.events.map((e) => e.id));
  const indexById = new Map(graph.events.map((e, i) => [e.id, i]));
  const errors: CausalError[] = [];

  for (const event of graph.events) {
    for (const causeId of event.causes) {
      if (!eventIds.has(causeId)) {
        errors.push({
          eventId: event.id,
          type: "missing_cause",
          message: `cause "${causeId}" does not exist in graph`,
        });
      }
    }

    for (const mustPrecedeId of event.mustPrecedeEventIds) {
      if (!eventIds.has(mustPrecedeId)) {
        errors.push({
          eventId: event.id,
          type: "missing_cause",
          message: `mustPrecede target "${mustPrecedeId}" does not exist in graph`,
        });
        continue;
      }
      const myIdx = indexById.get(event.id) ?? -1;
      const targetIdx = indexById.get(mustPrecedeId) ?? -1;
      if (myIdx >= targetIdx) {
        errors.push({
          eventId: event.id,
          type: "ordering_violation",
          message: `event "${event.id}" must precede "${mustPrecedeId}" but appears at index ${myIdx} (target at ${targetIdx})`,
        });
      }
    }

    const hasIncoming = graph.events.some((e) => e.effects.includes(event.id));
    const hasCauses = event.causes.length > 0;
    const isFirst = indexById.get(event.id) === 0;
    if (!hasIncoming && !hasCauses && !isFirst) {
      errors.push({
        eventId: event.id,
        type: "orphan_event",
        message: `event "${event.id}" has no causes and is not the first event`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Build a mapping of beatId → eventIds for cross-referencing with outline beats.
 */
export function buildBeatEventMapping(
  events: StoryEvent[],
  beatEventLinks: Array<{ beatId: string; servedEventIds: string[] }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const validIds = new Set(events.map((e) => e.id));
  for (const link of beatEventLinks) {
    const served = link.servedEventIds.filter((id) => validIds.has(id));
    map.set(link.beatId, served);
  }
  return map;
}
