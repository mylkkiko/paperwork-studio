import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tone badges (tint background + coloured text, ≥5.6:1 in both themes). Status badges add an icon so the status is
 * never shown by colour alone. Phase 3 names map onto tones: default→info, secondary→neutral, destructive→danger.
 */
const badgeVariants = cva('inline-flex max-w-full items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0', {
  variants: {
    variant: {
      neutral: 'bg-neutral-bg text-neutral-fg',
      info: 'bg-info-bg text-info-fg',
      violet: 'bg-violet-bg text-violet-fg',
      success: 'bg-success-bg text-success-fg',
      warning: 'bg-warning-bg text-warning-fg',
      danger: 'bg-danger-bg text-danger-fg',
      default: 'bg-info-bg text-info-fg',
      secondary: 'bg-neutral-bg text-neutral-fg',
      destructive: 'bg-danger-bg text-danger-fg',
      outline: 'border border-border bg-surface text-text',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
export const Badge = ({ className, variant, ...props }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...props} />;
