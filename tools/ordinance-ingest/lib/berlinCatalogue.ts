// Layer 1 — the Berlin B-Plan CATALOGUE crawler.
//
// Pages the legacy `bplan` WFS into a local catalogue of plan records with their
// document links. Endpoint, layers and field names are exactly those the live
// PROBE VERDICT of 2026-07-31 established (§1–§3), NOT the earlier `plu_bplan`
// assumptions it corrected:
//   - service : https://gdi.berlin.de/services/wfs/bplan   (WFS 2.0.0, DL-DE/Zero-2.0)
//   - layers  : bplan:b_bp_fs (festgesetzt / in force), bplan:c_bp_ak (außer Kraft)
//   - fields  : grund_www = Begründungstext (THE EXTRACTOR'S TARGET)
//               scan_www  = Planzeichnung   (the drawing)
//               url_www   = portal page
//
// Metadata only — this crawl downloads no PDFs. It is a handful of requests for
// several thousand records, which is why the whole in-force population can be
// censused rather than sampled.

import { USER_AGENT, sleep } from './httpCache.js';

export const BERLIN_WFS = 'https://gdi.berlin.de/services/wfs/bplan';

/** The in-force layer — the one extraction targets. */
export const LAYER_IN_FORCE = 'bplan:b_bp_fs';
/** The repealed layer — carries document fields, but must never yield a live rule. */
export const LAYER_REPEALED = 'bplan:c_bp_ak';

/** One plan record, reduced to the fields the ingestion pipeline needs. */
export interface BerlinPlanRecord {
    readonly planid: string;
    readonly planname: string;
    readonly bezirk: string | null;
    readonly planartname: string | null;
    readonly rechtsstand: string | null;
    /** Begründung PDF — the extractor's target. `null` is a real, common answer. */
    readonly grund_www: string | null;
    /** Planzeichnung PDF (the drawing). */
    readonly scan_www: string | null;
    readonly url_www: string | null;
    /** Festsetzung date, when the register states one. */
    readonly festsg_am: string | null;
}

interface WfsFeature {
    readonly properties: Record<string, unknown>;
}

const asString = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' || s.toLowerCase() === 'none' ? null : s;
};

/** Count features in a layer without downloading them (`RESULTTYPE=hits`). */
export async function countFeatures(layer: string): Promise<number> {
    const url =
        `${BERLIN_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
        `&TYPENAMES=${encodeURIComponent(layer)}&RESULTTYPE=hits`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`WFS hits failed for ${layer}: HTTP ${res.status}`);
    const xml = await res.text();
    const m = xml.match(/numberMatched="(\d+)"/);
    if (!m) throw new Error(`WFS hits response for ${layer} carried no numberMatched.`);
    return Number(m[1]);
}

/**
 * Page a whole layer into plan records. Sequential, with a polite delay between
 * pages — this is a public-sector server and the whole crawl is only a few requests.
 */
export async function crawlLayer(
    layer: string,
    options: { pageSize?: number; politeDelayMs?: number; max?: number } = {},
): Promise<BerlinPlanRecord[]> {
    const { pageSize = 1000, politeDelayMs = 700, max } = options;
    const total = await countFeatures(layer);
    const target = max === undefined ? total : Math.min(total, max);
    const out: BerlinPlanRecord[] = [];

    for (let start = 0; start < target; start += pageSize) {
        const count = Math.min(pageSize, target - start);
        const url =
            `${BERLIN_WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
            `&TYPENAMES=${encodeURIComponent(layer)}&OUTPUTFORMAT=application/json` +
            `&COUNT=${count}&STARTINDEX=${start}`;
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) throw new Error(`WFS GetFeature failed at ${start}: HTTP ${res.status}`);
        const body = (await res.json()) as { features?: WfsFeature[] };
        for (const f of body.features ?? []) {
            const p = f.properties;
            const planid = asString(p['planid']);
            if (planid === null) continue;
            out.push({
                planid,
                planname: asString(p['planname']) ?? planid,
                bezirk: asString(p['bezirk']),
                planartname: asString(p['planartname']),
                rechtsstand: asString(p['bp_rechtsstand']),
                grund_www: asString(p['grund_www']),
                scan_www: asString(p['scan_www']),
                url_www: asString(p['url_www']),
                festsg_am: asString(p['festsg_am']),
            });
        }
        if (start + pageSize < target) await sleep(politeDelayMs);
    }
    return out;
}

/** Document-availability census over a set of plan records (no downloads). */
export interface DocumentAvailability {
    readonly plans: number;
    readonly withBegruendung: number;
    readonly withPlanzeichnungOnly: number;
    readonly withNoDocument: number;
}

export function documentAvailability(plans: readonly BerlinPlanRecord[]): DocumentAvailability {
    let withBegruendung = 0;
    let withPlanzeichnungOnly = 0;
    let withNoDocument = 0;
    for (const p of plans) {
        if (p.grund_www !== null) withBegruendung += 1;
        else if (p.scan_www !== null) withPlanzeichnungOnly += 1;
        else withNoDocument += 1;
    }
    return {
        plans: plans.length,
        withBegruendung,
        withPlanzeichnungOnly,
        withNoDocument,
    };
}

/**
 * Deterministic sample of a plan list. Seeded so a reported statistic can be
 * reproduced exactly — an unreproducible sample is an anecdote.
 */
export function seededSample<T>(items: readonly T[], n: number, seed: number): T[] {
    // mulberry32 — small, fast, and deterministic across platforms.
    let s = seed >>> 0;
    const rand = (): number => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j] as T, pool[i] as T];
    }
    return pool.slice(0, Math.min(n, pool.length));
}
