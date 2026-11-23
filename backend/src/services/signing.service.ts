/**
 * Public, token-based document page (S-2). No login: the token in the link is the credential.
 *
 * Signatures are handwritten on paper. The public link only DELIVERS the document; nothing on it can set a
 * document to "signed" — only the coordinator's paper-signature action (with the uploaded scan) can.
 *
 *  view()    GET  /api/sign/:token          document info; first open moves sent -> viewed
 *  pdf()     GET  /api/sign/:token/pdf      the document PDF (with the ☐ box to sign next to)
 *  decline() POST /api/sign/:token/decline
 *
 * The link lifetime (SIGN_LINK_TTL_DAYS, default 14) is the deadline to hand in the signed paper document.
 *
 * Token states:
 *  - unknown hash                         -> 404 INVALID_TOKEN
 *  - revoked (replaced by a newer link)   -> 410 TOKEN_REVOKED (unless the document is signed/declined)
 *  - past the deadline                    -> view/pdf still work (the page shows "deadline passed");
 *                                            the document is marked expired if it was still waiting;
 *                                            decline -> 410 TOKEN_EXPIRED
 *  - document signed/declined             -> view/pdf still work (read-only); decline -> 409
 */
import type { Deps } from '../deps';
import { conflict, gone, notFound } from '../lib/errors';
import type { AuditService } from './audit.service';
import type { SignLinksService } from './sign-links.service';

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
   * Resolve a token.
   *  - 'read'   (view, pdf): works for final documents and after the deadline.
   *  - 'decline': only while the document is waiting and the deadline has not passed.
   */
  private async resolve(token: string, mode: 'read' | 'decline') {
    const req = await this.links.findByToken(token);
    if (!req) throw notFound('Signing link');
    let doc = req.document;
    const isFinal = doc.status === 'signed' || doc.status === 'declined';
    if (isFinal && mode === 'read') return { req, doc };
    if (isFinal) throw conflict(doc.status === 'signed' ? 'ALREADY_SIGNED' : 'ALREADY_DECLINED', `Document is already ${doc.status}`);
    if (req.revokedAt) throw gone('TOKEN_REVOKED', 'This link has been replaced by a newer one');

    if (req.expiresAt <= this.d.clock.now()) {
      // Only mark expired if no other link is still valid (same rule as the scheduled job).
      if ((doc.status === 'sent' || doc.status === 'viewed') && !(await this.links.activeRequest(doc.id))) {
        doc = { ...doc, ...(await this.d.prisma.document.update({ where: { id: doc.id }, data: { status: 'expired' } })) };
        await this.audit.log(null, 'document.expired', 'Document', doc.id, {});
      }
      if (mode === 'decline') throw gone('TOKEN_EXPIRED', 'The deadline for this document has passed');
    }
    if (mode === 'decline' && doc.status === 'expired') throw gone('TOKEN_EXPIRED', 'The deadline for this document has passed');
    return { req, doc };
  }

  async view(token: string, client: ClientInfo) {
    const { req, doc: resolved } = await this.resolve(token, 'read');
    let doc = resolved;
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
    const { doc } = await this.resolve(token, 'read');
    return { buffer: await this.d.storage.get(doc.pdfPath), fileName: `${doc.number}.pdf` };
  }

  async decline(token: string, reason: string | undefined, client: ClientInfo) {
    const { req } = await this.resolve(token, 'decline');
    const now = this.d.clock.now();
    await this.d.prisma.$transaction([
      this.d.prisma.document.update({ where: { id: req.documentId }, data: { status: 'declined', declinedAt: now, declineReason: reason ?? null } }),
      this.d.prisma.signatureRequest.updateMany({ where: { documentId: req.documentId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await this.audit.log(null, 'document.declined', 'Document', req.documentId, { reason, ip: client.ip, userAgent: client.userAgent });
    return { status: 'declined' as const };
  }
}
