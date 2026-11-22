import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-md border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg~*]:pl-7', {
  variants: {
    variant: {
      default: 'border-border bg-surface text-text',
      info: 'border-transparent bg-info-bg text-info-fg',
      warning: 'border-transparent bg-warning-bg text-warning-fg',
      destructive: 'border-transparent bg-danger-bg text-danger-fg',
      success: 'border-transparent bg-success-bg text-success-fg',
    },
  },
  defaultVariants: { variant: 'default' },
});

export const Alert = ({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) => (
  <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);
export const AlertTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 className={cn('mb-1 font-semibold leading-none', className)} {...p} />;
export const AlertDescription = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...p} />;
