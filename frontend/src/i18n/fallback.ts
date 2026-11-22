/**
 * What the UI shows for a translation key that doesn't exist in the current language.
 * A visible marker (instead of next-intl's default "namespace.key") makes missing translations easy to spot
 * by people and by the E2E language test, which fails if "⟦missing:" appears on a page.
 */
export const MISSING_MARKER = '⟦missing:';

export function missingMessage({ namespace, key }: { namespace?: string; key: string }) {
  return `${MISSING_MARKER}${[namespace, key].filter(Boolean).join('.')}⟧`;
}

export function reportI18nError(error: { code: string; message: string }) {
  // MISSING_MESSAGE and invalid ICU arguments end up here; the E2E test also watches the console for "[i18n]".
  console.error('[i18n]', error.code, error.message);
}
