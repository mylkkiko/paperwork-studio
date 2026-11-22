'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  buttonLabel: string;
  emptyLabel: string;
}

/**
 * File picker with translated labels. The native input's own text ("Choose File / No file chosen") is drawn by
 * the browser in the browser's language and cannot be translated, so it is visually hidden (still focusable).
 */
export const FileInput = React.forwardRef<HTMLInputElement, Props>(({ className, buttonLabel, emptyLabel, onChange, ...props }, ref) => {
  const [name, setName] = React.useState('');
  return (
    <label
      className={cn(
        'flex h-10 w-full cursor-pointer items-center gap-3 rounded-md border border-border-strong/70 bg-surface px-2 text-sm shadow-sm hover:border-border-strong focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus has-[[aria-invalid=true]]:border-danger-fg',
        className,
      )}
    >
      <input
        ref={ref}
        type="file"
        className="sr-only"
        onChange={(e) => {
          setName(Array.from(e.target.files ?? []).map((f) => f.name).join(', '));
          onChange?.(e);
        }}
        {...props}
      />
      <span className="shrink-0 rounded bg-surface-muted px-2 py-1 text-xs font-medium">{buttonLabel}</span>
      <span className={cn('truncate', !name && 'text-text-muted')}>{name || emptyLabel}</span>
    </label>
  );
});
FileInput.displayName = 'FileInput';
