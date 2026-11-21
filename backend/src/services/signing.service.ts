/**
 * Public, token-based signing (S-2). No login: the token in the link is the credential.
 *
 *  view()    GET  /api/sign/:token       document info; first open moves sent -> viewed
 *  pdf()     GET  /api/sign/:token/pdf   the PDF (signed copy after signing)
 *  sign()    POST /api/sign/:token       { agree: true } -> Signature row, ☑ PDF, status signed
 *  decline() POST /api/sign/:token/decline
 *
 * Token states:
 *  - unknown hash          -> 404 INVALID_TOKEN
 *  - past expiresAt        -> 410 TOKEN_EXPIRED (document marked expired if it was still waiting)
 *  - revoked (replaced by a newer link) -> 410 TOKEN_REVOKED
 *  - document signed/declined -> view/pdf still work (read-only receipt); sign/decline -> 409
 *
 * After a successful signature all links of the document are revoked, so a token can sign only once.
 */
import type { Deps } from '../deps';
import { conflict, gone, notFound } from '../lib/errors';
import * as docx from './docx.service';
import type { AuditService } from './audit.service';
import type { SignLinksService } from './sign-links.service';
import { signatureText } from './recipients.service';
import { formatDateTimeHy } from './formatters';

export interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

export class SigningService {
  constructor(
    private readonly d: Deps,
    private readonly audit: AuditService,
    private readonly links: SignLinksService,
  ) {}

  /**
   * Resolve a token. `allowFinal` lets view/pdf show signed/declined documents even though their links are
   * revoked by the signature itself.
   */
  private async resolve(token: string, opts: { allowFinal: boolean }) {
    const req = await this.links.findByToken(token);
    if (!req) throw notFound('Signing link');
    const doc = req.document;
    const isFinal = doc.status === 'signed' || doc.status === 'declined';
    if (isFinal && opts.allowFinal) return req;
    if (isFinal) throw conflict(doc.status === 'signed' ? 'ALREADY_SIGNED' : 'ALREADY_DECLINED', `Document is already ${doc.status}`);
    if (req.expiresAt <= this.d.clock.now()) {
      if (doc.status === 'sent' || doc.status === 'viewed') {
        // Only mark expired if no other link is still valid.
        if (!(await this.links.activeRequest(doc.id))) {
          await this.d.prisma.document.update({ where: { id: doc.id }, data: { status: 'expired' } });
          await this.audit.log(null, 'document.expired', 'Document', doc.id, {});
        }
      }
      throw gone('TOKEN_EXPIRED', 'This signing link has expired');
    }
    if (req.revokedAt) throw gone('TOKEN_REVOKED', 'This signing link has been replaced by a newer one');
    return req;
  }

  async view(token: string, client: ClientInfo) {
    const req = await this.resolve(token, { allowFinal: true });
    let doc = req.document;
    if (doc.status === 'sent') {
      doc = { ...doc, ...(await this.d.prisma.document.update({ where: { id: doc.id }, data: { status: 'viewed', viewedAt: this.d.clock.now() } })) };
      await this.audit.log(null, 'document.viewed', 'Document', doc.id, { ip: client.ip, userAgent: client.userAgent });
    }
    const signature = await this.d.prisma.signature.findFirst({ where: { documentId: doc.id }, orderBy: { signedAt: 'desc' } });
    return {
      documentNumber: doc.number,
      title: req.document.templateVersion.template.title,
      versionNumber: req.document.templateVersion.versionNumber,
      recipientName: doc.recipientName,
      status: doc.status,
      expiresAt: req.expiresAt,
      signedAt: signature?.signedAt ?? null,
      signatureMethod: signature?.method ?? null,
      declinedAt: doc.declinedAt,
    };
  }

  async pdf(token: string) {
    const req = await this.resolve(token, { allowFinal: true });
    const doc = req.document;
    return { buffer: await this.d.storage.get(doc.signedPdfPath ?? doc.pdfPath), fileName: `${doc.number}.pdf` };
  }

  async sign(token: string, client: ClientInfo) {
    const req = await this.resolve(token, { allowFinal: false });
    const doc = req.document;
    const now = this.d.clock.now();

    // Re-render from the SAME template version and the SAME data snapshot, only the checkbox changes to ☑.
    const values = { ...(doc.dataSnapshot as Record<string, string>), 'signature.checkbox': signatureText({ signedAt: formatDateTimeHy(now), method: 'online' }) };
    const filled = docx.render(await this.d.storage.get(doc.templateVersion.filePath), values);
    const signedPdf = await this.d.pdf.docxToPdf(filled, `${doc.number}-signed.docx`);
    const signedPdfPath = `documents/${doc.batchId}/${doc.number}-signed.pdf`;
    await this.d.storage.put(signedPdfPath, signedPdf);

    // The status check inside the transaction guards against two tabs confirming at the same time.
    const signature = await this.d.prisma.$transaction(async (tx) => {
      const updated = await tx.document.updateMany({
        where: { id: doc.id, status: { in: ['sent', 'viewed'] } },
        data: { status: 'signed', signedPdfPath, viewedAt: doc.viewedAt ?? now },
      });
      if (updated.count === 0) throw conflict('ALREADY_SIGNED', 'Document is already signed');
      await tx.signatureRequest.updateMany({ where: { documentId: doc.id, revokedAt: null }, data: { revokedAt: now } });
      return tx.signature.create({
        data: { documentId: doc.id, method: 'online', signerName: doc.recipientName, signedAt: now, ip: client.ip ?? null, userAgent: client.userAgent?.slice(0, 500) ?? null },
      });
    });
    await this.audit.log(null, 'document.signed', 'Document', doc.id, { method: 'online', ip: client.ip, userAgent: client.userAgent, signatureId: signature.id });
    return { status: 'signed' as const, signedAt: signature.signedAt, documentNumber: doc.number };
  }

  async decline(token: string, reason: string | undefined, client: ClientInfo) {
    const req = await this.resolve(token, { allowFinal: false });
    const now = this.d.clock.now();
    await this.d.prisma.$transaction([
      this.d.prisma.document.update({ where: { id: req.documentId }, data: { status: 'declined', declinedAt: now, declineReason: reason ?? null } }),
      this.d.prisma.signatureRequest.updateMany({ where: { documentId: req.documentId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await this.audit.log(null, 'document.declined', 'Document', req.documentId, { reason, ip: client.ip, userAgent: client.userAgent });
    return { status: 'declined' as const };
  }
}
