import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SignFlow } from '@/components/sign/sign-flow';

export async function generateMetadata() {
  const t = await getTranslations('sign');
  return { title: t('pageTitle'), robots: { index: false, follow: false } };
}

/** Public signing page — no login. Armenian by default; mobile-first layout. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('common');
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-3 sm:p-6">
      <header className="flex items-center justify-between">
        <span className="font-semibold">{t('appName')}</span>
        <LanguageSwitcher />
      </header>
      <SignFlow token={token} />
    </div>
  );
}
