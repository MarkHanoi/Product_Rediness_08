/**
 * bench-journal-sidecar.mjs — §JOURNAL-SIDECAR (L-9980 … L-9984), C05 §3.8.
 *
 *   node --expose-gc tools/perf/bench-journal-sidecar.mjs [--versions=20] [--mutations=30432]
 *
 * ⭐ WHAT IT MEASURES, AND AGAINST WHAT. The founder's own console line
 * (ISSUE-LOG L-8704, 2026-08-23):
 *
 *     281 elements, 7 levels, 62 walls, 10 slabs, 31 furniture …
 *     temporalGraph 30 432 mutations · integrity suffix 0x8639ce
 *     = 8 796 110 canonical chars · ~36.8 MB (38 630 482 chars) across 20 versions
 *
 * The defaults are calibrated to exactly that: 30 432 mutation records and 20
 * versions. The bench reproduces his container's SIZE from the shape alone, then
 * reports what the v3 container costs for the identical history — same records,
 * same count, one copy instead of twenty.
 *
 * WHY A STANDALONE SCRIPT — the same reason as its sibling
 * `bench-version-container.mjs`, whose harness this deliberately mirrors:
 * `ProjectRepository.ts` reaches localStorage, IndexedDB, a thumbnail cache and a
 * Worker, so importing it would measure the shims. This TRANSCRIBES the codec
 * (fflate level 1 → chunked base64 → marker prefix) and both container shapes
 * verbatim, so the ratios it reports are the ratios the browser pays. Committed
 * so the numbers in ISSUE-LOG can be re-taken by anyone rather than inherited.
 *
 * ⛔ WHAT IT DOES NOT MEASURE, stated so nothing here is read as covered:
 *   - the IndexedDB structured-clone + disk write itself (browser-only);
 *   - the founder's actual browser, data and disk. §PROBE-OPEN-PATH-STORAGE-LEG
 *     is the instrument for that and it prints one line per open. Until he pastes
 *     it, EVERY figure below is a Node reproduction of his SHAPE, not of his
 *     session — which is precisely the distinction L-5850 was written to keep.
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { deflateSync, inflateSync, strToU8, strFromU8 } = require('fflate');

// -- codec: byte-identical to apps/editor/src/workers/compressCodec.ts -------
const COMPRESSED_MARKER = '\x00fflate\x01';
const V2_CONTAINER_MARKER = '\x00fflate2\x01';
const V3_CONTAINER_MARKER = '\x00fflate3\x01';
const MAX_VERSIONS_STORED = 20;
const JOURNAL_CHUNK_RECORDS = 2000;

function _uint8ToBase64(bytes) {
    const CHUNK = 8192;
    const parts = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    return Buffer.from(parts.join(''), 'latin1').toString('base64');
}
function encodeCompressed(json) {
    return COMPRESSED_MARKER + _uint8ToBase64(deflateSync(strToU8(json), { level: 1 }));
}
function decodeCompressed(data) {
    if (!data.startsWith(COMPRESSED_MARKER)) return data;
    const bin = Buffer.from(data.slice(COMPRESSED_MARKER.length), 'base64');
    return strFromU8(inflateSync(new Uint8Array(bin)));
}
/** Transcribed from JournalSidecar.hashJournalChunk — FNV-1a/32 + length suffix. */
function hashJournalChunk(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + '-' + (text.length >>> 0).toString(16);
}

// -- payload: the founder's shape -------------------------------------------
const ELEMENT_IDS = Array.from({ length: 281 }, (_, i) => `el-${1787150674754 + i}-${i.toString(36)}`);
const SESSION_ID = randomUUID();
const KINDS = ['wall', 'slab', 'furniture', 'handrail', 'column', 'door', 'window'];

function makeElement(i) {
    return {
        id: ELEMENT_IDS[i % ELEMENT_IDS.length],
        type: KINDS[i % 7],
        levelId: `lvl-${i % 7}`,
        start: { x: i * 1.37, y: 0, z: i * 0.91 },
        end: { x: i * 1.37 + 4.2, y: 0, z: i * 0.91 + 2.6 },
        height: 2.7, thickness: 0.2,
        systemTypeId: `wt-${i % 12}`,
        params: { fireRating: 60, acoustic: 52, finishInner: `fin-${i % 9}`, finishOuter: `fin-${(i + 3) % 9}` },
        createdAt: 1787150674754 + i * 31, updatedAt: 1787150674754 + i * 97,
    };
}
function makeMutation(i) {
    return {
        id: randomUUID(),
        elementId: ELEMENT_IDS[i % ELEMENT_IDS.length],
        elementType: KINDS[i % 7],
        mutationType: ['create', 'update', 'delete'][i % 3],
        mutatedAt: 1787150674754 + i * 137,
        mutatedBy: 'system', commandId: 'system', sessionId: SESSION_ID,
    };
}
function makeEdge(i) {
    return {
        id: randomUUID(), sourceId: ELEMENT_IDS[i % 281], targetId: `lvl-${i % 7}`,
        type: 'hostedBy', createdAt: 1787150674754 + i, createdBy: 'system',
        validFrom: 1787150674754 + i, validUntil: null, commandId: 'system', sessionId: SESSION_ID,
    };
}

/**
 * THE ONE journal — shared by every version below, because it is append-only.
 * Edges are held inline in every version on BOTH sides of the comparison: they
 * are not detached (expireEdge mutates validUntil in place), so they must not be
 * allowed to flatter the "after" column.
 */
let JOURNAL = null;
const EDGES = Array.from({ length: 240 }, (_, i) => makeEdge(i));

function makeSnapshot(cursor, tag, detached) {
    const temporalGraph = detached
        ? { version: 1, edges: EDGES, sessionId: SESSION_ID, mutationsRef: { v: 1, n: cursor } }
        : { version: 1, edges: EDGES, sessionId: SESSION_ID, mutations: JOURNAL.slice(0, cursor) };
    return {
        projectId: 'proj-1787150674754-fe43bbbc18c5', projectName: 'Bench', versionLabel: tag,
        elementCount: 281, schemaVersion: 5,
        walls: Array.from({ length: 62 }, (_, i) => makeElement(i)),
        slabs: Array.from({ length: 10 }, (_, i) => makeElement(62 + i)),
        furniture: Array.from({ length: 31 }, (_, i) => makeElement(72 + i)),
        handrails: Array.from({ length: 178 }, (_, i) => makeElement(103 + i)),
        levels: Array.from({ length: 7 }, (_, i) => ({ id: `lvl-${i}`, name: `L${i}`, elevation: i * 3 })),
        semanticGraph: { version: 1, relationships: [] },
        temporalGraph,
        integrity: { algo: 'fnv1a32-canonical-v2', checksum: 'deadbeef-8639ce', schemaVersion: 5 },
    };
}
function makeVersion(i, cursor, detached) {
    return {
        id: `proj-${1787417024748 + i * 1000}-${i.toString(36)}v`,
        projectId: 'proj-1787150674754-fe43bbbc18c5',
        label: 'Auto-save', timestamp: 1787417024748 + i * 1000,
        elementCount: 281, snapshot: makeSnapshot(cursor, `v${i}`, detached),
        syncStatus: 'local-only',
    };
}

// -- the two containers, exactly as ProjectRepository writes them ------------
const assembleV2 = (entries) => V2_CONTAINER_MARKER + JSON.stringify(entries);
const assembleV3 = (entries, journal) => V3_CONTAINER_MARKER + JSON.stringify({ f: 3, j: journal, v: entries });
const envelopeV2 = (raw) => JSON.parse(raw.slice(V2_CONTAINER_MARKER.length));
const envelopeV3 = (raw) => JSON.parse(raw.slice(V3_CONTAINER_MARKER.length));

function planJournal(records, prior) {
    const k = JOURNAL_CHUNK_RECORDS;
    const reuse = prior ? Math.min(Math.floor(prior.n / k), prior.c.length) : 0;
    const chunks = reuse > 0 ? prior.c.slice(0, reuse) : [];
    let deflated = 0;
    for (let start = chunks.length * k; start < records.length; start += k) {
        const slice = records.slice(start, Math.min(start + k, records.length));
        const text = JSON.stringify(slice);
        deflated += text.length;
        chunks.push({ b: encodeCompressed(text), n: slice.length, h: hashJournalChunk(text) });
    }
    return { journal: { k, n: records.length, c: chunks }, deflatedChars: deflated };
}
function readJournal(journal) {
    const out = [];
    for (const ch of journal.c) {
        const text = decodeCompressed(ch.b);
        if (hashJournalChunk(text) !== ch.h) throw new Error('chunk digest mismatch');
        for (const r of JSON.parse(text)) out.push(r);
    }
    return out;
}

const msOf = (t0, t1) => Number(t1 - t0) / 1e6;
function time(label, fn) {
    if (globalThis.gc) globalThis.gc();
    const t0 = process.hrtime.bigint();
    const v = fn();
    const t1 = process.hrtime.bigint();
    console.log(`  ${label.padEnd(60)} ${msOf(t0, t1).toFixed(0).padStart(6)} ms`);
    return v;
}
const MB = (n) => (n / 1048576).toFixed(2);

// -- main -------------------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const N_VERSIONS = Number(argv.versions ?? 20);
const N_MUTATIONS = Number(argv.mutations ?? 30432);

console.log(`\n[bench-journal-sidecar] JOURNAL-SIDECAR -- ${N_VERSIONS} versions - ${N_MUTATIONS} journal records`);
console.log('calibrated to ISSUE-LOG L-8704: 281 elements, 30 432 mutations, ~36.8 MB across 20 versions\n');

JOURNAL = Array.from({ length: N_MUTATIONS }, (_, i) => makeMutation(i));

// Cursors: an append-only journal, so version n holds n-1 fewer records than the
// newest. A handful of records per autosave, which is what the founder's console
// showed growing (30 357 -> 30 432 in about an hour).
const cursorOf = (i) => N_MUTATIONS - (N_VERSIONS - 1 - i) * 4;

// -- BEFORE: v2, journal embedded whole in every version --------------------
const v2Versions = Array.from({ length: N_VERSIONS }, (_, i) => makeVersion(i, cursorOf(i), false));
const v2Blobs = v2Versions.map(v => encodeCompressed(JSON.stringify(v)));
const v2Container = assembleV2(v2Versions.map((v, i) => ({ i: v.id, b: v2Blobs[i] })));

// -- AFTER: v3, one shared chunked journal + cursors ------------------------
const { journal } = planJournal(JOURNAL, null);
const v3Versions = Array.from({ length: N_VERSIONS }, (_, i) => makeVersion(i, cursorOf(i), true));
const v3Blobs = v3Versions.map(v => encodeCompressed(JSON.stringify(v)));
const v3Container = assembleV3(v3Versions.map((v, i) => ({ i: v.id, b: v3Blobs[i], r: cursorOf(i) })), journal);

const oneRawV2 = JSON.stringify(v2Versions[N_VERSIONS - 1]);
const oneRawV3 = JSON.stringify(v3Versions[N_VERSIONS - 1]);
const journalRaw = JSON.stringify(JOURNAL);

console.log('-- CONTAINER BYTES -------------------------------------------------------');
console.log(`  BEFORE  v2 container            : ${MB(v2Container.length)} MB  (${v2Container.length.toLocaleString()} chars)`);
console.log(`  AFTER   v3 container            : ${MB(v3Container.length)} MB  (${v3Container.length.toLocaleString()} chars)`);
console.log(`  ** reduction                    : ${(v2Container.length / v3Container.length).toFixed(1)}x`);
console.log(`  !! journal records before/after : ${N_MUTATIONS.toLocaleString()} / ${readJournal(journal).length.toLocaleString()}  (NOTHING DROPPED)`);
console.log('');
console.log(`  one version raw, journal inline : ${MB(oneRawV2.length)} MB`);
console.log(`  one version raw, cursor only    : ${MB(oneRawV3.length)} MB`);
console.log(`  the journal itself, raw         : ${MB(journalRaw.length)} MB  (${(journalRaw.length / oneRawV2.length * 100).toFixed(1)}% of a v2 snapshot)`);
console.log(`  the journal, deflated in chunks : ${MB(journal.c.reduce((n, c) => n + c.b.length, 0))} MB in ${journal.c.length} chunk(s)\n`);

console.log('-- PROJECT OPEN (the narrow path PlatformShell actually uses) -------------');
time('BEFORE  parse envelope + inflate 1 + parse', () => {
    const e = envelopeV2(v2Container);
    return JSON.parse(decodeCompressed(e[e.length - 1].b)).snapshot.temporalGraph.mutations.length;
});
time('AFTER   ...+ inflate & VERIFY the shared journal + attach', () => {
    const c = envelopeV3(v3Container);
    const rec = JSON.parse(decodeCompressed(c.v[c.v.length - 1].b));
    const all = readJournal(c.j);
    rec.snapshot.temporalGraph.mutations = all.slice(0, rec.snapshot.temporalGraph.mutationsRef.n);
    delete rec.snapshot.temporalGraph.mutationsRef;
    return rec.snapshot.temporalGraph.mutations.length;
});
time('AFTER   a SECOND open in the same session (journal in memory)', () => {
    const c = envelopeV3(v3Container);
    return JSON.parse(decodeCompressed(c.v[c.v.length - 1].b)).snapshot.temporalGraph.mutationsRef.n;
});

console.log('\n-- THE VERSION-HISTORY PANEL (inflates all 20) ---------------------------');
time('BEFORE  inflate + parse 20 snapshots, each carrying the log', () => envelopeV2(v2Container).map(e => JSON.parse(decodeCompressed(e.b))).length);
time('AFTER   inflate + parse 20 snapshots + ONE shared journal', () => {
    const c = envelopeV3(v3Container);
    readJournal(c.j);
    return c.v.map(e => JSON.parse(decodeCompressed(e.b))).length;
});

console.log('\n-- ONE AUTOSAVE (append a version; the journal grew by 4 records) --------');
const priorJournal = envelopeV3(v3Container).j;
JOURNAL.push(...Array.from({ length: 4 }, (_, i) => makeMutation(N_MUTATIONS + i)));
const freshV2 = makeVersion(N_VERSIONS, N_MUTATIONS + 4, false);
const freshV3 = makeVersion(N_VERSIONS, N_MUTATIONS + 4, true);

time('BEFORE  deflate one version (journal inline) + assemble', () => {
    const e = envelopeV2(v2Container).filter(x => x.i !== freshV2.id);
    e.push({ i: freshV2.id, b: encodeCompressed(JSON.stringify(freshV2)) });
    return assembleV2(e.slice(-MAX_VERSIONS_STORED)).length;
});
const grown = time('AFTER   deflate one version (cursor) + the TAIL chunk + assemble', () => {
    const c = envelopeV3(v3Container);
    const next = planJournal(JOURNAL, c.j);
    const e = c.v.filter(x => x.i !== freshV3.id);
    e.push({ i: freshV3.id, b: encodeCompressed(JSON.stringify(freshV3)), r: JOURNAL.length });
    return assembleV3(e.slice(-MAX_VERSIONS_STORED), next.journal).length;
});

const tail = planJournal(JOURNAL, priorJournal).deflatedChars;
console.log('');
console.log(`  BEFORE  chars DEFLATEd per autosave : ${JSON.stringify(freshV2).length.toLocaleString()} (the whole log, every time)`);
console.log(`  AFTER   chars DEFLATEd per autosave : ${(JSON.stringify(freshV3).length + tail).toLocaleString()} (one version + the tail chunk)`);
console.log(`  AFTER   container after that save   : ${MB(grown)} MB`);
console.log('');
console.log('!! NOT MEASURED HERE: the founder\'s browser, data, IndexedDB clone or disk.');
console.log('   PROBE-OPEN-PATH-STORAGE-LEG prints one line per open and is the instrument');
console.log('   for that; until he pastes it, these are Node reproductions of his SHAPE.\n');
