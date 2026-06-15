/**
 * Variant Handler — Color Theme Definitions
 * All Tailwind classes use valid scale steps only (500, 600, etc.)
 */

export interface ColorTheme {
  id: string;
  name: string;
  primaryBg: string;
  secondaryBg: string;
  border: string;
  accentText: string;
  badgeBg: string;
  buttonBg: string;
  inputBg: string;
  cardBg: string;
  iconColor: string;
  isLight?: boolean;
}

export const THEMES: ColorTheme[] = [
  {
    id: 'classic-slate',
    name: 'Slate Dark (Default)',
    primaryBg: 'bg-slate-900',
    secondaryBg: 'bg-slate-950',
    border: 'border-slate-800',
    accentText: 'text-indigo-400',
    badgeBg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
    buttonBg: 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/40',
    inputBg: 'bg-slate-900',
    cardBg: 'bg-slate-950',
    iconColor: 'text-indigo-400',
    isLight: false,
  },
  {
    id: 'light-clean',
    name: 'Slate Light',
    primaryBg: 'bg-slate-50',
    secondaryBg: 'bg-white',
    border: 'border-slate-200',
    accentText: 'text-indigo-600',
    badgeBg: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    buttonBg: 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-200',
    inputBg: 'bg-white',
    cardBg: 'bg-white',
    iconColor: 'text-indigo-600',
    isLight: true,
  },
  {
    id: 'emerald-science',
    name: 'Emerald Dark',
    primaryBg: 'bg-zinc-900',
    secondaryBg: 'bg-zinc-950',
    border: 'border-zinc-800',
    accentText: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/40',
    inputBg: 'bg-zinc-900',
    cardBg: 'bg-zinc-950',
    iconColor: 'text-emerald-400',
    isLight: false,
  },
];
