// Layer 1 — ACQUISITION adapter: a polite, caching HTTP fetcher for ordinance PDFs.
//
// This is the I/O ADAPTER for the pure taxonomy in
// `@pryzm/ordinance-extraction` (`ingest/types.ts`). The package stays pure and
// network-free; this file does the fetching and maps every outcome onto that
// package's `AcquisitionOutcome` so a 404, a timeout and a missing link never
// collapse into one another.
//
// POLITENESS IS A HARD REQUIREMENT, not a nicety. These are public-sector servers
// funded by the city of Berlin, serving an open licence (DL-DE/Zero-2.0) as a
// courtesy. This client therefore:
//   - identifies itself honestly in the User-Agent, with a contact address;
//   - serialises requests per host and sleeps between them;
//   - retries only on transient failures, with exponential backoff;
//   - caches on disk keyed by URL, so a document is fetched exactly ONCE ever;
//   - honours a hard cap on total bytes so a run cannot become a bulk mirror.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AcquisitionOutcome } from '../../../packages/ordinance-extraction/src/ingest/types.js';

export const USER_AGENT =
    'PRYZM-planning-research/1.0 (non-commercial planning-data research; contact: pryzmhello@gmail.com)';

export interface FetchOptions {
    /** Directory the raw PDFs and their metadata are cached in. */
    readonly cacheDir: string;
    /** Milliseconds to sleep after each network request. Default 800. */
    readonly politeDelayMs?: number;
    /** Per-request timeout in ms. Default 120_000 (some Begründungen are 10 MB+). */
    readonly timeoutMs?: number;
    /** Retries for transient failures (timeout / 5xx). Default 2. */
    readonly retries?: number;
}

export const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/** A stable, filesystem-safe cache key for a URL. */
export function cacheKey(url: string): string {
    return createHash('sha256').update(url).digest('hex').slice(0, 32);
}

function pathsFor(cacheDir: string, url: string): { pdf: string; meta: string } {
    const key = cacheKey(url);
    // Two-level fan-out keeps directories small on a few-thousand-file corpus.
    const dir = join(cacheDir, key.slice(0, 2));
    return { pdf: join(dir, `${key}.pdf`), meta: join(dir, `${key}.json`) };
}

/** Is a byte buffer actually a PDF? (A 200-OK HTML error page is the classic trap.) */
function looksLikePdf(bytes: Uint8Array): boolean {
    // "%PDF-" — allow a small leading-junk offset, which real-world PDFs have.
    const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
    return head.includes('%PDF-');
}

/** Transient failures worth a retry; everything else is reported immediately. */
function isTransient(status: number): boolean {
    return status >= 500 || status === 408;
}

// ── PER-HOST THROTTLE ────────────────────────────────────────────────────────
// Learned the hard way on 2026-07-31: a 3-way-concurrent run against
// www.berlin.de earned 284 consecutive HTTP 429s. Concurrency across DIFFERENT
// hosts is fine and polite; concurrency against ONE host is not. So every request
// to a given host is serialised behind that host's own promise chain and spaced by
// a minimum gap, and a 429 makes this process back off from that host globally —
// not just on the one request that happened to receive it.
const hostChain = new Map<string, Promise<void>>();
const hostNextAllowedAt = new Map<string, number>();

/** Minimum gap between two requests to the same host. */
const HOST_MIN_GAP_MS = 1_500;

/** Run `fn` serialised per host, respecting that host's cool-down. */
async function withHostLock<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const prior = hostChain.get(host) ?? Promise.resolve();
    let release!: () => void;
    hostChain.set(
        host,
        prior.then(() => new Promise<void>((r) => (release = r))),
    );
    await prior;
    try {
        const waitUntil = hostNextAllowedAt.get(host) ?? 0;
        const wait = waitUntil - Date.now();
        if (wait > 0) await sleep(wait);
        return await fn();
    } finally {
        hostNextAllowedAt.set(host, Date.now() + HOST_MIN_GAP_MS);
        release();
    }
}

/** Back off from a host after a 429, honouring `Retry-After` when it is sane. */
function noteRateLimit(host: string, retryAfter: string | null): number {
    const seconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
    const cool = Math.min(Math.max(seconds, 30), 300) * 1000;
    hostNextAllowedAt.set(host, Date.now() + cool);
    return cool;
}

/**
 * Acquire one PDF, using the on-disk cache when possible.
 *
 * `url === null` is NOT an error path — it is the `no-document-link` outcome, which
 * is what a German legacy plan with `grund_www = null` legitimately produces. It
 * never touches the network.
 */
export async function acquirePdf(
    url: string | null,
    options: FetchOptions,
): Promise<AcquisitionOutcome> {
    if (url === null || url.trim() === '') {
        return {
            ok: false,
            reason: 'no-document-link',
            url: null,
            status: null,
            detail: 'The plan record carries no document URL. Nothing to fetch — this is the register being honest, not a failure.',
        };
    }

    const { cacheDir, politeDelayMs = 800, timeoutMs = 120_000, retries = 2 } = options;
    const { pdf: pdfPath, meta: metaPath } = pathsFor(cacheDir, url);

    // ── Cache hit: never re-fetch what we already have. ──
    try {
        const cachedMeta = JSON.parse(await readFile(metaPath, 'utf8')) as AcquisitionOutcome;
        if (cachedMeta.ok) {
            await stat(pdfPath); // confirm the body is still there
            return { ...cachedMeta, fromCache: true };
        }
        // A cached PERMANENT failure (404, not-a-pdf) is also worth honouring, so a
        // corpus run does not hammer known-dead links on every pass.
        if (cachedMeta.reason === 'http-not-found' || cachedMeta.reason === 'not-a-pdf') {
            return cachedMeta;
        }
    } catch {
        // No usable cache entry — fall through and fetch.
    }

    let lastDetail = '';
    let lastStatus: number | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await sleep(politeDelayMs * 2 ** attempt); // backoff

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const host = (() => {
            try {
                return new URL(url).host;
            } catch {
                return url;
            }
        })();
        try {
            const res = await withHostLock(host, () =>
                fetch(url, {
                    signal: controller.signal,
                    headers: { 'User-Agent': USER_AGENT, Accept: 'application/pdf,*/*' },
                    redirect: 'follow',
                }),
            );
            lastStatus = res.status;

            // 429 — we were rude. Back off from the whole host, and report it as
            // its own reason: this document was NOT examined, and it is certainly
            // not missing. Never cached, because nothing was learned about it.
            if (res.status === 429) {
                const cool = noteRateLimit(host, res.headers.get('retry-after'));
                if (attempt < retries) {
                    await sleep(cool);
                    continue;
                }
                return {
                    ok: false,
                    reason: 'rate-limited',
                    url,
                    status: 429,
                    detail: `Host ${host} returned 429 (rate limited). The document was NOT examined — this says nothing about whether it exists or has a text layer. Slow down and retry.`,
                };
            }

            if (res.status === 404 || res.status === 410) {
                const out: AcquisitionOutcome = {
                    ok: false,
                    reason: 'http-not-found',
                    url,
                    status: res.status,
                    detail: `The register links this document but the host returns ${res.status}. A broken link is a register defect — distinct from a plan that simply has no document.`,
                };
                await persistMeta(metaPath, out);
                await sleep(politeDelayMs);
                return out;
            }

            if (!res.ok) {
                lastDetail = `HTTP ${res.status} ${res.statusText}`;
                if (isTransient(res.status) && attempt < retries) continue;
                const out: AcquisitionOutcome = {
                    ok: false,
                    reason: 'http-error',
                    url,
                    status: res.status,
                    detail: lastDetail,
                };
                await sleep(politeDelayMs);
                return out;
            }

            const bytes = new Uint8Array(await res.arrayBuffer());
            await sleep(politeDelayMs);

            if (bytes.byteLength === 0) {
                return {
                    ok: false,
                    reason: 'empty-body',
                    url,
                    status: res.status,
                    detail: '200 OK with a zero-byte body.',
                };
            }
            if (!looksLikePdf(bytes)) {
                const out: AcquisitionOutcome = {
                    ok: false,
                    reason: 'not-a-pdf',
                    url,
                    status: res.status,
                    detail: `200 OK but the body is not a PDF (content-type ${res.headers.get('content-type') ?? 'unknown'}). Most often a portal HTML error page served with status 200.`,
                };
                await persistMeta(metaPath, out);
                return out;
            }

            const sha256 = createHash('sha256').update(bytes).digest('hex');
            const success: AcquisitionOutcome = {
                ok: true,
                url,
                status: res.status,
                byteLength: bytes.byteLength,
                sha256,
                contentType: res.headers.get('content-type'),
                fetchedAt: new Date().toISOString(),
                fromCache: false,
            };
            await mkdir(dirname(pdfPath), { recursive: true });
            await writeFile(pdfPath, bytes);
            await persistMeta(metaPath, success);
            return success;
        } catch (err) {
            const e = err as Error;
            const aborted = e.name === 'AbortError';
            lastDetail = aborted ? `Timed out after ${timeoutMs} ms` : e.message;
            if (attempt < retries) continue;
            return {
                ok: false,
                reason: aborted ? 'timeout' : 'network-error',
                url,
                status: lastStatus,
                detail: lastDetail,
            };
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        ok: false,
        reason: 'network-error',
        url,
        status: lastStatus,
        detail: lastDetail || 'Exhausted retries.',
    };
}

async function persistMeta(metaPath: string, outcome: AcquisitionOutcome): Promise<void> {
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(outcome, null, 2), 'utf8');
}

/** The on-disk path of a cached PDF (whether or not it exists). */
export function cachedPdfPath(cacheDir: string, url: string): string {
    return pathsFor(cacheDir, url).pdf;
}
