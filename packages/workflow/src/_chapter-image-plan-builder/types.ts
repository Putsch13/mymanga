import type {
  ContentRating,
  HeroPresenceMode,
  ImageIntentType,
} from "@manga-ai-studio/core";

export interface ChapterImagePlanItem {
  imageId: string;
  projectId: string;
  chapterId: string;
  pageIndex: number;
  panelIndex: number;
  beatIndex: number;
  beatType: string;
  beatId: string;

  storyFunction: string;
  imageIntentType: ImageIntentType;
  dominantSubject: string;
  secondarySubjects: string[];
  cutawayType: string | null;

  cameraIntent: string;
  framingIntent: string;

  environmentPriority: number;
  characterPriority: number;
  npcPriority: number;
  propPriority: number;
  groupPriority: number;

  requiredCharacters: string[];
  requiredNpcs: string[];
  requiredProps: string[];
  requiredLocationSignals: string[];
  requiredDialogueLines: string[];
  requiredNarrativeContext: string[];
  continuityAnchors: string[];

  forbiddenFocus: string[];
  forbiddenFraming: string[];
  forbiddenPromptClauses: string[];

  targetLoras: string[];
  targetCanonSources: string[];
  promptLanguage: "en";
  contentRating: ContentRating;
  mangaStyleProfile: string;

  heroPresenceMode: HeroPresenceMode;
  heroVisualWeight: number;
}

export interface ChapterImagePlanBuilderInput {
  projectId: string;
  chapterId: string;
  mangaStyleProfile: string;
  contentRating: ContentRating;
  beats: ChapterBeatPlanInput[];
  totalImageTarget: number;
}

export interface ChapterBeatPlanInput {
  beatId: string;
  beatIndex: number;
  beatType: string;
  beatTitle: string;
  storyFunction: string;
  allocatedImages: number;
  panels: ChapterPanelPlanInput[];
}

export interface ChapterPanelPlanInput {
  pageIndex: number;
  panelIndex: number;
  subjectFocus?: string | null;
  cutawayType?: string | null;
  shotType?: string | null;
  cameraAngle?: string | null;
  mood?: string | null;
  panelCharacterRoles?: string[];
  panelCharacterNames?: string[];
  npcPresence?: string[];
  npcGroupPresence?: string[];
  requiredProps?: string[];
  mustShowLocationSignals?: string[];
  dialogueLines?: string[];
  narrativeContext?: string[];
  beatType?: string | null;
}

export interface ChapterImagePlanValidationResult {
  valid: boolean;
  totalImages: number;
  intentDistribution: Record<string, number>;
  issues: string[];
  warnings: string[];
}
