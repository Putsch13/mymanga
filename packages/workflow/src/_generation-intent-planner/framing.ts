import type { FramingCategory, PanelIntentType } from "./types";

export function resolveFramingCategory(
  intentType: PanelIntentType,
  shotType: string,
): FramingCategory {
  if (intentType === "prop_insert" || intentType === "symbolic_insert") return "insert";
  if (intentType === "environment_establishing") return "establishing";
  if (intentType === "environment_transition") return "wide";

  switch (shotType) {
    case "extreme_closeup":
    case "closeup":
      return "closeup";
    case "wide":
      return "wide";
    case "over_shoulder":
      return "over_shoulder";
    default:
      return "medium";
  }
}
