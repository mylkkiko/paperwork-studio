import { cn } from '@/lib/utils';

/** Subtle shimmer (off under prefers-reduced-motion). */
export const Skeleton = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    aria-hidden
    className={cn(
      'rounded-md bg-surface-muted bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--border)_70%,transparent),transparent)] bg-[length:200%_100%] motion-safe:animate-[shimmer_1.4s_ease-in-out_infinite]',
      className,
    )}
    {...p}
  />
);
