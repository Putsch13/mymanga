import { approvedOutlineSchema } from "../types/approved-outline";
import { buildProductionContractFromApprovedOutline } from "../types/chapter-studio-helpers";
import { productionOutlineSchema, type ProductionOutline } from "../types/chapter-studio";

/**
 * Résout un `ProductionOutline` exploitable par le pipeline premium à partir
 * d'enregistrements JSON (plan persisté, outline approuvé).
 *
 * Ordre : `productionPlan.productionOutline` (si présent et valide) →
 * `approvedOutline` déjà au schéma production → `approvedOutline` au schéma
 * approuvé (conversion documentée via {@link buildProductionContractFromApprovedOutline}).
 */
export function resolveProductionOutlineForPremiumPipeline(input: {
  approvedOutlineRaw?: Record<string, unknown> | null;
  productionPlanRaw?: Record<string, unknown> | null;
  chapterSummary?: string | null;
  cliffhangerOverride?: string | null;
}): ProductionOutline | null {
  const planRaw = input.productionPlanRaw;
  if (planRaw && typeof planRaw === "object" && "productionOutline" in planRaw) {
    const embedded = (planRaw as Record<string, unknown>).productionOutline;
    if (embedded != null) {
      const parsed = productionOutlineSchema.safeParse(embedded);
      if (parsed.success) return parsed.data;
    }
  }

  const approvedRaw = input.approvedOutlineRaw;
  if (approvedRaw == null) return null;

  const asProduction = productionOutlineSchema.safeParse(approvedRaw);
  if (asProduction.success) return asProduction.data;

  const asApproved = approvedOutlineSchema.safeParse(approvedRaw);
  if (asApproved.success) {
    const { productionOutline } = buildProductionContractFromApprovedOutline({
      approvedOutline: asApproved.data,
      chapterSummary: input.chapterSummary ?? null,
      cliffhanger: input.cliffhangerOverride ?? null,
    });
    return productionOutline;
  }

  return null;
}
