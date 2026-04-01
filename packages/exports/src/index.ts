/** Export PDF / ZIP — implémenter avec @react-pdf ou service externe. */
export async function exportChapterPdfStub(_chapterId: string): Promise<Uint8Array> {
  void _chapterId;
  return new TextEncoder().encode("%PDF stub");
}
