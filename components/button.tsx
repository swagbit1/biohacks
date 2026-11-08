import {cva, type VariantProps} from 'class-variance-authority';
import {clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';
import type {ComponentProps} from 'react';
import {
  ArrowDownToLine, ArrowRight, AudioLines, BookHeart, Delete, Play, Pause, CalendarDays, Camera, Check, ChevronRight,
  CircleHelp, Clapperboard, FileText, FolderOpen, Heart, Keyboard, Mic, Plus, RotateCcw,
  Save, ShieldCheck, Sparkles, Square, Trash2, UserRound, Video, X,
} from 'lucide-react';

const icons={
  backspace:Delete, play:Play, pause:Pause,
  add:Plus, open:FolderOpen, next:ArrowRight, save:Save, download:ArrowDownToLine,
  record:Mic, video:Video, stop:Square, text:FileText, voice:AudioLines, glide:Keyboard,
  memories:BookHeart, events:CalendarDays, heart:Heart, film:Clapperboard, avatar:UserRound,
  camera:Camera, reset:RotateCcw, delete:Trash2, check:Check, secure:ShieldCheck,
  draft:Sparkles, help:CircleHelp, close:X, choose:ChevronRight,
};

const variants=cva(
  'evervoice-button inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-base font-semibold leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50',
  {
    variants:{variant:{
      default:'bg-[var(--blue)] text-[var(--navy)] hover:bg-[var(--blue-light)]',
      outline:'border border-[var(--border)] bg-[var(--navy-card)] text-[var(--text)] hover:bg-[var(--navy-raised)]',
    }},
    defaultVariants:{variant:'default'},
  },
);

export function Button({className,variant,icon,children,...props}:ComponentProps<'button'> & VariantProps<typeof variants> & {icon?:keyof typeof icons}){
  const Icon=icon&&icons[icon];
  return <button type="button" className={twMerge(clsx(variants({variant}),className))} {...props}>
    {Icon&&<Icon size={20} className="shrink-0" aria-hidden="true"/>}
    {children}
  </button>;
}
