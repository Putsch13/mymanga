export type RecordObj = Record<string, unknown>;

export function asRecord(value: unknown): RecordObj {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as RecordObj;
  }
  return {};
}

export function asRecordOrNull(value: unknown): RecordObj | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as RecordObj;
  }
  return null;
}
