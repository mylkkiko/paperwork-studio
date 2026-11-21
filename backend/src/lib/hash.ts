import { createHash, randomBytes } from 'node:crypto';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** 32 random bytes, base64url-encoded (43 chars) — used for signing links. */
export const randomToken = () => randomBytes(32).toString('base64url');
