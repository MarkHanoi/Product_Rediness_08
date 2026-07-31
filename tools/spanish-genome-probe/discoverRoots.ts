/**
 * Generic geospatial-endpoint discovery for a Spanish municipality.
 *
 *   npx tsx tools/spanish-genome-probe/discoverRoots.ts <domain> [--extra host,host]
 *
 * This is ladder rung **R0/R1** of the pre-registered root-discovery ladder
 * (see GENOME-TEST-01-PREREGISTRATION.md §2): it takes ONLY a bare domain and
 * tries the standard host prefixes and standard service paths. It embeds no
 * city knowledge whatsoever — the same command works for any municipality.
 *
 * Every candidate is reported with its exact outcome. A 404, a DNS failure, a
 * TLS failure, a timeout and a 200-with-an-error-envelope are five different
 * results and are never collapsed into "not available".
 */

import { getJson, type Fetched } from './arcgisCrawler.js';

/** Standard sub-domain prefixes used by Spanish municipal SDIs. */
export const HOST_PREFIXES = [
  '',
  'www.',
  'geoportal.',
  'sig.',
  'gis.',
  'ide.',
  'mapas.',
  'mapa.',
  'cartografia.',
  'visor.',
  'geo.',
  'servicios.',
  'opendata.',
];

/** Standard ArcGIS Server / Portal REST catalogue paths. */
export const ARCGIS_PATHS = [
  '/arcgis/rest/services',
  '/server/rest/services',
  '/rest/services',
  '/hosted/rest/services', // MAD — this is Madrid's own shape
  '/arcgis/rest/services/', // trailing-slash variant some proxies require
  '/portal/rest/services',
  '/geoportal/rest/services',
];

/** Standard OGC capability paths, for the CH2 "does it expose anything?" question. */
export const OGC_PATHS = [
  '/geoserver/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
  '/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities',
  '/ogc/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
  '/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
];

export interface RootCandidate {
  readonly url: string;
  readonly kind: 'arcgis' | 'ogc';
  readonly outcome: Fetched<unknown>['status'] | 'ok-catalog' | 'ok-xml';
  readonly detail: string;
}

async function tryArcGis(url: string, timeoutMs: number): Promise<RootCandidate> {
  const r = await getJson<{ folders?: string[]; services?: unknown[]; currentVersion?: number }>(
    `${url}?f=json`,
    { timeoutMs },
  );
  if (r.status !== 'ok') {
    const detail =
      r.status === 'http-error'
        ? `HTTP ${r.httpStatus}`
        : r.status === 'arcgis-error'
          ? `ArcGIS ${r.code}: ${r.message}`
          : r.status === 'network-error'
            ? r.message
            : r.status;
    return { url, kind: 'arcgis', outcome: r.status, detail };
  }
  const v = r.value;
  const isCatalog = Array.isArray(v.folders) || Array.isArray(v.services) || typeof v.currentVersion === 'number';
  return {
    url,
    kind: 'arcgis',
    outcome: isCatalog ? 'ok-catalog' : 'parse-error',
    detail: isCatalog
      ? `folders=${v.folders?.length ?? 0} services=${v.services?.length ?? 0} version=${v.currentVersion ?? '?'}`
      : 'HTTP 200 JSON but not an ArcGIS catalogue',
  };
}

async function tryOgc(url: string, timeoutMs: number): Promise<RootCandidate> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return { url, kind: 'ogc', outcome: 'http-error', detail: `HTTP ${res.status}` };
    const text = (await res.text()).slice(0, 4000);
    const isCaps = /WFS_Capabilities|wfs:WFS_Capabilities|<ows:ServiceIdentification/i.test(text);
    return {
      url,
      kind: 'ogc',
      outcome: isCaps ? 'ok-xml' : 'parse-error',
      detail: isCaps ? 'WFS GetCapabilities returned' : `200 but not WFS caps (${text.slice(0, 80).replace(/\s+/g, ' ')})`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { url, kind: 'ogc', outcome: ac.signal.aborted ? 'timeout' : 'network-error', detail: msg };
  } finally {
    clearTimeout(t);
  }
}

export async function discoverRoots(
  domain: string,
  opts: { extraHosts?: string[]; timeoutMs?: number; concurrency?: number } = {},
): Promise<RootCandidate[]> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const hosts = [...HOST_PREFIXES.map((p) => `${p}${domain}`), ...(opts.extraHosts ?? [])];
  const jobs: (() => Promise<RootCandidate>)[] = [];
  for (const h of hosts) {
    for (const p of ARCGIS_PATHS) jobs.push(() => tryArcGis(`https://${h}${p}`, timeoutMs));
    for (const p of OGC_PATHS) jobs.push(() => tryOgc(`https://${h}${p}`, timeoutMs));
  }
  const out: RootCandidate[] = [];
  const conc = opts.concurrency ?? 12;
  let i = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (i < jobs.length) {
        const j = jobs[i++]!;
        out.push(await j());
      }
    }),
  );
  return out;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('spanish-genome-probe/discoverRoots.ts');
if (isMain) {
  const domain = process.argv[2];
  const extraIdx = process.argv.indexOf('--extra');
  if (!domain) {
    console.error('usage: tsx discoverRoots.ts <domain> [--extra host1,host2]');
    process.exit(2);
  }
  const extra = extraIdx >= 0 ? process.argv[extraIdx + 1]!.split(',') : [];
  discoverRoots(domain, { extraHosts: extra }).then((res) => {
    const hits = res.filter((r) => r.outcome === 'ok-catalog' || r.outcome === 'ok-xml');
    console.log(`\n=== HITS (${hits.length}/${res.length}) ===`);
    for (const h of hits) console.log(`  ${h.outcome.padEnd(11)} ${h.url}\n              ${h.detail}`);
    // Group the misses so "nothing found" is never reported as one undifferentiated failure.
    const byOutcome = new Map<string, number>();
    for (const r of res) if (!hits.includes(r)) byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1);
    console.log(`\n=== MISSES BY KIND ===`);
    for (const [k, v] of [...byOutcome].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
    const interesting = res.filter((r) => !hits.includes(r) && r.outcome !== 'network-error' && r.outcome !== 'timeout');
    console.log(`\n=== NON-DNS MISSES (host resolved, path wrong) ===`);
    for (const r of interesting) console.log(`  ${r.outcome.padEnd(11)} ${r.url}  — ${r.detail.slice(0, 90)}`);
  });
}
