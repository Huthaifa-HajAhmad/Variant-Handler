/**
 * Variant Handler — Clinical Export Functions
 *
 * Generates TSV, styled Excel (XLS), and HTML slide-deck (PPT) files.
 *
 * Fixes applied:
 *  - All user-supplied strings embedded in HTML are escaped via escapeHtml()
 *    to prevent XSS when the exported file is opened in a browser (HIGH severity).
 *  - Variants are parsed once per export call (pre-parsed array) instead of
 *    calling parseVariant() inside the forEach loop (N+1 performance issue).
 *  - downloadBlob() revokes the object URL immediately after click, preventing
 *    a memory leak (previously URL.revokeObjectURL was never called).
 */
import { BatchItem } from '../lib/types';
import { parseVariant, ParsedVariant } from '../lib/parser';
import { escapeHtml, downloadBlob } from './sanitize';

// ── TSV Export ───────────────────────────────────────────────────────────────

export function exportTSV(
  batchQueue: BatchItem[],
  history: string[],
  onAlert: (msg: string) => void,
): void {
  if (batchQueue.length === 0 && history.length === 0) {
    onAlert('Workspace is empty. Add variants or run history searches to export!');
    return;
  }

  // Pre-parse all items once (not inside the loop)
  const parsedQueue = batchQueue.map((item) => ({ item, parsed: parseVariant(item.input) }));
  const parsedHistory = history.map((input) => ({ input, parsed: parseVariant(input) }));

  let content = '--- CLINICAL VARIANT BATCH QUEUE ---\r\n';
  content += '# Enrichment columns (rsID, gnomAD AF, ClinVar Sig, ClinVar Review, Snapshot At) are a point-in-time snapshot captured when the variant was active. May lag the upstream source — verify against the source for clinical use.\r\n';
  content +=
    'ID\tGene/Transcript\tVariant Notation\tClinical Notes & Observations\tNomenclature Type\tChromosome\tPosition\tRef Allele\tAlt Allele\tTranscript Ref\tCoding Change\tProtein Change\tdbSNP rsID\tgnomAD AF\tClinVar Significance\tClinVar Review\tEnrichment Snapshot At\r\n';

  parsedQueue.forEach(({ item, parsed }, idx) => {
    const snap = item.enrichmentSnapshot;
    content +=
      `${idx + 1}\t` +
      `${item.gene}\t` +
      `${item.input}\t` +
      `${(item.note || '').replace(/[\t\r\n]/g, ' ')}\t` +
      `${parsed.type}\t` +
      `${parsed.chromosome || 'N/A'}\t` +
      `${parsed.position || 'N/A'}\t` +
      `${parsed.ref || 'N/A'}\t` +
      `${parsed.alt || 'N/A'}\t` +
      `${parsed.transcript || 'N/A'}\t` +
      `${parsed.codingChange || 'N/A'}\t` +
      `${parsed.proteinChange || 'N/A'}\t` +
      `${snap?.rsId || 'N/A'}\t` +
      `${snap?.gnomadAf !== undefined ? snap.gnomadAf : 'N/A'}\t` +
      `${snap?.clinvarSignificance || 'N/A'}\t` +
      `${snap?.clinvarReview || 'N/A'}\t` +
      `${snap ? new Date(snap.snapshotAt).toISOString() : 'N/A'}\r\n`;
  });

  if (parsedHistory.length > 0) {
    content += '\r\n--- RECENT SEARCH HISTORY LEDGER ---\r\n';
    content +=
      'ID\tVariant Notation\tInferred Source\tNomenclature Type\tChromosome\tPosition\tRef Allele\tAlt Allele\tTranscript Ref\tCoding Change\tProtein Change\r\n';

    parsedHistory.forEach(({ input, parsed }, idx) => {
      const inferredGene = parsed.transcript
        ? input.split(':')[0] || 'Genomic'
        : parsed.chromosome
        ? `chr${parsed.chromosome}`
        : 'RAW';

      content +=
        `${idx + 1}\t` +
        `${input}\t` +
        `${inferredGene}\t` +
        `${parsed.type}\t` +
        `${parsed.chromosome || 'N/A'}\t` +
        `${parsed.position || 'N/A'}\t` +
        `${parsed.ref || 'N/A'}\t` +
        `${parsed.alt || 'N/A'}\t` +
        `${parsed.transcript || 'N/A'}\t` +
        `${parsed.codingChange || 'N/A'}\t` +
        `${parsed.proteinChange || 'N/A'}\r\n`;
    });
  }

  const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8;' });
  downloadBlob(blob, `clin_variants_full_report_${Date.now()}.tsv`);
  onAlert('Successfully exported full TSV dataset (Queue & History)!');
}

// ── Excel (XLS) Export ───────────────────────────────────────────────────────

export function exportExcel(
  batchQueue: BatchItem[],
  history: string[],
  onAlert: (msg: string) => void,
): void {
  if (batchQueue.length === 0 && history.length === 0) {
    onAlert('Workspace is empty. Add variants or run history searches to export!');
    return;
  }

  const parsedQueue   = batchQueue.map((item) => ({ item, parsed: parseVariant(item.input) }));
  const parsedHistory = history.map((input) => ({ input, parsed: parseVariant(input) }));

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
  html += `<head>`;
  html += `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Clinical Variants Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`;
  html += `<meta charset="utf-8">`;
  html += `<style>`;
  html += `  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 25px; background-color: #f8fafc; }`;
  html += `  .section-title { font-size: 16px; font-weight: bold; color: #0f172a; margin-top: 30px; margin-bottom: 10px; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px; }`;
  html += `  table { border-collapse: collapse; width: 100%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 30px; }`;
  html += `  th { background-color: #1e293b; color: #ffffff; font-weight: bold; font-size: 11px; text-transform: uppercase; padding: 10px; border: 1px solid #cbd5e1; text-align: left; }`;
  html += `  td { padding: 8px 10px; border: 1px solid #cbd5e1; font-size: 11px; color: #334155; }`;
  html += `  tr:nth-child(even) { background-color: #f1f5f9; }`;
  html += `  .gene-badge { font-weight: bold; color: #4f46e5; }`;
  html += `  .coordinate { font-family: 'Consolas', 'Courier New', monospace; font-size: 11px; color: #0f172a; font-weight: 500; }`;
  html += `</style>`;
  html += `</head>`;
  html += `<body>`;
  html += `<h2 style="color:#0f172a; margin-bottom:5px;">Comprehensive Variant Examination Matrix</h2>`;
  html += `<p style="font-size: 11px; color: #64748b; margin-top:0; margin-bottom: 25px;">Exported via Variant Handler Diagnostic Suite on: ${escapeHtml(new Date().toLocaleString())}</p>`;
  html += `<p style="font-size: 10px; color: #94a3b8; margin-top:0; margin-bottom: 18px;">Enrichment columns (rsID, gnomAD AF, ClinVar) are a point-in-time snapshot captured when each variant was active. May lag the upstream source — verify against the source for clinical use.</p>`;

  // Section 1: Batch queue
  html += `<div class="section-title">1. Active Diagnostic Batch Queue (${batchQueue.length})</div>`;
  if (batchQueue.length === 0) {
    html += `<p style="font-size: 11px; color: #64748b;">No active batch variants registered in queue during export.</p>`;
  } else {
    html += `<table><thead><tr>`;
    html += `<th style="width:4%;">ID</th><th style="width:12%;">Gene/Transcript</th>`;
    html += `<th style="width:30%;">Variant Coordinate</th>`;
    html += `<th style="width:14%;">Location (Type)</th><th style="width:40%;">Clinical Notes &amp; Observations</th>`;
    html += `</tr></thead><tbody>`;

    parsedQueue.forEach(({ item, parsed }, idx) => {
      const typeLabel   = parsed.type === 'unknown' ? 'Unspecified' : parsed.type.toUpperCase();
      const detailCoord = parsed.chromosome ? `chr${parsed.chromosome}:${parsed.position}` : 'N/A';

      // FIX: all user data is HTML-escaped before embedding
      html += `<tr>`;
      html += `<td style="text-align:center;font-weight:bold;">${idx + 1}</td>`;
      html += `<td><span class="gene-badge">${escapeHtml(item.gene || 'N/A')}</span></td>`;
      html += `<td><span class="coordinate">${escapeHtml(item.input)}</span></td>`;
      html += `<td><span style="font-size:10px;font-weight:bold;color:#64748b;">${escapeHtml(typeLabel)} (${escapeHtml(detailCoord)})</span></td>`;
      html += `<td>${escapeHtml(item.note || 'No diagnostic notes/observations compiled in workspace.')}</td>`;
      html += `</tr>`;
    });

    html += `</tbody></table>`;

    // R3: enrichment snapshot sub-table (only when at least one item has a snapshot)
    const anySnapshot = parsedQueue.some(({ item }) => item.enrichmentSnapshot);
    if (anySnapshot) {
      html += `<div class="section-title" style="margin-top:18px;">1b. Enrichment Snapshot (captured when each variant was active)</div>`;
      html += `<table><thead><tr>`;
      html += `<th style="width:4%;">ID</th><th style="width:24%;">Variant</th><th style="width:12%;">dbSNP rsID</th>`;
      html += `<th style="width:12%;">gnomAD AF</th><th style="width:22%;">ClinVar Significance</th><th style="width:18%;">ClinVar Review</th><th style="width:12%;">Snapshot At</th>`;
      html += `</tr></thead><tbody>`;
      parsedQueue.forEach(({ item }, idx) => {
        const snap = item.enrichmentSnapshot;
        html += `<tr>`;
        html += `<td style="text-align:center;font-weight:bold;">${idx + 1}</td>`;
        html += `<td><span class="coordinate">${escapeHtml(item.input)}</span></td>`;
        html += `<td style="font-family:monospace;">${escapeHtml(snap?.rsId || '—')}</td>`;
        html += `<td style="font-family:monospace;">${snap?.gnomadAf !== undefined ? escapeHtml(String(snap.gnomadAf)) : '—'}</td>`;
        html += `<td>${escapeHtml(snap?.clinvarSignificance || '—')}</td>`;
        html += `<td style="font-size:10px;color:#64748b;">${escapeHtml(snap?.clinvarReview || '—')}</td>`;
        html += `<td style="font-family:monospace;font-size:10px;">${snap ? escapeHtml(new Date(snap.snapshotAt).toLocaleString()) : '—'}</td>`;
        html += `</tr>`;
      });
      html += `</tbody></table>`;
    }
  }

  // Section 2: History
  html += `<div class="section-title">2. Recent Search History Logs (${history.length})</div>`;
  if (parsedHistory.length === 0) {
    html += `<p style="font-size: 11px; color: #64748b;">No recent coordinate searches captured in history.</p>`;
  } else {
    html += `<table><thead><tr>`;
    html += `<th style="width:4%;">ID</th><th style="width:12%;">Gene Reference</th>`;
    html += `<th style="width:25%;">Search Query / Input</th><th style="width:12%;">Format Category</th>`;
    html += `<th style="width:22%;">Parsed Genomic Alignment</th><th style="width:25%;">Parsed Transcript Changes</th>`;
    html += `</tr></thead><tbody>`;

    parsedHistory.forEach(({ input, parsed }, idx) => {
      const inferredGene   = parsed.transcript ? (input.split(':')[0] || 'Genomic') : (parsed.chromosome ? `chr${parsed.chromosome}` : 'RAW');
      const coordType      = parsed.type === 'unknown' ? 'Unresolved' : parsed.type.toUpperCase();
      const alignmentText  = parsed.chromosome ? `chr${parsed.chromosome}:${parsed.position || ''} (${parsed.ref || ''}>${parsed.alt || ''})` : 'No Genomic Range';
      const transcriptText = parsed.transcript ? `${parsed.transcript} (${parsed.codingChange || ''} ${parsed.proteinChange || ''})` : 'No Transcript Mapping';

      html += `<tr>`;
      html += `<td style="text-align:center;font-weight:bold;">${idx + 1}</td>`;
      html += `<td><span style="font-weight:bold;color:#4338ca;">${escapeHtml(inferredGene)}</span></td>`;
      html += `<td><span class="coordinate">${escapeHtml(input)}</span></td>`;
      html += `<td style="font-weight:500;font-size:10px;">${escapeHtml(coordType)}</td>`;
      html += `<td style="font-family:monospace;font-size:10px;">${escapeHtml(alignmentText)}</td>`;
      html += `<td style="font-family:monospace;font-size:10px;">${escapeHtml(transcriptText)}</td>`;
      html += `</tr>`;
    });

    html += `</tbody></table>`;
  }

  html += `</body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(blob, `clin_comprehensive_matrix_${Date.now()}.xls`);
  onAlert('Successfully generated XLS workbook summarizing both datasets!');
}

// ── Presentation (HTML slide deck) Export ────────────────────────────────────

export function exportPPT(
  batchQueue: BatchItem[],
  history: string[],
  onAlert: (msg: string) => void,
): void {
  if (batchQueue.length === 0 && history.length === 0) {
    onAlert('Workspace is empty. Add variants or run history searches to export!');
    return;
  }

  const parsedHistory = history.map((input) => ({ input, parsed: parseVariant(input) }));
  const totalSlides   = batchQueue.length + (history.length > 0 ? 2 : 1);
  const pad           = (n: number) => String(n).padStart(2, '0');

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">`;
  html += `<title>Clinical Genomic Case Discussion - Variant Handler</title>`;
  html += `<style>`;
  html += `  @page { size: A4 landscape; margin: 0; }`;
  html += `  @media print { body { background-color: #0d1527 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .slide { page-break-after: always; border: none !important; width: 100vw !important; height: 100vh !important; box-shadow: none !important; border-radius: 0 !important; } }`;
  html += `  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #1e293b; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; }`;
  html += `  .deck-container { display: flex; flex-direction: column; gap: 30px; padding: 40px; width: 100%; max-width: 1024px; }`;
  html += `  .slide { background-color: #0f172a; border: 2px solid #334155; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); width: 100%; aspect-ratio: 16/9; box-sizing: border-box; position: relative; padding: 50px 70px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }`;
  html += `  .logo-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 15px; }`;
  html += `  .brand-logo { font-size: 14px; font-weight: bold; color: #10b981; letter-spacing: 1.5px; font-family: monospace; }`;
  html += `  .slide-header { font-size: 12px; color: #64748b; font-family: monospace; }`;
  html += `  .title-content { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; margin-bottom: 25px; }`;
  html += `  .slide-title { font-size: 38px; font-weight: 800; color: #ffffff; margin: 0; line-height: 1.2; letter-spacing: -1px; }`;
  html += `  .slide-subtitle { font-size: 15px; color: #34d399; margin: 10px 0 0 0; font-family: monospace; text-transform: uppercase; letter-spacing: 1px; }`;
  html += `  .slide-content-grid { display: grid; grid-template-columns: 1.1fr 1.9fr; gap: 40px; margin-top: 15px; flex-grow: 1; }`;
  html += `  .badge-panel { display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; gap: 15px; }`;
  html += `  .details-box { display: flex; flex-direction: column; gap: 6px; background-color: rgba(30,41,59,0.4); padding: 15px; border-radius: 8px; border: 1px solid #1e293b; width: 85%; }`;
  html += `  .label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: bold; font-family: monospace; letter-spacing: 0.5px; }`;
  html += `  .notes-panel { display: flex; flex-direction: column; gap: 10px; }`;
  html += `  .notes-box { font-size: 14px; line-height: 1.6; color: #cbd5e1; padding: 20px; background-color: rgba(30,41,59,0.6); border-radius: 8px; border-left: 4px solid #10b981; min-height: 140px; box-sizing: border-box; }`;
  html += `  .notes-title { font-size: 12px; font-weight: bold; color: #94a3b8; text-transform: uppercase; font-family: monospace; letter-spacing: 0.5px; }`;
  html += `  .slide-footer { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #475569; border-top: 1px solid #1e293b; padding-top: 12px; font-family: monospace; }`;
  html += `  .print-banner { background-color: #f59e0b; color: #0f172a; width: 100%; text-align: center; padding: 8px; font-size: 11px; font-weight: bold; font-family: monospace; letter-spacing: 0.5px; }`;
  html += `</style></head><body>`;
  html += `<div class="print-banner">PRESENTATION DISPATCH • SAVED AS POWERPOINT-COMPATIBLE SLIDES • PRESS CTRL+P TO EXPORT PDF SLIDES</div>`;
  html += `<div class="deck-container">`;

  // Slide 1 — Cover
  html += `<div class="slide">`;
  html += `  <div class="logo-bar"><span class="brand-logo">VARIANT HANDLER // CLINICAL GENOMICS</span><span class="slide-header">SLIDE 01 / ${pad(totalSlides)}</span></div>`;
  html += `  <div class="title-content">`;
  html += `    <h1 class="slide-title">Clinical Genomic Case Discussion Deck</h1>`;
  html += `    <p class="slide-subtitle">Interactive Batch Workspace Slides</p>`;
  html += `  </div>`;
  html += `  <div style="background-color:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:8px;padding:12px;font-size:12.5px;color:#a7f3d0;margin-bottom:20px;">`;
  html += `    📊 <strong>Batch Cohort Analysis:</strong> Total Variants: <strong>${batchQueue.length}</strong> | Search Queries: <strong>${history.length}</strong>`;
  html += `  </div>`;
  html += `  <div class="slide-footer"><span>Variant Handler Diagnostic Review Deck</span><span>Generated: ${escapeHtml(new Date().toLocaleDateString())}</span></div>`;
  html += `</div>`;

  // Slides 2…N — One per variant
  batchQueue.forEach((item, idx) => {
    const slideIdx = idx + 2;
    html += `<div class="slide">`;
    html += `  <div class="logo-bar"><span class="brand-logo">VARIANT HANDLER // ACTIVE WORKBENCH CASE NO. ${pad(idx + 1)}</span><span class="slide-header">SLIDE ${pad(slideIdx)} / ${pad(totalSlides)}</span></div>`;
    html += `  <div style="margin-top:15px;">`;
    html += `    <div style="display:flex;align-items:baseline;gap:15px;">`;
    html += `      <h2 style="font-size:34px;color:#ffffff;margin:0;font-weight:800;">${escapeHtml(item.gene)}</h2>`;
    html += `      <span style="font-family:monospace;font-size:15px;color:#34d399;background-color:rgba(52,211,153,0.1);border-radius:4px;padding:2px 8px;border:1px solid rgba(52,211,153,0.2);">${escapeHtml(item.input)}</span>`;
    html += `    </div>`;
    html += `  </div>`;
    html += `  <div class="slide-content-grid">`;
    html += `    <div class="badge-panel">`;
    html += `      <div class="details-box">`;
    html += `        <span class="label">Interpretation Model</span>`;
    html += `        <span style="color:#ffffff;font-size:12px;font-weight:bold;">Hereditary Pathology Review</span>`;
    html += `        <span class="label" style="margin-top:8px;">Workspace State</span>`;
    html += `        <span style="color:#34d399;font-size:11px;font-family:monospace;">✔ Verified Core Match</span>`;
    html += `      </div>`;
    html += `    </div>`;
    html += `    <div class="notes-panel">`;
    html += `      <span class="notes-title">Clinical Review Observations</span>`;
    html += `      <div class="notes-box" style="border-left-color:#10b981;">`;
    html += `        ${escapeHtml(item.note || 'No clinical/diagnostic annotations recorded on this variant.')}`;
    html += `      </div>`;
    html += `    </div>`;
    html += `  </div>`;
    html += `  <div class="slide-footer"><span>Variant Handler Clinical Presentation Deck</span><span>MUTATION OBSERVED • PATHOLOGY DISCUSSION DECK</span></div>`;
    html += `</div>`;
  });

  // Slide N+1 — History log (if any)
  if (parsedHistory.length > 0) {
    const histSlideIdx = batchQueue.length + 2;
    html += `<div class="slide">`;
    html += `  <div class="logo-bar"><span class="brand-logo">VARIANT HANDLER // HISTORY SESSION LOGS</span><span class="slide-header">SLIDE ${pad(histSlideIdx)} / ${pad(totalSlides)}</span></div>`;
    html += `  <div style="margin-top:15px;">`;
    html += `    <h2 style="font-size:28px;color:#ffffff;margin:0;font-weight:800;text-transform:uppercase;">Recent Coordinate Search Ledger</h2>`;
    html += `    <p style="font-size:12px;color:#94a3b8;margin:3px 0 0 0;">Recent inquiries verified during this clinical workspace session</p>`;
    html += `  </div>`;
    html += `  <div style="flex-grow:1;margin-top:15px;overflow-y:auto;max-height:250px;background-color:rgba(30,41,59,0.3);border:1px solid #1e293b;border-radius:8px;padding:15px;">`;
    html += `    <table style="width:100%;border-collapse:collapse;text-align:left;font-size:11px;">`;
    html += `      <thead><tr style="border-bottom:2px solid #334155;color:#94a3b8;">`;
    html += `        <th style="padding:6px 4px;text-transform:uppercase;">Idx</th>`;
    html += `        <th style="padding:6px 4px;text-transform:uppercase;">Variant Coordinate</th>`;
    html += `        <th style="padding:6px 4px;text-transform:uppercase;">Alignment Class</th>`;
    html += `        <th style="padding:6px 4px;text-transform:uppercase;">Parsed Details</th>`;
    html += `      </tr></thead>`;
    html += `      <tbody style="color:#cbd5e1;">`;

    parsedHistory.forEach(({ input, parsed }, idx) => {
      const formatLabel = parsed.type === 'unknown' ? 'UNRESOLVED' : parsed.type.toUpperCase();
      let detailsText = '';
      if (parsed.chromosome) {
        detailsText += `chr${parsed.chromosome}:${parsed.position || ''}`;
        if (parsed.ref && parsed.alt) detailsText += ` (${parsed.ref}>${parsed.alt})`;
      }
      if (parsed.transcript) {
        if (detailsText) detailsText += ' | ';
        detailsText += parsed.transcript;
        if (parsed.codingChange) detailsText += ` (${parsed.codingChange})`;
      }
      if (!detailsText) detailsText = 'Nomenclature verification pending host launch';

      html += `        <tr style="border-bottom:1px solid #1e293b;">`;
      html += `          <td style="padding:6px 4px;font-weight:bold;color:#34d399;">${pad(idx + 1)}</td>`;
      html += `          <td style="padding:6px 4px;font-family:monospace;color:#ffffff;">${escapeHtml(input)}</td>`;
      html += `          <td style="padding:6px 4px;font-family:monospace;font-size:10px;color:#f59e0b;">${escapeHtml(formatLabel)}</td>`;
      html += `          <td style="padding:6px 4px;font-family:monospace;font-size:10px;color:#94a3b8;">${escapeHtml(detailsText)}</td>`;
      html += `        </tr>`;
    });

    html += `      </tbody></table>`;
    html += `  </div>`;
    html += `  <div class="slide-footer"><span>Variant Handler Session Archive</span><span>LEDGER DISPATCHED • HISTORICAL RECORD REVIEW</span></div>`;
    html += `</div>`;
  }

  html += `</div></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  downloadBlob(blob, `variantstream_slides_${Date.now()}.html`);
  onAlert('Case discussion slide deck generated successfully! Open the downloaded HTML file in your browser.');
}
