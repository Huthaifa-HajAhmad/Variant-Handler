/**
 * Three-letter → one-letter amino-acid code map, shared by the URL builders
 * (OncoKB, VarSome, GeneBe) and the content script's protein highlighting.
 */
export const AMINO_ACID_3_TO_1: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G',
  His: 'H', Ile: 'I', Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S',
  Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Ter: '*', Stop: '*', Sec: 'U', Pyl: 'O', X: 'X',
};

/**
 * Normalises a protein change into a single-letter alteration slug
 * (`p.Val600Glu` → `V600E`). Used by OncoKB, VarSome, GeneBe, and the
 * content script's highlight search.
 */
export function formatOneLetterProtein(proteinChange?: string): string | null {
  if (!proteinChange) return null;

  let alteration = proteinChange.trim();
  alteration = alteration.replace(/^p\./i, '');
  alteration = alteration.replace(/^\(/, '').replace(/\)$/, '');

  // Every three-letter residue becomes one letter, wherever it sits: Val600Glu → V600E,
  // Phe508del → F508del, Glu746_Ala750del → E746_A750del, Val600_Lys601delinsGlu → V600_K601delinsE.
  // Lookarounds rather than \b, which does not separate residues across `_`.
  alteration = alteration.replace(
    /(?:(?<![A-Za-z])|(?<=delins|ins))([A-Z][a-z]{2})(?![a-z])/g,
    (token: string) => AMINO_ACID_3_TO_1[token] ?? token,
  );
  // Stop codons written as Ter → *
  alteration = alteration.replace(/Ter/g, '*');

  return alteration || null;
}
