/**
 * Variant Handler — Enrichment Response Parsers
 *
 * Normalizes raw JSON payload responses from MyVariant.info, ClinVar,
 * dbNSFP, SnpEff, CADD, AlphaMissense, and REVEL into clean EnrichmentData objects.
 */

import { EnrichmentData } from './types';

export const API_BASE = 'https://myvariant.info/v1/variant';

export const FIELDS = [
  'dbsnp.rsid',
  'gnomad_genome.af.af',
  'clinvar.rcv.clinical_significance',
  'clinvar.rcv.review_status',
  'cadd.gene.genename',
  'dbnsfp.genename',
  'snpeff.ann.genename',
  'clinvar.gene',
  'hgvs.genomic',
  'hgvsp',
  'clinvar.hgvs.protein',
  'dbnsfp.hgvsp',
  'snpeff.ann.hgvs_p',
  'evs.hgvs.protein',
  'clinvar.hgvs.coding',
  'dbnsfp.hgvsc',
  'snpeff.ann.hgvs_c',
  'evs.hgvs.coding',
  'evs.gene.accession',
  'cadd.phred',
  'dbnsfp.revel.score',
  'dbnsfp.alphamissense.score',
  'dbnsfp.alphamissense.pred',
  'dbnsfp.uniprot',
  'dbnsfp.mutpred.accession',
].join(',');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCodingChange(data: any): { codingChange?: string; transcript?: string } | undefined {
  if (!data) return undefined;

  const parseHgvscString = (str: any) => {
    if (typeof str !== 'string') return null;
    const parts = str.split(':');
    if (parts.length > 1) {
      const transcript = parts[0];
      const codingChange = parts[1];
      if (codingChange.startsWith('c.')) {
        return { transcript, codingChange };
      }
    } else if (str.startsWith('c.')) {
      return { codingChange: str };
    }
    return null;
  };

  // 1. clinvar.hgvs.coding
  const clinvarCoding = data.clinvar?.hgvs?.coding;
  if (Array.isArray(clinvarCoding)) {
    const nmItem = clinvarCoding.find(item => typeof item === 'string' && item.startsWith('NM_'));
    if (nmItem) {
      const res = parseHgvscString(nmItem);
      if (res) return res;
    }
    for (const item of clinvarCoding) {
      const res = parseHgvscString(item);
      if (res) return res;
    }
  } else if (typeof clinvarCoding === 'string') {
    const res = parseHgvscString(clinvarCoding);
    if (res) return res;
  }

  // 2. snpeff.ann
  const snpeffAnn = data.snpeff?.ann;
  if (Array.isArray(snpeffAnn)) {
    const nmAnn = snpeffAnn.find(ann => typeof ann?.feature_id === 'string' && ann.feature_id.startsWith('NM_'));
    if (nmAnn && typeof nmAnn.hgvs_c === 'string' && nmAnn.hgvs_c.startsWith('c.')) {
      return { transcript: nmAnn.feature_id, codingChange: nmAnn.hgvs_c };
    }
    for (const ann of snpeffAnn) {
      if (ann && typeof ann.hgvs_c === 'string' && ann.hgvs_c.startsWith('c.')) {
        return { transcript: ann.feature_id, codingChange: ann.hgvs_c };
      }
    }
  } else if (snpeffAnn && typeof snpeffAnn === 'object') {
    const ann = snpeffAnn as any;
    if (typeof ann.hgvs_c === 'string' && ann.hgvs_c.startsWith('c.')) {
      return { transcript: ann.feature_id, codingChange: ann.hgvs_c };
    }
  }

  // 3. dbnsfp.hgvsc
  const dbnsfp = data.dbnsfp?.hgvsc;
  if (Array.isArray(dbnsfp)) {
    const found = dbnsfp.find(c => typeof c === 'string' && c.startsWith('c.'));
    if (found) return { codingChange: found };
  } else if (typeof dbnsfp === 'string' && dbnsfp.startsWith('c.')) {
    return { codingChange: dbnsfp };
  }

  // 4. evs.hgvs.coding
  const evsCoding = data.evs?.hgvs?.coding;
  if (typeof evsCoding === 'string' && evsCoding.startsWith('c.')) {
    return { codingChange: evsCoding, transcript: data.evs?.gene?.accession };
  }

  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractProteinChange(data: any): string | undefined {
  if (!data) return undefined;

  const extractFromClinvarString = (str: any): string | null => {
    if (typeof str !== 'string') return null;
    const parts = str.split(':');
    const pPart = parts.length > 1 ? parts[1] : parts[0];
    if (pPart.startsWith('p.')) return pPart;
    return null;
  };

  // 1. Direct hgvsp field
  const direct = data.hgvsp;
  if (Array.isArray(direct)) {
    const found = direct.find(p => typeof p === 'string' && p.startsWith('p.'));
    if (found) return found;
  } else if (typeof direct === 'string' && direct.startsWith('p.')) {
    return direct;
  }

  // 2. clinvar.hgvs.protein
  const clinvarProt = data.clinvar?.hgvs?.protein;
  if (Array.isArray(clinvarProt)) {
    for (const item of clinvarProt) {
      const res = extractFromClinvarString(item);
      if (res) return res;
    }
  } else if (typeof clinvarProt === 'string') {
    const res = extractFromClinvarString(clinvarProt);
    if (res) return res;
  }

  // 3. snpeff.ann
  const snpeffAnn = data.snpeff?.ann;
  if (Array.isArray(snpeffAnn)) {
    for (const ann of snpeffAnn) {
      const p = ann?.hgvs_p;
      if (typeof p === 'string' && p.startsWith('p.')) return p;
    }
  } else if (snpeffAnn && typeof snpeffAnn === 'object') {
    const p = (snpeffAnn as any).hgvs_p;
    if (typeof p === 'string' && p.startsWith('p.')) return p;
  }

  // 4. dbnsfp.hgvsp
  const dbnsfp = data.dbnsfp?.hgvsp;
  if (Array.isArray(dbnsfp)) {
    const threeLetter = dbnsfp.find(p => typeof p === 'string' && /^p\.[A-Z][a-z]{2}\d+[A-Z][a-z]{2}$/i.test(p));
    if (threeLetter) return threeLetter;
    
    const anyP = dbnsfp.find(p => typeof p === 'string' && p.startsWith('p.'));
    if (anyP) return anyP;
  } else if (typeof dbnsfp === 'string' && dbnsfp.startsWith('p.')) {
    return dbnsfp;
  }

  // 5. evs.hgvs.protein
  const evs = data.evs?.hgvs?.protein;
  if (typeof evs === 'string') {
    const cleaned = evs.replace(/[\(\)]/g, '');
    if (cleaned.startsWith('p.')) return cleaned;
  }

  return undefined;
}

export function getReviewStars(review?: string): number {
  if (!review) return 0;
  const r = review.toLowerCase();
  if (r.includes('practice guideline'))                        return 4;
  if (r.includes('expert panel'))                              return 3;
  if (r.includes('criteria provided') && r.includes('conflicting')) return 1;
  if (r.includes('criteria provided'))                         return 2;
  if (r.includes('no assertion') || r.includes('no criteria'))  return 0;
  return 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseApiResponse(data: any, queryKey: string): EnrichmentData {
  // dbSNP rs ID
  const rsId: string | undefined =
    typeof data?.dbsnp?.rsid === 'string'
      ? data.dbsnp.rsid
      : typeof data?.dbsnp?.rsid === 'number'
      ? `rs${data.dbsnp.rsid}`
      : undefined;

  // gnomAD allele frequency (falls back to exomes if genomes is missing)
  const gnomadAf: number | undefined =
    typeof data?.gnomad_genome?.af?.af === 'number'
      ? data.gnomad_genome.af.af
      : typeof data?.gnomad_exome?.af?.af === 'number'
      ? data.gnomad_exome.af.af
      : undefined;

  // gnomAD allele count (falls back to exomes if genomes is missing)
  const gnomadAc: number | undefined =
    typeof data?.gnomad_genome?.ac?.ac === 'number'
      ? data.gnomad_genome.ac.ac
      : typeof data?.gnomad_exome?.ac?.ac === 'number'
      ? data.gnomad_exome.ac.ac
      : undefined;

  // gnomAD allele number (falls back to exomes if genomes is missing)
  const gnomadAn: number | undefined =
    typeof data?.gnomad_genome?.an?.an === 'number'
      ? data.gnomad_genome.an.an
      : typeof data?.gnomad_exome?.an?.an === 'number'
      ? data.gnomad_exome.an.an
      : undefined;

  // CADD PHRED score
  const caddPhred: number | undefined =
    typeof data?.cadd?.phred === 'number'
      ? data.cadd.phred
      : typeof data?.cadd?.phred === 'string'
      ? parseFloat(data.cadd.phred)
      : undefined;

  // REVEL score
  const revelScore: number | undefined =
    typeof data?.dbnsfp?.revel?.score === 'number'
      ? data.dbnsfp.revel.score
      : typeof data?.dbnsfp?.revel?.score === 'string'
      ? parseFloat(data.dbnsfp.revel.score)
      : undefined;

  // AlphaMissense score
  const amScore: number | undefined = (() => {
    const am = data?.dbnsfp?.alphamissense;
    if (!am) return undefined;
    const scoreVal = am.score;
    if (typeof scoreVal === 'number') return scoreVal;
    if (typeof scoreVal === 'string') return parseFloat(scoreVal);
    if (Array.isArray(scoreVal) && scoreVal.length > 0) {
      const uniprotAccs = data?.dbnsfp?.uniprot || data?.dbnsfp?.uniprot_acc || data?.dbnsfp?.mutpred?.accession;
      let canonicalIdx = 0;
      if (Array.isArray(uniprotAccs)) {
        const foundIdx = uniprotAccs.findIndex((u: any) => {
          const acc = typeof u === 'string' ? u : u?.acc || u?.acc_id;
          return typeof acc === 'string' && !acc.includes('-');
        });
        if (foundIdx !== -1 && foundIdx < scoreVal.length) {
          canonicalIdx = foundIdx;
        }
      }
      const parsedVal = typeof scoreVal[canonicalIdx] === 'number' ? scoreVal[canonicalIdx] : parseFloat(scoreVal[canonicalIdx]);
      console.log('[VariantHandler] amScore resolved:', {
        uniprot: uniprotAccs,
        score: scoreVal,
        canonicalIdx,
        result: parsedVal
      });
      return isNaN(parsedVal) ? undefined : parsedVal;
    }
    return undefined;
  })();

  const amPred: string | undefined = (() => {
    const am = data?.dbnsfp?.alphamissense;
    if (!am) return undefined;
    const predVal = am.pred;
    if (typeof predVal === 'string') return predVal;
    if (Array.isArray(predVal) && predVal.length > 0) {
      const uniprotAccs = data?.dbnsfp?.uniprot || data?.dbnsfp?.uniprot_acc || data?.dbnsfp?.mutpred?.accession;
      let canonicalIdx = 0;
      if (Array.isArray(uniprotAccs)) {
        const foundIdx = uniprotAccs.findIndex((u: any) => {
          const acc = typeof u === 'string' ? u : u?.acc || u?.acc_id;
          return typeof acc === 'string' && !acc.includes('-');
        });
        if (foundIdx !== -1 && foundIdx < predVal.length) {
          canonicalIdx = foundIdx;
        }
      }
      return String(predVal[canonicalIdx]);
    }
    return undefined;
  })();

  // ClinVar (may be array of RCV entries — sort by star status first)
  const rcv = Array.isArray(data?.clinvar?.rcv)
    ? [...data.clinvar.rcv].sort((a: any, b: any) => getReviewStars(b?.review_status) - getReviewStars(a?.review_status))[0]
    : data?.clinvar?.rcv;
  const clinvarSignificance: string | undefined =
    typeof rcv?.clinical_significance === 'string' ? rcv.clinical_significance : undefined;
  const clinvarReview: string | undefined =
    typeof rcv?.review_status === 'string' ? rcv.review_status : undefined;

  // Gene symbol fallback extraction
  const geneSymbol: string | undefined = (() => {
    // 1. CADD genename
    const caddGene = data?.cadd?.gene;
    if (caddGene) {
      if (typeof caddGene.genename === 'string') return caddGene.genename;
      if (Array.isArray(caddGene)) {
        const first = caddGene.find((g: any) => typeof g?.genename === 'string');
        if (first?.genename) return first.genename;
      }
    }

    // 2. dbNSFP genename
    const dbnsfpGene = data?.dbnsfp?.genename;
    if (dbnsfpGene) {
      if (typeof dbnsfpGene === 'string') return dbnsfpGene;
      if (Array.isArray(dbnsfpGene)) {
        const first = dbnsfpGene.find((g: any) => typeof g === 'string');
        if (first) return first;
      }
    }

    // 3. SnpEff genename
    const snpeffAnn = data?.snpeff?.ann;
    if (snpeffAnn) {
      if (Array.isArray(snpeffAnn)) {
        const first = snpeffAnn.find((g: any) => g && typeof g.genename === 'string');
        if (first?.genename) return first.genename;
      } else if (typeof snpeffAnn === 'object') {
        const ann = snpeffAnn as any;
        if (typeof ann.genename === 'string') return ann.genename;
      }
    }

    // 4. ClinVar gene
    const clinvarGene = data?.clinvar?.gene;
    if (clinvarGene) {
      if (typeof clinvarGene === 'string') return clinvarGene;
      if (typeof clinvarGene === 'object' && clinvarGene !== null) {
        const symbol = (clinvarGene as any).symbol;
        if (typeof symbol === 'string') return symbol;
      }
    }

    return undefined;
  })();

  // HGVSg string (first in array if present)
  const hgvsGenomicRaw = data?.hgvs?.genomic;
  const hgvsg: string | undefined = Array.isArray(hgvsGenomicRaw)
    ? hgvsGenomicRaw[0]
    : typeof hgvsGenomicRaw === 'string'
    ? hgvsGenomicRaw
    : undefined;

  // HGVSp protein change (starts with p.)
  const proteinChange = extractProteinChange(data);

  // HGVSc coding change and transcript
  const resolvedCoding = extractCodingChange(data);
  const codingChange = resolvedCoding?.codingChange;
  const transcript = resolvedCoding?.transcript;

  // If we got a 'notfound' response body, return a minimal record
  if (data?.notfound === true || data?._id === undefined) {
    return { source: 'none', fetchedAt: Date.now() };
  }

  return {
    rsId,
    geneSymbol,
    gnomadAf,
    gnomadAc,
    gnomadAn,
    caddPhred,
    revelScore,
    amScore,
    amPred,
    clinvarSignificance,
    clinvarReview,
    hgvsg,
    proteinChange,
    codingChange,
    transcript,
    source: 'myvariant',
    fetchedAt: Date.now(),
  };
}
