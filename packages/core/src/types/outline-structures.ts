export type OutlineArcPromise = {
  arcName: string;
  promise: string;
  stage: "setup" | "progression" | "payoff" | "twist";
  priority: "low" | "medium" | "high";
  payoffTarget?: string | null;
};

export type OutlineWorldConsequence = {
  consequenceType: string;
  description: string;
  scope: "local" | "chapter" | "world";
  persistence: "temporary" | "lasting" | "permanent";
  affectedLocations: string[];
  affectedCharacters: string[];
};

export type OutlineSetupPayoffHook = {
  hookId: string;
  label: string;
  kind: "setup" | "foreshadowing" | "echo" | "payoff";
  targetBeatHint?: string | null;
  resolved: boolean;
};

export type StructuredBeatPayload = {
  source: "generator_structured" | "heuristic_fallback";
  confidence: number;
  arcPromises: OutlineArcPromise[];
  worldConsequences: OutlineWorldConsequence[];
  setupPayoffHooks: OutlineSetupPayoffHook[];
};
