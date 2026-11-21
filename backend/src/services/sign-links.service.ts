/**
 * Signing links and the emails that carry them.
 *
 * Token handling (S-2):
 *  - The raw token is 32 random bytes (base64url). It exists ONLY in the email link.
 *  - The database stores sha256(token). A leaked database therefore does not leak usable links.
 *  - Looking a token up = hashing what the signer sent and finding that hash (unique index).
 *  - Each SignatureRequest has an expiry (SIGN_LINK_TTL_DAYS, default 14).
 *
 * New link vs reminder:
 *  - send()   issues a fresh request with a fresh expiry and REVOKES older links for the document.
 *  - remind() can't re-send the old link (we never stored it), so it issues an extra token with the SAME
 *             expiry as the active request. Older links from earlier emails keep working until that expiry.
 */
import type { Document, SignatureRequest } from '@prisma/client';
import type { Deps } from '../deps';
import { sha256, randomToken } from '../lib/hash';
import { DAY_MS } from '../lib/clock';
import { DEFAULT_LOCALE, t } from '../i18n';
import { formatDateHy } from './formatters';

export type EmailKind = 'signRequest' | 'reminder' | 'newVersion';

export class SignLinksService {
  constructor(private readonly d: Pick<Deps, 'prisma' | 'clock' | 'config' | 'mailer' | 'core'>) {}

  linkFor(token: string) {
    return `${this.d.config.APP_PUBLIC_URL.replace(/\/$/, '')}/sign/${token}`;
  }

  /** The newest request that is not revoked and not expired, or null. */
  async activeRequest(documentId: string): Promise<SignatureRequest | null> {
    return this.d.prisma.signatureRequest.findFirst({
      where: { documentId, revokedAt: null, expiresAt: { gt: this.d.clock.now() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Fresh link with a new expiry; older links for this document stop working. */
  async issueNew(documentId: string) {
    const now = this.d.clock.now();
    await this.d.prisma.signatureRequest.updateMany({ where: { documentId, revokedAt: null }, data: { revokedAt: now } });
    return this.create(documentId, new Date(now.getTime() + this.d.config.SIGN_LINK_TTL_DAYS * DAY_MS));
  }

  /** Extra link with the same expiry as the active request (used by reminders). */
  async issueAdditional(documentId: string, expiresAt: Date) {
    return this.create(documentId, expiresAt);
  }

  private async create(documentId: string, expiresAt: Date) {
    const token = randomToken();
    const request = await this.d.prisma.signatureRequest.create({
      data: { documentId, tokenHash: sha256(token), expiresAt, createdAt: this.d.clock.now() },
    });
    return { token, request };
  }

  /** Find a request by the raw token from the URL. Returns null if unknown. */
  async findByToken(token: string) {
    if (!token || token.length > 200) return null;
    return this.d.prisma.signatureRequest.findUnique({
      where: { tokenHash: sha256(token) },
      include: { document: { include: { templateVersion: { include: { template: true } } } } },
    });
  }

  async email(kind: EmailKind, doc: Document & { templateVersion: { template: { title: string } } }, token: string, expiresAt: Date, summary?: string) {
    if (!doc.recipientEmail) return false;
    const academy = await this.d.core.getAcademy();
    const params = {
      name: doc.recipientName,
      title: doc.templateVersion.template.title,
      number: doc.number,
      link: this.linkFor(token),
      expires: formatDateHy(expiresAt),
      academy: academy.name,
      summary: summary ?? '',
    };
    await this.d.mailer.send({
      to: doc.recipientEmail,
      subject: t(DEFAULT_LOCALE, `email.${kind}.subject`, params),
      text: t(DEFAULT_LOCALE, `email.${kind}.body`, params),
    });
    return true;
  }
}
