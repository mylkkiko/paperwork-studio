import type { Metadata, Viewport } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { IntlProvider } from '@/components/intl-provider';
import { Providers } from '@/components/providers';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: { default: t('appName'), template: `%s · ${t('appName')}` } };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <IntlProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </IntlProvider>
      </body>
    </html>
  );
}
