import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Four variants: primary (one per area), secondary, ghost (low emphasis / icon actions), danger (destructive).
 * `default` = primary, `outline` = secondary, `destructive` = danger (names kept from Phase 3), plus `link`.
 * Disabled buttons use muted surface + muted text instead of a faded accent (readable, clearly inactive).
 */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover disabled:bg-surface-muted disabled:text-text-muted disabled:shadow-none',
        secondary: 'border border-border-strong/60 bg-surface text-text shadow-sm hover:bg-surface-muted disabled:text-text-muted disabled:border-border',
        outline: 'border border-border-strong/60 bg-surface text-text shadow-sm hover:bg-surface-muted disabled:text-text-muted disabled:border-border',
        ghost: 'text-text hover:bg-surface-muted disabled:text-text-muted',
        destructive: 'bg-danger-solid text-danger-solid-fg shadow-sm hover:opacity-90 disabled:bg-surface-muted disabled:text-text-muted',
        danger: 'bg-danger-solid text-danger-solid-fg shadow-sm hover:opacity-90 disabled:bg-surface-muted disabled:text-text-muted',
        link: 'text-accent-text underline-offset-4 hover:underline disabled:text-text-muted',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
Button.displayName = 'Button';
export { buttonVariants };
