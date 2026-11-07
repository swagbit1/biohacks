import {cva, type VariantProps} from 'class-variance-authority';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import type {ComponentProps} from 'react';
const variants = cva('inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50', {
  variants:{variant:{default:'bg-[#d6f09c] text-[#17251f] hover:bg-[#e6f7bf]',outline:'border border-[#769183]/60 hover:bg-white/10'}},
  defaultVariants:{variant:'default'},
});
export function Button({className,variant,...props}:ComponentProps<'button'> & VariantProps<typeof variants>) {
  return <button type="button" className={twMerge(clsx(variants({variant}),className))} {...props}/>;
}
