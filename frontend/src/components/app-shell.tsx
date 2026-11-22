'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, LayoutDashboard, LogOut, Menu, PenLine, Send, Settings2, Users, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from './language-switcher';
import { ForbiddenState, LoadingState } from './states';

interface NavItem {
  href: string;
  key: string;
  icon: typeof FileText;
  visible: (role?: Role) => boolean;
}

/** Navigation shows only what the role can use (the API enforces the same rules). */
export const NAV: NavItem[] = [
  { href: '/dashboard', key: 'dashboard', icon: LayoutDashboard, visible: () => true },
  { href: '/templates', key: 'templates', icon: FileText, visible: () => true },
  { href: '/generate', key: 'generate', icon: PenLine, visible: can.generate },
  { href: '/signatures', key: 'signatures', icon: Send, visible: can.manageSignatures },
  { href: '/admin/users', key: 'users', icon: Users, visible: can.admin },
  { href: '/admin/merge-fields', key: 'mergeFields', icon: Settings2, visible: can.admin },
];

export function visibleNav(role?: Role) {
  return NAV.filter((n) => n.visible(role));
}

/** A page the role may not open directly (by URL): shown as "no access" instead of failing API calls. */
export function isRouteAllowed(pathname: string, role?: Role) {
  const item = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'));
  return !item || item.visible(role);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-md p-10">
        <LoadingState rows={3} />
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-1" aria-label={t('nav.main')}>
      {visibleNav(user.role).map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent', active && 'bg-accent font-medium text-primary')}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(`nav.${key}`)}
          </Link>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="text-sm">
        <div className="font-medium" data-testid="current-user">{user.name}</div>
        <div className="text-xs text-muted-foreground">{t(`roles.${user.role}`)}</div>
      </div>
      <LanguageSwitcher />
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          logout();
          router.replace('/login');
        }}
      >
        <LogOut /> {t('nav.logout')}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <Link href="/dashboard" className="font-semibold">{t('common.appName')}</Link>
        <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={t('nav.menu')} aria-expanded={open}>
          {open ? <X /> : <Menu />}
        </Button>
      </header>
      {open && (
        <div className="border-b bg-background p-4 md:hidden">
          {nav}
          <div className="mt-4">{userBox}</div>
        </div>
      )}
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r bg-background p-4 md:flex">
        <div>
          <Link href="/dashboard" className="mb-6 block px-3 text-lg font-semibold">{t('common.appName')}</Link>
          {nav}
        </div>
        {userBox}
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{isRouteAllowed(pathname, user.role) ? children : <ForbiddenState />}</main>
    </div>
  );
}
