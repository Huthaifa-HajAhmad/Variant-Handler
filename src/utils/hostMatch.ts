/**
 * Hostname matching helpers.
 *
 * Matching is exact or dot-suffix only, so look-alike hosts such as
 * `evil-oncokb.org` and `oncokb.org.attacker.com` do not match `oncokb.org`.
 */

export function hostIs(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

export function hostMatchesAny(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostIs(host, domain));
}
