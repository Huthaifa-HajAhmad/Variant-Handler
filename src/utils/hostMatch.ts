/**
 * Hostname matching helpers.
 *
 * Matching is exact or dot-suffix only, so look-alike hosts such as
 * `evil-oncokb.org` and `oncokb.org.attacker.com` do not match `oncokb.org`.
 */

export function hostIs(host: string, domain: string): boolean {
  const h = host.toLowerCase().trim();
  // Strip any accidental protocol, port, or path components from domain
  const d = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0];
  return h === d || h.endsWith(`.${d}`);
}

export function hostMatchesAny(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostIs(host, domain));
}
