import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PdfConverter } from '../../src/integrations/pdf/PdfConverter';

/**
 * Fast stand-in for Gotenberg: returns a valid 1-page PDF and remembers every .docx it was given,
 * so tests can inspect exactly what would have been printed (e.g. the ☑ line of a signed copy).
 * Real Armenian rendering is tested separately against Gotenberg (armenian-pdf.test.ts).
 */
export class FakePdfConverter implements PdfConverter {
  calls: { docx: Buffer; fileName: string }[] = [];
  failOn?: (fileName: string) => boolean;

  async docxToPdf(docx: Buffer, fileName = 'document.docx') {
    if (this.failOn?.(fileName)) throw new Error(`fake conversion failure for ${fileName}`);
    this.calls.push({ docx, fileName });
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    page.drawText(`FAKE ${fileName}`, { x: 50, y: 780, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
    return Buffer.from(await pdf.save());
  }
}
