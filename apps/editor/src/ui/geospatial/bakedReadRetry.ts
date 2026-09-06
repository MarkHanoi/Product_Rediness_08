// bakedReadRetry.ts — §CTX-READ-RETRY (L-12937) — retry a BAKED context-tile read on a TRANSIENT
// failure before anything falls back to live Overpass. PURE: no network, no DOM, no pmtiles; the
// sleep is injectable so the spec drives it with fake timers.
//
// THE DEFECT THIS CLOSES (founder, 2026-09-05, "I NEED CONSISTENCY"):
//   • Jouy-en-Josas — the console carried `§CTX-PMTILES-READER landuse/parks/rail/trees/water … from
//     baked tile(s)` lines and NO `roads` line, then `§OVERPASS-CLIENT-FAILOVER — the proxy reported
//     ALL upstream mirrors failed (429/timeout)`, and the founder saw no roads.
//   • Amsterdam, same day — landuse/parks/rail/tree tile reads failed while a publish was uploading
//     to R2 (reads racing a publish → 503 / rate-limit).
// In both, ONE transient failure of the baked read (a 5xx, a dropped connection, a half-written
// object that does not decode) fell STRAIGHT through to Overpass — the third party that L-513
// proved cannot be made reliable — so a layer was missing on one load and present on the next.
// The baked tiles are static bytes on a CDN: a second read seconds later is overwhelmingly likely
// to succeed, and costs one coalesced range request per failed tile (§CTX-TILE-DECODE-CACHE keeps
// every tile that DID read). Retrying the cheap, reliable source before consulting the expensive,
// unreliable one is the whole change.
//
// HONESTY (§CONTEXT-DATA-HONESTY, C57 §1.5/§1.9, C58 §1.2) — what is and is NOT retried:
//   • an honest EMPTY is a VALUE, not an error. `withBakedReadRetry` retries only on a THROWN
//     error the classifier accepts; a resolved `[]` / `ok, 0 features` returns at once. Re-asking
//     for a second opinion on "nothing is mapped here" is the L-467/L-469 conflation in a new coat.
//   • a 403/404 on the archive is NOT transient — the object is not published under this stamp
//     and will not appear mid-session (a re-bake ships a new `CONTEXT_TILESET_VERSION`). It is
//     never retried; §CTX-KNOWN-MISSING memoises it for the session.
//   • an ABORT is the caller cancelling (§L-579) — never retried, and a retry back-off that is
//     interrupted by an abort stops immediately.
//   • structural refusals (zoom below the tileset floor, bbox over the tile cap, unsupported
//     archive spec/compression) are not transient and are not retried.
// What IS retried: network errors (`Failed to fetch`, `NetworkError`, `Load failed`), HTTP 5xx,
// 429/408, and DECODE failures (wrong magic, empty/undecodable directory, bad MVT bytes, a body
// that fails the byte-serving check) — the signatures of a hiccup, a rate-limit or a half-written
// object, all of which clear on their own.
//
// ⚠ THE L-NUMBER IS AMBIGUOUS AND THE TAG IS NOT — GREP `§CTX-READ-RETRY`, NOT `L-12937`.
// L-12959 records that `L-12922`–`L-12941` are DOUBLE-BOOKED in `docs/04-reference/ISSUE-LOG.md`:
// the register's `L-12937` is the NZ keyed parcel leg, the 2026-09-05 close section's `L-12937` is
// the France measured-height gate (and landed commits cite it that way), while the close row that
// actually describes THIS work is `L-12936` — whose register twin is the C77 secrets ratchet. This
// lane was assigned `L-12937` by the orchestrator and cites it, but the tag is the identifier that
// resolves to exactly one thing.
//
// ⚠ THE RETRY IS NOT ENOUGH ON ITS OWN — see `contextTiles.ts` §CTX-READ-RETRY-EVICT. pmtiles'
// `SharedPromiseCache` stores the header/directory PROMISE before it settles and never evicts a
// REJECTED one, so a retry through the same `PMTiles` instance would replay the cached rejection
// without touching the network. The `onRetry` hook exists so the caller can drop that instance
// first; this module deliberately knows nothing about pmtiles.

/** How a baked read failed — decides whether a retry could plausibly clear it. */
export type BakedReadFailureKind =
    /** `fetch` rejected: DNS, connection reset, offline, CORS/CSP refusal surfaced as a TypeError. */
    | 'network'
    /** HTTP 500–599 on a range request (the proxy's 502/504, R2's 500/503). */
    | 'http-5xx'
    /** HTTP 429 / 408 — rate-limited or request-timeout; the archive exists. */
    | 'http-429'
    /** HTTP 400–499 other than 429/408 — 403/404 = NOT PUBLISHED, 416 = stale directory. Not transient. */
    | 'http-4xx'
    /** The bytes arrived but do not decode: wrong magic, empty directory, bad MVT, byte-serving check. */
    | 'decode'
    /** The caller cancelled (`AbortError`). Never retried. */
    | 'abort'
    /** Anything else (unsupported spec version / compression, directory depth, …). Not retried. */
    | 'unknown';

/** The kinds a retry is allowed to follow. Everything else returns at once. */
export const RETRYABLE_BAKED_READ_KINDS: ReadonlySet<BakedReadFailureKind> =
    new Set<BakedReadFailureKind>(['network', 'http-5xx', 'http-429', 'decode']);

/** A typed failure the reader throws to drive the retry — carries the classified `kind`. */
export class BakedReadError extends Error {
    readonly kind: BakedReadFailureKind;
    readonly status: number | undefined;
    constructor(message: string, kind: BakedReadFailureKind, status?: number) {
        super(message);
        this.name = 'BakedReadError';
        this.kind = kind;
        this.status = status;
    }
}

/** The message of an arbitrary thrown value, never throwing itself. */
export function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message || err.name || 'Error';
    if (typeof err === 'string') return err;
    try { return String(err); } catch { return 'unknown error'; }
}

const HTTP_STATUS_RE = /Bad response code: (\d{3})\b/;
const NETWORK_RE = /failed to fetch|networkerror|network error|load failed|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network request failed/i;
// pmtiles header/directory decode + the byte-serving check + MVT/pbf parse failures.
const DECODE_RE = /wrong magic number|empty directory is invalid|expected varint|content-length|byte serving|failed to read response stream|unimplemented type|unexpected end|invalid wire type|incorrect header check|invalid (?:block|distance|stored)|unknown compression|decompress/i;
// Structural — the archive itself is not readable by this client; a retry cannot change that.
const STRUCTURAL_RE = /spec version|compression method not supported|maximum directory depth|exceeds max safe|outside zoom level bounds/i;

/**
 * Classify a thrown baked-read failure. Recognises the reader's OWN transport errors
 * (`Bad response code: NNN`, the byte-serving check), pmtiles' header/directory errors, pbf/MVT
 * decode errors and the browser's fetch TypeErrors. Unknown shapes are `unknown` (NOT retried) —
 * the retry is opt-in by evidence, never by default.
 */
export function classifyBakedReadError(err: unknown): { kind: BakedReadFailureKind; status?: number; message: string } {
    if (err instanceof BakedReadError) return { kind: err.kind, status: err.status, message: err.message };
    const name = err instanceof Error ? err.name : (err as { name?: unknown } | null)?.name;
    const message = errorMessage(err);
    if (name === 'AbortError') return { kind: 'abort', message };
    const m = HTTP_STATUS_RE.exec(message);
    if (m) {
        const status = Number(m[1]);
        if (status >= 500) return { kind: 'http-5xx', status, message };
        if (status === 429 || status === 408) return { kind: 'http-429', status, message };
        if (status >= 400) return { kind: 'http-4xx', status, message };
        return { kind: 'unknown', status, message };
    }
    if (STRUCTURAL_RE.test(message)) return { kind: 'unknown', message };
    if (NETWORK_RE.test(message) || (err instanceof TypeError && /fetch/i.test(message))) {
        return { kind: 'network', message };
    }
    if (DECODE_RE.test(message)) return { kind: 'decode', message };
    return { kind: 'unknown', message };
}

/** Does a retry stand a chance? The default `isRetryable` for `withBakedReadRetry`. */
export function isRetryableBakedReadError(err: unknown): boolean {
    return RETRYABLE_BAKED_READ_KINDS.has(classifyBakedReadError(err).kind);
}

/** What `onRetry` is told, once per retry, BEFORE the back-off sleep. */
export interface BakedReadRetryEvent {
    /** The attempt that just failed (1-based). The retry about to run is `attempt + 1`. */
    readonly attempt: number;
    /** The total attempts the policy allows. */
    readonly attempts: number;
    /** How long the back-off before the next attempt will be. */
    readonly delayMs: number;
    /** The error the failed attempt threw. */
    readonly error: unknown;
}

export interface BakedReadRetryOptions {
    /** Total attempts INCLUDING the first. `1` = no retry. Default 3. */
    readonly attempts?: number;
    /**
     * Back-off before retry k (1-based) is `delaysMs[k - 1]`; a policy with more retries than
     * delays reuses the last delay. Default `[400, 1500, 4000]`.
     */
    readonly delaysMs?: readonly number[];
    /** Whether the thrown error is worth a retry. Default `isRetryableBakedReadError`. */
    readonly isRetryable?: (err: unknown) => boolean;
    /** Called once per retry, before the sleep. Throwing here aborts the retry (the error propagates). */
    readonly onRetry?: (event: BakedReadRetryEvent) => void;
    /** A caller cancellation. When it fires, no further attempt is made and the LAST error is rethrown. */
    readonly signal?: AbortSignal;
    /** Test seam — the back-off sleep. Default `setTimeout`, abort-aware. */
    readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export const DEFAULT_BAKED_READ_ATTEMPTS = 3;
export const DEFAULT_BAKED_READ_DELAYS_MS: readonly number[] = [400, 1500, 4000];

/** `setTimeout` as a promise that resolves EARLY (not rejects) when `signal` aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
        if (signal?.aborted) { resolve(); return; }
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onAbort = (): void => {
            if (timer !== null) clearTimeout(timer);
            resolve();
        };
        timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, Math.max(0, ms));
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * Run `fn` up to `attempts` times, sleeping `delaysMs[k-1]` before retry k, retrying ONLY when
 * `fn` THROWS an error `isRetryable` accepts. A resolved value — an honest empty included — is
 * returned at once and is never retried. After the last attempt (or on a non-retryable error, or
 * an abort during the back-off) the LAST error is rethrown unchanged, so the caller can still
 * read its kind.
 *
 * `fn` receives the 1-based attempt number.
 */
export async function withBakedReadRetry<T>(
    fn: (attempt: number) => Promise<T>,
    options: BakedReadRetryOptions = {},
): Promise<T> {
    const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_BAKED_READ_ATTEMPTS));
    const delays = options.delaysMs && options.delaysMs.length > 0 ? options.delaysMs : DEFAULT_BAKED_READ_DELAYS_MS;
    const isRetryable = options.isRetryable ?? isRetryableBakedReadError;
    const sleep = options.sleep ?? abortableSleep;
    const signal = options.signal;

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn(attempt);
        } catch (err) {
            lastError = err;
            const isLast = attempt >= attempts;
            if (isLast || signal?.aborted || !isRetryable(err)) throw err;
            const delayMs = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
            options.onRetry?.({ attempt, attempts, delayMs, error: err });
            await sleep(delayMs, signal);
            // The back-off was cut short by the caller cancelling: do not spend another attempt.
            if (signal?.aborted) throw err;
        }
    }
    // Unreachable — every path inside the loop returns or throws — kept for the type checker.
    throw lastError;
}
