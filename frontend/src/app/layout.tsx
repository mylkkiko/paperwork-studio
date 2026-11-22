import type { Metadata, Viewport } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { IntlProvider } from '@/components/intl-provider';
import { Providers } from '@/components/providers';
import { Noto_Sans, Noto_Sans_Armenian } from 'next/font/google';
import './globals.css';

// Same type family for Latin/Cyrillic and Armenian; downloaded at build time and served by the app.
const noto = Noto_Sans({ subsets: ['latin', 'cyrillic'], variable: '--font-noto', display: 'swap' });
const notoArmenian = Noto_Sans_Armenian({ subsets: ['armenian'], variable: '--font-noto-armenian', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: { default: t('appName'), template: `%s · ${t('appName')}` } };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    // suppressHydrationWarning: next-themes adds class="dark" before React hydrates
    <html lang={locale} className={`${noto.variable} ${notoArmenian.variable}`} suppressHydrationWarning>
      <body>
        <IntlProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </IntlProvider>
      </body>
    </html>
  );
}
