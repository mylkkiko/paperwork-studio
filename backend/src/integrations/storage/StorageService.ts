/**
 * File storage boundary. Paths are relative keys like "templates/<id>/v1.docx".
 * Local disk today; an S3 implementation only needs these four methods.
 * Files are NEVER served statically — routes read them after an access check.
 */
export interface StorageService {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}
