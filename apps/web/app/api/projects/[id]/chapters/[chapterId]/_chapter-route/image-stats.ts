interface ImageLite {
  status: string;
  imageUrl: string | null;
  userValidatedAt: Date | null;
  retryCount?: number | null;
}

export interface ChapterImageStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  generating: number;
  locked: number;
  retried: number;
}

export function computeImageStats(allImages: ImageLite[]): ChapterImageStats {
  return {
    total: allImages.length,
    completed: allImages.filter((i) => i.status === "completed" && i.imageUrl).length,
    failed: allImages.filter((i) => i.status === "failed" || i.status === "blocked").length,
    pending: allImages.filter((i) => i.status === "planned" || i.status === "pending").length,
    generating: allImages.filter((i) => i.status === "generating").length,
    locked: allImages.filter((i) => i.userValidatedAt != null).length,
    retried: allImages.filter((i) => (i.retryCount ?? 0) > 0).length,
  };
}
