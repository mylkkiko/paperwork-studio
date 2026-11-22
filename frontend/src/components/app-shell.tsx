'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, FileText, LayoutDashboard, LogOut, Menu, PenLine, Send, Settings2, Users, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';
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

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

function Brand({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('common');
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 whitespace-nowrap rounded-md font-semibold" aria-label={compact ? t('appName') : undefined}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-fg" aria-hidden>
        <FileText className="h-4 w-4" />
      </span>
      {/* narrow phones: icon only, so the header controls fit */}
      <span className={compact ? 'hidden min-[420px]:inline' : undefined}>{t('appName')}</span>
    </Link>
  );
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
    <nav className="flex flex-col gap-0.5" aria-label={t('nav.main')}>
      {visibleNav(user.role).map(({ href, key, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-muted hover:text-text',
              active && 'bg-accent-soft font-medium text-accent-text hover:bg-accent-soft hover:text-accent-text',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {t(`nav.${key}`)}
          </Link>
        );
      })}
    </nav>
  );

  const signOut = () => {
    logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-dvh md:pl-64">
      {/* Desktop sidebar: navigation only, full height */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 border-r bg-surface px-3 py-4 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        {nav}
      </aside>

      {/* Header: context on the left, settings and account on the right */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-6">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label={t('nav.menu')} aria-expanded={open}>
          <Menu />
        </Button>
        <div className="md:hidden">
          <Brand compact />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher compact />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* accessible name = the visible name and role (WCAG 2.5.3); phones show only the avatar, so it gets a label */}
              <Button variant="ghost" className="h-10 gap-2 px-2" title={t('nav.account')}>
                <span className="sr-only sm:hidden">{`${t('nav.account')}: ${user.name}`}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text" aria-hidden>
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-48 flex-col items-start text-left leading-tight sm:flex">
                  <span className="truncate text-sm font-medium" data-testid="current-user">
                    {user.name}
                  </span>
                  <span className="truncate text-xs text-text-muted">{t(`roles.${user.role}`)}</span>
                </span>
                <ChevronDown className="hidden text-text-muted sm:block" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuLabel className="text-sm text-text">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs font-normal text-text-muted">{user.email}</div>
                <div className="text-xs font-normal text-text-muted">{t(`roles.${user.role}`)}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}>
                <LogOut aria-hidden /> {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Phone navigation: sheet from the left */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <div className="absolute inset-0 bg-overlay animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r bg-surface px-3 py-4 shadow-md animate-fade-in">
            <div className="flex items-center justify-between px-2">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X />
              </Button>
            </div>
            {nav}
            <div className="mt-auto border-t px-2 pt-4">
              <Button variant="secondary" className="w-full" onClick={signOut}>
                <LogOut /> {t('nav.logout')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {isRouteAllowed(pathname, user.role) ? children : <ForbiddenState />}
      </main>
    </div>
  );
}
