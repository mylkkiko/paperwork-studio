import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tables scroll horizontally inside their card on small screens (the page never scrolls sideways).
 * On phones, cells marked `sticky` stay pinned on the left so the row stays identifiable while scrolling.
 * The header row sticks to the top of the page while scrolling long tables.
 */
export const Table = ({ className, containerClassName, ...p }: React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string }) => (
  // A table that scrolls vertically inside its card (containerClassName with a max height) keeps its header visible.
  <div className={cn('relative w-full overflow-x-auto overscroll-x-contain', containerClassName)}>
    <table className={cn('w-full caption-bottom border-separate border-spacing-0 text-sm', className)} {...p} />
  </div>
);
export const THead = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className={cn('[&_th]:sticky [&_th]:top-0 [&_th]:z-10', className)} {...p} />;
export const TBody = ({ className, ...p }: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className={cn('[&_tr:last-child_td]:border-b-0', className)} {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('group transition-colors duration-100 [&>td]:hover:bg-surface-muted data-[selected=true]:[&>td]:bg-accent-soft', className)} {...p} />
);
export const TH = ({ className, sticky, numeric, ...p }: React.ThHTMLAttributes<HTMLTableCellElement> & { sticky?: boolean; numeric?: boolean }) => (
  <th
    className={cn(
      'h-11 whitespace-nowrap border-b bg-surface-muted px-3 text-left align-middle text-xs font-medium text-text-muted',
      numeric && 'text-right',
      sticky && 'max-sm:sticky max-sm:left-0 max-sm:z-20',
      className,
    )}
    {...p}
  />
);
export const TD = ({ className, sticky, numeric, ...p }: React.TdHTMLAttributes<HTMLTableCellElement> & { sticky?: boolean; numeric?: boolean }) => (
  <td
    className={cn(
      'h-12 border-b bg-surface px-3 py-2 align-middle [overflow-wrap:anywhere]',
      numeric && 'tabular text-right',
      sticky && 'max-sm:sticky max-sm:left-0 max-sm:z-[1]',
      className,
    )}
    {...p}
  />
);
