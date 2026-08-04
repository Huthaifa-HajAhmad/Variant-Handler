/**
 * Variant Handler — UCSC Sequence Resolution & Reference Allele Validation
 *
 * Resolves reference genomic sequence for structural variants/indels and
 * validates user-entered reference alleles against UCSC genome browser assemblies.
 */

import { ParsedVariant, GenomeBuild, hasRealAllele } from '../parser';

const sequenceCache = new Map<string, string>();

export function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    A: 'T', T: 'A', C: 'G', G: 'C',
    a: 't', t: 'a', c: 'g', g: 'c',
    N: 'N', n: 'n'
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}

export async function resolveUcscSequence(
  parsed: ParsedVariant,
  build: GenomeBuild,
  performFetch: (url: string) => Promise<any>
): Promise<{ resolvedPos: number; resolvedRef: string; resolvedAlt: string; resolvedHgvsg: string } | null> {
  if (!parsed.chromosome || !parsed.position) return null;

  const structMatch = parsed.raw.match(/(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i);
  if (!structMatch) return null;

  const changeType = structMatch[1].toLowerCase();
  const seq = (structMatch[2] || '').toUpperCase();

  const pos = parseInt(parsed.position, 10);
  const endPos = parsed.endPosition ? parseInt(parsed.endPosition, 10) : undefined;
  if (isNaN(pos)) return null;

  const db = build === 'GRCh37' ? 'hg19' : 'hg38';
  const endPosComputed = endPos ?? (pos + (changeType === 'del' && seq ? seq.length - 1 : 0));

  let startParam = 0;
  let endParam = 0;

  if (changeType === 'del' || changeType === 'dup' || changeType === 'delins') {
    if (pos <= 1) return null;
    startParam = pos - 2;
    endParam = endPosComputed;
  } else if (changeType === 'ins') {
    startParam = pos - 1;
    endParam = pos;
  } else if (changeType === 'inv') {
    startParam = pos - 1;
    endParam = endPosComputed;
  } else {
    return null;
  }

  const cacheKey = `${db}:${parsed.chromosome}:${startParam}:${endParam}`;
  let dna = sequenceCache.get(cacheKey);

  if (!dna) {
    const ucscUrl = `https://api.genome.ucsc.edu/getData/sequence?genome=${db};chrom=chr${parsed.chromosome};start=${startParam};end=${endParam}`;
    try {
      const response = await performFetch(ucscUrl);
      if (response && typeof response.dna === 'string') {
        dna = response.dna.toUpperCase();
        sequenceCache.set(cacheKey, dna);
      }
    } catch (err) {
      console.warn('[VariantHandler] UCSC Sequence fetch failed:', err);
      return null;
    }
  }

  if (!dna) return null;

  let resolvedPos = pos;
  let resolvedRef = '';
  let resolvedAlt = '';

  if (changeType === 'del') {
    resolvedPos = pos - 1;
    resolvedRef = dna;
    resolvedAlt = dna[0];
  } else if (changeType === 'dup') {
    resolvedPos = pos - 1;
    resolvedRef = dna[0];
    resolvedAlt = dna[0] + dna.substring(1);
  } else if (changeType === 'delins') {
    resolvedPos = pos - 1;
    resolvedRef = dna;
    resolvedAlt = dna[0] + seq;
  } else if (changeType === 'ins') {
    resolvedPos = pos;
    resolvedRef = dna;
    resolvedAlt = dna + seq;
  } else if (changeType === 'inv') {
    resolvedPos = pos;
    resolvedRef = dna;
    resolvedAlt = reverseComplement(dna);
  }

  const resolvedHgvsg = `chr${parsed.chromosome}:g.${resolvedPos}${resolvedRef}>${resolvedAlt}`;
  return { resolvedPos, resolvedRef, resolvedAlt, resolvedHgvsg };
}

export async function validateRefAllele(
  parsed: ParsedVariant,
  build: GenomeBuild,
  performFetch: (url: string) => Promise<any>
): Promise<string | null> {
  if (!parsed.chromosome || !parsed.position || !parsed.ref) return null;
  const pos = parseInt(parsed.position, 10);
  if (isNaN(pos)) return null;

  const db = build === 'GRCh37' ? 'hg19' : 'hg38';
  const refSeq = parsed.ref.toUpperCase();
  if (refSeq === '-' || !hasRealAllele(refSeq)) return null;

  const startParam = pos - 1;
  const endParam = startParam + refSeq.length;

  const cacheKey = `${db}:${parsed.chromosome}:${startParam}:${endParam}`;
  let dna = sequenceCache.get(cacheKey);

  if (!dna) {
    try {
      const url = `https://api.genome.ucsc.edu/getData/sequence?genome=${db}&chrom=chr${parsed.chromosome}&start=${startParam}&end=${endParam}`;
      const res = await performFetch(url);
      if (res && res.dna) {
        dna = res.dna.toUpperCase();
        sequenceCache.set(cacheKey, dna);
      }
    } catch (err) {
      console.warn('[VariantHandler] UCSC sequence validation query failed:', err);
      return null;
    }
  }

  if (dna && dna !== refSeq) {
    const otherBuild = build === 'GRCh37' ? 'GRCh38' : 'GRCh37';
    const otherDb = otherBuild === 'GRCh37' ? 'hg19' : 'hg38';
    const otherCacheKey = `${otherDb}:${parsed.chromosome}:${startParam}:${endParam}`;
    let otherDna = sequenceCache.get(otherCacheKey);

    if (!otherDna) {
      try {
        const otherUrl = `https://api.genome.ucsc.edu/getData/sequence?genome=${otherDb}&chrom=chr${parsed.chromosome}&start=${startParam}&end=${endParam}`;
        const otherRes = await performFetch(otherUrl);
        if (otherRes && otherRes.dna) {
          otherDna = otherRes.dna.toUpperCase();
          sequenceCache.set(otherCacheKey, otherDna);
        }
      } catch (e) {
        // Ignore alternative build validation fetch failures
      }
    }

    if (otherDna === refSeq) {
      return `Reference allele mismatch on ${build}: assembly reference is "${dna}", but input specified "${refSeq}". Note: reference matches "${refSeq}" at this position on ${otherBuild}. Did you select the wrong genome build?`;
    }

    return `Reference allele mismatch: genome reference at chr${parsed.chromosome}:${pos} is "${dna}", but input specified "${refSeq}".`;
  }
  return null;
}
