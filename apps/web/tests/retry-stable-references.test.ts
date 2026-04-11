import { describe, expect, it } from "vitest";
import { collectRetryStableReferences } from "@/lib/images/retry-stable-references";

describe("collectRetryStableReferences", () => {
  it("reconstruit des refs stables depuis referenceTrace avant les URLs legacy", () => {
    const refs = collectRetryStableReferences({
      metadata: {
        referenceTrace: {
          requested: [
            {
              assetId: "asset-1",
              storageKey: "projects/demo/ref-1.png",
              sourceType: "media_asset",
              sourceUrl: "https://demo.supabase.co/storage/v1/object/sign/mymanga-images/projects/demo/ref-1.png",
            },
          ],
          used: [],
          ignored: [],
        },
        requestedCanonicalRef: "https://cdn.example.com/canon.png",
      },
      savedReferenceIds: ["https://legacy.example.com/old.png"],
    });

    expect(refs.some((ref) => ref.assetId === "asset-1")).toBe(true);
    expect(refs.some((ref) => ref.storageKey === "projects/demo/ref-1.png")).toBe(true);
    expect(refs.some((ref) => ref.sourceUrl === "https://legacy.example.com/old.png")).toBe(true);
  });

  it("déduplique les refs quand plusieurs sources pointent vers la même image", () => {
    const refs = collectRetryStableReferences({
      metadata: {
        canonRefUsed: "https://cdn.example.com/canon.png",
        requestedCanonicalRef: "https://cdn.example.com/canon.png",
      },
      savedReferenceIds: ["https://cdn.example.com/canon.png"],
    });

    expect(refs).toHaveLength(1);
  });
});
