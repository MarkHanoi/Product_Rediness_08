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
import { afterAll, describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
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

describe('§PENDING-REGION — `bake.mjs --regions-json` emits the flag on every row that has never been baked', () => {
    const tables = regionsJson();

    it('every row carries a boolean `pending` (absent on the row ⇒ false — never undefined on the wire)', () => {
        expect(tables.schema).toBe('pryzm-context-bake-regions@1');
        for (const r of tables.allRegions) expect(typeof r.pending, `${r.name}.pending`).toBe('boolean');
    });

    it('newzealand is pending, and no LIVE region is (a live region must never carry the flag)', () => {
        const nz = tables.allRegions.find((r) => r.name === 'newzealand');
        expect(nz).toBeDefined();
        expect(nz!.pending).toBe(true);
        expect(nz!.heightJoin).toBeNull();
        // ⚠ RE-STATED 2026-09-06 (lane EU-EVERY-COUNTRY). This read `toEqual(['newzealand'])`, which
        // was right on the day and is a LITERAL of a set that grows every time a new country lands
        // before its first bake — §EU-EVERY-COUNTRY added seventeen. The INVARIANT this case exists to
        // protect is not "exactly one row is pending"; it is "a region that is already LIVE in R2 must
        // never carry the flag", because a flag on a live region lets a later publish drop it silently.
        // So: newzealand is pending, and every long-live region is not. Add to LIVE, never to a literal.
        const pending = new Set(tables.allRegions.filter((r) => r.pending).map((r) => r.name));
        expect(pending.has('newzealand')).toBe(true);
        const LIVE = ['spain', 'denmark', 'netherlands', 'france', 'germany', 'italy', 'portugal',
            'belgium', 'switzerland', 'austria', 'czechia', 'poland', 'greatbritain', 'ireland',
            'sweden', 'norway', 'finland', 'estonia', 'latvia', 'lithuania', 'luxembourg', 'greece',
            'croatia', 'slovenia', 'hungary', 'romania', 'slovakia', 'bulgaria', 'paris', 'lyon', 'koln'];
        expect([...pending].filter((n) => LIVE.includes(n))).toEqual([]);
    });
});

// Every case here spawns TWO node children per `expectedFor` (the ESM shim, and bake.mjs inside it),
// so vitest's 10 s DEFAULT testTimeout is load-fragile — under full fleet load the csv case timed out
// at 10 000 ms while doing nothing wrong. Each carries an explicit 60 s. (c7d1ebe6 recorded the same
// fragility in mergeTiles.spec.ts's hooks; this is that, fixed here rather than described again.)
describe('§PENDING-REGION — merge-tiles.mjs expectedRegions (the REAL function on the REAL table)', () => {
    const tables = regionsJson();
    const everyone = tables.allRegions.map((r) => r.name);
    // ⚠ RE-DERIVED 2026-09-06 (lane EU-EVERY-COUNTRY). These read `everyone.filter(n => n !== 'newzealand')`
    // and `toEqual(['newzealand'])` — literals of the pending SET, which grows every time a country
    // lands before its first bake (§EU-EVERY-COUNTRY added seventeen at once). The behaviour under test
    // is unchanged and is the same sentence as before: expect=all expects exactly the NON-pending rows,
    // and names every pending row that is not staged instead of refusing for it.
    const pendingNames = tables.allRegions.filter((r) => r.pending === true).map((r) => r.name);
    const live = tables.allRegions.filter((r) => r.pending !== true).map((r) => r.name);

    it('expect=all with the pending rows UNSTAGED expects every non-pending row and lists them as pending-unstaged (no refusal)', () => {
        const r = expectedFor('all', live);
        expect(r.expected).toEqual(live);
        expect(r.expected).not.toContain('newzealand');
        expect(r.pendingUnstaged).toEqual(pendingNames);
        expect(r.pendingUnstaged).toContain('newzealand');
    }, 60_000);

    it('expect=all with NOTHING staged still leaves the pending rows out — the missing set is exactly the live rows, never a pending one', () => {
        const r = expectedFor('all', []);
        expect(r.expected).toEqual(live);
        expect(r.pendingUnstaged).toEqual(pendingNames);
    }, 60_000);

    it('expect=all with every pending row STAGED expects them all (the first publish needs no special expect= value)', () => {
        const r = expectedFor('all', everyone);
        expect(r.expected).toEqual(everyone);
        expect(r.expected).toContain('newzealand');
        expect(r.pendingUnstaged).toEqual([]);
    }, 60_000);

    it('expect=staged and an explicit csv are unchanged by the flag — naming newzealand expects it', () => {
        expect(expectedFor('staged', ['newzealand', 'france'])).toEqual({ expected: ['newzealand', 'france'], pendingUnstaged: [] });
        expect(expectedFor('newzealand,france', [])).toEqual({ expected: ['newzealand', 'france'], pendingUnstaged: [] });
    }, 60_000);

    it('the merge command logs the pending set by NAME (an unexplained absence would be the next silent loss)', () => {
        const merge = readFileSync(MERGE, 'utf8');
        expect(merge).toMatch(/expectedRegions\(tables\.allRegions,\s*expectArg,/);
        expect(merge).toMatch(/§PENDING-REGION[^\n]*pendingUnstaged\.join/);
    });
});

// ── §PENDING-REGION — the REAL `merge` command, not the pure function (lane NZ-FINISH, 2026-09-05).
// The block above proves `expectedRegions`; the buildings publish running today rides the CLI path
// AROUND it — bakeTables() → expectedRegions → the MISSING-REGION refusal → the tileset manifest. A
// pure-function pin cannot see a wiring slip between those (e.g. the refusal reading `allRegions`
// directly). So: every live row staged as ONE fixture set (stage-manifest accepts a csv), newzealand
// NOT staged, `merge --expect all` — exit 0, newzealand named on stdout as pending-unstaged, absent
// from the manifest. Then the contrast (a live row missing ⇒ refusal names THAT row, never NZ), and
// the flip side (NZ staged ⇒ merges in with no special expect= value). Fixture helpers mirror
// mergeTiles.spec.ts's `stageSet` deliberately — the CLI is the contract, not the helper.
describe('§PENDING-REGION — the REAL `merge --expect all` CLI with newzealand pending and NOT staged', () => {
    const DIR = mkdtempSync(join(tmpdir(), 'pryzm-nz-pending-'));
    afterAll(() => rmSync(DIR, { recursive: true, force: true }));

    const tables = regionsJson();
    // (`everyone` was removed here 2026-09-06 — the manifest assertion below names `live` + newzealand,
    //  which is exactly what this case stages; a whole-table literal is racy while siblings edit bake.mjs.)
    const live = tables.allRegions.filter((r) => r.pending !== true).map((r) => r.name);
    // ⚠ NO `pendingNames` LITERAL HERE (lane EU-EVERY-COUNTRY, 2026-09-06). The CLI cases below read
    // bake.mjs in a CHILD PROCESS seconds after this file read it, so any assertion spelling out the
    // whole pending set races a sibling lane's edit (measured: `puertorico` → `puertoricousa` mid-run).
    // They assert the SHAPE of the pending line plus newzealand by name instead — same contract, no race.

    /** One staged set (a real pmtiles fixture + a real staging manifest) claiming `regions`. */
    function stageSet(staging: string, slug: string, regions: readonly string[], tiles: Array<{ z: number; x: number; y: number; payloadText: string }>): void {
        const dir = join(staging, slug);
        mkdirSync(dir, { recursive: true });
        const spec = join(dir, 'buildings.fixture.json');
        writeFileSync(spec, JSON.stringify({ tileCompression: 'gzip', tileType: 'mvt', layerName: 'buildings', tiles }));
        execFileSync(NODE, [MERGE, 'write-fixture', '--out', join(dir, 'buildings.pmtiles'), '--spec', spec], { encoding: 'utf8' });
        rmSync(spec);
        execFileSync(NODE, [MERGE, 'stage-manifest', '--dir', dir, '--regions', regions.join(','), '--layers', 'buildings', '--slug', slug], { encoding: 'utf8' });
    }
    function mergeAll(staging: string, out: string): { status: number | null; stdout: string; stderr: string } {
        const r = spawnSync(NODE, [MERGE, 'merge', '--staging', staging, '--out', out, '--expect', 'all', '--layer', 'buildings', '--engine', 'js'], { encoding: 'utf8', timeout: 120_000 });
        return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    }
    const LIVE_TILES = [{ z: 2, x: 2, y: 1, payloadText: 'live-A' }, { z: 3, x: 4, y: 2, payloadText: 'live-B' }];
    const NZ_TILES = [{ z: 2, x: 3, y: 3, payloadText: 'nz-A' }];

    it('does NOT refuse: exit 0, newzealand named as pending-unstaged on stdout, absent from the tileset manifest', () => {
        const staging = join(DIR, 'ok', 'staging');
        const out = join(DIR, 'ok', 'merged');
        stageSet(staging, 'everything-live', live, LIVE_TILES);
        const r = mergeAll(staging, out);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stderr).not.toContain('MISSING');
        // ⚠ STRUCTURE, NOT THE WHOLE LIST (lane EU-EVERY-COUNTRY, 2026-09-06). This asserted the exact
        // sentence including every pending name. That is racy by construction under a fleet: the
        // pending set is read from bake.mjs TWICE — once here at collection time, once by the merge
        // child process seconds later — and a sibling lane renaming a row in between turns a correct
        // gate into a red test (measured: `puertorico` → `puertoricousa` mid-run). The CONTRACT is
        // that the merge NAMES its pending-unstaged rows and counts them; that is what is asserted.
        expect(r.stdout).toMatch(/§PENDING-REGION — \d+ bake\.mjs row\(s\) flagged pending and NOT staged: \[[^\]]*\] — not expected by this merge/);
        expect(r.stdout).toContain('newzealand');   // …and newzealand is one of them, by name
        expect(r.stdout).toContain(`${live.length} region(s) in the bytes (${live.length} expected)`);
        const manifest = JSON.parse(readFileSync(join(out, 'tileset-manifest.json'), 'utf8')) as { regions: Record<string, unknown> };
        expect(Object.keys(manifest.regions).sort()).toEqual([...live].sort());
        expect(manifest.regions).not.toHaveProperty('newzealand');
    }, 120_000);

    it('still refuses BY NAME when a LIVE row is missing — the refusal names that row and never newzealand', () => {
        const staging = join(DIR, 'miss', 'staging');
        stageSet(staging, 'minus-latvia', live.filter((n) => n !== 'latvia'), LIVE_TILES);
        const r = mergeAll(staging, join(DIR, 'miss', 'merged'));
        expect(r.status).toBe(1);
        // The SENTENCE is another lane's (§SEA-BAKE-POLYGONS made the refusal layer-scoped: "… for layer 'buildings' …
        // NO staged 'buildings' bake"); the CONTRACT is exit 1 + the missing row named + NZ not named.
        expect(r.stderr).toMatch(/MISSING REGION\(S\)[^\n]*— 1 expected region\(s\) have NO staged (?:'buildings' )?bake: \[latvia\]/);
        expect(r.stderr).not.toContain('newzealand');
        expect(r.stdout).toContain('— not expected by this merge');
        expect(r.stdout).toContain('newzealand');   // still named among the pending set, not swallowed
    }, 120_000);

    it('merges newzealand IN once it is staged, with no special expect= value and no pending line', () => {
        const staging = join(DIR, 'staged', 'staging');
        const out = join(DIR, 'staged', 'merged');
        stageSet(staging, 'everything-live', live, LIVE_TILES);
        stageSet(staging, 'newzealand', ['newzealand'], NZ_TILES);
        const r = mergeAll(staging, out);
        expect(r.status, r.stderr).toBe(0);
        // ⚠ SCOPED TO NEWZEALAND (lane EU-EVERY-COUNTRY, 2026-09-06). This read
        // `not.toContain('§PENDING-REGION')`, which was true only while newzealand was the sole pending
        // row: this case stages `live` + newzealand, so every OTHER pending row is legitimately unstaged
        // and legitimately named. The sentence under test is "staging NZ removes NZ from the pending
        // line", not "no row anywhere is pending".
        const pendingLine = (r.stdout.match(/§PENDING-REGION[^\n]*/) ?? [''])[0];
        expect(pendingLine).not.toContain('newzealand');
        const manifest = JSON.parse(readFileSync(join(out, 'tileset-manifest.json'), 'utf8')) as { regions: Record<string, unknown> };
        expect(Object.keys(manifest.regions).sort()).toEqual([...live, 'newzealand'].sort());
        expect(manifest.regions).toHaveProperty('newzealand');
    }, 120_000);

    // ⭐ THE FAIL-SAFE, and the reason the flag is not a foot-gun. c7d1ebe6 states that the no-loss
    // gate is deliberately NOT flag-aware: once NZ is LIVE, forgetting to drop `pending: true` must
    // REFUSE, not silently delete it. That is an assertion about a SECOND, independent gate (step 4,
    // against the live tileset-manifest.json) and nothing exercised it. Here the manifest written by
    // the 50-region merge above is fed back in as the LIVE one, newzealand is left unstaged, and the
    // flag is still set — the run must die naming newzealand.
    it('a pending row that is ALREADY LIVE is still protected: unstaged ⇒ REGION LOSS, never a silent delete', () => {
        const liveManifest = join(DIR, 'staged', 'merged', 'tileset-manifest.json');
        const liveJson = JSON.parse(readFileSync(liveManifest, 'utf8')) as { regions: Record<string, unknown> };
        expect(liveJson.regions).toHaveProperty('newzealand');
        const staging = join(DIR, 'relapse', 'staging');
        stageSet(staging, 'everything-live', live, LIVE_TILES);
        const r = spawnSync(NODE, [MERGE, 'merge', '--staging', staging, '--out', join(DIR, 'relapse', 'merged'),
            '--expect', 'all', '--layer', 'buildings', '--engine', 'js', '--live-manifest', liveManifest],
            { encoding: 'utf8', timeout: 120_000 });
        expect(r.status).toBe(1);
        // HEAD prints "the LIVE tileset contains [newzealand]"; lane SEA-BAKE's in-flight rewrite prints
        // "the LIVE tileset's 'buildings' layer contains [newzealand]". The CONTRACT is exit 1 + REGION
        // LOSS + the row named — not either lane's sentence.
        expect(r.stderr ?? '').toMatch(/REGION LOSS[^\n]*\[newzealand\]/);
        // …and the pending line still explains why it was not expected, so the operator sees BOTH halves.
        expect(r.stdout ?? '').toContain('— not expected by this merge');
        expect(r.stdout ?? '').toContain('newzealand');   // still named among the pending set, not swallowed
    }, 120_000);

    // ⭐ THE PRODUCTION SHAPE, and the ONE configuration the three cases above do not cover (lane
    // NZ-FINISH-VERIFY, 2026-09-06). Every case so far runs the merge with NO `--live-manifest`, or
    // with one that CONTAINS newzealand. The real publish runs with a live manifest that does NOT —
    // §4's no-loss gate armed, the pending row absent from what is live. Nothing exercised that, and
    // it is the only combination in which BOTH gates see newzealand at once: step 3 must leave it out
    // of `expected`, and step 4 must not invent a loss for a region that was never live. A flag-aware
    // slip in EITHER direction (step 4 protecting a pending row it does not hold, step 3 expecting it)
    // shows up here and nowhere else.
    //
    // MEASURED, and this is why the case is worth its 120 s: the buildings publish DID run in this
    // exact shape and did NOT refuse — r2.dev/tiles/tileset-manifest.json (probed 2026-09-06, HTTP 200,
    // 20,953 B) reads `mergedLayers: ["buildings"]`, `mergedAt: 2026-09-05T21:45:10.144Z`, 49 regions,
    // `newzealand` ABSENT. c7d1ebe6 shipped the flag on the ASSUMPTION that publish would survive it;
    // it did. This test is that fact made repeatable, so the next row to carry `pending` inherits a
    // proof rather than the assumption.
    it('the PRODUCTION shape: live manifest present WITHOUT newzealand ⇒ both gates pass, no REGION LOSS invented for a never-live row', () => {
        const liveManifest = join(DIR, 'ok', 'merged', 'tileset-manifest.json');
        const liveJson = JSON.parse(readFileSync(liveManifest, 'utf8')) as { regions: Record<string, unknown> };
        expect(Object.keys(liveJson.regions)).not.toContain('newzealand'); // the live map today
        const staging = join(DIR, 'steady', 'staging');
        stageSet(staging, 'everything-live', live, LIVE_TILES);
        const r = spawnSync(NODE, [MERGE, 'merge', '--staging', staging, '--out', join(DIR, 'steady', 'merged'),
            '--expect', 'all', '--layer', 'buildings', '--engine', 'js', '--live-manifest', liveManifest],
            { encoding: 'utf8', timeout: 120_000 });
        expect(r.status, r.stderr ?? '').toBe(0);
        expect(r.stderr ?? '').not.toContain('REGION LOSS');
        expect(r.stderr ?? '').not.toContain('MISSING');
        // The no-loss gate RAN (it is not silently skipped) and covered every live region…
        expect(r.stdout ?? '').toMatch(/no-loss gate: every live region covered/);
        // …while the pending row is still named, so the operator sees WHY newzealand is not there.
        expect(r.stdout ?? '').toContain('— not expected by this merge');
        expect(r.stdout ?? '').toContain('newzealand');   // still named among the pending set, not swallowed
        const merged = JSON.parse(readFileSync(join(DIR, 'steady', 'merged', 'tileset-manifest.json'), 'utf8')) as { regions: Record<string, unknown> };
        expect(Object.keys(merged.regions).sort()).toEqual([...live].sort());
    }, 120_000);
});
