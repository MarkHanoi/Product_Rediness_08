// §BAKE-NEWZEALAND / §PENDING-REGION (2026-09-05, lane NZ-EVERYWHERE) — the New Zealand context
// skeleton, pinned end to end: the bake row, the honest no-height mapping, and — the load-bearing
// part — the `pending` flag that keeps an UNSTAGED new row OUT of the `expect=all` set.
//
// WHY THE FLAG IS THE POINT. merge-tiles.mjs derives `expect=all` from bake.mjs's table (the
// §SYNC-SWITCH single source of truth). Before this lane, adding a 50th row meant the NEXT expect=all
// publish would REFUSE BY NAME — the missing-region gate firing for a region that had never been live
// and so could not be lost. The founder's france+switzerland expect=all publish was hours away when
// this row landed. So a pending row is EXPECTED ONLY WHEN STAGED, and this spec proves BOTH halves:
// unstaged ⇒ not expected (no refusal); staged ⇒ expected (merges in, and can then be lost, so the
// flag must come off once live — the spec's last block says why).
//
// bake.mjs runs main() on import and cannot be loaded by vitest, so — like swissWiring.spec.ts and
// mnhFr.spec.ts — the ROW is asserted on the TEXT, and the flag's SEMANTICS are asserted on the real
// CLI output (`bake.mjs --regions-json`, a child process) fed to the real `expectedRegions` (imported
// from merge-tiles.mjs in a child process, the mergeTiles.spec.ts precedent).
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAKE = resolve(HERE, '../bake.mjs');
const MERGE = resolve(HERE, '../merge-tiles.mjs');
const bake = readFileSync(BAKE, 'utf8');
const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const NODE = process.execPath;

interface RegionRow { readonly name: string; readonly bbox: string; readonly heightJoin: string | null; readonly pending: boolean }
interface Tables { readonly schema: string; readonly allRegions: readonly RegionRow[] }

function regionsJson(): Tables {
    const out = execFileSync(NODE, [BAKE, '--regions-json'], { encoding: 'utf8', timeout: 60_000 });
    return JSON.parse(out) as Tables;
}

/** Run the REAL `expectedRegions` (merge-tiles.mjs, child process) on the REAL bake table. */
function expectedFor(expectArg: string, staged: readonly string[]): { expected: string[]; pendingUnstaged: string[] } {
    const script = `
      import { expectedRegions } from ${JSON.stringify(pathToFileURL(MERGE).href)};
      import { execFileSync } from 'node:child_process';
      const tables = JSON.parse(execFileSync(process.execPath, [${JSON.stringify(BAKE)}, '--regions-json'], { encoding: 'utf8' }));
      console.log(JSON.stringify(expectedRegions(tables.allRegions, ${JSON.stringify(expectArg)}, ${JSON.stringify(staged)})));
    `;
    const out = execFileSync(NODE, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
    return JSON.parse(out.trim());
}

describe('§BAKE-NEWZEALAND — the bake row', () => {
    it("declares the `newzealand` row on Geofabrik's national NZ extract with the founder's bbox and NO heightJoin", () => {
        const row = bake.match(/\{\s*name:\s*'newzealand'\s*,[^\n]*\}/);
        expect(row, 'newzealand row').not.toBeNull();
        expect(row![0]).toContain("pbfUrl: 'https://download.geofabrik.de/australia-oceania/new-zealand-latest.osm.pbf'");
        expect(row![0]).toContain("bbox: '166.0,-47.5,178.7,-34.3'");
        expect(row![0]).not.toMatch(/heightJoin/); // LINZ outlines carry no height — never a fabricated join
        expect(row![0]).toMatch(/pending:\s*true/);
    });

    it('the bbox stays west of the antimeridian (osmium -b cannot wrap; the Chathams are deliberately outside)', () => {
        const [w, s, e, n] = '166.0,-47.5,178.7,-34.3'.split(',').map(Number);
        expect(w).toBeLessThan(e);
        expect(s).toBeLessThan(n);
        expect(e).toBeLessThanOrEqual(180);
        // Auckland, Wellington, Christchurch, Dunedin, Invercargill are inside.
        for (const [lon, lat] of [[174.7645, -36.8485], [174.7762, -41.2865], [172.6362, -43.5321], [170.5028, -45.8788], [168.3538, -46.4132]]) {
            expect(lon).toBeGreaterThan(w); expect(lon).toBeLessThan(e);
            expect(lat).toBeGreaterThan(s); expect(lat).toBeLessThan(n);
        }
    });

    it('heightSources.mjs REGION_SOURCE maps `newzealand` to an honest NO-SOURCE object that names the LINZ evidence', () => {
        const m = heightSources.match(/^\s*newzealand:\s*\{([^\n]*)\}/m);
        expect(m, 'newzealand REGION_SOURCE row').not.toBeNull();
        expect(m![1]).toMatch(/source:\s*null/);
        expect(m![1]).toMatch(/status:\s*'no-source'/);
        expect(m![1]).toContain('101290');           // the outlines layer that has no height
        expect(m![1]).toContain('401');              // the keyless-service reading
        expect(m![1]).toMatch(/DSM/);                // the owed derive is NAMED, not hidden
    });

    it('no NZ city row exists, so a later national join could never double-bake a city', () => {
        for (const city of ['auckland', 'wellington', 'christchurch']) {
            expect(bake, `${city} must not be a bake region row`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${city}'`));
        }
    });
});

describe('§PENDING-REGION — `bake.mjs --regions-json` emits the flag, and ONLY for newzealand today', () => {
    const tables = regionsJson();

    it('every row carries a boolean `pending` (absent on the row ⇒ false — never undefined on the wire)', () => {
        expect(tables.schema).toBe('pryzm-context-bake-regions@1');
        for (const r of tables.allRegions) expect(typeof r.pending, `${r.name}.pending`).toBe('boolean');
    });

    it('newzealand is pending; no other row is (a live region must never carry the flag)', () => {
        const nz = tables.allRegions.find((r) => r.name === 'newzealand');
        expect(nz).toBeDefined();
        expect(nz!.pending).toBe(true);
        expect(nz!.heightJoin).toBeNull();
        expect(tables.allRegions.filter((r) => r.pending).map((r) => r.name)).toEqual(['newzealand']);
    });
});

describe('§PENDING-REGION — merge-tiles.mjs expectedRegions (the REAL function on the REAL table)', () => {
    const tables = regionsJson();
    const everyone = tables.allRegions.map((r) => r.name);
    const live = everyone.filter((n) => n !== 'newzealand');

    it('expect=all with newzealand UNSTAGED expects every non-pending row and lists newzealand as pending-unstaged (no refusal)', () => {
        const r = expectedFor('all', live);
        expect(r.expected).toEqual(live);
        expect(r.expected).not.toContain('newzealand');
        expect(r.pendingUnstaged).toEqual(['newzealand']);
    });

    it('expect=all with NOTHING staged still leaves newzealand out — the missing set is exactly the live rows, never the pending one', () => {
        const r = expectedFor('all', []);
        expect(r.expected).toEqual(live);
        expect(r.pendingUnstaged).toEqual(['newzealand']);
    });

    it('expect=all with newzealand STAGED expects it (the first NZ publish needs no special expect= value)', () => {
        const r = expectedFor('all', everyone);
        expect(r.expected).toEqual(everyone);
        expect(r.expected).toContain('newzealand');
        expect(r.pendingUnstaged).toEqual([]);
    });

    it('expect=staged and an explicit csv are unchanged by the flag — naming newzealand expects it', () => {
        expect(expectedFor('staged', ['newzealand', 'france'])).toEqual({ expected: ['newzealand', 'france'], pendingUnstaged: [] });
        expect(expectedFor('newzealand,france', [])).toEqual({ expected: ['newzealand', 'france'], pendingUnstaged: [] });
    });

    it('the merge command logs the pending set by NAME (an unexplained absence would be the next silent loss)', () => {
        const merge = readFileSync(MERGE, 'utf8');
        expect(merge).toMatch(/expectedRegions\(tables\.allRegions,\s*expectArg,/);
        expect(merge).toMatch(/§PENDING-REGION[^\n]*pendingUnstaged\.join/);
    });
});
