// §EA-LIDAR-GB-OSM-JOIN (2026-09-05, lane HEIGHTS-GB-IE) — the WIRING of the England measured-height
// stamp, pinned.
//
// France (L-12910) and Switzerland (L-12883) each had a stamp BUILT and imported by nothing for a day: a
// measured-height channel one import away while the country baked honest 9 m defaults and rendered as
// ghosts. Great Britain had the same shape for LONGER — heightSources.mjs REGION_SOURCE said `ealidar_gb`
// "documented … the owed build is the England nDSM stamp" since the whole-country rows landed. This spec
// exists so the GB stamp cannot repeat that shape silently. bake.mjs runs main() on import and cannot be
// loaded by vitest, so — like swissWiring.spec.ts — the wiring is asserted on the TEXT, one assertion per
// place the join is wired, because "exactly like mds" is the design rule (bake.mjs §MDS-OSM-JOIN).
//
// The GB dispatch is a ROW of NATIONAL_STAMP_TABLE (§NATIONAL-STAMP-TABLE, lane HEIGHTS-NORDICS), not
// another `||` term in the pinned chain: that chain is pinned contiguously at BOTH ends by sibling specs
// (auOpenHeightsWiring `if (… 'au_open' || … 'mds'`, mnhFr `'mds' || 'dhm' || 'lod2nrw' || 'mnh_fr'`,
// swissWiring `'mnh_fr' || 'swiss')`), so there is no insertion point that breaks none of them. Table rows
// dispatch BEFORE the chain through the SAME recorder (recordNationalStampOutcome), so the
// §MEASURED-HEIGHT-GATE sees GB exactly as it sees mds/dhm/swiss.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const hs = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');

describe('§EA-LIDAR-GB-OSM-JOIN — bake.mjs wires the ealidar_gb stamp for the `greatbritain` row', () => {
    it('imports the stamp from its OWN module and the working set from the pure half (not through heightSources.mjs)', () => {
        expect(bake).toMatch(/^import \{ stampEaLidarGbHeightsOnGeojsonseq \} from '\.\/heights\/ealidarGbStamp\.mjs';/m);
        expect(bake).toMatch(/^import \{ EA_LIDAR_GB_CITY_BBOXES \} from '\.\/heights\/ealidarGb\.mjs';/m);
    });

    it("the `greatbritain` region row declares heightJoin:'ealidar_gb' (the key heightSources.mjs REGION_SOURCE names)", () => {
        const row = bake.match(/\{\s*name:\s*'greatbritain'\s*,[^\n]*\}/);
        expect(row, 'greatbritain row').not.toBeNull();
        expect(row![0]).toMatch(/heightJoin:\s*'ealidar_gb'/);
    });

    it('the `ireland` row declares NO heightJoin — no open bbox-addressable elevation exists (probed 2026-09-05), never armed on a blank', () => {
        const row = bake.match(/\{\s*name:\s*'ireland'\s*,[^\n]*\}/);
        expect(row, 'ireland row').not.toBeNull();
        expect(row![0]).not.toMatch(/heightJoin/);
    });

    it('no GB city row exists, so the national join cannot double-bake London', () => {
        for (const city of ['london', 'manchester', 'birmingham', 'leeds', 'bristol']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });

    it('stampBboxesFor bounds the national join to EA_LIDAR_GB_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
        const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'stampBboxesFor').not.toBeNull();
        expect(fn![1]).toMatch(/r\.heightJoin === 'ealidar_gb'\)\s*return EA_LIDAR_GB_CITY_BBOXES\.map/);
    });

    it('dispatches ealidar_gb as a NATIONAL_STAMP_TABLE row (stamp + working set), through the SHARED outcome recorder', () => {
        const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
        expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
        expect(table![1]).toMatch(/^\s*ealidar_gb:\s*\{\s*stamp:\s*stampEaLidarGbHeightsOnGeojsonseq,\s*bboxes:\s*EA_LIDAR_GB_CITY_BBOXES\s*\},?$/m);
        // The table dispatches through the ONE recorder the pinned chain also uses — the gate must see both the same way.
        expect(bake).toMatch(/const tableStamp = NATIONAL_STAMP_TABLE\[r\.heightJoin\];/);
        expect(bake).toMatch(/^function recordNationalStampOutcome\(r, res, stamped, baseGeo, geos\)/m);
        expect(bake.match(/recordNationalStampOutcome\(r, res, stamped, baseGeo, geos\);/g)?.length).toBeGreaterThanOrEqual(2);
        // GB did not edit the shared condition: it carries no 'ealidar_gb' term, and the swiss pin's text survives.
        expect(bake).not.toMatch(/r\.heightJoin === 'ealidar_gb' \|\|/);
        expect(bake).toMatch(/r\.heightJoin === 'mnh_fr' \|\| r\.heightJoin === 'swiss'/);
    });

    it('both CI gates refuse a GB bake that ships no measured heights at Trafalgar Square', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*london greatbritain 51\.5074,-0\.1278 500$/m);
        }
    });
});

describe('§EA-LIDAR-GB — heightSources.mjs REGION_SOURCE tells the truth about GB and IE', () => {
    it("greatbritain → 'ealidar_gb', marked WIRED 2026-09-05", () => {
        expect(hs).toMatch(/^\s*greatbritain:\s*'ealidar_gb',\s*\/\/.*WIRED 2026-09-05/m);
    });
    it('the ealidar_gb source row says the differencing is ours and Scotland/Wales are not served', () => {
        const row = hs.match(/ealidar_gb:\s*\{[\s\S]*?\n\s*\},/);
        expect(row, 'ealidar_gb SOURCES row').not.toBeNull();
        expect(row![0]).toMatch(/impl:\s*'live'/);
        expect(row![0]).toMatch(/differenc/i);
        expect(row![0]).toMatch(/Scotland/);
        expect(row![0]).toMatch(/Wales/);
    });
    it("ireland stays no-source, with the 2026-09-05 probe (GSI ImageServers are 8-bit HILLSHADES, not elevation)", () => {
        const row = hs.match(/^\s*ireland:\s*\{[^\n]*\},?$/m);
        expect(row, 'ireland REGION_SOURCE row').not.toBeNull();
        expect(row![0]).toMatch(/status:\s*'no-source'/);
        expect(row![0]).toMatch(/2026-09-05/);
        expect(row![0]).toMatch(/hillshade/i);
    });
});
