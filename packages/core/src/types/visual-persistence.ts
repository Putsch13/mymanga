export type MediaAssetType =
  | "character_ref"
  | "face_crop"
  | "action_ref"
  | "npc_ref"
  | "scene_keyframe"
  | "panel_output"
  | "training_zip"
  | "lora_weights"
  | "lora_config"
  | "trace_payload"
  | "trace_response"
  | "other";

export type FalMode = "text2img" | "img2img" | "lora_training";

export interface MediaAssetDescriptor {
  id: string;
  type: MediaAssetType;
  origin: "user_upload" | "generated" | "fal_upload" | "fal_output" | "derived_crop" | "system";
  storageProvider: string;
  storageKey?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  falCdnUrl?: string | null;
  sha256?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  metadata?: Record<string, unknown>;
}

export interface CharacterVisualLock {
  id: string;
  characterId: string;
  version: number;
  isActive: boolean;
  displayName: string;
  shortVisualCore: string;
  triggerWord?: string | null;
  loraUrl?: string | null;
  canonicalRefUrls: string[];
  defaultOutfit?: string | null;
  altOutfits: string[];
  currentState: Record<string, unknown>;
  injuryState?: Record<string, unknown> | null;
  ageVariant?: string | null;
  faceCloseupRef?: string | null;
  actionRef?: string | null;
}

export interface NpcVisualProfile {
  id: string;
  stableNpcId: string;
  role: string;
  shortVisualCore: string;
  outfitSignature?: string | null;
  silhouetteSignature?: string | null;
  accessoryMarker?: string | null;
  relationToLocation?: string | null;
  importanceLevel: "generic" | "recurring" | "important";
  promotionStatus: "candidate" | "promoted" | "locked";
  appearanceCount: number;
  canonicalRefUrl?: string | null;
}

export interface SceneKeyframe {
  id: string;
  sceneId: string;
  version: number;
  selected: boolean;
  imageUrl?: string | null;
  involvedCharacters: string[];
  environmentLock: Record<string, unknown>;
  lightingLock?: string | null;
  timeOfDay?: string | null;
  compositionArchetype?: string | null;
  emotionalTone?: string | null;
  combatMode: boolean;
  referenceCrops: string[];
}

export interface PanelCharacterPlan {
  panelId: string;
  foregroundCharacters: string[];
  midgroundCharacters: string[];
  backgroundCharacters: string[];
  faceVisibilityExpected: "none" | "partial" | "clear" | "priority";
  actionIntensity: "low" | "medium" | "high";
  speakingPriority: string[];
}

export interface FalTrace {
  id: string;
  provider: string;
  model: string;
  mode: FalMode;
  status: "submitted" | "running" | "completed" | "failed" | "timeout" | "canceled";
  requestId?: string | null;
  jobId?: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  refsUsed: string[];
  lorasUsed: Array<{ url?: string | null; triggerWord?: string | null; scale?: number | null }>;
  timings: Record<string, unknown>;
  error?: Record<string, unknown> | null;
}
