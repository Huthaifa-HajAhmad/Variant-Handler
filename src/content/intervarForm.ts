/**
 * InterVar form autofill helpers.
 *
 * InterVar is a POST form behind reCAPTCHA, so no URL can encode a variant.
 * These helpers populate its build/chr/pos/ref/alt fields; the user submits.
 * Kept in a separate module so they can be unit-tested outside the content
 * script entry point.
 */
import { hgBuild } from '../utils/genomeBuild';

export interface VariantCoordinates {
  chromosome?: string;
  position?: string;
  ref?: string;
  alt?: string;
}

export function fillIntervarForm(
  genomeBuild: string | undefined,
  coordinates?: VariantCoordinates,
): boolean {
  if (!coordinates?.chromosome || !coordinates.position) return false;

  const setSelect = (name: string, matcher: (value: string, label: string) => boolean): void => {
    const select = document.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    if (!select) return;
    const option = Array.from(select.options).find(o => matcher(o.value, (o.textContent ?? '').trim()));
    if (!option) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const setInput = (name: string, value?: string): void => {
    if (!value) return;
    const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const wantedHg = genomeBuild === 'GRCh37' ? hgBuild('GRCh37') : hgBuild('GRCh38');
  const chrom = coordinates.chromosome.toUpperCase();

  setSelect('build', (value, label) =>
    value.toLowerCase().startsWith(wantedHg) || label.toLowerCase().startsWith(wantedHg));
  setSelect('chr', (value, label) =>
    value.toUpperCase() === chrom || label.toUpperCase() === chrom);
  setInput('pos', coordinates.position);
  setInput('ref', coordinates.ref);
  setInput('alt', coordinates.alt);
  return true;
}
