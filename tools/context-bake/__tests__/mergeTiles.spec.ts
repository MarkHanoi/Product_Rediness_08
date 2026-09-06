// §SYNC-SWITCH (2026-09-02) — tests for merge-tiles.mjs, the per-region-bake staging + merge/publish
// switch (the workflow change bake.mjs:57 designed in-comment).
//
// WHAT THESE LOCK DOWN.
//   • The MISSING-REGION REFUSAL: the R2 publish is a sync that REPLACES the live tileset, so a
//     merge missing an expected region would silently DELETE that region's cities from the map.
//     The merge must exit non-zero NAMING the region (never a warning, never a skip).
//   • The merge itself: two region-scoped pmtiles → one archive, byte-identical tile payloads,
//     union bounds, honest counts, and a tileset-manifest.json recording exactly what went in.
//   • The ambiguity / collision / layer-gap / integrity / no-loss refusals — each one is a way a
//     partial or stale staging area could publish a lying tileset while reporting success.
//
// INDEPENDENCE (§probe-can-be-wrong-three-ways): the merged archive is verified by THIS SPEC'S OWN
// PMTiles v3 decoder (below), written from the spec and sharing no code with merge-tiles.mjs; and
// the Hilbert tile addressing is pinned against constants computed by the real `pmtiles` npm
// library v4.4.1 (transcribed 2026-09-02 — see PINNED_TILE_IDS). Tool and test can only agree by
// both matching the spec.
//
// Everything runs through the CLI in child processes — merge-tiles.mjs is NOT imported, following
// the mdsBboxCoversTerrainRegion.spec.ts precedent (vite's transform rejects some plain-Node .mjs
// in this directory; child processes are immune, and they also exercise the REAL exit codes the
// workflow will see).
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span (P8 applies to exported
// package functions, not bake tooling).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirnameish = dirname(fileURLToPath(import.meta.url));
const MERGE = join(__dirnameish, '..', 'merge-tiles.mjs');
const NODE = process.execPath;

const DIR = mkdtempSync(join(tmpdir(), 'pryzm-mergetiles-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

/** Run the merge-tiles CLI; never throws — the workflow reads exit codes, so must the test. */
function cli(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync(NODE, [MERGE, ...args], { encoding: 'utf8', timeout: 120_000 });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// ── Pinned Hilbert constants — computed 2026-09-02 by the INDEPENDENT `pmtiles` npm library
// (v4.4.1: zxyToTileId / tileIdToZxy), transcribed verbatim. If merge-tiles.mjs drifts from the
// library the whole ecosystem reads with, every published tile lands at the wrong address.
const PINNED_TILE_IDS: Array<[number, number, number, number]> = [
    [0, 0, 0, 0], [1, 0, 0, 1], [1, 0, 1, 2], [1, 1, 1, 3], [1, 1, 0, 4],
    [2, 0, 0, 5], [2, 1, 0, 6], [2, 2, 1, 18], [2, 3, 3, 15], [3, 7, 7, 63],
    [5, 31, 0, 1364], [12, 2048, 1362, 19853051], [16, 32768, 21845, 5082377966],
];

// ── The spec's OWN PMTiles v3 decoder — independent of merge-tiles.mjs by construction. ──────────
interface PmHeader {
    rootDirOffset: number; rootDirLength: number;
    metadataOffset: number; metadataLength: number;
    leafDirsOffset: number; leafDirsLength: number;
    tileDataOffset: number; tileDataLength: number;
    numAddressedTiles: number; numTileEntries: number; numTileContents: number;
    clustered: number; internalCompression: number; tileCompression: number; tileType: number;
    minZoom: number; maxZoom: number;
    minLonE7: number; minLatE7: number; maxLonE7: number; maxLatE7: number;
}
function decodeHeader(b: Buffer): PmHeader {
    expect(b.toString('latin1', 0, 7)).toBe('PMTiles');
    expect(b[7]).toBe(3);
    const u64 = (off: number) => Number(b.readBigUInt64LE(off));
    return {
        rootDirOffset: u64(8), rootDirLength: u64(16),
        metadataOffset: u64(24), metadataLength: u64(32),
        leafDirsOffset: u64(40), leafDirsLength: u64(48),
        tileDataOffset: u64(56), tileDataLength: u64(64),
        numAddressedTiles: u64(72), numTileEntries: u64(80), numTileContents: u64(88),
        clustered: b[96], internalCompression: b[97], tileCompression: b[98], tileType: b[99],
        minZoom: b[100], maxZoom: b[101],
        minLonE7: b.readInt32LE(102), minLatE7: b.readInt32LE(106),
        maxLonE7: b.readInt32LE(110), maxLatE7: b.readInt32LE(114),
    };
}
function readVarint(buf: Buffer, pos: { i: number }): number {
    let v = 0, mul = 1;
    for (;;) {
        const byte = buf[pos.i++];
        v += (byte % 128) * mul;
        if (byte < 0x80) return v;
        mul *= 128;
    }
}
function decodeDirectory(raw: Buffer): Array<{ tileId: number; runLength: number; length: number; offset: number }> {
    const buf = gunzipSync(raw); // merge-tiles writes gzip internal compression; anything else fails here loudly.
    const pos = { i: 0 };
    const n = readVarint(buf, pos);
    const es = Array.from({ length: n }, () => ({ tileId: 0, runLength: 0, length: 0, offset: 0 }));
    let last = 0;
    for (const e of es) { last += readVarint(buf, pos); e.tileId = last; }
    for (const e of es) e.runLength = readVarint(buf, pos);
    for (const e of es) e.length = readVarint(buf, pos);
    for (let i = 0; i < n; i++) {
        const v = readVarint(buf, pos);
        es[i].offset = v === 0 && i > 0 ? es[i - 1].offset + es[i - 1].length : v - 1;
    }
    return es;
}
/** Fully decode an archive: header + every tile's DECOMPRESSED payload, keyed by tileId. */
function decodeArchive(path: string): { header: PmHeader; tiles: Map<number, Buffer>; metadata: unknown } {
    const file = readFileSync(path);
    const header = decodeHeader(file.subarray(0, 127));
    const tiles = new Map<number, Buffer>();
    const walk = (entries: ReturnType<typeof decodeDirectory>) => {
        for (const e of entries) {
            if (e.runLength === 0) {
                walk(decodeDirectory(file.subarray(header.leafDirsOffset + e.offset, header.leafDirsOffset + e.offset + e.length)));
            } else {
                for (let k = 0; k < e.runLength; k++) {
                    const raw = file.subarray(header.tileDataOffset + e.offset, header.tileDataOffset + e.offset + e.length);
                    tiles.set(e.tileId + k, header.tileCompression === 2 ? gunzipSync(raw) : Buffer.from(raw));
                }
            }
        }
    };
    walk(decodeDirectory(file.subarray(header.rootDirOffset, header.rootDirOffset + header.rootDirLength)));
    const metadata = header.metadataLength > 0
        ? JSON.parse(gunzipSync(file.subarray(header.metadataOffset, header.metadataOffset + header.metadataLength)).toString('utf8'))
        : null;
    return { header, tiles, metadata };
}
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

// ── Fixture builders ─────────────────────────────────────────────────────────
// Region names are REAL rows from bake.mjs ALL_REGIONS — stage-manifest fail-louds on typos by
// design, so an invented name would (correctly) be refused before the case under test is reached.
interface FixtureTile { z: number; x: number; y: number; payloadText: string }
function stageSet(staging: string, slug: string, regions: string[], layer: string, tiles: FixtureTile[], boundsE7?: Record<string, number>): string {
    const dir = join(staging, slug);
    mkdirSync(dir, { recursive: true });
    const specPath = join(dir, `${layer}.fixture.json`);
    writeFileSync(specPath, JSON.stringify({ tileCompression: 'gzip', tileType: 'mvt', layerName: layer, tiles, boundsE7 }));
    execFileSync(NODE, [MERGE, 'write-fixture', '--out', join(dir, `${layer}.pmtiles`), '--spec', specPath], { encoding: 'utf8' });
    rmSync(specPath); // the staged prefix holds only what R2 would: <layer>.pmtiles + the manifest.
    execFileSync(NODE, [MERGE, 'stage-manifest', '--dir', dir, '--regions', regions.join(','), '--layers', layer, '--slug', slug], { encoding: 'utf8' });
    return dir;
}

const LU_TILES: FixtureTile[] = [
    { z: 2, x: 2, y: 1, payloadText: 'lux-payload-A' },
    { z: 3, x: 4, y: 2, payloadText: 'lux-payload-B' },
];
const EE_TILES: FixtureTile[] = [
    { z: 2, x: 3, y: 0, payloadText: 'est-payload-A' },
    { z: 3, x: 7, y: 1, payloadText: 'est-payload-C' },
];
const LU_BOUNDS = { minLonE7: 57000000, minLatE7: 494000000, maxLonE7: 66000000, maxLatE7: 502000000 };
const EE_BOUNDS = { minLonE7: 216000000, minLatE7: 575000000, maxLonE7: 283000000, maxLatE7: 598000000 };

describe('merge-tiles.mjs — Hilbert tile addressing', () => {
    it('matches the independent pmtiles npm library on every pinned constant, both directions', () => {
        // Import happens in a child process (see header note); the assertion payload comes back as JSON.
        const script = `
      import { zxyToTileId, tileIdToZxy } from ${JSON.stringify(pathToFileURL(MERGE).href)};
      const pinned = ${JSON.stringify(PINNED_TILE_IDS)};
      const bad = [];
      for (const [z, x, y, id] of pinned) {
        if (zxyToTileId(z, x, y) !== id) bad.push(['fwd', z, x, y, id, zxyToTileId(z, x, y)]);
        const [bz, bx, by] = tileIdToZxy(id);
        if (bz !== z || bx !== x || by !== y) bad.push(['back', z, x, y, id, [bz, bx, by]]);
      }
      let rt = 0; // exhaustive round-trip z0..z6 — 5,461 tiles
      for (let z = 0; z <= 6; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++) {
        const [bz, bx, by] = tileIdToZxy(zxyToTileId(z, x, y));
        if (bz !== z || bx !== x || by !== y) rt++;
      }
      console.log(JSON.stringify({ bad, rt }));
    `;
        const out = execFileSync(NODE, ['--input-type=module', '-e', script], { encoding: 'utf8' });
        const { bad, rt } = JSON.parse(out.trim());
        expect(bad).toEqual([]);
        expect(rt).toBe(0);
    });
});

describe('merge-tiles.mjs merge — the happy path on real pmtiles bytes', () => {
    const staging = join(DIR, 'happy', 'staging');
    const outDir = join(DIR, 'happy', 'merged');
    let result: ReturnType<typeof cli>;

    beforeAll(() => {
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES, LU_BOUNDS);
        stageSet(staging, 'estonia', ['estonia'], 'buildings', EE_TILES, EE_BOUNDS);
        result = cli(['merge', '--staging', staging, '--out', outDir,
            '--expect', 'luxembourg,estonia', '--layer', 'buildings', '--engine', 'js']);
    });

    it('exits 0 and reports both sets', () => {
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('luxembourg');
        expect(result.stdout).toContain('estonia');
    });

    it('produces one archive holding EVERY tile of both inputs, payloads byte-identical', () => {
        const { header, tiles } = decodeArchive(join(outDir, 'buildings.pmtiles'));
        expect(header.numAddressedTiles).toBe(4);
        expect(header.numTileEntries).toBe(4);
        expect(header.clustered).toBe(1);
        // Every fixture payload survives the merge byte-for-byte, addressed at the PINNED id.
        const idOf = (z: number, x: number, y: number) =>
            PINNED_TILE_IDS.find(([pz, px, py]) => pz === z && px === x && py === y)?.[3];
        expect(tiles.get(idOf(2, 2, 1)!)?.toString('utf8')).toBe('lux-payload-A');
        for (const t of [...LU_TILES, ...EE_TILES]) {
            const found = [...tiles.values()].some((b) => b.toString('utf8') === t.payloadText);
            expect(found, `payload '${t.payloadText}' missing from merged archive`).toBe(true);
        }
        expect(header.minZoom).toBe(2);
        expect(header.maxZoom).toBe(3);
    });

    it('unions the bounds of its inputs', () => {
        const { header } = decodeArchive(join(outDir, 'buildings.pmtiles'));
        expect(header.minLonE7).toBe(LU_BOUNDS.minLonE7);
        expect(header.minLatE7).toBe(LU_BOUNDS.minLatE7);
        expect(header.maxLonE7).toBe(EE_BOUNDS.maxLonE7);
        expect(header.maxLatE7).toBe(EE_BOUNDS.maxLatE7);
    });

    it('writes a tileset-manifest.json recording regions, sources and true shas', () => {
        const manifest = JSON.parse(readFileSync(join(outDir, 'tileset-manifest.json'), 'utf8'));
        expect(manifest.schema).toBe('pryzm-context-tileset-manifest@1');
        expect(Object.keys(manifest.regions).sort()).toEqual(['estonia', 'luxembourg']);
        expect(manifest.regions.luxembourg.stagedSet).toBe('luxembourg');
        expect(manifest.layers.buildings.sha256).toBe(sha256(join(outDir, 'buildings.pmtiles')));
        expect(manifest.layers.buildings.bytes).toBe(statSync(join(outDir, 'buildings.pmtiles')).size);
        expect(manifest.layers.buildings.numAddressedTiles).toBe(4);
    });
});

describe('merge-tiles.mjs merge — the refusal arms', () => {
    it('REFUSES BY NAME when an expected region has no staged bake (the no-silent-city-loss gate)', () => {
        const staging = join(DIR, 'missing', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        stageSet(staging, 'estonia', ['estonia'], 'buildings', EE_TILES);
        const r = cli(['merge', '--staging', staging, '--out', join(DIR, 'missing', 'merged'),
            '--expect', 'luxembourg,estonia,latvia', '--layer', 'buildings', '--engine', 'js']);
        expect(r.status).not.toBe(0);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('latvia');      // the missing region is NAMED
        expect(r.stderr).toContain('MISSING');
        expect(r.stderr.toLowerCase()).toContain('delete'); // and the consequence is stated
    });

    it('refuses a region staged ambiguously by two different sets, naming region and both slugs', () => {
        const staging = join(DIR, 'dupe', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        stageSet(staging, 'lux-again', ['luxembourg'], 'buildings', EE_TILES);
        const r = cli(['merge', '--staging', staging, '--out', join(DIR, 'dupe', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("region 'luxembourg'");
        expect(r.stderr).toContain('lux-again');
    });

    it('refuses colliding tile ids (js engine) naming the tile — never a silent overwrite', () => {
        const staging = join(DIR, 'collide', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        stageSet(staging, 'estonia', ['estonia'], 'buildings',
            [{ z: 2, x: 2, y: 1, payloadText: 'estonia-stole-lux-tile' }]); // same z/x/y as LU_TILES[0]
        const r = cli(['merge', '--staging', staging, '--out', join(DIR, 'collide', 'merged'),
            '--expect', 'luxembourg,estonia', '--layer', 'buildings', '--engine', 'js']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('COLLISION');
        expect(r.stderr).toContain('2/2/1');       // the colliding tile, named as z/x/y
        expect(r.stderr).toContain('tile-join');   // and the correct remedy is stated
    });

    it('refuses a set that lacks a requested layer, naming set and layer', () => {
        const staging = join(DIR, 'layergap', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        const r = cli(['merge', '--staging', staging, '--out', join(DIR, 'layergap', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings,roads', '--engine', 'js']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("'roads'");
        expect(r.stderr).toContain('luxembourg');
    });

    it('refuses a staged file whose bytes drifted from its manifest (truncated/stale download)', () => {
        const staging = join(DIR, 'integrity', 'staging');
        const dir = stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        appendFileSync(join(dir, 'buildings.pmtiles'), Buffer.from([0x00])); // corrupt AFTER manifest
        const r = cli(['merge', '--staging', staging, '--out', join(DIR, 'integrity', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js']);
        expect(r.status).toBe(1);
        expect(r.stderr).toMatch(/truncated|sha256/);
    });

    it('no-loss gate: refuses to drop a region the LIVE manifest carries, unless the removal is named', () => {
        const staging = join(DIR, 'noloss', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        const live = join(DIR, 'noloss', 'live-tileset-manifest.json');
        writeFileSync(live, JSON.stringify({
            schema: 'pryzm-context-tileset-manifest@1',
            regions: { luxembourg: { stagedSet: 'luxembourg' }, denmark: { stagedSet: 'denmark' } },
        }));
        const refused = cli(['merge', '--staging', staging, '--out', join(DIR, 'noloss', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js', '--live-manifest', live]);
        expect(refused.status).toBe(1);
        expect(refused.stderr).toContain('denmark');
        expect(refused.stderr).toContain('REGION LOSS');

        const allowed = cli(['merge', '--staging', staging, '--out', join(DIR, 'noloss', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js', '--live-manifest', live,
            '--allow-region-removal', 'denmark']);
        expect(allowed.stderr).toBe('');
        expect(allowed.status).toBe(0);
        expect(allowed.stdout).toContain('deliberate removals: denmark');
    });

    // ⛔ §NO-LOSS-IS-ABOUT-THE-OUTPUT (lane PUBLISH-THE-82, 2026-09-06) — THE HOLE THE TEST ABOVE
    // LEFT OPEN, and it is the one the real bucket walks into. That test drops `denmark` by never
    // staging it at all; the gate then fires because `carrier('buildings','denmark')` is falsy. But
    // `tiles-staging/` is an ACCUMULATOR — each bake syncs only its OWN slug prefix and nothing
    // prunes a slug — so in production every live region HAS a staged set, `carrier` is truthy for
    // all of them forever, and the gate could not fire no matter how narrow the merge was.
    //
    // MEASURED at HEAD 607ab09c, before the fix, against the 49 REAL staged manifests fetched from
    // R2 (HTTP 200 each) plus the REAL live tileset-manifest.json: `--expect spain` exited 0, printed
    // "no-loss gate: every live region covered", and merged ONE region — a publish that would have
    // deleted 48 live regions while reporting success. This is that run, in miniature.
    it('no-loss gate: refuses a live region that IS staged but is outside the run expect= set', () => {
        const staging = join(DIR, 'nolossscope', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        stageSet(staging, 'estonia', ['estonia'], 'buildings', EE_TILES); // staged, and stays staged forever
        const live = join(DIR, 'nolossscope', 'live-tileset-manifest.json');
        writeFileSync(live, JSON.stringify({
            schema: 'pryzm-context-tileset-manifest@1',
            regions: { luxembourg: { stagedSet: 'luxembourg' }, estonia: { stagedSet: 'estonia' } },
        }));
        const refused = cli(['merge', '--staging', staging, '--out', join(DIR, 'nolossscope', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js', '--live-manifest', live]);
        expect(refused.status).toBe(1);
        expect(refused.stderr).toContain('REGION LOSS');
        expect(refused.stderr).toContain('estonia');
        // …and it must say WHICH fix applies: widen expect=, not re-bake something already staged.
        expect(refused.stderr).toContain('ARE staged and would still be lost');

        // The deliberate path is unchanged: name the removal and it proceeds.
        const allowed = cli(['merge', '--staging', staging, '--out', join(DIR, 'nolossscope', 'merged'),
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js', '--live-manifest', live,
            '--allow-region-removal', 'estonia']);
        expect(allowed.status).toBe(0);
        expect(allowed.stdout).toContain('deliberate removals: estonia');
    });

    // §MANIFEST-LAYER-CARRY-FORWARD (lane CONTEXT-R2, 2026-09-04). The workflow header PRESCRIBES
    // a per-layer dispatch as the disk-budget escape, and the R2 publish is a sync WITHOUT --delete.
    // So a `--layer roads` run leaves buildings.pmtiles live and served; a manifest listing only
    // `roads` would be a FALSE statement about the bucket, and the no-loss gate is REGION-scoped so
    // nothing would refuse. This locks the carried entry AND its honesty mark: a carried layer is a
    // fact about the live object, not something this run verified.
    it('layer carry-forward: keeps live layers this run did not merge, marked carriedForward', () => {
        const staging = join(DIR, 'carry', 'staging');
        const outDir = join(DIR, 'carry', 'merged');
        stageSet(staging, 'luxembourg', ['luxembourg'], 'buildings', LU_TILES);
        const live = join(DIR, 'carry', 'live-tileset-manifest.json');
        writeFileSync(live, JSON.stringify({
            schema: 'pryzm-context-tileset-manifest@1',
            mergeRunId: '33795775939',
            mergedAt: '2026-09-03T20:56:05.737Z',
            mergeGitSha: 'f75659e7',
            regions: { luxembourg: { stagedSet: 'luxembourg' } },
            layers: {
                buildings: { file: 'buildings.pmtiles', bytes: 999, sha256: 'stale', sources: ['luxembourg'] },
                roads: { file: 'roads.pmtiles', bytes: 2007237155, sha256: 'abc123', sources: ['luxembourg'] },
            },
        }));
        const r = cli(['merge', '--staging', staging, '--out', outDir,
            '--expect', 'luxembourg', '--layer', 'buildings', '--engine', 'js', '--live-manifest', live]);
        expect(r.stderr).toBe('');
        expect(r.status).toBe(0);
        const m = JSON.parse(readFileSync(join(outDir, 'tileset-manifest.json'), 'utf8'));

        // The merged layer is FRESH: real bytes, real sha, and NOT marked as carried.
        expect(m.mergedLayers).toEqual(['buildings']);
        expect(m.layers.buildings.carriedForward).toBeUndefined();
        expect(m.layers.buildings.sha256).toBe(sha256(join(outDir, 'buildings.pmtiles')));
        expect(m.layers.buildings.sha256).not.toBe('stale');

        // The unmerged layer SURVIVES with its live bytes, and says whose run produced them.
        expect(m.layers.roads.carriedForward).toBe(true);
        expect(m.layers.roads.bytes).toBe(2007237155);
        expect(m.layers.roads.producedBy.mergeRunId).toBe('33795775939');
        expect(r.stdout).toContain('layer carry-forward');
    });

    it('stage-manifest fail-louds on a region name not in bake.mjs ALL_REGIONS (typo guard)', () => {
        const dir = join(DIR, 'typo');
        mkdirSync(dir, { recursive: true });
        const spec = join(dir, 'f.json');
        writeFileSync(spec, JSON.stringify({ tileCompression: 'gzip', tiles: LU_TILES }));
        execFileSync(NODE, [MERGE, 'write-fixture', '--out', join(dir, 'buildings.pmtiles'), '--spec', spec]);
        const r = spawnSync(NODE, [MERGE, 'stage-manifest', '--dir', dir, '--regions', 'atlantis', '--layers', 'buildings'], { encoding: 'utf8' });
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('atlantis');
    });
});
