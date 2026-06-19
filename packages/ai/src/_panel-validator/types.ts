/**
 * Types partagés du module panel-validator.
 *
 * `GeneratedPanelData` est le contrat d'entrée du validateur : les images
 * générées par le pipeline contractuel sont décrites avec leur prompt, leur
 * `panelContract`, leur `stylePack` et leurs `panelQa` afin de pouvoir vérifier
 * la fidélité visuelle et la conformité narrative.
 */
import type {
  CharacterFingerprint,
  PanelValidationResult,
} from "@manga-ai-studio/core";
import type { SceneBlueprint } from "@manga-ai-studio/world";

export interface GeneratedPanelData {
  panelId: string;
  imageUrl: string;
  requiredCharacters: Array<{
    characterId: string;
    characterName: string;
    fingerprint: CharacterFingerprint;
  }>;
  metadata?: {
    prompt?: string;
    negativePrompt?: string;
    model?: string;
    sceneBlueprint?: SceneBlueprint;
    panelContract?: PanelContract;
    stylePack?: StylePack;
    panelQa?: PanelQa;
  };
}

export interface PanelContract {
  shotType?: string;
  purpose?: string;
  mustShow?: string[];
  backgroundExtras?: string[];
  // Premium contractual fields
  subjectFocus?: string;
  mustShowEnemy?: boolean;
  requiredNpcCount?: number;
  speakerAnchorCharacterId?: string | null;
  dialogueCarrier?: string;
  cutawayType?: string;
  heroCenterAllowed?: boolean;
  requiredPropsTyped?: Array<{
    canonicalName: string;
    mustBeVisible: boolean;
    visibilityMode: string;
    narrativeRole: string;
    category?: string;
  }>;
}

export interface StylePack {
  renderFamily?: string | null;
  lineWeight?: string | null;
  shadingMode?: string | null;
  contrastProfile?: string | null;
  anatomyBias?: string | null;
  backgroundDensity?: string | null;
  cameraLanguage?: string | null;
  negativeConstraints?: string[];
}

export interface PanelQa {
  heroCharacterId?: string | null;
  pageNumber?: number | null;
  panelNumber?: number | null;
  pagePanelCount?: number | null;
  panelCategory?: string | null;
  visualPriority?: string | null;
  characterRoles?: Array<string | null>;
  characterIds?: string[];
  explicitCriticality?: {
    level: "NON_CRITICAL" | "CRITICAL";
    reasons: string[];
  } | null;
}

export type PanelIssue = PanelValidationResult["issues"][number];

export interface QualityScores {
  characterConsistencyScore: number;
  backgroundPresenceScore: number;
  environmentReadabilityScore: number;
  interactionScore: number;
  shotComplianceScore: number;
  styleConsistencyScore: number;
  releaseScore: number;
  visionScore: number | null;
  propComplianceScore?: number;
  subjectFocusScore?: number;
  dialogueAnchorScore?: number;
  enemyPresenceScore?: number;
  populationScore?: number;
  cutawayComplianceScore?: number;
}
