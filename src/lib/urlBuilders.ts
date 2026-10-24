import { ParsedVariant, parseVariant, computeEndPos, getFormattedVariant } from './parser';
import { PlatformAdapter, getMissingDataReason, hasRealAllele, isConcreteBase, mergeResolvedGenomic } from './platforms';
import { GenomeBuild, DEFAULT_BUILD, ucscDb, gnomadDataset, spliceAiAssembly, franklinHg, hgBuild } from '../utils/genomeBuild';
import { normaliseAlleles } from '../utils/normalize';
import { lookupGeneSymbol } from './geneSymbols';
import { formatOneLetterProtein } from './aminoAcids';

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

function getCleanRaw(parsed: ParsedVariant): string {
  if (parsed.rsId) return parsed.rsId;
  if (parsed.annotationText) {
    return parsed.raw.replace(/\s*\([^()]*\)\s*$/, '').trim();
  }
  return parsed.raw;
}

export const alphamissenseBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const hgvsp = enrichment?.proteinChange || parsed.proteinChange || '';
  
  let term = '';
  if (gene && hgvsp) {
    term = `${gene} ${hgvsp}`;
  } else if (gene) {
    term = gene;
  } else if (hgvsp) {
    term = hgvsp;
  } else {
    const transcript = enrichment?.transcript || parsed.transcript;
    const codingChange = enrichment?.codingChange || parsed.codingChange;
    if (transcript && codingChange) {
      term = `${transcript}:${codingChange}`;
    } else {
      term = getCleanRaw(parsed);
    }
  }

  return `https://alphamissense.hegelab.org/search?variant=${encodeURIComponent(term)}`;
};

export const clinvarBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const rsId = enrichment?.rsId || parsed.rsId;
  const hgvsg = enrichment?.hgvsg;
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const hgvsp = enrichment?.proteinChange;
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt) ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const variantTerm = fullHgvsG || fullHgvsC || hgvsg || hgvsc || rsId || hgvsp;
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
  return `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(getCleanRaw(parsed))}&vh_clear_filters=true`;
};

export const dbsnpBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const rsId = enrichment?.rsId || parsed.rsId;
  const hgvsg = enrichment?.hgvsg;
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const fullHgvsC = parsed.transcript && parsed.codingChange ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt) ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const variantTerm = fullHgvsG || fullHgvsC || hgvsg || hgvsc || rsId;
  if (variantTerm) {
    return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(variantTerm)}`;
  }
  if (gene) {
    return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(gene)}%5Bgene%5D`;
  }
  return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(getCleanRaw(parsed))}`;
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
  return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(getCleanRaw(parsed))}`;
};

export const variantvalidatorBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  // VariantValidator uses a CSRF-protected POST form at /service/validate/
  // Direct GET /service/validate/<variant> 404s. Return the form base URL so the user
  // lands on the working validation page and the content script can autofill #variant_id.
  return 'https://variantvalidator.org/service/validate/';
};

/**
 * Normalises a protein change into a single-letter alteration slug
 * (`p.Val600Glu` → `V600E`). Re-exported from `aminoAcids` for URL builders;
 * the implementation lives there so the content script can share it.
 */
export { formatOneLetterProtein };

/** True when the user's input used protein or coding (c.) notation. */
function usesProteinNotation(parsed: ParsedVariant): boolean {
  return !!parsed.proteinChange || (parsed.codingChange?.startsWith('c.') ?? false);
}

/** Full HGVSc string from enrichment or parsed input, when available. */
function buildHgvsC(
  parsed: ParsedVariant,
  enrichment?: { transcript?: string; codingChange?: string } | null,
): string {
  if (enrichment?.transcript && enrichment?.codingChange) {
    return `${enrichment.transcript}:${enrichment.codingChange}`;
  }
  if (parsed.transcript && parsed.codingChange?.startsWith('c.')) {
    return `${parsed.transcript}:${parsed.codingChange}`;
  }
  return '';
}

export const franklinBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  if (chrom && pos && isConcreteBase(nRef) && isConcreteBase(nAlt)) {
    const path = [encodeURIComponent(chrom), encodeURIComponent(nPos), nRef, nAlt].join('-');
    return `https://franklin.genoox.com/clinical-db/variant/snp/chr${path}?hg=${franklinHg(build)}`;
  }
  if (gene) {
    return `https://franklin.genoox.com/clinical-db/gene/${encodeURIComponent(gene)}`;
  }
  return 'https://franklin.genoox.com/clinical-db/home';
};

/**
 * Builds OncoKB's HGVSg query form (`7:g.140453136A>T`) — no `chr` prefix,
 * no whitespace. Returns null when the parsed variant has no coordinates.
 */
function toOncokbHgvsg(parsed: ParsedVariant): string | null {
  const { chromosome, position, ref, alt, endPosition } = parsed;
  if (!chromosome || !position) return null;

  if (isConcreteBase(ref) && isConcreteBase(alt)) {
    return `${chromosome}:g.${position}${ref}>${alt}`;
  }
  // Structural shorthand is only usable with an explicit range (e.g.
  // `16:g.5145601_5151200del`); a position-only input cannot form valid HGVSg.
  if (!endPosition) return null;
  const formatted = getFormattedVariant(parsed, 'hgvs_g').replace(/\s+/g, '').replace(/^chr/i, '');
  return formatted.includes(':g.') ? formatted : null;
}

export const oncokbBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';

  // Coordinate-first: when the user supplied genomic notation, use OncoKB's
  // HGVSg route so the lookup reflects those coordinates exactly instead of a
  // transcript/protein prediction. Protein and coding inputs keep the
  // gene/alteration route below.
  if (!parsed.copyNumberChange && !usesProteinNotation(parsed)) {
    const hgvsg = toOncokbHgvsg(parsed);
    if (hgvsg) {
      return `https://www.oncokb.org/hgvsg/${hgvsg}?refGenome=${encodeURIComponent(build)}`;
    }
  }
  if (!gene) {
    return null;
  }
  const proteinChange = enrichment?.proteinChange || parsed.proteinChange || '';
  const alteration = parsed.copyNumberChange ?? formatOneLetterProtein(proteinChange);

  // Deep-link only to alteration slugs OncoKB reliably serves:
  //  - missense / in-frame indels (V600E, F508del, R273H)
  //  - copy-number amplification (ERBB2 Amplification)
  // Truncating changes (nonsense/frameshift) are grouped under "Truncating
  // Mutations", and deletion naming varies by gene ("Exon 19 Deletion",
  // "Deletion", ...), so those route to the gene page which is always valid.
  const isDeepLinkable =
    alteration !== null &&
    alteration !== 'Deletion' &&
    !/\*|fs/i.test(alteration);

  if (isDeepLinkable) {
    return `https://www.oncokb.org/gene/${encodeURIComponent(gene)}/${encodeURIComponent(alteration)}`;
  }
  return `https://www.oncokb.org/gene/${encodeURIComponent(gene)}`;
};

export const varsomeBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const protein = formatOneLetterProtein(enrichment?.proteinChange || parsed.proteinChange);
  const coding = buildHgvsC(parsed, enrichment);
  const rsId = enrichment?.rsId || parsed.rsId;
  const chrom = parsed.chromosome ?? '';
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(parsed.position ?? '', parsed.ref ?? '', parsed.alt ?? '');

  let query = '';
  if (usesProteinNotation(parsed)) {
    // VarSome accepts `GENE:PROTEIN`, HGVS c., rsIDs, and gene symbols.
    if (gene && protein) query = `${gene}:${protein}`;
    else if (coding) query = coding;
    else if (rsId) query = rsId;
    else query = gene;
  } else if (chrom && parsed.position && isConcreteBase(nRef) && isConcreteBase(nAlt)) {
    // VarSome's canonical genomic notation omits the `chr` prefix spacing.
    query = `chr${chrom}-${nPos}-${nRef}-${nAlt}`;
  } else if (coding) {
    query = coding;
  } else if (rsId) {
    query = rsId;
  } else {
    query = gene;
  }

  if (!query) return null;
  // Use VarSome's own search form: it accepts every variant format and lands
  // on the canonical variant page (direct slugs can 404 behind their guard).
  return `https://varsome.com/variant/search?query=${encodeURIComponent(query)}&genome=${hgBuild(build)}`;
};

export const varchatBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const protein = enrichment?.proteinChange || parsed.proteinChange || '';
  const hgvsC = buildHgvsC(parsed, enrichment);
  const geneCoding = gene && parsed.codingChange?.startsWith('c.') ? `${gene}:${parsed.codingChange}` : '';

  // VarChat supports HGVS at coding/protein level plus gene symbols.
  const term = hgvsC || geneCoding || (gene && protein ? `${gene} ${protein}` : '') || gene;
  if (!term) return null;
  return `https://varchat.engenome.com/search?text=${encodeURIComponent(term)}`;
};

export const genebeBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const hg = hgBuild(build);
  const chrom = parsed.chromosome ?? '';
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(parsed.position ?? '', parsed.ref ?? '', parsed.alt ?? '');

  // GeneBe's canonical form is `chrom-pos-ref-alt`.
  if (!usesProteinNotation(parsed) && chrom && parsed.position && isConcreteBase(nRef) && isConcreteBase(nAlt)) {
    const variant = `${chrom}-${nPos}-${nRef}-${nAlt}`;
    return `https://genebe.net/variant/${hg}/${encodeURIComponent(variant)}`;
  }
  const coding = buildHgvsC(parsed, enrichment);
  if (coding) {
    return `https://genebe.net/variant/${hg}/${encodeURIComponent(coding)}`;
  }
  const protein = formatOneLetterProtein(enrichment?.proteinChange || parsed.proteinChange);
  if (gene && protein) {
    return `https://genebe.net/variant/${hg}/${encodeURIComponent(`${gene}:p.${protein}`)}`;
  }
  if (gene) {
    return `https://genebe.net/gene/${hg}/${encodeURIComponent(gene)}`;
  }
  return null;
};

// InterVar is a POST form behind reCAPTCHA — no URL can encode the variant.
// Launch the form (https is required by the extension's URL safety check); the
// content script populates chr/pos/ref/alt on Autofill.
export const intervarBuilder: PlatformUrlBuilder = () => 'https://wintervar.wglab.org/';

export const opentargetsBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const chrom = parsed.chromosome ?? '';
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(parsed.position ?? '', parsed.ref ?? '', parsed.alt ?? '');

  // Open Targets variant IDs are `chrom_pos_ref_alt` (no `chr` prefix) and the
  // platform is GRCh38-only. Direct `/variant/{id}` links 404 for variants the
  // platform has not indexed, so route through search, which its own homepage
  // examples use for variant IDs.
  const variantId =
    build === 'GRCh38' && chrom && parsed.position && isConcreteBase(nRef) && isConcreteBase(nAlt)
      ? `${chrom}_${nPos}_${nRef}_${nAlt}`
      : '';

  const term = variantId || gene;
  if (!term) return null;
  return `https://platform.opentargets.org/search?q=${encodeURIComponent(term)}&page=1`;
};

export const mobidetailsBuilder: PlatformUrlBuilder = (parsed, adapter, build, enrichment) => {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  // Variant pages use internal numeric IDs and search is POST-only, so the
  // deepest linkable route is the gene's variant list. The site moved to
  // mobidetails.chu-montpellier.fr; the old host redirects there.
  if (!gene) return null;
  return `https://mobidetails.chu-montpellier.fr/vars/${encodeURIComponent(gene)}`;
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
  const cleanRaw = getCleanRaw(parsed);
  const variantFormatted = fullHgvsG || fullHgvsC || geneSymbol || cleanRaw;

  const db = ucscDb(build);
  const dataset = gnomadDataset(build);
  const assembly = spliceAiAssembly(build);

  let url = adapter.urlTemplate;
  url = url.replace(/\{\{variant\}\}/g,    encodeURIComponent(variantFormatted));
  url = url.replace(/\{\{raw\}\}/g,        encodeURIComponent(cleanRaw));
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
  url = url.replace(/\{\{gene\}\}/g,      encodeURIComponent(enrichment?.geneSymbol || parsed.geneSymbol || ''));
  url = url.replace(/\{\{hg\}\}/g,        franklinHg(build));
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
  ['franklin', franklinBuilder],
  ['oncokb', oncokbBuilder],
  ['varsome', varsomeBuilder],
  ['varchat', varchatBuilder],
  ['genebe', genebeBuilder],
  ['intervar', intervarBuilder],
  ['opentargets', opentargetsBuilder],
  ['mobidetails', mobidetailsBuilder],
]);

export function buildPlatformUrl(
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  build: GenomeBuild = DEFAULT_BUILD,
  enrichment?: { geneSymbol?: string; rsId?: string; hgvsg?: string; proteinChange?: string; codingChange?: string; transcript?: string } | null,
): string | null {
  const missingReason = getMissingDataReason(parsed, adapter, enrichment);
  if (missingReason) return null;

  // User-supplied data always wins; enrichment only fills gaps. The same merge
  // is used by getMissingDataReason so eligibility and URL building cannot
  // disagree.
  const effectiveParsed = mergeResolvedGenomic(parsed, enrichment);
  const effectiveBuild = effectiveParsed.genomeBuild ?? build;

  const builder = builders.get(adapter.id) || defaultBuilder;
  return builder(effectiveParsed, adapter, effectiveBuild, enrichment);
}
