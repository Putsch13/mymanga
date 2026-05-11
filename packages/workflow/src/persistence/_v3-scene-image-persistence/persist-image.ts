import { persistImageIfNeeded, type PersistedImageResult } from "../../pipeline-image-persistence";
import type { PreparedPanelStorageMeta } from "./types";

export interface PanelImagePersistOutcome {
  durableImageUrl: string | null;
  storageMeta: PreparedPanelStorageMeta;
  imagePersisted: boolean;
  imageAlreadyStable: boolean;
  storageFailed: boolean;
}

const EMPTY_STORAGE_META: PreparedPanelStorageMeta = {
  bucket: null,
  storageKey: null,
  mimeType: null,
};

export async function persistPanelImageIfAny(args: {
  providerImageUrl: string | null;
  projectId: string;
  chapterId: string;
  panelId: string;
}): Promise<PanelImagePersistOutcome> {
  const { providerImageUrl, projectId, chapterId, panelId } = args;

  if (!providerImageUrl) {
    return {
      durableImageUrl: null,
      storageMeta: EMPTY_STORAGE_META,
      imagePersisted: false,
      imageAlreadyStable: false,
      storageFailed: false,
    };
  }

  const persistResult: PersistedImageResult = await persistImageIfNeeded({
    imageUrl: providerImageUrl,
    projectId,
    chapterId,
    sceneImageId: panelId,
    logContext: `v3-persist:${panelId}`,
  });

  if (persistResult.ok && persistResult.persisted) {
    return {
      durableImageUrl: persistResult.url,
      storageMeta: {
        bucket: persistResult.bucket,
        storageKey: persistResult.storageKey,
        mimeType: persistResult.mimeType,
      },
      imagePersisted: true,
      imageAlreadyStable: false,
      storageFailed: false,
    };
  }

  if (persistResult.ok && !persistResult.persisted) {
    return {
      durableImageUrl: persistResult.url,
      storageMeta: EMPTY_STORAGE_META,
      imagePersisted: false,
      imageAlreadyStable: true,
      storageFailed: false,
    };
  }

  return {
    durableImageUrl: null,
    storageMeta: EMPTY_STORAGE_META,
    imagePersisted: false,
    imageAlreadyStable: false,
    storageFailed: true,
  };
}
