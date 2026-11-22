import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-border-strong/70 bg-surface text-sm text-text shadow-sm transition-colors placeholder:text-text-muted hover:border-border-strong disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted aria-[invalid=true]:border-danger-fg';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, 'h-10 px-3', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-24 px-3 py-2 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/**
 * Native select (accessible, mobile-friendly) with a consistent chevron; follows the theme via color-scheme.
 * `className` styles the select, `wrapperClassName` sizes the wrapper (default: full width).
 */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, ...props }, ref) => (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select ref={ref} className={cn(field, 'h-10 appearance-none truncate pl-3 pr-9', className)} {...props} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
    </div>
  ),
);
Select.displayName = 'Select';
