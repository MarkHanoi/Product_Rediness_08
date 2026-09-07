// §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — the WIRING, exercised through the real CLIs.
//
// `seaPolygons.spec.ts` proves the clipper. This file proves the layer is REACHABLE: that bake.mjs
// declares `sea`, plans it without a Geofabrik extract, and tiles it as polygons at z8–z14; and that
// merge-tiles.mjs treats an OPTIONAL layer's absence as an absence rather than a refusal — the exact
// failure mode that would otherwise strand every published tileset the first time a landlocked region
// staged no `sea.pmtiles` (§authored-but-unwired: a module nothing dispatches is not shipped).
//
// Every assertion here runs the REAL child process and reads the REAL exit code — the value the
// workflow sees — for the reason mergeTiles.spec.ts states in its header. Nothing is downloaded:
// `--dry-run` short-circuits `download()` before any fetch, which is asserted below by the plan text.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAKE = join(HERE, '..', 'bake.mjs');
const MERGE = join(HERE, '..', 'merge-tiles.mjs');
const NODE = process.execPath;
/** These spawn node, which spawns node again (`bakeTables`); on a loaded machine that is seconds. */
const SLOW = 120_000;

const DIR = mkdtempSync(join(tmpdir(), 'pryzm-seabake-'));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

function run(script: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync(NODE, [script, ...args], { encoding: 'utf8', timeout: SLOW });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Stage a set with REAL fixture bytes for each layer (write-fixture + stage-manifest, as the workflow does). */
function stageSet(staging: string, slug: string, regions: string[], layers: string[]): string {
    const dir = join(staging, slug);
    mkdirSync(dir, { recursive: true });
    for (const layer of layers) {
        const spec = join(dir, `${layer}.fixture.json`);
        writeFileSync(spec, JSON.stringify({
            tileCompression: 'gzip', tileType: 'mvt', layerName: layer,
            // Distinct tile ids per layer so a js-engine merge never collides across layers.
            tiles: [{ z: 2, x: 2 + layers.indexOf(layer), y: 1, payloadText: `${slug}-${layer}` }],
        }));
        const w = run(MERGE, ['write-fixture', '--out', join(dir, `${layer}.pmtiles`), '--spec', spec]);
        expect(w.status, w.stderr).toBe(0);
        rmSync(spec);
    }
    const m = run(MERGE, ['stage-manifest', '--dir', dir, '--regions', regions.join(','), '--layers', layers.join(','), '--slug', slug]);
    expect(m.status, m.stderr).toBe(0);
    return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('bake.mjs — the `sea` layer is declared, optional, and source-backed', () => {
    it('--regions-json names `sea` in allLayers AND in optionalLayers', () => {
        const r = run(BAKE, ['--regions-json']);
        expect(r.status).toBe(0);
        const tables = JSON.parse(r.stdout) as { allLayers: string[]; optionalLayers: string[] };
        expect(tables.allLayers).toContain('sea');
        // The contract merge-tiles.mjs reads: an absent `sea.pmtiles` is an absence, not a gap.
        expect(tables.optionalLayers).toContain('sea');
    }, SLOW);

    it('plans a coastal region WITHOUT a Geofabrik extract, and tippecanoes polygons at z8–z14', () => {
        const r = run(BAKE, ['--dry-run', '--layer', 'sea', '--region', 'france']);
        expect(r.status, r.stderr).toBe(0);
        const out = r.stdout;
        // The source, its licence, and the fact that the pbf is not needed at all.
        expect(out).toContain('https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip');
        expect(out).toContain('ODbL');
        expect(out).toContain("no OSM extract needed for [sea]");
        expect(out).not.toContain('france-latest.osm.pbf\n  →'); // no pbf download line
        // One streaming pass, one GeoJSONSeq per region.
        expect(out).toMatch(/clip sea · france \(-5\.15,41\.3,9\.6,51\.1\) → .*france-sea\.geojsonseq/);
        // Polygons, z8–z14, with the three flags the layer needs (see the LAYERS row's comment).
        expect(out).toMatch(/tippecanoe -o \S*sea\.pmtiles -l sea -Z 8 -z 14 -P --force --drop-densest-as-needed --no-tiny-polygon-reduction --buffer=0 \S*france-sea\.geojsonseq/);
    }, SLOW);

    it('does NOT refuse a non-buildings scope on the height-stamp heap floor (the false refusal)', () => {
        // france declares heightJoin `mnh_fr`; the stamp runs ONLY inside the buildings layer, so a
        // `--layer sea` run retains no footprints. Before this was scoped, the preflight exited 5 with
        // "needs at least 6000 MB" and the FIRST sea dispatch could not have run at all.
        const r = run(BAKE, ['--dry-run', '--layer', 'sea', '--region', 'france']);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("height-stamp budget: SKIPPED");
        expect(r.stdout).not.toContain('HEIGHT-STAMP BUDGET FAILED');
        // …and it still ARMS for a buildings scope on the same region.
        const b = run(BAKE, ['--check', '--layer', 'buildings', '--region', 'france']);
        expect(b.stdout + b.stderr).toContain('height-stamp budget:');
        expect(b.stdout + b.stderr).not.toContain('height-stamp budget: SKIPPED');
    }, SLOW);
});

describe('merge-tiles.mjs — an OPTIONAL layer is absent, never missing', () => {
    it('stage-manifest RECORDS a not-produced optional layer instead of dying on it', () => {
        const staging = join(DIR, 'notproduced', 'staging');
        const dir = stageSet(staging, 'luxembourg', ['luxembourg'], ['buildings']);
        // Re-stage the SAME dir claiming all layers: only `buildings.pmtiles` exists there.
        const r = run(MERGE, ['stage-manifest', '--dir', dir, '--regions', 'luxembourg', '--layers', 'buildings,sea', '--slug', 'luxembourg']);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain('sea.pmtiles not produced');
        const mf = JSON.parse(readFileSync(join(dir, 'staging-manifest.json'), 'utf8')) as
            { layers: Record<string, unknown>; optionalLayersNotProduced: string[] };
        expect(Object.keys(mf.layers)).toEqual(['buildings']);   // never CLAIMED
        expect(mf.optionalLayersNotProduced).toEqual(['sea']);   // and never silent
    }, SLOW);

    it('stage-manifest still REFUSES a missing NON-optional layer (the gate is not weakened)', () => {
        const staging = join(DIR, 'nonoptional', 'staging');
        const dir = stageSet(staging, 'luxembourg', ['luxembourg'], ['buildings']);
        const r = run(MERGE, ['stage-manifest', '--dir', dir, '--regions', 'luxembourg', '--layers', 'buildings,roads', '--slug', 'luxembourg']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('roads.pmtiles');
        expect(r.stderr).toContain('refusing to write a manifest claiming a layer the bake did not produce');
    }, SLOW);

    it('merge NAMES and SKIPS an expected region with no staged sea, and merges the rest', () => {
        const staging = join(DIR, 'gap', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], ['buildings']);
        stageSet(staging, 'estonia', ['estonia'], ['buildings', 'sea']);
        const r = run(MERGE, ['merge', '--staging', staging, '--out', join(DIR, 'gap', 'merged'),
            '--expect', 'luxembourg,estonia', '--layer', 'buildings,sea', '--engine', 'js', '--dry-run']);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain("optional layer 'sea'");
        expect(r.stdout).toContain('luxembourg');
        expect(r.stdout).toContain('SKIPPED, not refused');
        expect(r.stdout).toContain('layers: buildings, sea');   // sea still merges for estonia
    }, SLOW);

    it('merge REFUSES the same gap when the layer is NOT optional (roads), naming region and layer', () => {
        const staging = join(DIR, 'gapnonopt', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], ['buildings']);
        stageSet(staging, 'estonia', ['estonia'], ['buildings', 'roads']);
        const r = run(MERGE, ['merge', '--staging', staging, '--out', join(DIR, 'gapnonopt', 'merged'),
            '--expect', 'luxembourg,estonia', '--layer', 'buildings,roads', '--engine', 'js', '--dry-run']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("MISSING REGION(S) for layer 'roads'");
        expect(r.stderr).toContain('luxembourg');
    }, SLOW);

    it('merge refuses HONESTLY when the optional layer is staged NOWHERE — never a silent success', () => {
        const staging = join(DIR, 'nosea', 'staging');
        stageSet(staging, 'luxembourg', ['luxembourg'], ['buildings']);
        const r = run(MERGE, ['merge', '--staging', staging, '--out', join(DIR, 'nosea', 'merged'),
            '--expect', 'luxembourg', '--layer', 'sea', '--engine', 'js', '--dry-run']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain('nothing to merge');
    }, SLOW);

    it('a LAYER-SCOPED set SUPERSEDES the base set\'s copy of that layer, and composes with the rest', () => {
        // The trap this replaced: `region=estonia layer=sea stage=true` under the bare `estonia` slug
        // wiped the region's other staged layers (the s3 sync is --delete), and a second set under a
        // new slug tripped the old region-level ambiguity refusal. Now the scoped set wins for `sea`
        // only, and `buildings` still comes from the base set.
        const staging = join(DIR, 'supersede', 'staging');
        stageSet(staging, 'estonia', ['estonia'], ['buildings', 'sea']);
        stageSet(staging, 'estonia--sea', ['estonia'], ['sea']);
        const r = run(MERGE, ['merge', '--staging', staging, '--out', join(DIR, 'supersede', 'merged'),
            '--expect', 'estonia', '--layer', 'buildings,sea', '--engine', 'js', '--dry-run']);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain("supersede: region 'estonia' layer 'sea'");
        expect(r.stdout).toContain("'estonia--sea' supersedes [estonia]");
        expect(r.stdout).toContain('layers: buildings, sea');
    }, SLOW);

    it('TWO layer-scoped sets for one (region, layer) stay AMBIGUOUS — the operator must delete one', () => {
        const staging = join(DIR, 'ambiguous', 'staging');
        stageSet(staging, 'estonia--sea', ['estonia'], ['sea']);
        stageSet(staging, 'estonia--sea-again', ['estonia'], ['sea']);
        const r = run(MERGE, ['merge', '--staging', staging, '--out', join(DIR, 'ambiguous', 'merged'),
            '--expect', 'estonia', '--layer', 'sea', '--engine', 'js', '--dry-run']);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("region 'estonia' layer 'sea' is staged by BOTH");
    }, SLOW);
});

describe('the proxy allowlist and the client layer union do not drift', () => {
    it('server/context-delivery/contextTilesProxy.js allows every ContextTileLayer, `sea` included', () => {
        const proxy = readFileSync(join(HERE, '..', '..', '..', 'server', 'context-delivery', 'contextTilesProxy.js'), 'utf8');
        const listed = /CONTEXT_TILE_LAYERS = \[([^\]]*)\]/.exec(proxy);
        expect(listed).not.toBeNull();
        const allowed = new Set([...listed![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!));
        const client = readFileSync(join(HERE, '..', '..', '..', 'apps', 'editor', 'src', 'ui', 'geospatial', 'contextTiles.ts'), 'utf8');
        const union = /export type ContextTileLayer =([^;]*);/.exec(client);
        expect(union).not.toBeNull();
        const declared = [...union![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
        expect(declared).toContain('sea');
        expect(allowed).toContain('sea');
        // Every layer the client can ASK for must be a layer the proxy will FORWARD: our own 404 is
        // indistinguishable, client-side, from "never baked" (§L-513b), so a lagging allowlist makes
        // the bake carry the blame for a refusal we made. That is the invariant; it is armed here
        // with ONE named exception, because a baseline that names its gap is honest and a loop that
        // hides it is not.
        //
        // ⭐ THE EXCEPTION IS GONE (lane STARTUP-FIX, L-13111, 2026-09-07) — DELETED, as this test's
        // own instruction required, in the commit that closed it. It read:
        //     const KNOWN_LAGGING = new Set(['canopy']);
        //   · `canopy` — added to the client union by the concurrent §VEG-REAL-CANOPY-BAKE lane
        //     (bake.mjs LAYERS `canopy`, `optIn: true`, so no ordinary bake produces it yet) and NOT
        //     yet added to the proxy allowlist. Measured 2026-09-05 by this test; it is that lane's
        //     one-word fix, not this one's, and the exception must be DELETED when they make it.
        // The measurement that closed it, against production 2026-09-07 — the response SIZE is the
        // tell, because our refusal and R2's are both a bare 404:
        //     /api/context-tiles/canopy.pmtiles?v=L663a    → 404, **38 bytes**   ← OURS
        //     /api/context-tiles/furniture.pmtiles?v=L663a → 404, **27150 bytes** ← R2's
        // The invariant below is now unconditional: EVERY layer the client can ask for is a layer
        // the proxy will forward. Do not re-introduce a lagging set — add the layer.
        for (const l of declared) {
            expect(allowed, `proxy allowlist is missing '${l}'`).toContain(l);
        }
    });
});

// §SEA-IS-NOT-ONE-WORLD-RUN (lane LAYERS-FURNITURE-SEA, 2026-09-06) — a dispatch RECOMMENDATION is
// a thing a person will follow, so a wrong one is a defect with a UI. context-merge-publish.yml's
// `layer` input told the operator to stage the sea for every region in one run ("region blank,
// layer=sea, stage=true → slug all--sea"). Both halves of that were measured false:
//   · COST — the clipper reads the WHOLE 1,275,373,628 B shapefile per run, so the parse is FIXED
//     and the marginal cost is the TOUCHED records. Ten EU regions touch 293 of 53,328 and clip in
//     412 s; all 131 region bboxes ran PAST 100 MINUTES on the same machine and archive without
//     finishing, against a 330-minute job ceiling that also has to hold a download and a tippecanoe.
//   · REFUSAL — an `all--sea` set DECLARES every bake.mjs region, and `expectedRegions` widens on
//     the staged names under BOTH expect=all and expect=staged (measured 40 → 132), so the NEXT
//     merge refuses by name on every region with no base staged set for the non-optional layers.
// Pinned as TEXT because the recommendation IS text — there is no other artefact to assert on.
describe('§SEA-IS-NOT-ONE-WORLD-RUN — the merge workflow must not recommend a blank-region sea stage', () => {
    const mergeYml = (): string =>
        readFileSync(join(HERE, '..', '..', '..', '.github', 'workflows', 'context-merge-publish.yml'), 'utf8');

    it('no longer tells the operator to stage the sea for every region in one run', () => {
        // The retired recommendation is QUOTED in the correction (recorded, not deleted), so the
        // assertion is not "the words are absent" — it is "every occurrence is on the line that
        // retires it". A blunt not.toContain here would forbid the record of the mistake.
        // ⛔ L-13114 (lane STARTUP-FIX, 2026-09-07) — THIS LINE HELD A LITERAL CR AND A LITERAL LF
        // INSIDE A REGEX LITERAL: the bytes were `.split(/<CR>?<LF>/);`, i.e. `\r?\n` written with
        // the escapes expanded. A raw newline in a regex literal is a hard PARSE error, so esbuild
        // refused the file and THE WHOLE SPEC NEVER RAN — including the allowlist-drift invariant
        // above, whose `KNOWN_LAGGING` entry said "the exception must be DELETED when they make it"
        // and was guarded by nothing. Committed broken in fd61083e (2026-09-06). See the ISSUE-LOG.
        const lines = mergeYml().split(/\r?\n/);
        const hits = lines.filter((l) => l.includes('region blank, layer=sea'));
        expect(hits.length, 'the all--sea recommendation vanished entirely — keep the record').toBeGreaterThan(0);
        for (const l of hits) {
            expect(l, `an all--sea recommendation that is not marked as retired: ${l.trim()}`)
                .toMatch(/USED TO RECOMMEND/);
        }
        // and the operator-facing `description:` values must carry none of it.
        for (const l of lines.filter((x) => x.trimStart().startsWith('description:'))) {
            expect(l).not.toContain('region blank, layer=sea');
            expect(l).not.toContain('for every region in one run');
        }
    });

    it('carries the measured reason, so the next reader can check it rather than trust it', () => {
        const y = mergeYml();
        expect(y).toContain('§SEA-IS-NOT-ONE-WORLD-RUN');
        expect(y).toContain('1,275,373,628');          // the shapefile the parse cost is paid on
        expect(y).toContain('293 of 53,328');          // touched records for a 10-region tranche
        expect(y).toContain('412 s');                  // that tranche's measured clip
        expect(y).toMatch(/expectedRegions/);          // the widening, named by the function that does it
    });

    it('still tells the operator that both layers are OPTIONAL and both ride the DEFAULT bake', () => {
        const y = mergeYml();
        expect(y).toMatch(/`sea` and\s+`?furniture`? are OPTIONAL|are OPTIONAL/);
        // The reason no separate dispatch is needed for an un-staged region: neither layer is optIn.
        const tables = JSON.parse(
            spawnSync(NODE, [BAKE, '--regions-json'], { encoding: 'utf8', timeout: SLOW }).stdout,
        ) as { layers: string[]; optionalLayers: string[] };
        expect(tables.layers).toEqual(expect.arrayContaining(['sea', 'furniture']));
        expect(tables.optionalLayers).toEqual(expect.arrayContaining(['sea', 'furniture']));
    }, SLOW);
});
