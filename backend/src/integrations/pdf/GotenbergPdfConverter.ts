import type { PdfConverter } from './PdfConverter';

/**
 * Gotenberg LibreOffice route: POST /forms/libreoffice/convert with the file as multipart.
 * Fonts: our Gotenberg image bundles Noto Serif/Sans Armenian + DejaVu (for ☐ ☑), see docker/gotenberg.
 */
export class GotenbergPdfConverter implements PdfConverter {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 60_000,
  ) {}

  async docxToPdf(docx: Buffer, fileName = 'document.docx'): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(docx)]), fileName);
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gotenberg conversion failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
