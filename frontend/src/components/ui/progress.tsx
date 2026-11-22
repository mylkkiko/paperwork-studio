import { cn } from '@/lib/utils';
export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-3 w-full overflow-hidden rounded-full bg-border', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}
