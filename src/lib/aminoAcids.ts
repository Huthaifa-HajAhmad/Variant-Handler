/**
 * Three-letter → one-letter amino-acid code map, shared by the OncoKB URL
 * builder and the content script's protein-change highlighting.
 */
export const AMINO_ACID_3_TO_1: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G',
  His: 'H', Ile: 'I', Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S',
  Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Ter: '*', Stop: '*', Sec: 'U', Pyl: 'O', X: 'X',
};
