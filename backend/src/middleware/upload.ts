import multer from 'multer';
import { badRequest } from '../lib/errors';

/** Files stay in memory (max 15 MB) and are written via StorageService after validation. */
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

/** Check real file signatures ("magic bytes"), not just the extension or the browser's mime type. */
export function detectType(buf: Buffer): 'docx' | 'pdf' | 'png' | 'jpg' | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx'; // zip container
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

export function requireFile(file: Express.Multer.File | undefined, allowed: ('docx' | 'pdf' | 'png' | 'jpg')[]) {
  if (!file) throw badRequest('A file is required (multipart field "file")');
  const type = detectType(file.buffer);
  if (!type || !allowed.includes(type)) throw badRequest(`Unsupported file type; allowed: ${allowed.join(', ')}`);
  if (type === 'docx' && !file.originalname.toLowerCase().endsWith('.docx')) throw badRequest('Template must be a .docx file');
  return { buffer: file.buffer, type };
}
