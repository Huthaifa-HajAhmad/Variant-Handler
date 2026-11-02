/**
 * Hostname matching helpers.
 *
 * Matching is exact or dot-suffix only, so look-alike hosts such as
 * `evil-oncokb.org` and `oncokb.org.attacker.com` do not match `oncokb.org`.
 *
 * Both arguments are safely normalized: empty inputs fail closed (false),
 * and protocols, query strings, hashes, userinfo, ports, and paths
 * in either argument are stripped before comparison.
 */

export function hostIs(host: string, domain: string): boolean {
  if (!host || !domain) return false;

  let h = host.toLowerCase().trim();
  if (h.startsWith('http://') || h.startsWith('https://')) {
    try {
      h = new URL(h).hostname.toLowerCase().trim();
    } catch { /* invalid URL — fall through to string matching */ }
  }

  // Sanitize host and domain: strip protocol, userinfo, path/query/hash, and port
  h = h.replace(/^[a-z]+:\/\//i, '').split(/[\/?#]/)[0].split('@').pop()!.split(':')[0].trim();
  const d = domain.toLowerCase().trim().replace(/^[a-z]+:\/\//i, '').split(/[\/?#]/)[0].split('@').pop()!.split(':')[0].trim();

  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function hostMatchesAny(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostIs(host, domain));
}

export const MOBIDETAILS_DOMAINS = [
  'mobidetails.chu-montpellier.fr',
  'mobidetails.iurc.montp.inserm.fr',
] as const;

export function isMobiDetailsHost(host: string): boolean {
  return hostMatchesAny(host, MOBIDETAILS_DOMAINS);
}
