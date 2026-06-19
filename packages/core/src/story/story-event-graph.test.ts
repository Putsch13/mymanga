import { describe, it, expect } from "vitest";
import {
  validateCausalGraph,
  buildBeatEventMapping,
  type StoryEventGraph,
  type StoryEvent,
} from "./story-event-graph";

function makeEvent(partial: Partial<StoryEvent> & { id: string }): StoryEvent {
  return {
    label: partial.id,
    type: "action",
    actors: [],
    location: "",
    causes: [],
    effects: [],
    requiredDialogue: false,
    mustPrecedeEventIds: [],
    ...partial,
  };
}

describe("validateCausalGraph", () => {
  it("returns ok for a valid linear graph", () => {
    const graph: StoryEventGraph = {
      chapterId: "ch1",
      events: [
        makeEvent({ id: "e1", effects: ["e2"] }),
        makeEvent({ id: "e2", causes: ["e1"], effects: ["e3"] }),
        makeEvent({ id: "e3", causes: ["e2"] }),
      ],
    };
    const result = validateCausalGraph(graph);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing cause references", () => {
    const graph: StoryEventGraph = {
      chapterId: "ch1",
      events: [
        makeEvent({ id: "e1" }),
        makeEvent({ id: "e2", causes: ["e999"] }),
      ],
    };
    const result = validateCausalGraph(graph);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.type === "missing_cause" && e.eventId === "e2")).toBe(true);
  });

  it("detects ordering violation in mustPrecedeEventIds", () => {
    const graph: StoryEventGraph = {
      chapterId: "ch1",
      events: [
        makeEvent({ id: "e1", mustPrecedeEventIds: ["e2"] }),
        makeEvent({ id: "e2" }),
        makeEvent({ id: "e3", mustPrecedeEventIds: ["e1"] }),
      ],
    };
    const result = validateCausalGraph(graph);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.type === "ordering_violation" && e.eventId === "e3")).toBe(true);
  });

  it("detects orphan events (no causes, not first)", () => {
    const graph: StoryEventGraph = {
      chapterId: "ch1",
      events: [
        makeEvent({ id: "e1" }),
        makeEvent({ id: "e2" }),
      ],
    };
    const result = validateCausalGraph(graph);
    expect(result.errors.some((e) => e.type === "orphan_event" && e.eventId === "e2")).toBe(true);
  });

  it("allows first event without causes", () => {
    const graph: StoryEventGraph = {
      chapterId: "ch1",
      events: [makeEvent({ id: "e1" })],
    };
    expect(validateCausalGraph(graph).ok).toBe(true);
  });
});

describe("buildBeatEventMapping", () => {
  it("maps beats to their served events filtering invalid IDs", () => {
    const events = [makeEvent({ id: "e1" }), makeEvent({ id: "e2" })];
    const links = [
      { beatId: "b1", servedEventIds: ["e1", "e999"] },
      { beatId: "b2", servedEventIds: ["e2"] },
    ];
    const map = buildBeatEventMapping(events, links);
    expect(map.get("b1")).toEqual(["e1"]);
    expect(map.get("b2")).toEqual(["e2"]);
  });
});
