/**
 * snapshotUrlScan.js — §SCAN-SNAPSHOT-URLS (L-10042)
 *
 * A BOUNDED value-level scan of the untrusted version snapshot posted to
 * `POST /api/projects/:id/versions`.
 *
 * WHAT IT CLOSES. The route validates the snapshot with a Zod schema that is
 * `.passthrough()` at every level and strictly types exactly one array
 * (`furniture`). Nothing looks at a single string VALUE. Snapshots carry
 * texture, GLB and CDN URLs that other collaborators fetch and render, so a
 * `javascript:` or private-network URL persisted here is served back to every
 * member of the project. Pascal's `graph-schema.ts` names two real bypasses of
 * exactly this class that it had to close (its Phase 8 P4 POST bypass and its
 * Phase 10 A2 PUT bypass).
 *
 * ⚠ "BOUNDED" IS THE OPERATIVE WORD, AND THE BOUND IS THE HONEST PART.
 * An unbounded walk over a 38 MB snapshot on every autosave is a denial of
 * service you wrote yourself. Two bounds, for two different attacks:
 *
 *   MAX_SCAN_DEPTH  = 48       — a nest of arrays cannot overflow the stack.
 *                                (This walk is iterative, so depth is a budget,
 *                                not a stack limit; the cap is kept so a
 *                                pathological nest cannot make the frontier grow
 *                                without bound either.)
 *   MAX_SCAN_VALUES = 500 000  — a wide-but-flat body cannot burn the request
 *                                budget.
 *
 * ⭐ THE COST, MEASURED — not asserted. Synthetic BIM snapshots (walls, joins,
 * finishes plus a temporal journal ten times their size), Node 24, median of 9
 * with a gc between runs, against the `JSON.stringify` the route ALREADY pays to
 * enforce its 50 MB size cap:
 *
 *     size      bounded    values visited            unbounded    route stringify
 *     0.7 MB      16 ms     60 815   FULL                18 ms       5 ms
 *     4.4 MB     111 ms    380 015   FULL               128 ms      38 ms
 *    17.8 MB      73 ms    500 000   TRUNCATED          366 ms     145 ms
 *    35.9 MB      57 ms    500 000   TRUNCATED          766 ms     277 ms
 *
 * ⭐ THE SHAPE IS THE POINT, not any single figure. Bounded cost STOPS GROWING
 * once the budget binds — the two largest snapshots cost LESS than the 4.4 MB one
 * because they truncate sooner in a denser part of the tree. Unbounded cost grows
 * linearly with the payload, to 766 ms on a 36 MB body, on every autosave, on the
 * single request thread. That is the denial of service the bound refuses.
 *
 * ⚠ 500 000 was chosen by measurement, not taste: it fully covers a snapshot up
 * to roughly 4-5 MB, and truncating above that is the deliberate trade. Full
 * coverage of a 36 MB body is the 766 ms column, per save.
 *
 * ⛔ THE CONSEQUENCE, STATED RATHER THAN HIDDEN: on a snapshot larger than the
 * value budget the scan is a SAMPLER, NOT A PROOF. It returns
 * `truncated: true`, and a caller that treats `findings.length === 0` on a
 * truncated scan as "this payload is clean" is wrong. That is why this ships in
 * REPORT-ONLY mode: it logs what it WOULD have rejected and rejects nothing.
 *
 * ⛔ REPORT-ONLY IS DELIBERATE AND IS NOT A TODO. Turning it into a refusal
 * before the allowlist has been measured against a week of real founder saves
 * would 400 legitimate saves, which is worse than the hole it closes. The exit
 * condition is written at the bottom of this file.
 *
 * No new dependencies. No network. Uses only the global `URL` parser.
 *
 * Contract: C22 (privacy / PII tier — what leaves the tenant), C08 §5 (wire
 * validation). Ported from docs/04-reference/AUDIT/D-collab-persistence.md §3.7 and §6 row 4.
 */

/** Maximum container nesting the walk will descend. */
export const MAX_SCAN_DEPTH = 48;

/** Maximum individual values the walk will visit before stopping. */
export const MAX_SCAN_VALUES = 500_000;

/**
 * Schemes that must never appear in a persisted snapshot value. `data:` is
 * included because `data:text/html` and `data:image/svg+xml` are both script
 * carriers; a legitimate raster data URI is caught by the same rule and is a
 * deliberate part of what report-only mode is measuring.
 */
export const DANGEROUS_SCHEMES = Object.freeze([
    'javascript', 'vbscript', 'data', 'file', 'blob', 'about', 'chrome', 'jar', 'view-source',
]);

/**
 * Hostnames and address shapes that an http(s) URL in a snapshot must never
 * name. Fetching one of these from the render path is a server-side request
 * forgery against the deployment's own network.
 */
const PRIVATE_HOST_PATTERNS = Object.freeze([
    /^localhost$/i,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,                 // link-local, incl. 169.254.169.254 cloud metadata
    /^metadata\./i,
    /\.internal$/i,
    /\.local$/i,
    /^\[?f[cd][0-9a-f]{2}:/i,      // IPv6 unique-local
]);

/**
 * Anything that could plausibly be a URL. Deliberately loose — the classifier
 * below decides; this only keeps the walk from parsing every label and GUID in
 * the model.
 */
const URLISH = /(^\s*[a-z][a-z0-9+.-]*\s*:)|(^\s*\/\/)/i;

/**
 * Strip the characters a browser strips from a URL BEFORE it resolves the
 * scheme, so a naive `startsWith` cannot be walked past.
 *
 * Per the WHATWG URL parser, ASCII tab / LF / CR are REMOVED from anywhere in
 * the input and leading/trailing C0 controls and spaces are TRIMMED. So
 * `java<TAB>script:alert(1)` and `java<NUL>script:alert(1)` both execute as
 * `javascript:` while failing a literal prefix test. Interior ASCII SPACE is
 * deliberately NOT removed: browsers do not remove it either, and removing it
 * here would turn ordinary prose such as a note reading `Data: 12` into a
 * scheme match. Pascal strips C0 for the same reason and says so.
 *
 * @param {string} raw
 */
export function normaliseForSchemeMatch(raw) {
    // eslint-disable-next-line no-control-regex
    return raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, '').trim();
}

/**
 * A `data:` value is only a data URI when it actually has the media-type and
 * comma the syntax requires. Without this, the single word `Data:` at the
 * start of a description field would be classified as a dangerous scheme —
 * a false positive on a legitimate save, which is the failure mode this whole
 * module is forbidden to commit.
 */
const DATA_URI = /^data:[a-z0-9!#$&^_.+-]*\/?[a-z0-9!#$&^_.+-]*(;[^,]*)?,/i;

/**
 * Classify one string value.
 *
 * @param {string} value
 * @returns {{kind: string, detail: string}|null} null when the value is not a
 *   URL, or is a URL this scan has no objection to.
 */
export function classifyUrlValue(value) {
    if (typeof value !== 'string' || value.length < 4) return null;
    // ⭐ THE HOT PRE-FILTER. A BIM snapshot is mostly ids, marks and material
    // names; none contain a colon and none begin with a slash. Two charCodeAt
    // scans here keep the regex + allocation off ~99% of the strings, which is
    // what makes a budget large enough to cover a real project affordable.
    let hasColonOrSlash = false;
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c === 58 /* : */ || c === 47 /* / */) { hasColonOrSlash = true; break; }
    }
    if (!hasColonOrSlash) return null;

    // ⚠ Normalise FIRST, then test. Testing the RAW value for URL-shape is the
    // bypass itself: `java<NUL>script:` is not URL-shaped until the NUL is gone.
    const cleaned = normaliseForSchemeMatch(value);
    if (!URLISH.test(cleaned)) return null;

    const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;

    if (scheme === 'data') {
        return DATA_URI.test(cleaned)
            ? { kind: 'dangerous-scheme', detail: 'data: URIs are script carriers (text/html, image/svg+xml) and are never valid in a persisted snapshot value' }
            : null;
    }
    if (scheme !== null && DANGEROUS_SCHEMES.includes(scheme)) {
        return {
            kind: 'dangerous-scheme',
            detail: `scheme "${scheme}:" is never valid in a persisted snapshot value`,
        };
    }

    if (scheme === 'http' || scheme === 'https') {
        let host;
        try {
            host = new URL(cleaned).hostname;
        } catch {
            return { kind: 'unparseable-url', detail: 'value begins with http(s): but does not parse as a URL' };
        }
        for (const pattern of PRIVATE_HOST_PATTERNS) {
            if (pattern.test(host)) {
                return {
                    kind: 'private-host',
                    detail: `host "${host}" is loopback, private or link-local — fetching it is a request against our own network`,
                };
            }
        }
        return null;
    }

    // Scheme-relative `//host/path` inherits whatever scheme the consumer is
    // on; it cannot be classified without that context, so it is reported.
    if (scheme === null && /^\/\//.test(cleaned)) {
        return { kind: 'scheme-relative', detail: 'scheme-relative URL inherits the consumer page scheme' };
    }

    return null;
}

/**
 * @typedef {object} ScanResult
 * @property {Array<{path: string, kind: string, detail: string, sample: string}>} findings
 * @property {boolean} truncated     — a bound was hit; findings are a SAMPLE, not a proof.
 * @property {string|null} truncatedBy — 'values' or 'depth' or null.
 * @property {number} valuesVisited
 * @property {number} maxDepthSeen
 */

/**
 * Bounded, iterative, never-throwing walk of an untrusted snapshot.
 *
 * @param {unknown} snapshot
 * @param {{maxValues?: number, maxDepth?: number, maxFindings?: number}} [limits]
 * @returns {ScanResult}
 */
export function scanSnapshotForUnsafeUrls(snapshot, limits) {
    const maxValues = limits?.maxValues ?? MAX_SCAN_VALUES;
    const maxDepth = limits?.maxDepth ?? MAX_SCAN_DEPTH;
    const maxFindings = limits?.maxFindings ?? 25;

    /** @type {ScanResult} */
    const result = {
        findings: [], truncated: false, truncatedBy: null,
        valuesVisited: 0, maxDepthSeen: 0,
    };

    // Explicit stack — a RECURSIVE walk over attacker-shaped JSON turns a deep
    // nest into a RangeError thrown past the route handler, i.e. a 500 where the
    // caller was owed a 400.
    //
    // ⭐ ONLY CONTAINERS ARE PUSHED, and the JSON path of a value is RECONSTRUCTED
    // from the parent chain only when a finding is actually recorded. Building
    // `${path}.${key}` eagerly for every leaf was 90% of the cost of this walk, and
    // a BIM snapshot is overwhelmingly numeric leaves — paying string concatenation
    // for each one is what forced the value budget down to a uselessly small
    // fraction of a real project.
    //
    // A non-container root has nothing to walk. Object.keys(null) throws, and a
    // scanner that throws must never be the reason a save fails.
    if (snapshot === null || typeof snapshot !== 'object') {
        if (typeof snapshot === 'string') {
            const f = classifyUrlValue(snapshot);
            if (f !== null) {
                result.findings.push({ path: '$', kind: f.kind, detail: f.detail, sample: snapshot.slice(0, 120) });
            }
            result.valuesVisited = 1;
        }
        return result;
    }

    const root = { node: snapshot, parent: null, key: '$', depth: 0 };
    const stack = [root];
    // Cycles cannot occur in JSON parsed off the wire, but this module is also
    // callable on in-process objects, so guard anyway.
    const seen = new Set();

    const pathOf = (frame, leafKey) => {
        const parts = leafKey === undefined ? [] : [leafKey];
        for (let f = frame; f !== null; f = f.parent) parts.push(f.key);
        return parts.reverse().join('.');
    };

    const record = (frame, leafKey, finding, sample) => {
        if (result.findings.length >= maxFindings) return;
        result.findings.push({
            path: pathOf(frame, leafKey),
            kind: finding.kind,
            detail: finding.detail,
            // Truncated so a hostile value cannot inflate the log line.
            sample: String(sample).slice(0, 120),
        });
    };

    outer:
    while (stack.length > 0) {
        const frame = stack.pop();
        const { node, depth } = frame;
        if (depth > result.maxDepthSeen) result.maxDepthSeen = depth;

        if (seen.has(node)) continue;
        seen.add(node);

        if (depth >= maxDepth) {
            result.truncated = true;
            if (result.truncatedBy === null) result.truncatedBy = 'depth';
            continue;
        }

        const isArray = Array.isArray(node);
        const keys = isArray ? null : Object.keys(node);
        const len = isArray ? node.length : keys.length;

        for (let i = 0; i < len; i++) {
            if (result.valuesVisited >= maxValues) {
                result.truncated = true;
                result.truncatedBy = 'values';
                break outer;
            }
            result.valuesVisited++;
            const key = isArray ? i : keys[i];
            const child = node[key];

            if (typeof child === 'string') {
                const f = classifyUrlValue(child);
                if (f !== null) record(frame, String(key), f, child);
                continue;
            }
            if (child !== null && typeof child === 'object') {
                stack.push({ node: child, parent: frame, key: String(key), depth: depth + 1 });
            }
        }

        // A hostile KEY is also a value that gets persisted and echoed back.
        if (keys !== null) {
            for (let i = 0; i < keys.length; i++) {
                const kf = classifyUrlValue(keys[i]);
                if (kf !== null) record(frame, '<key>', kf, keys[i]);
            }
        }
    }

    return result;
}

/**
 * One machine-parsable log line for report-only mode.
 *
 * ⛔ It says REPORT-ONLY in the line itself, so nobody reading a log can
 * mistake a finding for a rejection that happened.
 *
 * @param {ScanResult} scan
 * @param {{projectId: string, versionId?: string, bytes?: number}} ctx
 * @returns {string|null} null when there is nothing to report.
 */
export function formatScanReport(scan, ctx) {
    if (scan.findings.length === 0 && !scan.truncated) return null;
    const kinds = {};
    for (const f of scan.findings) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    return JSON.stringify({
        event: 'snapshot-url-scan',
        mode: 'REPORT-ONLY — nothing was rejected',
        projectId: ctx.projectId,
        versionId: ctx.versionId ?? null,
        bytes: ctx.bytes ?? null,
        wouldReject: scan.findings.length > 0,
        findingCount: scan.findings.length,
        kinds,
        // The SAMPLE flag is the difference between "clean" and "not looked at".
        truncated: scan.truncated,
        truncatedBy: scan.truncatedBy,
        valuesVisited: scan.valuesVisited,
        maxDepthSeen: scan.maxDepthSeen,
        findings: scan.findings.slice(0, 5),
    });
}

/*
 * EXIT CONDITION — how this stops being report-only.
 *
 *   1. Collect `snapshot-url-scan` lines for one week of real saves.
 *   2. Enumerate every URL-bearing snapshot field the founder's own projects
 *      actually use, and turn the observed hosts into a named allowlist.
 *      (The audit lists this enumeration as the PREREQUISITE for row 4, and it
 *      is not done here — see the lane report.)
 *   3. Only `dangerous-scheme` and `private-host` become 400s first. They have
 *      no legitimate use in a snapshot, so they are the two classes that can be
 *      refused without an allowlist at all.
 *   4. `truncated: true` must NEVER produce a refusal on its own: a scan that
 *      did not finish has not established anything about the values it skipped.
 */
