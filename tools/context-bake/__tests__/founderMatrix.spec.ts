// §FOUNDER-MATRIX — the tripwire on §8/§9 of `docs/04-reference/WORLD-COVERAGE-LEDGER.md`.
//
// WHY THIS TEST EXISTS
// --------------------
// The founder asked, 2026-09-06, for a SET of countries to be complete on a LIST of layers.
// §8 answers that question, and every previous answer to it in this repo has been a
// hand-typed table that rotted — CLAUDE.md records six recurrences of exactly that shape for
// the contract count/range alone. Its sibling `worldCoverageLedger.spec.ts` pins the parts of
// the page derived from the SOURCE TABLES. This one pins the parts derived from the R2 PROBES,
// because those are where a false GREEN can be minted:
//
//   • a cell may read ✅ ONLY when a probe returned bytes a browser can read. The two defects
//     this rule exists to prevent both landed on 2026-09-06 — L-12976 shipped "splines now
//     ship" on 1332 passing tests for an app with no bundle entry, and L-12982 read an HTTP
//     200 staging manifest as proof a canopy had staged when its layer list never contained
//     canopy. CHECK THE ARTEFACT'S CONTENT, NEVER ITS EXISTENCE.
//   • a 404 from R2 is a 27 KB `text/html` error page. A probe that trusted `res.ok`, or a
//     byte count, would read that as a healthy layer — so `layerIsServed` demands the PMTiles
//     magic and a 206, and this spec pins that it does.
//   • the scoring rules that were WRONG on the first run and are worth a regression test each:
//     a partly-live cell must not read WIRED (it under-reports published bytes), and a height
//     join must never carry a cell UP (Japan scored 🟡 on "3D context buildings" with nothing
//     of Japan on R2, because `plateau_jp` is a city list and a city list scores PARTIAL).
//
// ⚠ OFFLINE BY CONSTRUCTION, like its sibling. It never touches the network: the builder's
// `probeR2Objects({ offline: true })` reads the committed snapshot, and the scoring assertions
// run against SYNTHETIC probe answers so they test the RULE rather than today's bucket. A test
// that needed a live bucket would go red on someone's train, and a test that asserted today's
// coverage would go red the moment a lane published something — which is the point of the work.
//
// LAYERING: build/inspection tooling test, like its bake.mjs siblings — no OTel span (P8 binds
// exported package functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

import {
    buildModel,
    buildFounderMatrix,
    buildShortestPath,
    probeManifest,
    probeR2Objects,
    layerIsServed,
    terrainIsServed,
    readBakeRegions,
    readBakeLayers,
    FOUNDER_SET,
    FOUNDER_COUNTRIES,
    FOUNDER_LAYER_MAP,
    COUNTRY_NAME,
    PMTILES_MAGIC,
    LEDGER_PATH,
    R2_PROBE_SNAPSHOT_PATH,
    // @ts-expect-error — plain .mjs tooling module, no types shipped (same as its bake.mjs siblings)
} from '../../coverage-ledger/build.mjs';

const page = (): string => {
    if (!existsSync(LEDGER_PATH as string)) {
        throw new Error(
            `docs/04-reference/WORLD-COVERAGE-LEDGER.md does not exist. Generate it: node tools/coverage-ledger/build.mjs`,
        );
    }
    return readFileSync(LEDGER_PATH as string, 'utf8');
};

// ⚠ MEMOISED, AND `blame: false`. `buildModel`'s §LIVE-VS-DECLARED arm runs one
// `git blame -L` per bake region against a 2,300-line file — ~12 minutes at 132 regions, which
// timed out EVERY assertion here at vitest's 10 s default and read as nine real failures.
// The blame answers a question this spec does not ask; `joinDrift` (which §8 DOES use) is read
// from the manifest and is unaffected. Building once and sharing it is not a shortcut: the model
// is a pure function of files on disk, so a second build would be a second identical answer.
let cached: ReturnType<typeof buildOffline> | null = null;
function buildOffline() { return offlineMatrixUncached(); }

/** The model + matrix as the page was generated: from the committed snapshot, never the network. */
async function offlineMatrixUncached() {
    const probe = await probeManifest({ offline: true });
    const model = buildModel({ manifest: probe.manifest, blame: false });
    const r2 = await probeR2Objects({
        offline: true,
        layerIds: model.bakeLayers.map((l: { id: string }) => l.id),
        terrainSlugs: model.national.map((r: { name: string }) => r.name),
    });
    return { model, r2, matrix: buildFounderMatrix(model, r2) };
}

function offlineMatrix() {
    cached ??= buildOffline();
    return cached;
}

describe('§FOUNDER-MATRIX — the founder\'s set is complete and every country is SAID BY NAME', () => {
    it('names every country the founder asked for, with no duplicates across the three groups', () => {
        const flat = Object.values(FOUNDER_SET as Record<string, string[]>).flat();
        expect(flat.length).toBe(FOUNDER_COUNTRIES.length); // no country in two groups
        // The countries he named in his own words must each be present exactly once.
        for (const code of ['AU', 'NZ', 'JP', 'KR', 'US', 'CA', 'MX']) {
            expect(flat.filter((c) => c === code)).toEqual([code]);
        }
        // A representative slice of "ALL European countries" — including the ones a tree that
        // only listed what it already had would silently omit.
        for (const code of ['RU', 'VA', 'SM', 'MC', 'GI', 'IS', 'MT', 'MD', 'XK', 'UA']) {
            expect(flat).toContain(code);
        }
        // …and of "Middle East".
        for (const code of ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'IL', 'JO', 'LB', 'TR', 'SY', 'IQ', 'IR', 'EG', 'PS', 'YE']) {
            expect(flat).toContain(code);
        }
    });

    it('has a printable NAME for every code — a country cannot be reported as a bare ISO pair', () => {
        const missing = (FOUNDER_COUNTRIES as string[]).filter((c) => !COUNTRY_NAME[c]);
        expect(missing, `codes with no COUNTRY_NAME: ${missing.join(' ')}`).toEqual([]);
    });

    it('renders one row per founder country on the page, by name', async () => {
        const md = page();
        const { matrix } = await offlineMatrix();
        expect(matrix.length).toBe(FOUNDER_COUNTRIES.length);
        const absentFromPage = matrix.filter((r: { code: string }) => !md.includes(`(\`${r.code}\`)`));
        expect(
            absentFromPage.map((r: { name: string }) => r.name),
            'every founder-named country must appear in §8c, whatever its verdict',
        ).toEqual([]);
    });

    it('translates all nine of the founder\'s words, and prints the translation on the page', () => {
        const md = page();
        const words = (FOUNDER_LAYER_MAP as { founder: string }[]).map((l) => l.founder);
        expect(words).toEqual([
            'parcels', '3D context buildings', 'terrain', 'roads', 'pedestrians',
            'trees', 'water', 'green areas', 'cadastral data',
        ]);
        for (const w of words) expect(md, `§8b must translate "${w}"`).toContain(`| **${w}** |`);
        // The two translations a lane is most likely to quietly drop.
        const ped = (FOUNDER_LAYER_MAP as { founder: string; tiles?: string[] }[]).find((l) => l.founder === 'pedestrians');
        expect(ped?.tiles).toEqual(['furniture']);
        const water = (FOUNDER_LAYER_MAP as { founder: string; tiles?: string[] }[]).find((l) => l.founder === 'water');
        expect(water?.tiles).toEqual(['water', 'sea']);
    });
});

describe('§FOUNDER-MATRIX — a cell reads SHIPPED only for bytes, never for a table row', () => {
    it('layerIsServed demands a 206 AND the PMTiles magic — an R2 404 error page is not a layer', () => {
        expect(layerIsServed({ status: 206, magic: PMTILES_MAGIC })).toBe(true);
        // The exact shape R2 returns for a miss, measured 2026-09-06: 404, 27,150 B of
        // text/html whose first four bytes are `<!do`. Every naive check passes this.
        expect(layerIsServed({ status: 404, bytes: 27150, contentType: 'text/html', magic: '3c21646f' })).toBe(false);
        // A 200 instead of a 206 makes a PMTiles archive unreadable even though the bytes
        // are there — the L661a scar in contextTiles.ts.
        expect(layerIsServed({ status: 200, magic: PMTILES_MAGIC })).toBe(false);
        // Right status, wrong body: a proxy that returned an HTML shell with a 206.
        expect(layerIsServed({ status: 206, magic: '3c21646f' })).toBe(false);
        expect(layerIsServed(undefined)).toBe(false);
        expect(terrainIsServed({ status: 200, bytes: 1625 })).toBe(true);
        expect(terrainIsServed({ status: 404, bytes: 27150 })).toBe(false);
        expect(terrainIsServed({ status: 200, bytes: 0 })).toBe(false);
    });

    it('scores NOTHING as SHIPPED when every probe 404s, however complete the tables are', async () => {
        const probe = await probeManifest({ offline: true });
        const model = buildModel({ manifest: probe.manifest, blame: false });
        const dead = {
            mode: 'live',
            note: 'synthetic — every object 404s',
            layers: Object.fromEntries(
                model.bakeLayers.map((l: { id: string }) => [l.id, { status: 404, bytes: 27150, contentType: 'text/html', magic: '3c21646f' }]),
            ),
            terrain: Object.fromEntries(model.national.map((r: { name: string }) => [r.name, { status: 404, bytes: 27150 }])),
        };
        const matrix = buildFounderMatrix(model, dead);
        const tileCols = (FOUNDER_LAYER_MAP as { founder: string; kind: string }[])
            .filter((l) => l.kind === 'tiles' || l.kind === 'terrain')
            .map((l) => l.founder);
        for (const row of matrix) {
            for (const col of tileCols) {
                expect(
                    row.cells[col].state,
                    `${row.code} ${col} must not read SHIPPED when its artefact 404s`,
                ).not.toBe('SHIPPED');
            }
        }
    });

    it('a height join can only DOWNGRADE a cell — it can never carry one with no tiles behind it', async () => {
        // The regression: Japan scored 🟡 PARTIAL on "3D context buildings" with NOTHING of
        // Japan on R2, because `plateau_jp` is a city list and a city list scores PARTIAL.
        // A join is a PROPERTY of an archive; a property of an archive that does not exist
        // cannot be evidence that anything shipped.
        const { model, matrix } = await offlineMatrix();
        const published: Set<string> = model.publishedBuildings;
        for (const row of matrix) {
            const anyLive = row.declared.some((s: string) => published.has(s)) || row.live.length > 0;
            if (anyLive) continue;
            expect(
                row.cells['3D context buildings'].state,
                `${row.code} has no published bake region, so its buildings cell cannot be PARTIAL or SHIPPED`,
            ).not.toBe('PARTIAL');
            expect(row.cells['3D context buildings'].state).not.toBe('SHIPPED');
        }
    });

    it('a partly-live cell reads PARTIAL, never WIRED — under-reporting bytes is a defect too', async () => {
        // `worst()` scored Bulgaria's `trees` as WIRED ("not published") because canopy 404s,
        // while trees.pmtiles was serving Bulgarian tree points the whole time.
        const { model, matrix, r2 } = await offlineMatrix();
        if (layerIsServed(r2.layers?.trees) && !layerIsServed(r2.layers?.canopy)) {
            // ⚠ FILTER PER LAYER, NEVER BY `row.live`. `row.live` is derived from
            // `model.publishedBuildings` ALONE — it means "live in the BUILDINGS archive", and
            // this arm is about TREES. The two source sets were IDENTICAL for as long as every
            // merge staged every layer together, so the sloppy filter never fired. The
            // 2026-09-07 merge (`mergeRunId` 34121618245) split them: it republished `buildings`
            // from a 46-region staging set that ADDED `gccstates`/`southkorea` and DROPPED
            // `france`/`spain`, while the other six layers kept the previous 49. So Bahrain
            // acquired live BUILDINGS and has no trees, and `tileCell('trees')` correctly said
            // WIRED — "trees.pmtiles is live but none of this country's regions are in its
            // sources". The verdict was right and the assertion was wrong.
            // Asserting on the trees source set is STRICTLY MORE PRECISE than `row.live.length`:
            // it still catches the Bulgaria regression verbatim (BG is in `trees.sources`), and
            // it stops the arm reporting a scorer defect when what actually happened is that a
            // merge shipped one layer without the others.
            const treeSrcs: Set<string> = model.publishedByLayer?.trees ?? new Set<string>();
            const live = matrix.filter((r: { live: string[] }) => r.live.some((s) => treeSrcs.has(s)));
            expect(live.length).toBeGreaterThan(0);
            for (const row of live) {
                expect(row.cells.trees.state, `${row.code} has live trees tiles`).not.toBe('WIRED');
                expect(row.cells.trees.state).not.toBe('ABSENT');
            }
        }
    });

    it('every non-SHIPPED cell carries a REASON naming the artefact — never a bare verdict', async () => {
        const { matrix } = await offlineMatrix();
        for (const row of matrix) {
            for (const [col, cell] of Object.entries(row.cells) as [string, { state: string; why: string }][]) {
                expect(cell.why, `${row.code}/${col} has no reason`).toBeTruthy();
                expect(cell.why.length, `${row.code}/${col} reason is too thin to act on`).toBeGreaterThan(20);
            }
        }
    });
});

describe('§FOUNDER-MATRIX — the page and the snapshots exist and agree with the model', () => {
    it('the committed R2 probe snapshot covers every declared layer and terrain slug', () => {
        expect(existsSync(R2_PROBE_SNAPSHOT_PATH as string), 'r2-probe-snapshot.json is missing — run the builder').toBe(true);
        const snap = JSON.parse(readFileSync(R2_PROBE_SNAPSHOT_PATH as string, 'utf8'));
        const layers = readBakeLayers().map((l: { id: string }) => l.id);
        const missing = layers.filter((id: string) => !snap.layers?.[id]);
        expect(missing, `layers never probed: ${missing.join(' ')} — re-run node tools/coverage-ledger/build.mjs`).toEqual([]);
        // Every probe record must carry its exact HTTP answer (C57 §1.5), not a verdict.
        for (const [id, p] of Object.entries(snap.layers) as [string, Record<string, unknown>][]) {
            expect(p.status, `${id} probe has no status`).toBeDefined();
            expect(p.url, `${id} probe does not record the URL it read`).toBeTruthy();
        }
    });

    it('§8 and §9 are on the page, with the probe record and the dispatch escape hatch', () => {
        const md = page();
        expect(md).toContain("## §8 · The founder's matrix");
        expect(md).toContain('### §8a · The probe record');
        expect(md).toContain('### §8c · The matrix');
        expect(md).toContain('## §9 · The shortest path');
        // The disk cliff and the job ceiling are the two constraints a plan here must respect.
        expect(md).toContain('MERGE CANNOT FIT');
        expect(md).toContain('330-minute');
        // A lane returns a dispatch list; it does not dispatch.
        expect(md).toContain('This lane dispatched nothing');
    });

    it('the shortest path proposes nothing that is already done, and puts the unblocking step first', async () => {
        const { model, r2, matrix } = await offlineMatrix();
        const steps = buildShortestPath(matrix, model, r2);
        expect(steps.length).toBeGreaterThan(0);
        // A step for a layer that IS served would be work already done.
        for (const s of steps) {
            for (const l of readBakeLayers() as { id: string }[]) {
                if (layerIsServed(r2.layers?.[l.id]) && s.title.includes(`\`${l.id}\` layer`)) {
                    throw new Error(`§9 proposes baking \`${l.id}\`, which is already served on R2`);
                }
            }
        }
        // DEPENDENCY-FIRST: a per-layer bake runs over STAGED regions, so staging comes first.
        const unpublished = model.bakeRegions.filter((r: { name: string }) => !model.publishedBuildings.has(r.name));
        if (unpublished.length) {
            expect(steps[0].title, 'the staging step must be first — it unblocks every per-layer bake').toContain('NEVER been published');
        }
        // Cells are measured, so they must be integers a reader can check against §8c.
        for (const s of steps) expect(Number.isInteger(s.cells), `${s.title} has a non-integer cell count`).toBe(true);
    });

    it('every bake region and every national terrain slug is probed — the probe set is DERIVED, never hand-listed', async () => {
        const { model, r2 } = await offlineMatrix();
        const declaredLayers = readBakeLayers().map((l: { id: string }) => l.id);
        expect(Object.keys(r2.layers).sort()).toEqual([...declaredLayers].sort());
        const nationalSlugs = model.national.map((r: { name: string }) => r.name).sort();
        const probedSlugs = Object.keys(r2.terrain).sort();
        const unprobed = nationalSlugs.filter((s: string) => !probedSlugs.includes(s));
        expect(
            unprobed,
            `terrain slugs never probed: ${unprobed.join(' ')} — re-run node tools/coverage-ledger/build.mjs`,
        ).toEqual([]);
    });

    it('every bake region has a country, so a new row can never be silently dropped from §8', () => {
        // The builder hard-fails on an unmapped slug; this pins that the CURRENT table is clean,
        // which is how a lane finds out at test time rather than at generate time. `southkorea`
        // landed from a sibling lane on 2026-09-06 and did exactly this.
        const regions = readBakeRegions();
        expect(regions.length).toBeGreaterThan(0);
        const model = buildModel({ manifest: null, blame: false });
        expect(model.unmapped, `unmapped bake slugs: ${model.unmapped.join(' ')}`).toEqual([]);
    });
});
