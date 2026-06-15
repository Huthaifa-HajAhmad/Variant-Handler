import React from 'react';
import { ColorTheme } from '../lib/themes';

interface FooterProps {
  activeTheme: ColorTheme;
  targetSystem: string;
  statusReady: string;
}

export default function Footer({ activeTheme, targetSystem, statusReady }: FooterProps) {
  return (
    <footer className={`${activeTheme.secondaryBg} px-3 py-2 text-[9px] text-slate-500 font-mono border-t ${activeTheme.border} tracking-tight flex justify-between items-center shrink-0 transition-all duration-300`}>
      <span>{targetSystem}</span>
      <span className="text-slate-500">•</span>
      <span className={`font-bold uppercase ${activeTheme.accentText}`}>{statusReady}</span>
    </footer>
  );
}
