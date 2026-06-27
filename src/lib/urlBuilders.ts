import { ParsedVariant, parseVariant, computeEndPos } from './parser';
import { PlatformAdapter, getMissingDataReason, hasRealAllele } from './platforms';
import { GenomeBuild, DEFAULT_BUILD, ucscDb, gnomadDataset, spliceAiAssembly } from '../utils/genomeBuild';
import { normaliseAlleles } from '../utils/normalize';
import { lookupGeneSymbol } from './geneSymbols';

export type PlatformUrlBuilder = (
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  build: GenomeBuild,
  enrichment?: { geneSymbol?: string; rsId?: string; hgvsg?: string; proteinChange?: string; codingChange?: string; transcript?: string } | null,
) => string | null;

export const gnomadBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const dataset = gnomadDataset(build);
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
    return `https://gnomad.broadinstitute.org/variant/${chrom}-${nPos}-${nRef}-${nAlt}?dataset=${dataset}`;
  }
  if (gene) {
    return `https://gnomad.broadinstitute.org/gene/${encodeURIComponent(gene)}?dataset=${dataset}`;
  }
  return `https://gnomad.broadinstitute.org/search?q=${encodeURIComponent(parsed.raw)}&dataset=${dataset}`;
};

export const ucscBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const endPosition = parsed.endPosition;
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const db = ucscDb(build);
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const endPos = endPosition
    ? endPosition
    : nRef && nAlt
    ? computeEndPos(nPos, nRef, nAlt)
    : nPos;

  if (chrom && pos) {
    return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=chr${chrom}:${nPos}-${endPos}`;
  }
  if (gene) {
    return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=${encodeURIComponent(gene)}`;
  }
  return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}`;
};

export const spliceaiBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const assembly = spliceAiAssembly(build);
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
    return `https://spliceailookup.broadinstitute.org/?variant=chr${chrom}-${nPos}-${nRef}-${nAlt}&assembly=${assembly}`;
  }
  if (gene) {
    return `https://spliceailookup.broadinstitute.org/?variant=${encodeURIComponent(gene)}&assembly=${assembly}`;
  }
  return 'https://spliceailookup.broadinstitute.org/';
};

export const alphamissenseBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const rsId = enrichment?.rsId;
  const hgvsg = enrichment?.hgvsg;
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const hgvsp = enrichment?.proteinChange;
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt) ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const term = hgvsp || hgvsg || hgvsc || rsId || fullHgvsG || fullHgvsC || gene || parsed.raw;
  return `https://alphamissense.hegelab.org/search?variant=${encodeURIComponent(term)}`;
};

export const clinvarBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const rsId = enrichment?.rsId;
  const hgvsg = enrichment?.hgvsg;
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const hgvsp = enrichment?.proteinChange;
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt) ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const variantTerm = rsId || hgvsg || hgvsc || fullHgvsG || fullHgvsC || hgvsp;
  if (variantTerm) {
    let queryTerm = variantTerm;
    if (variantTerm === hgvsp && gene) {
      queryTerm = `${gene} ${hgvsp}`;
    }
    return `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(queryTerm)}&vh_clear_filters=true`;
  }
  if (gene) {
    return `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(gene)}%5Bgene%5D&vh_clear_filters=true`;
  }
  return `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(parsed.raw)}&vh_clear_filters=true`;
};

export const dbsnpBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const rsId = enrichment?.rsId;
  const hgvsg = enrichment?.hgvsg;
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt) ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const variantTerm = rsId || hgvsg || hgvsc || fullHgvsG || fullHgvsC;
  if (variantTerm) {
    return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(variantTerm)}`;
  }
  if (gene) {
    return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(gene)}%5Bgene%5D`;
  }
  return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(parsed.raw)}`;
};

export const mutalyzerBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';

  const variantTerm = hgvsc || fullHgvsC;
  if (variantTerm) {
    return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(variantTerm)}`;
  }
  if (gene) {
    return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(gene)}`;
  }
  return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(parsed.raw)}`;
};

export const variantvalidatorBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const hgvsg = enrichment?.hgvsg;
  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = (parsed.chromosome && parsed.position && hasRealAllele(parsed.ref) && hasRealAllele(parsed.alt))
    ? `chr${parsed.chromosome}:g.${parsed.position}${parsed.ref}>${parsed.alt}` : '';

  const variantTerm = hgvsc || hgvsg || fullHgvsC || fullHgvsG;
  if (variantTerm) {
    return `https://variantvalidator.org/service/validate/${encodeURIComponent(variantTerm)}`;
  }
  return 'https://variantvalidator.org/';
};

export const defaultBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const endPosition = parsed.endPosition;
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const endPos = endPosition
    ? endPosition
    : nRef && nAlt
    ? computeEndPos(nPos, nRef, nAlt)
    : nPos;

  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt) ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const geneSymbol = parsed.transcript ? lookupGeneSymbol(parsed.transcript) : null;
  const variantFormatted = fullHgvsG || fullHgvsC || geneSymbol || parsed.raw;

  const db = ucscDb(build);
  const dataset = gnomadDataset(build);
  const assembly = spliceAiAssembly(build);

  let url = adapter.urlTemplate;
  url = url.replace(/\{\{variant\}\}/g,    encodeURIComponent(variantFormatted));
  url = url.replace(/\{\{raw\}\}/g,        encodeURIComponent(parsed.raw));
  url = url.replace(/\{\{chrom\}\}/g,      encodeURIComponent(chrom));
  url = url.replace(/\{\{pos\}\}/g,        encodeURIComponent(nPos));
  url = url.replace(/\{\{endPos\}\}/g,     encodeURIComponent(endPos));
  url = url.replace(/\{\{ref\}\}/g,        encodeURIComponent(nRef));
  url = url.replace(/\{\{alt\}\}/g,        encodeURIComponent(nAlt));
  url = url.replace(/\{\{dashFormat\}\}/g, `${encodeURIComponent(chrom)}-${encodeURIComponent(nPos)}-${encodeURIComponent(nRef)}-${encodeURIComponent(nAlt)}`);
  url = url.replace(/\{\{g\}\}/g,          encodeURIComponent(fullHgvsG));
  url = url.replace(/\{\{c\}\}/g,          encodeURIComponent(fullHgvsC));
  url = url.replace(/\{\{p\}\}/g,          encodeURIComponent(parsed.proteinChange ?? ''));
  url = url.replace(/\{\{transcript\}\}/g, encodeURIComponent(parsed.transcript ?? ''));
  url = url.replace(/\{\{db\}\}/g,         db);
  url = url.replace(/\{\{dataset\}\}/g,    dataset);
  url = url.replace(/\{\{assembly\}\}/g,   assembly);

  return url;
};

const builders = new Map<string, PlatformUrlBuilder>([
  ['gnomad', gnomadBuilder],
  ['ucsc', ucscBuilder],
  ['spliceai', spliceaiBuilder],
  ['alphamissense', alphamissenseBuilder],
  ['clinvar', clinvarBuilder],
  ['dbsnp', dbsnpBuilder],
  ['mutalyzer', mutalyzerBuilder],
  ['variantvalidator', variantvalidatorBuilder],
]);

export function buildPlatformUrl(
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  build: GenomeBuild = DEFAULT_BUILD,
  enrichment?: { geneSymbol?: string; rsId?: string; hgvsg?: string; proteinChange?: string; codingChange?: string; transcript?: string } | null,
): string | null {
  const missingReason = getMissingDataReason(parsed, adapter, enrichment);
  if (missingReason) return null;

  // Pre-process enrichment.hgvsg if present to override genomic parameters
  const effectiveParsed = { ...parsed };
  if (enrichment?.hgvsg) {
    const resolvedGenomic = parseVariant(enrichment.hgvsg);
    if (resolvedGenomic.isValid && resolvedGenomic.position) {
      effectiveParsed.chromosome = resolvedGenomic.chromosome ?? effectiveParsed.chromosome;
      effectiveParsed.position = resolvedGenomic.position;
      effectiveParsed.ref = resolvedGenomic.ref ?? effectiveParsed.ref;
      effectiveParsed.alt = resolvedGenomic.alt ?? effectiveParsed.alt;
      effectiveParsed.endPosition = resolvedGenomic.endPosition;
    }
  }

  const builder = builders.get(adapter.id) || defaultBuilder;
  return builder(effectiveParsed, adapter, build, enrichment);
}
