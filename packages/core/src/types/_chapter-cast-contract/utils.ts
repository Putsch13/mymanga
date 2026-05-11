export function uniqueStringIds(
  ids: readonly string[] | null | undefined,
): string[] {
  return [
    ...new Set(
      (ids ?? [])
        .filter((id) => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ];
}
