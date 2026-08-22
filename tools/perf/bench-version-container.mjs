/**
 * bench-version-container.mjs — §PERF-VERSION-ENVELOPE-WRITE (L-5801..L-5804)
 *
 * Reproducible before/after harness for the local version-history store
 * (`apps/editor/src/ui/platform/ProjectRepository.ts` + `VersionCacheStore.ts`).
 *
 *   node --expose-gc tools/perf/bench-version-container.mjs [--versions=20] [--mutations=33500]
 *
 * WHY A STANDALONE SCRIPT AND NOT A VITEST BENCH
 * ----------------------------------------------
 * `ProjectRepository.ts` reaches `localStorage`, `IndexedDB`, the thumbnail
 * cache and a `Worker`. Importing it into a bench would measure the harness's
 * shims as much as the code. This file therefore TRANSCRIBES the four hot
 * operations verbatim — same codec (`fflate` level 1 -> chunked base64 ->
 * marker prefix), same v2 container shape (`\x00fflate2\x01` + JSON list of
 * `{i, b}`), same trim rule — so the ratios it reports are the ratios the
 * browser pays. It is deliberately committed so the numbers in
 * `docs/04-reference/ISSUE-LOG.md` can be re-taken by anyone, on any machine,
 * rather than inherited.
 *
 * WHAT IT DOES NOT MEASURE (browser-only, stated so nobody reads it as covered):
 *   - the IndexedDB structured-clone + disk write itself,
 *   - `postMessage` transfer of the raw JSON to `compress.worker.ts`,
 *   - whether the compression worker is reachable in production at all.
 */

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { deflateSync, inflateSync, strToU8, strFromU8 } = require('fflate');

// -- codec: byte-identical to apps/editor/src/workers/compressCodec.ts -------
const COMPRESSED_MARKER = '\x00fflate\x01';
const V2_CONTAINER_MARKER = '\x00fflate2\x01';

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

// -- payload: the founder's shape (264 elements, 7 levels) plus the ----------
// append-only temporal mutation log the serializer embeds in EVERY snapshot.
const ELEMENT_IDS = Array.from({ length: 264 }, (_, i) => `el-${1787150674754 + i}-${i.toString(36)}`);
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
function makeSnapshot(mutationCount, tag) {
    return {
        projectId: 'proj-1787150674754-fe43bbbc18c5', projectName: 'Bench', versionLabel: tag,
        elementCount: 264, schemaVersion: 5,
        walls: Array.from({ length: 62 }, (_, i) => makeElement(i)),
        slabs: Array.from({ length: 10 }, (_, i) => makeElement(62 + i)),
        furniture: Array.from({ length: 31 }, (_, i) => makeElement(72 + i)),
        handrails: Array.from({ length: 145 }, (_, i) => makeElement(103 + i)),
        levels: Array.from({ length: 7 }, (_, i) => ({ id: `lvl-${i}`, name: `L${i}`, elevation: i * 3 })),
        temporalGraph: {
            version: 1, edges: [], sessionId: SESSION_ID,
            mutations: Array.from({ length: mutationCount }, (_, i) => makeMutation(i)),
        },
        integrity: { algo: 'fnv1a', checksum: 'deadbeef', schemaVersion: 5 },
    };
}
function makeVersion(i, mutationCount) {
    return {
        id: `proj-${1787417024748 + i * 1000}-${i.toString(36)}v`,
        projectId: 'proj-1787150674754-fe43bbbc18c5',
        label: 'Auto-save', timestamp: 1787417024748 + i * 1000,
        elementCount: 264, snapshot: makeSnapshot(mutationCount, `v${i}`),
        syncStatus: 'local-only',
    };
}

// -- the v2 container, exactly as ProjectRepository writes it ----------------
const MAX_VERSIONS_STORED = 20;
const assemble = (entries) => V2_CONTAINER_MARKER + JSON.stringify(entries);
const envelopeOf = (raw) => JSON.parse(raw.slice(V2_CONTAINER_MARKER.length));

/** BASELINE `_decodeVersionsPayload` — inflate + JSON.parse EVERY entry. */
function decodeAll(raw) {
    return envelopeOf(raw).map(e => JSON.parse(decodeCompressed(e.b)));
}
/** `getLatestVersion` — parse the envelope, inflate exactly ONE. */
function decodeLatest(raw) {
    const entries = envelopeOf(raw);
    if (entries.length === 0) return null;
    return JSON.parse(decodeCompressed(entries[entries.length - 1].b));
}

const msOf = (t0, t1) => Number(t1 - t0) / 1e6;
function time(label, fn) {
    if (globalThis.gc) globalThis.gc();
    const t0 = process.hrtime.bigint();
    fn();
    const t1 = process.hrtime.bigint();
    console.log(`  ${label.padEnd(58)} ${msOf(t0, t1).toFixed(0).padStart(6)} ms`);
}

// -- main -------------------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const N_VERSIONS = Number(argv.versions ?? 20);
const N_MUTATIONS = Number(argv.mutations ?? 33500);

console.log(`\n[bench-version-container] ${N_VERSIONS} versions - ${N_MUTATIONS} temporal mutation records/snapshot\n`);

const seeded = Array.from({ length: N_VERSIONS }, (_, i) => makeVersion(i, N_MUTATIONS));
const blobs = seeded.map(v => encodeCompressed(JSON.stringify(v)));
const stored = assemble(seeded.map((v, i) => ({ i: v.id, b: blobs[i] })));

const oneRaw = JSON.stringify(seeded[0]);
console.log(`  stored container      : ${(stored.length / 1048576).toFixed(1)} MB of chars`);
console.log(`  ...as ProjectRepository REPORTS it (length*2): ${(stored.length * 2 / 1048576).toFixed(1)} MB`);
console.log(`  one version, raw JSON : ${(oneRaw.length / 1048576).toFixed(1)} MB`);
console.log(`  one version, blob     : ${(blobs[0].length / 1048576).toFixed(2)} MB`);
console.log(`  of which temporalGraph: ${(JSON.stringify(seeded[0].snapshot.temporalGraph).length / 1048576).toFixed(1)} MB raw\n`);

console.log('-- PROJECT OPEN ----------------------------------------------------------');
time('BASELINE  getVersions()          (inflate all 20)', () => decodeAll(stored).length);
time('NEW       getLatestVersion()     (inflate 1)', () => decodeLatest(stored));

console.log('\n-- ONE AUTOSAVE: append a version ----------------------------------------');
const fresh = makeVersion(N_VERSIONS, N_MUTATIONS);
const freshJson = JSON.stringify(fresh);

time('BASELINE  saveVersionWithMeta    (decode 20 -> push -> assemble)', () => {
    const versions = decodeAll(stored);
    versions.push(fresh);
    const trimmed = versions.slice(-MAX_VERSIONS_STORED);
    const cache = new Map(envelopeOf(stored).map(e => [e.i, e.b]));
    const entries = trimmed.map(v => ({ i: v.id, b: cache.get(v.id) ?? encodeCompressed(JSON.stringify(v)) }));
    return assemble(entries).length;
});

time('NEW       envelope append        (0 decodes)', () => {
    const entries = envelopeOf(stored).filter(e => e.i !== fresh.id);
    entries.push({ i: fresh.id, b: encodeCompressed(freshJson) });
    return assemble(entries.slice(-MAX_VERSIONS_STORED)).length;
});

console.log('\n-- ONE SYNC-STATUS FLIP (local-only -> synced), fires after every save ----');
const targetId = seeded[N_VERSIONS - 1].id;

time('BASELINE  updateSyncStatus       (decode 20 -> patch -> assemble)', () => {
    const versions = decodeAll(stored);
    const idx = versions.findIndex(v => v.id === targetId);
    versions[idx] = { ...versions[idx], syncStatus: 'synced' };
    const cache = new Map(envelopeOf(stored).map(e => [e.i, e.b]));
    cache.delete(targetId);
    const entries = versions.map(v => ({ i: v.id, b: cache.get(v.id) ?? encodeCompressed(JSON.stringify(v)) }));
    return assemble(entries).length;
});

time('NEW       envelope patch         (inflate 1)', () => {
    const entries = envelopeOf(stored);
    const idx = entries.findIndex(e => e.i === targetId);
    const rec = JSON.parse(decodeCompressed(entries[idx].b));
    rec.syncStatus = 'synced';
    entries[idx] = { i: targetId, b: encodeCompressed(JSON.stringify(rec)) };
    return assemble(entries).length;
});

console.log('\n-- COMPONENT COSTS (what remains after the decodes are gone) -------------');
time('assemble container once (JSON.stringify of the envelope)', () => assemble(envelopeOf(stored)).length);
time('parse envelope only     (no inflate)', () => envelopeOf(stored).length);
time('deflate ONE version     (level 1)', () => encodeCompressed(freshJson).length);
time('inflate ONE version', () => decodeCompressed(blobs[0]).length);
console.log('');
