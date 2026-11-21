export interface PdfConverter {
  /** Convert a .docx buffer to PDF bytes. */
  docxToPdf(docx: Buffer, fileName?: string): Promise<Buffer>;
}
