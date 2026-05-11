import { asRecord, asRecordOrNull } from "./types";

interface PanelImageLike {
  id: string;
  panelNumber: number;
  status: string;
  provider: string | null;
  model: string | null;
  consistencyScore: number | null;
  prompt: string | null;
  metadata: unknown;
  falTraces: Array<{
    id: string;
    status: string;
    mode: string | null;
    provider: string | null;
    model: string | null;
    requestId: string | null;
    jobId: string | null;
    requestPayload: unknown;
    timings: unknown;
    refsUsed: unknown;
    lorasUsed: unknown;
  }>;
}

interface SceneWithImages {
  id: string;
  keyframes: Array<{ id: string; imageUrl: string | null }>;
  images: PanelImageLike[];
}

function buildPromptDebug(meta: Record<string, unknown>) {
  const promptDebug = asRecord(meta.promptDebug);
  return {
    finalPrompt:
      typeof promptDebug.finalPrompt === "string"
        ? promptDebug.finalPrompt.slice(0, 1500)
        : null,
    finalNegativePrompt:
      typeof promptDebug.finalNegativePrompt === "string"
        ? promptDebug.finalNegativePrompt.slice(0, 1000)
        : null,
    promptSource: typeof promptDebug.promptSource === "string" ? promptDebug.promptSource : null,
    usedPacket: promptDebug.usedPacket === true,
    packetVersion: typeof promptDebug.packetVersion === "string" ? promptDebug.packetVersion : null,
    provider: typeof promptDebug.provider === "string" ? promptDebug.provider : null,
    model: typeof promptDebug.model === "string" ? promptDebug.model : null,
    referencePolicy:
      typeof promptDebug.referencePolicy === "string" ? promptDebug.referencePolicy : null,
    width: typeof promptDebug.width === "number" ? promptDebug.width : null,
    height: typeof promptDebug.height === "number" ? promptDebug.height : null,
    refsCount: typeof promptDebug.refsCount === "number" ? promptDebug.refsCount : null,
    lorasCount: typeof promptDebug.lorasCount === "number" ? promptDebug.lorasCount : null,
    seed: typeof promptDebug.seed === "number" ? promptDebug.seed : null,
    origin: typeof promptDebug.origin === "string" ? promptDebug.origin : null,
    requestedAt: typeof promptDebug.requestedAt === "string" ? promptDebug.requestedAt : null,
    retryMode: typeof promptDebug.retryMode === "string" ? promptDebug.retryMode : null,
    retryAttemptIndex:
      typeof promptDebug.retryAttemptIndex === "number" ? promptDebug.retryAttemptIndex : null,
    promptWarnings: Array.isArray(promptDebug.warnings)
      ? (promptDebug.warnings as string[])
      : Array.isArray(promptDebug.promptWarnings)
        ? (promptDebug.promptWarnings as string[])
        : [],
  };
}

function buildCanonicalPacketDebug(canonicalPacket: Record<string, unknown> | null) {
  if (!canonicalPacket) return null;
  return {
    packetVersion:
      typeof canonicalPacket.packetVersion === "string" ? canonicalPacket.packetVersion : null,
    imageIntentType:
      typeof canonicalPacket.imageIntentType === "string"
        ? canonicalPacket.imageIntentType
        : null,
    dominantSubjectKind:
      typeof canonicalPacket.dominantSubjectKind === "string"
        ? canonicalPacket.dominantSubjectKind
        : null,
    heroPresenceMode:
      typeof canonicalPacket.heroPresenceMode === "string"
        ? canonicalPacket.heroPresenceMode
        : null,
    contentRating:
      typeof canonicalPacket.contentRating === "string" ? canonicalPacket.contentRating : null,
    finalEnglishStructuredPrompt:
      typeof canonicalPacket.finalEnglishStructuredPrompt === "string"
        ? (canonicalPacket.finalEnglishStructuredPrompt as string).slice(0, 1500)
        : null,
    negativePromptEnglish:
      typeof canonicalPacket.negativePromptEnglish === "string"
        ? (canonicalPacket.negativePromptEnglish as string).slice(0, 1000)
        : null,
    modelRoutingDecision: asRecordOrNull(canonicalPacket.modelRoutingDecision),
    providerPayload: asRecordOrNull(canonicalPacket.providerPayload),
    buildWarnings: Array.isArray(canonicalPacket.buildWarnings)
      ? (canonicalPacket.buildWarnings as string[])
      : [],
  };
}

function buildTraces(falTraces: PanelImageLike["falTraces"]) {
  return falTraces.map((trace) => ({
    id: trace.id,
    status: trace.status,
    mode: trace.mode,
    provider: trace.provider,
    model: trace.model,
    requestId: trace.requestId,
    jobId: trace.jobId,
    refsUsed: Array.isArray(trace.refsUsed) ? trace.refsUsed : [],
    lorasUsed: Array.isArray(trace.lorasUsed) ? trace.lorasUsed : [],
    timings: asRecordOrNull(trace.timings),
    requestPayload: asRecordOrNull(trace.requestPayload),
  }));
}

export function buildPanelDebug(scenes: SceneWithImages[]) {
  return scenes.flatMap((scene) =>
    scene.images.slice(0, 4).map((image) => {
      const meta = asRecord(image.metadata);
      const validationDetails = asRecord(meta.validationDetails);
      const qualityScores = asRecord(validationDetails.qualityScores);
      const visionAnalysis = asRecord(validationDetails.visionAnalysis);
      const generationLog = asRecord(meta.generationLog);
      const generationDebugSnapshot =
        meta.generationDebugSnapshot && typeof meta.generationDebugSnapshot === "object"
          ? meta.generationDebugSnapshot
          : null;
      const canonicalPacket = asRecordOrNull(meta.canonicalPacket);
      const canonicalPacketValidation = asRecordOrNull(meta.canonicalPacketValidation);
      const packetRerollPlans = Array.isArray(meta.packetRerollPlans)
        ? (meta.packetRerollPlans as Record<string, unknown>[])
        : [];
      const falStrategy = asRecord(meta.falStrategy);
      const activeKeyframe = scene.keyframes[0] ?? null;

      return {
        sceneId: scene.id,
        panelId: image.id,
        panelNumber: image.panelNumber,
        status: image.status,
        provider: image.provider,
        model: image.model,
        keyframeId: activeKeyframe?.id ?? null,
        keyframeImageUrl: activeKeyframe?.imageUrl ?? null,
        workflow:
          typeof generationLog.workflow === "string"
            ? generationLog.workflow
            : typeof falStrategy.workflow === "string"
              ? falStrategy.workflow
              : null,
        prompt: typeof image.prompt === "string" ? image.prompt.slice(0, 700) : null,
        promptDebug: buildPromptDebug(meta),
        generationDebugSnapshot,
        canonicalPacket: buildCanonicalPacketDebug(canonicalPacket),
        canonicalPacketValidation,
        packetRerollPlans: packetRerollPlans.slice(-5),
        referencePolicy:
          typeof generationLog.referencePolicy === "string"
            ? generationLog.referencePolicy
            : typeof falStrategy.referencePolicy === "string"
              ? falStrategy.referencePolicy
              : null,
        panelCategory:
          typeof generationLog.panelCategory === "string"
            ? generationLog.panelCategory
            : typeof falStrategy.panelCategory === "string"
              ? falStrategy.panelCategory
              : null,
        sceneComplexityScore:
          typeof generationLog.sceneComplexityScore === "number"
            ? generationLog.sceneComplexityScore
            : typeof falStrategy.sceneComplexityScore === "number"
              ? falStrategy.sceneComplexityScore
              : null,
        environmentCritical: falStrategy.environmentCritical === true,
        continuityCritical: falStrategy.continuityCritical === true,
        releaseScore:
          typeof qualityScores.releaseScore === "number"
            ? qualityScores.releaseScore
            : (image.consistencyScore ?? null),
        backgroundPresenceScore:
          typeof qualityScores.backgroundPresenceScore === "number"
            ? qualityScores.backgroundPresenceScore
            : null,
        interactionScore:
          typeof qualityScores.interactionScore === "number"
            ? qualityScores.interactionScore
            : null,
        styleConsistencyScore:
          typeof qualityScores.styleConsistencyScore === "number"
            ? qualityScores.styleConsistencyScore
            : null,
        visionScore:
          typeof qualityScores.visionScore === "number" ? qualityScores.visionScore : null,
        visionEnabled: visionAnalysis.enabled === true,
        visionFindings: Array.isArray(visionAnalysis.findings) ? visionAnalysis.findings : [],
        rerollCount: typeof meta.rerollCount === "number" ? meta.rerollCount : 0,
        rerollKind: typeof meta.rerollKind === "string" ? meta.rerollKind : null,
        scenePass: typeof meta.scenePass === "string" ? meta.scenePass : null,
        imageSize: typeof generationLog.imageSize === "string" ? generationLog.imageSize : null,
        issues: Array.isArray(validationDetails.issues) ? validationDetails.issues : [],
        traces: buildTraces(image.falTraces),
      };
    }),
  );
}
