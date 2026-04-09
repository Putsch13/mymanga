export type StructuredSceneEvent = {
  eventType: string;
  title: string;
  description: string;
  actorNames?: string[];
  location?: string | null;
  consequences?: string[];
  objectsGained?: string[];
  objectsLost?: string[];
  injuriesApplied?: string[];
  injuriesResolved?: string[];
  relationshipChanges?: string[];
  continuityFlags?: string[];
  irreversible?: boolean;
  importance?: "minor" | "major" | "critical";
};

export type StructuredCharacterDelta = {
  characterName: string;
  location?: string | null;
  emotionalState?: string | null;
  objective?: string | null;
  outfit?: string | null;
  gainedItems?: string[];
  lostItems?: string[];
  injuriesAdded?: string[];
  injuriesHealed?: string[];
  knowledgeGained?: string[];
  obligationsAdded?: string[];
  relationshipChanges?: Array<{
    targetCharacterName: string;
    shift: string;
    intensityDelta?: number;
    note?: string;
  }>;
};

export type StructuredLocationDelta = {
  locationName: string;
  state?: string | null;
  visualAnchorsAdded?: string[];
  propsAdded?: string[];
  propsRemoved?: string[];
  occupantsAdded?: string[];
  occupantsRemoved?: string[];
  tracesAdded?: string[];
  damageAdded?: string[];
  surveillanceAdded?: string[];
  vegetationAdded?: string[];
  narrativeFunction?: string | null;
};

export type StructuredArcDelta = {
  arcName: string;
  status?: string | null;
  progression?: string[];
  tensionDelta?: number;
  openPromisesAdded?: string[];
  paidPromisesAdded?: string[];
  blockersAdded?: string[];
  blockersResolved?: string[];
  currentState?: string | null;
};

export type SceneContinuityPayload = {
  source: "generator_structured" | "heuristic_fallback";
  confidence: number;
  sceneEvents: StructuredSceneEvent[];
  characterDeltas: StructuredCharacterDelta[];
  locationDeltas: StructuredLocationDelta[];
  arcDeltas: StructuredArcDelta[];
};
