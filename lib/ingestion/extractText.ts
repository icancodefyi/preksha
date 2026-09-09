// Text-layer extraction only (typed PDF/plain text). Scanned/handwritten
// FIRs need OCR (Tesseract per docs Phase 14), deliberately out of scope for
// this pass — see Phase 12.1: narrow live demo, not the full pipeline.
export async function extractText(buf: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    const result = await parser.getText();
    if (!result.text.trim()) {
      throw new Error("PDF has no extractable text layer (scanned/handwritten) — OCR not implemented yet");
    }
    return result.text;
  }
  if (lower.endsWith(".txt")) return buf.toString("utf-8");
  throw new Error(`Unsupported FIR file type for "${filename}" — upload .pdf (with text layer) or .txt`);
}
