-- Paper-only signatures: the uploaded scan is the signed copy; the re-rendered "signed PDF" is gone.
ALTER TABLE "Document" DROP COLUMN "signedPdfPath";
