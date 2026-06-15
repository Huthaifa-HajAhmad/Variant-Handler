/**
 * VariantStream Playground Constants & Templates
 *
 * FIX CRITICAL-2: The default batch item labelled 'GBA' was using transcript
 * NM_000152 (which encodes GAA / acid alpha-glucosidase, causative in Pompe
 * disease — Glycogen Storage Disease Type II).  GBA (glucocerebrosidase,
 * causative in Gaucher disease) is encoded by NM_000157.  The batch item is
 * corrected to use the proper GBA transcript and disease annotation.
 *
 * FIX CRITICAL-3: PAH test variant updated to use NM_000277.3 (current
 * GRCh38 RefSeq accession) to be consistent with the canonical database
 * which now stores version-normalised keys.
 */

export interface TestVariantItem {
  id: string;
  name: string;
  input: string;
  gene: string;
  significance: string;
}

export const TEST_VARIANTS: TestVariantItem[] = [
  {
    id: 'cftr',
    name: 'CFTR delta-F508 Recessive',
    input: 'NM_000492.4:c.1521_1523delCTT',
    gene: 'CFTR',
    significance: 'Pathogenic (Autosomal Recessive Cystic Fibrosis)'
  },
  {
    id: 'smn1',
    name: 'SMN1 Splicing SMA Marker',
    input: 'NM_000344.4:c.840C>T',
    gene: 'SMN1',
    significance: 'Pathogenic (Spinal Muscular Atrophy Hereditary Core)'
  },
  {
    id: 'pah',
    name: 'PAH Classical PKU Marker',
    // FIX CRITICAL-3: Updated to NM_000277.3 (current GRCh38 RefSeq accession)
    input: 'NM_000277.3:c.1222C>T',
    gene: 'PAH',
    significance: 'Pathogenic (Phenylketonuria severity regulator)'
  },
  {
    id: 'dmd',
    name: 'DMD Nonsense Muscle Dystrophy',
    input: 'NM_004006.3:c.589C>T',
    gene: 'DMD',
    significance: 'Pathogenic (Duchenne Muscular Dystrophy truncation)'
  },
  {
    id: 'gba',
    name: 'GBA Lysosomal Gaucher Disease',
    // FIX CRITICAL-2: Corrected to NM_000157 (GBA / glucocerebrosidase).
    // NM_000152 encodes GAA (acid alpha-glucosidase / Pompe disease), NOT GBA.
    input: 'NM_000157.4:c.1226A>G',
    gene: 'GBA',
    significance: 'Pathogenic (Gaucher Storage Disease familial core)'
  }
];

export interface SimulatedSiteContent {
  id: string;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  urlHost: string;
  headerBg: string;
  containerBg: string;
  helpText: string;
  mockResults: (query: string) => { label: string; val: string }[];
}

export const SIMULATED_SITES: { [key: string]: SimulatedSiteContent } = {
  gnomad: {
    id: 'gnomad',
    title: 'gnomAD Browser (v4.0)',
    subtitle: 'Genome Aggregation Database variant summary interface.',
    searchPlaceholder: 'Search by gene, variant ID, or coordinates (e.g. 7-140753336-A-T)...',
    urlHost: 'gnomad.broadinstitute.org/search',
    headerBg: 'bg-[#0f172a]',
    containerBg: 'bg-[#fafafa]',
    helpText: 'Requires clean, chr-prefixed or raw coordinates formatted as chrom-pos-ref-alt.',
    mockResults: (query) => [
      { label: 'Exon Allele Frequency', val: '0.0000341 (Extremely Rare)' },
      { label: 'Homozygote Count', val: '0 (Absent in general population)' },
      { label: 'pLI Score (Loss-of-Function)', val: '0.98 (Highly Intolerant)' },
      { label: 'ClinVar Assessment', val: 'Pathogenic (Reported in 134 clinical entries)' }
    ]
  },
  ucsc: {
    id: 'ucsc',
    title: 'UCSC Genome Browser Gateway',
    subtitle: 'Interactive UCSC genome sequence reference track alignments.',
    searchPlaceholder: 'Enter coordinate range or sequence query (e.g. chr7:140753336)...',
    urlHost: 'genome.ucsc.edu/cgi-bin/hgTracks',
    headerBg: 'bg-[#1e1b4b]',
    containerBg: 'bg-[#f8fafc]',
    helpText: 'Utilizes raw chromosome intervals and nucleotide positions in Assembly GRCh38/hg38.',
    mockResults: (query) => [
      { label: 'PhastCons Score', val: '0.998 (Highly conserved sequence region)' },
      { label: 'RepeatMasker Alignment', val: 'None detected (High complexity genomic sequence)' },
      { label: 'Gene Expression', val: 'Highly active in airway epithelia and motor neurons' },
      { label: 'Cytogenetic Band', val: '7q34' }
    ]
  },
  spliceai: {
    id: 'spliceai',
    title: 'SpliceAI Prediction Lookup',
    subtitle: 'High precision neural network predictions for RNA splicing alterations.',
    searchPlaceholder: 'Enter coordinates as chrom-pos-ref-alt (e.g. 7-140753336-A-T)...',
    urlHost: 'spliceai.lookup.broadinstitute.org',
    headerBg: 'bg-[#022c22]',
    containerBg: 'bg-[#f0fdf4]',
    helpText: 'Scores above 0.2 suggest pre-mRNA splicing disruption; scores above 0.5 are highly pathogenic.',
    mockResults: (query) => [
      { label: 'Splice Acceptor Gain (AG)', val: '0.01 (Unlikely splicing disruption)' },
      { label: 'Splice Donor Gain (DG)', val: '0.02 (Low influence)' },
      { label: 'Splice Acceptor Loss (AL)', val: '0.89 (High risk of splicing disruption!)' },
      { label: 'Splice Donor Loss (DL)', val: '0.91 (High risk of splicing disruption!)' }
    ]
  },
  alphamissense: {
    id: 'alphamissense',
    title: 'AlphaMissense Structural Atlas',
    subtitle: 'DeepMind structures mapping structural pathogenicity of proteins.',
    searchPlaceholder: 'Search single amino acid change, variant ID or protein coordinates...',
    urlHost: 'alphamissense.lucid.bio/search',
    headerBg: 'bg-[#451a03]',
    containerBg: 'bg-[#fffbeb]',
    helpText: 'Calculates the probability of amino acid changes disrupting secondary protein structure.',
    mockResults: (query) => [
      { label: 'Pathogenicity Probability (am_class)', val: '0.9972 (Classified: LIKELY PATHOGENIC)' },
      { label: 'Solvent Accessibility Area', val: '24.1 Å² (Buried inside activation loop)' },
      { label: 'Protein Structural Modality', val: 'AlphaFold prediction confidence iDDT: 94.6' }
    ]
  },
  variantvalidator: {
    id: 'variantvalidator',
    title: 'Variant Validator Clinical Standardizer',
    subtitle: 'Validates variant definitions against HGVS recommendations and maps to coordinates.',
    searchPlaceholder: 'Enter coding standard notation (e.g., NM_000492.4:c.1521_1523delCTT)...',
    urlHost: 'variantvalidator.org/validate',
    headerBg: 'bg-[#50072b]',
    containerBg: 'bg-[#fdf2f8]',
    helpText: 'Standardizes transcript relative coordinates to genomic reference codes.',
    mockResults: (query) => [
      { label: 'HGVS Nomenclature Check', val: 'PASS (Valid syntax)' },
      { label: 'Mapped Assembly GRCh38', val: 'NC_000007.14:g.140753336A>T' },
      { label: 'Associated Transcripts', val: 'NM_004333.6, NM_001374258.1, XM_011515234' },
      { label: 'Validation Warning', val: 'None. Clean transcript alignment detected.' }
    ]
  }
};
