import { describe, it, expect, beforeEach } from 'vitest';
import { fillIntervarForm } from '../content/intervarForm';

function buildIntervarDom(): void {
  document.body.innerHTML = `
    <form>
      <select name="build">
        <option value="hg19_update_2025">hg19_updated.v.202508</option>
        <option value="hg38_update_2025">hg38_updated.v.202508</option>
      </select>
      <select name="chr">
        <option value="1">1</option>
        <option value="7">7</option>
        <option value="16">16</option>
      </select>
      <input type="text" name="pos" />
      <input type="text" name="ref" />
      <input type="text" name="alt" />
    </form>
  `;
}

describe('fillIntervarForm', () => {
  beforeEach(buildIntervarDom);

  it('fills build, chromosome, position, ref and alt', () => {
    const ok = fillIntervarForm('GRCh38', {
      chromosome: '16',
      position: '66823281',
      ref: 'T',
      alt: 'C',
    });

    expect(ok).toBe(true);
    expect((document.querySelector('select[name="build"]') as HTMLSelectElement).value).toBe('hg38_update_2025');
    expect((document.querySelector('select[name="chr"]') as HTMLSelectElement).value).toBe('16');
    expect((document.querySelector('input[name="pos"]') as HTMLInputElement).value).toBe('66823281');
    expect((document.querySelector('input[name="ref"]') as HTMLInputElement).value).toBe('T');
    expect((document.querySelector('input[name="alt"]') as HTMLInputElement).value).toBe('C');
  });

  it('selects the hg19 build for GRCh37', () => {
    fillIntervarForm('GRCh37', { chromosome: '7', position: '140453136', ref: 'A', alt: 'T' });
    expect((document.querySelector('select[name="build"]') as HTMLSelectElement).value).toBe('hg19_update_2025');
  });

  it('returns false when coordinates are missing', () => {
    expect(fillIntervarForm('GRCh38', {})).toBe(false);
    expect(fillIntervarForm('GRCh38', undefined)).toBe(false);
    expect(fillIntervarForm('GRCh38', { chromosome: '7' })).toBe(false);
  });

  it('matches chromosome select options when options use chr prefix (e.g. value="chr7")', () => {
    document.body.innerHTML = `
      <form>
        <select name="build">
          <option value="hg38_update_2025">hg38_updated.v.202508</option>
        </select>
        <select name="chr">
          <option value="chr1">chr1</option>
          <option value="chr7">chr7</option>
          <option value="chrX">chrX</option>
        </select>
        <input type="text" name="pos" />
        <input type="text" name="ref" />
        <input type="text" name="alt" />
      </form>
    `;

    const ok = fillIntervarForm('GRCh38', {
      chromosome: '7',
      position: '140453136',
      ref: 'A',
      alt: 'T',
    });
    expect(ok).toBe(true);
    expect((document.querySelector('select[name="chr"]') as HTMLSelectElement).value).toBe('chr7');

    fillIntervarForm('GRCh38', {
      chromosome: 'chrX',
      position: '1000',
      ref: 'C',
      alt: 'G',
    });
    expect((document.querySelector('select[name="chr"]') as HTMLSelectElement).value).toBe('chrX');
  });

  it('matches chromosome select option when option has no chr prefix but coordinates has chr prefix', () => {
    const ok = fillIntervarForm('GRCh38', {
      chromosome: 'chr7',
      position: '140453136',
      ref: 'A',
      alt: 'T',
    });
    expect(ok).toBe(true);
    expect((document.querySelector('select[name="chr"]') as HTMLSelectElement).value).toBe('7');
  });
});
