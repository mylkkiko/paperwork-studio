import { getTranslations } from 'next-intl/server';
import { FileText } from 'lucide-react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignFlow } from '@/components/sign/sign-flow';

export async function generateMetadata() {
  const t = await getTranslations('sign');
  return { title: t('pageTitle'), robots: { index: false, follow: false } };
}

/** Public signing page — no login. Armenian by default; mobile-first; 16px text for comfortable reading. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('common');
  return (
    <div className="min-h-dvh text-base">
      <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-3 sm:px-6">
          <span className="flex items-center gap-2.5 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-fg" aria-hidden>
              <FileText className="h-4 w-4" />
            </span>
            {t('appName')}
          </span>
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-8">
        <SignFlow token={token} />
      </main>
    </div>
  );
}
