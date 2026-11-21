/**
 * Everything that touches the inside of a .docx file:
 *  - extractFields: which {{merge.fields}} a template uses
 *  - render: fill a template with values
 *  - extractParagraphs: plain-text paragraphs (for clause splitting / comparison)
 *  - usesAutoNumbering: does the document use Word list numbering (w:numPr)?
 *
 * Fields split across Word runs: when someone edits a template in Word, `{{student.full_name}}` is often stored
 * as several runs, e.g. `{{stu` + `dent.full` + `_name}}` (spell-check, partial formatting). We never regex the
 * XML for tags. docxtemplater's lexer reassembles runs inside a paragraph before parsing, so both extraction
 * and rendering see the complete tag.
 */
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { unprocessable } from '../lib/errors';

const DELIMITERS = { start: '{{', end: '}}' };

/** Flat lookup: the tag "student.full_name" is looked up as one key, not as nested objects. */
type Values = Record<string, string>;

function openZip(buf: Buffer): PizZip {
  try {
    const zip = new PizZip(buf);
    if (!zip.file('word/document.xml')) throw new Error('missing word/document.xml');
    return zip;
  } catch {
    throw unprocessable('INVALID_DOCX', 'The file is not a valid .docx document');
  }
}

/**
 * Compile a template. Syntax errors (unclosed tags, `{{` inside `{{`) become a 422 with the tag and context,
 * so the editor can find the broken spot in Word.
 */
function compile(buf: Buffer, onTag?: (tag: string) => void): Docxtemplater {
  const zip = openZip(buf);
  try {
    return new Docxtemplater(zip, {
      delimiters: DELIMITERS,
      paragraphLoop: true,
      linebreaks: true,
      errorLogging: false,
      // Empty string for missing values; the precheck step is responsible for catching gaps before generation.
      nullGetter: () => '',
      parser: (tag: string) => {
        const key = tag.trim();
        return {
          get: (scope: Values) => {
            onTag?.(key);
            return scope[key];
          },
        };
      },
    });
  } catch (err: unknown) {
    const errors = (err as { properties?: { errors?: { properties: Record<string, unknown> }[] } }).properties?.errors;
    if (errors) {
      throw unprocessable(
        'TEMPLATE_SYNTAX_ERROR',
        'The template contains broken merge fields',
        errors.map((e) => ({ id: e.properties.id, tag: e.properties.xtag, context: e.properties.context, explanation: e.properties.explanation })),
      );
    }
    throw err;
  }
}

/**
 * Returns all merge-field keys in document order (unique).
 * Implementation: a "dry render" with a parser that records every tag it is asked to resolve.
 * (docxtemplater's InspectModule would also work but pulls in lodash; this needs nothing extra.)
 */
export function extractFields(buf: Buffer): string[] {
  const seen = new Set<string>();
  const doc = compile(buf, (key) => seen.add(key));
  doc.render({});
  return [...seen];
}

/** Fill the template. Values must already be formatted strings (see formatters.ts). */
export function render(buf: Buffer, values: Values): Buffer {
  const doc = compile(buf);
  doc.render(values);
  const zip = doc.getZip();
  const xml = zip.file('word/document.xml')!.asText();
  zip.file('word/document.xml', isolateSymbols(xml));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Checkbox glyphs ☐ ☑ are not in the Armenian document font. Left to automatic font fallback, LibreOffice
 * lays the whole line out wrongly (glyph dropped, words overlapping). Verified fix: put each symbol in its own
 * run with an explicit font that has it (DejaVu Sans; Word on Windows substitutes Segoe UI Symbol).
 *
 *   <w:r><w:rPr>X</w:rPr><w:t>☐  Ստորագրություն</w:t></w:r>
 *   ->
 *   <w:r><w:rPr>X</w:rPr><w:t></w:t></w:r>
 *   <w:r><w:rPr>X + rFonts=DejaVu Sans</w:rPr><w:t>☐</w:t></w:r>
 *   <w:r><w:rPr>X</w:rPr><w:t>  Ստորագրություն</w:t></w:r>
 */
const SYMBOL_FONT = 'DejaVu Sans';
const SYMBOLS = /[☐☑]/;

export function isolateSymbols(xml: string): string {
  return xml.replace(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
    if (!SYMBOLS.test(run)) return run;
    const rPr = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    const symbolFonts = `<w:rFonts w:ascii="${SYMBOL_FONT}" w:hAnsi="${SYMBOL_FONT}" w:cs="${SYMBOL_FONT}" w:eastAsia="${SYMBOL_FONT}"/>`;
    const symbolRPr = rPr
      ? rPr.replace(/<w:rFonts[^>]*\/>/, '').replace(/^<w:rPr>(<w:rStyle[^>]*\/>)?/, (_m, style = '') => `<w:rPr>${style}${symbolFonts}`)
      : `<w:rPr>${symbolFonts}</w:rPr>`;
    const open = run.match(/^<w:r(?: [^>]*)?>/)![0];
    // Split every <w:t> that contains a symbol into text / symbol / text runs.
    return run.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, (t, text: string) => {
      if (!SYMBOLS.test(text)) return t;
      return text
        .split(/([☐☑])/)
        .filter((part) => part !== '')
        .map((part) => (SYMBOLS.test(part) ? `</w:r>${open}${symbolRPr}<w:t>${part}</w:t></w:r>${open}${rPr}` : `<w:t xml:space="preserve">${part}</w:t>`))
        .join('');
    });
  });
}

/** True if any paragraph uses Word's automatic list numbering. */
export function usesAutoNumbering(buf: Buffer): boolean {
  const xml = openZip(buf).file('word/document.xml')!.asText();
  return xml.includes('<w:numPr>');
}

export interface Paragraph {
  text: string;
  /** true for Word "Heading 1..3" styled paragraphs */
  heading: boolean;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/**
 * Paragraph texts via mammoth's HTML output (so we know which paragraphs are headings).
 * Inline tags are stripped; empty paragraphs are dropped.
 */
export async function extractParagraphs(buf: Buffer): Promise<Paragraph[]> {
  openZip(buf); // validate first for a clean error
  const { value: html } = await mammoth.convertToHtml({ buffer: buf });
  const out: Paragraph[] = [];
  const blockRe = /<(p|h[1-6]|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  for (const m of html.matchAll(blockRe)) {
    const text = m[2]
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
      .trim();
    if (text) out.push({ text, heading: /^h[1-3]$/.test(m[1]) });
  }
  return out;
}
