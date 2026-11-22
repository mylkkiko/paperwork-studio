'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { KeyRound, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import type { Role, User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Select } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, QueryState, useErrorMessage } from '@/components/states';

const ROLES: Role[] = ['admin', 'editor', 'coordinator'];

export default function UsersPage() {
  const t = useTranslations('admin.users');
  const tr = useTranslations('roles');
  const f = useFormat();
  const me = useAuth().user;
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const query = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: User[] }>('/users') });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<User> & { password?: string } }) => api<User>(`/users/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      toast.success(t('saved'));
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus /> {t('create')}
          </Button>
        }
      />
      <QueryState query={query}>
        {({ items }) => (
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>{t('name')}</TH>
                  <TH>{t('email')}</TH>
                  <TH>{t('role')}</TH>
                  <TH>{t('active')}</TH>
                  <TH>{t('created')}</TH>
                  <TH className="text-right">{t('actions')}</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <TR key={u.id}>
                      <TD className="font-medium">
                        {u.name} {self && <Badge variant="secondary">{t('you')}</Badge>}
                      </TD>
                      <TD>{u.email}</TD>
                      <TD>
                        <Select aria-label={t('role')} className="h-9" wrapperClassName="w-44" value={u.role} disabled={self} onChange={(e) => update.mutate({ id: u.id, patch: { role: e.target.value as Role } })}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {tr(r)}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD>
                        <Button size="sm" variant={u.active ? 'outline' : 'secondary'} disabled={self} onClick={() => update.mutate({ id: u.id, patch: { active: !u.active } })}>
                          {u.active ? t('deactivate') : t('activate')}
                        </Button>
                        {!u.active && <Badge variant="destructive" className="ml-2">{t('inactive')}</Badge>}
                      </TD>
                      <TD className="text-text-muted">{f.date(u.createdAt)}</TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setPasswordFor(u)}>
                          <KeyRound /> {t('setPassword')}
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}
      </QueryState>
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <PasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} onSave={(password) => (passwordFor ? update.mutateAsync({ id: passwordFor.id, patch: { password } }) : undefined)} />
    </>
  );
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('admin.users');
  const tr = useTranslations('roles');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const schema = z.object({
    name: z.string().trim().min(1, 'required'),
    email: z.string().email('email'),
    password: z.string().min(8, 'password'),
    role: z.enum(['admin', 'editor', 'coordinator']),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', role: 'coordinator' } });
  const create = useMutation({
    mutationFn: (v: Values) => api<User>('/users', { body: v }),
    onSuccess: () => {
      toast.success(t('createdToast'));
      qc.invalidateQueries({ queryKey: ['users'] });
      close();
    },
  });
  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };
  const err = (name: keyof Values) => form.formState.errors[name]?.message && <p className="text-xs text-danger-fg">{t(`error.${form.formState.errors[name]!.message}`)}</p>;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent closeLabel={tCommon('close')}>
        <DialogHeader>
          <DialogTitle>{t('create')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-name">{t('name')}</Label>
            <Input id="u-name" {...form.register('name')} />
            {err('name')}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-email">{t('email')}</Label>
            <Input id="u-email" type="email" {...form.register('email')} />
            {err('email')}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-password">{t('password')}</Label>
            <Input id="u-password" type="password" autoComplete="new-password" {...form.register('password')} />
            {err('password')}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-role">{t('role')}</Label>
            <Select id="u-role" {...form.register('role')}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(r)}
                </option>
              ))}
            </Select>
          </div>
          {create.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(create.error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {tCommon('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onSave }: { user: User | null; onClose: () => void; onSave: (password: string) => Promise<unknown> | undefined }) {
  const t = useTranslations('admin.users');
  const tCommon = useTranslations('common');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = password.length >= 8;
  const close = () => {
    setPassword('');
    onClose();
  };
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent closeLabel={tCommon('close')}>
        <DialogHeader>
          <DialogTitle>{t('setPasswordFor', { name: user?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">{t('password')}</Label>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {password && !valid && <p className="text-xs text-danger-fg">{t('error.password')}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tCommon('cancel')}
          </Button>
          <Button
            disabled={!valid}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(password);
                close();
              } finally {
                setBusy(false);
              }
            }}
          >
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
