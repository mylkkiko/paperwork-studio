import { AppShell } from '@/components/app-shell';

/** Every page in this group requires login; AppShell redirects to /login otherwise. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
