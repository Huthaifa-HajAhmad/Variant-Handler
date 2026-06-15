import React from 'react';

interface HighlightedCoordinateProps {
  input: string;
  isLight?: boolean;
}

export default function HighlightedCoordinate({ input, isLight }: HighlightedCoordinateProps) {
  const clean = input.trim();
  const transcriptCls = isLight ? 'text-slate-600 font-medium' : 'text-slate-400/90 font-medium';
  const colonCls      = isLight ? 'text-slate-400'             : 'text-slate-500';
  const coordCls      = isLight ? 'text-sky-700 font-bold' : 'text-sky-400 font-bold';
  const refCls        = isLight ? 'text-rose-600 font-bold' : 'text-rose-400 font-bold';
  const gtCls         = isLight ? 'text-slate-400 font-medium' : 'text-slate-500 font-medium';
  const altCls        = isLight ? 'text-emerald-600 font-bold' : 'text-emerald-400 font-bold';
  const protPfxCls    = isLight ? 'text-slate-400 font-medium' : 'text-slate-500 font-medium';
  const protWildCls   = isLight ? 'text-indigo-600 font-semibold' : 'text-indigo-400 font-semibold';
  const protMutCls    = isLight ? 'text-pink-600 font-bold' : 'text-pink-400 font-bold';
  const rawCls        = isLight ? 'text-slate-700 select-text'   : 'text-slate-300 select-text';

  const cdnaMatch = clean.match(/^([A-Z0-9_.]+(?:\.[0-9]+)?)\s*:\s*c\.\s*([0-9]+[-+0-9]*)\s*([ACGTN]+)\s*>\s*([ACGTN]+)/i);
  if (cdnaMatch) {
    const [, transcript, coord, ref, alt] = cdnaMatch;
    return (
      <span className="font-mono text-[11px] inline-flex items-center gap-0.5 tracking-tight break-all select-text">
        <span className={transcriptCls}>{transcript}</span>
        <span className={colonCls}>:c.</span>
        <span className={coordCls}>{coord}</span>
        <span className={refCls}>{ref}</span>
        <span className={gtCls}>&gt;</span>
        <span className={altCls}>{alt}</span>
      </span>
    );
  }

  const genMatch = clean.match(/^(?:Chr)?([0-9]{1,2}|X|Y|MT?)(?:\([^)]+\))?\s*:\s*(?:g\.)?\s*([0-9]+)\s*([ACGTN]+)\s*>\s*([ACGTN]+)/i);
  if (genMatch) {
    const [, chrom, pos, ref, alt] = genMatch;
    return (
      <span className="font-mono text-[11px] inline-flex items-center gap-0.5 tracking-tight break-all select-text">
        <span className={transcriptCls}>chr{chrom}</span>
        <span className={colonCls}>:g.</span>
        <span className={coordCls}>{pos}</span>
        <span className={refCls}>{ref}</span>
        <span className={gtCls}>&gt;</span>
        <span className={altCls}>{alt}</span>
      </span>
    );
  }

  const simpleProt = clean.match(/^p\.\s*([A-Za-z]{3})([0-9]+)([A-Za-z]{3}|\*)/i);
  if (simpleProt) {
    const [, wild, coord, mut] = simpleProt;
    return (
      <span className="font-mono text-[11px] inline-flex items-center gap-0.5 tracking-tight select-text">
        <span className={protPfxCls}>p.</span>
        <span className={protWildCls}>{wild}</span>
        <span className={coordCls}>{coord}</span>
        <span className={protMutCls}>{mut}</span>
      </span>
    );
  }

  const splitColon = clean.split(':');
  if (splitColon.length > 1) {
    return (
      <span className="font-mono text-[11px] tracking-tight select-text">
        <span className={transcriptCls}>{splitColon[0]}</span>
        <span className={colonCls}>:</span>
        <span className={coordCls}>{splitColon.slice(1).join(':')}</span>
      </span>
    );
  }

  return <span className={`font-mono text-[11px] ${rawCls}`}>{clean}</span>;
}
