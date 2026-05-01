import type { EnvironmentVisualDna } from "../types/generation-debug-snapshot";

export function nonEmptyArray<T>(value: T[] | null | undefined): T[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

export function nonEmptyEnvironmentDna(
  value: EnvironmentVisualDna | null | undefined,
): EnvironmentVisualDna | undefined {
  if (!value) return undefined;
  const loc = typeof value.locationName === "string" ? value.locationName.trim() : "";
  const anchor = typeof value.anchorId === "string" ? value.anchorId.trim() : "";
  const arrays = [
    value.visualAnchors,
    value.architectureHints,
    value.atmosphere,
    value.propAnchors,
    value.lightingHints,
    value.forbiddenDrift,
  ];
  const hasArrayContent = arrays.some(
    (a) =>
      Array.isArray(a)
      && a.some((x) => typeof x === "string" && x.trim().length > 0),
  );
  if (loc.length > 0 || anchor.length > 0 || hasArrayContent) return value;
  return undefined;
}
