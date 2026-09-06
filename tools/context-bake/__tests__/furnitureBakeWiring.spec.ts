// §STREET-LIFE (L-12936, founder 2026-09-05: "would it be possible to add everywhere pedestrians but
// also street lighting etc?") — the BAKE half's wiring, exercised through the real CLI.
//
// `apps/editor/src/ui/geospatial/__tests__/contextStreetLife.spec.ts` proves the placement rules.
// THIS file proves the `furniture` layer is REACHABLE: that bake.mjs declares it, plans the right
// osmium/tippecanoe commands for it, marks it OPTIONAL, and that every enumeration of the layer id
// list agrees with the LAYERS table. §authored-but-unwired — a layer no dispatch names is not
// shipped, and the layer-id list is enumerated in FOUR places (bake.mjs, two workflow inputs, the
// proxy allowlist) that have each drifted before.
//
// ⚠ WHY `optional: true` IS ASSERTED HERE AND NOT JUST COMMENTED. merge-tiles.mjs step 3 REFUSES the
// whole merge when an expected region has no staged set for a NON-optional layer, because the R2
// publish is a sync that REPLACES the archive. `furniture` is absent for every region staged before
// this lane, so a non-optional `furniture` would refuse every merge until a full re-bake landed —
// the §PENDING-HEIGHTS shape (L-12937). The seaBakeWiring spec pins the merge behaviour itself for
// the optional class; this file pins that `furniture` is IN that class.
//
// Every assertion runs the REAL child process and reads the REAL exit code — the value the workflow
// sees. Nothing is downloaded: `--dry-run` short-circuits `download()` before any fetch.
//
// LAYERING: a build/inspection tool test, like its siblings — no OTel span.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const BAKE = join(HERE, '..', 'bake.mjs');
const NODE = process.execPath;
/** These spawn node, which spawns node again (`bakeTables`); on a loaded machine that is seconds. */
const SLOW = 120_000;

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync(NODE, [BAKE, ...args], { encoding: 'utf8', timeout: SLOW });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('bake.mjs — the `furniture` layer is declared, optional, and filtered to NODES', () => {
    it('--regions-json names `furniture` in allLayers AND in optionalLayers', () => {
        const r = run(['--regions-json']);
        expect(r.status, r.stderr).toBe(0);
        const tables = JSON.parse(r.stdout) as { allLayers: string[]; optionalLayers: string[] };
        expect(tables.allLayers).toContain('furniture');
        // The contract merge-tiles.mjs reads: an absent `furniture.pmtiles` is an absence, not a gap.
        expect(tables.optionalLayers).toContain('furniture');
    }, SLOW);

    it('is IN the default bake (unlike an optIn layer) so a re-baked region ships it without a flag', () => {
        const r = run(['--regions-json']);
        const tables = JSON.parse(r.stdout) as { layers: string[] };
        // `layers` is the run's RESOLVED set — no --layer given, so it is the default bake.
        expect(tables.layers, 'furniture must ride an ordinary bake — it is cheap and the client needs it')
            .toContain('furniture');
        // …and the opt-in canopy layer is NOT, which is what makes the assertion above meaningful.
        expect(tables.layers).not.toContain('canopy');
    }, SLOW);

    it('plans osmium tags-filter on the FOUR node classes, exports points, tiles at z15–16', () => {
        const r = run(['--dry-run', '--layer', 'furniture', '--region', 'luxembourg']);
        expect(r.status, r.stderr).toBe(0);
        const out = r.stdout;
        // `n/` = NODES only. A `nwr/` filter would drag in the shelter WAYS around bus stops and the
        // bicycle-parking areas, which `--geometry-types point` then discards after paying for them.
        expect(out).toContain(
            'osmium tags-filter /work/clip-luxembourg.osm.pbf ' +
            'n/highway=street_lamp n/amenity=bench n/highway=bus_stop n/amenity=bicycle_parking');
        expect(out).not.toMatch(/nwr\/highway=street_lamp/);
        // POINT geometry — the client reader carries single-vertex features for this layer
        // (contextTiles.ts LAYER_IS_POINT.furniture).
        expect(out).toMatch(/osmium export \S*luxembourg-furniture\.osm\.pbf -f geojsonseq --geometry-types point/);
        // z15–16 (finer than trees' z14: a 6 m post is only read close in) + the density cap.
        expect(out).toMatch(
            /tippecanoe -o \S*furniture\.pmtiles -l furniture -Z 15 -z 16 -P --force --drop-densest-as-needed \S*luxembourg-furniture\.geojsonseq/);
    }, SLOW);

    it('does NOT trip the height-stamp heap floor on a furniture-only scope (the false-refusal shape)', () => {
        // `denmark` declares heightJoin `dhm`; the stamp runs ONLY inside the buildings layer, so a
        // `--layer furniture` run retains no footprints and must not be refused on a footprint budget.
        // (Deliberately NOT `spain`: that row also declares a `footprintSource`, whose own preflight
        // is a DIFFERENT gate belonging to another lane — asserting through it would make this spec
        // fail for their reasons, which is how a wiring test stops meaning anything.)
        const r = run(['--dry-run', '--layer', 'furniture', '--region', 'denmark']);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain('height-stamp budget: SKIPPED');
        expect(r.stdout).not.toContain('HEIGHT-STAMP BUDGET FAILED');
    }, SLOW);
});

describe('every enumeration of the layer ids names `furniture` (four lists, one truth)', () => {
    /** The LAYERS table is the authority; these four lists are hand-written and have drifted before. */
    it('bake.mjs allLayers ⊆ the two workflow `layer` input descriptions and the client union', () => {
        const tables = JSON.parse(run(['--regions-json']).stdout) as { allLayers: string[] };
        expect(tables.allLayers).toContain('furniture');

        const bakeYml = readFileSync(join(ROOT, '.github', 'workflows', 'context-bake.yml'), 'utf8');
        const mergeYml = readFileSync(join(ROOT, '.github', 'workflows', 'context-merge-publish.yml'), 'utf8');
        // The operator picks a single layer from these descriptions; a layer missing from them is a
        // layer nobody can bake or publish on its own.
        expect(bakeYml, 'context-bake.yml `layer` input does not offer furniture').toContain('furniture');
        expect(mergeYml, 'context-merge-publish.yml `layer` input does not offer furniture').toContain('furniture');

        const client = readFileSync(
            join(ROOT, 'apps', 'editor', 'src', 'ui', 'geospatial', 'contextTiles.ts'), 'utf8');
        const union = /export type ContextTileLayer =([^;]*);/.exec(client);
        expect(union).not.toBeNull();
        expect([...union![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)).toContain('furniture');
    }, SLOW);

    it('the tile proxy will FORWARD furniture — our own 404 is indistinguishable from "never baked"', () => {
        const proxy = readFileSync(
            join(ROOT, 'server', 'context-delivery', 'contextTilesProxy.js'), 'utf8');
        const listed = /CONTEXT_TILE_LAYERS = \[([^\]]*)\]/.exec(proxy);
        expect(listed).not.toBeNull();
        expect([...listed![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)).toContain('furniture');
    });
});
