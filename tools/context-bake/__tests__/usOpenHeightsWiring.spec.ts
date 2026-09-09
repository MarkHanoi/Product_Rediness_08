// §US-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-US) — the WIRING of the US per-CITY measured-height
// channels, pinned.
//
// ⭐ REWRITTEN 2026-09-06 (lane USA-HEIGHTS-NATIONAL), and the reason matters more than the diff. This
// spec used to assert that `newyork` / `california` / `massachusetts` declare `heightJoin:'us_open'`,
// that `illinois` / `texas` declare NO heightJoin, and that bake.mjs dispatches `us_open` through
// NATIONAL_STAMP_TABLE. All three are now false, ON PURPOSE:
//
//   • `us_open` reaches ONE metro box per state. While those three rows carried it, they DECLARED a
//     measured-height join and delivered it to Manhattan, San Francisco and Boston only — Buffalo,
//     Fresno, Sacramento, Worcester and Los Angeles rendered the fabricated 9 m carpet inside a state
//     that claimed heights. That is the §MDS-NATIONAL-SWEEP / Ciudad Real defect (L-12946) with a
//     bigger denominator, and the founder asked for the opposite ("all EEUU — complete country
//     coverage"). Every US row now declares `heightJoin:'usas'`.
//   • `illinois` / `texas` declaring NO join was the honest answer while the only US channels were
//     three city portals (Chicago's own footprints carry `stories`, not a height — probed). It stopped
//     being the honest answer the moment a NATIONAL layer was wired: FEMA/ORNL "USA Structures" serves
//     1,641,197 height-bearing structures in Illinois and 3,530,320 in Texas.
//
// ⭐ WHAT DID **NOT** CHANGE, and is what this file still exists to pin: the three CITY channels are
// still read, from the same adapters, with the same working-set boxes, byte for byte. The national
// stamp resolves the CITY channel FIRST per FOOTPRINT (`usOpenChannelForPoint`), because USA Structures
// UNDER-READS tall towers — same Midtown cell, NYC height_roof 270.6 m vs USA Structures 170.5 m. So the
// question this spec answers is no longer "is us_open wired" but "did the national move quietly cost the
// three cities their own authority survey". It did not, and here is the proof.
//
// The national wiring itself is pinned in usasNationalWiring.spec.ts.
//
// bake.mjs runs main() on import and cannot be loaded by vitest, so the wiring is asserted on the TEXT,
// as swissWiring.spec.ts / auOpenHeightsWiring.spec.ts do. heightSources.mjs is read the same way.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const hs = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/usasNationalStamp.mjs'), 'utf8');
// ⭐ §BAKE-US-STATES (2026-09-06, lane USA-ALL-STATES) — the ROWS these joins hang on are whole STATES
// now, not metro clips. The METRO keys (newyork / sanfrancisco / boston) and every probed number are
// unchanged; only the bake row moved: sanfrancisco → `california`, boston → `massachusetts`, and
// `newyork` kept its slug while widening Manhattan → the whole state.
const CITY_STATES = ['newyork', 'california', 'massachusetts'];
const RETIRED_METROS = ['sanfrancisco', 'chicago', 'austin', 'houston', 'boston'];

describe('§US-OPEN-HEIGHTS-OSM-JOIN — the three CITY channels survived the move to the national join', () => {
    // ⭐ RE-ANCHORED 2026-09-10 (lane CI-SIX-RED). This arm asserted that BAKE.MJS
    // imported the working set. It stopped being true on 2026-09-09, when the lint
    // job's `no-unused-vars` errors were fixed: bake.mjs had kept the import lines
    // and stopped USING them, because the priority pass moved INSIDE the wrapper.
    // The arm's PURPOSE survives untouched — "built and imported by nothing" is the
    // France ghost-town shape this file exists to refuse (L-12910) — so the
    // assertion moves to where the set is now actually READ, rather than being
    // deleted or relaxed. Asserting an import in a file that no longer uses it was
    // measuring the wrong copy: bake.mjs could import it and never call it, which is
    // precisely the orphan this arm is for.
    it('bake.mjs imports the national retain set + swathe rows from heights/usOpenHeights.mjs', () => {
        expect(bake).toMatch(/^import \{ US_NATIONAL_BBOXES, USAS_SWATHE_ROWS \} from '\.\/heights\/usOpenHeights\.mjs';/m);
    });

    it('the three CITY adapters are still READ — usOpenChannelForPoint defaults to US_OPEN_CITY_BBOXES', () => {
        // The national stamp reaches the three city channels THROUGH this resolver, so the
        // city set is read inside its own module and bake.mjs needs no import for it.
        const mod = readFileSync(resolve(HERE, '../heights/usOpenHeights.mjs'), 'utf8');
        expect(mod).toMatch(/export function usOpenChannelForPoint\([^)]*cities = US_OPEN_CITY_BBOXES/);
    });

    it("the three CITY states declare heightJoin:'usas', which is a SUPERSET of what they had", () => {
        for (const name of CITY_STATES) {
            const row = bake.match(new RegExp(`\\{\\s*name:\\s*'${name}'\\s*,[^\\n]*\\}`));
            expect(row, `${name} row`).not.toBeNull();
            expect(row![0], name).toMatch(/heightJoin: 'usas'/);
        }
    });

    it('⭐ the national stamp resolves the CITY channel FIRST, per FOOTPRINT — not per cell, not nation-first', () => {
        // This is the ONLY thing standing between Manhattan and a 100 m under-read. If this line ever
        // becomes `usNationalCovers(...) ? US_NATIONAL_HEIGHTS.usas : city`, the CI gate row
        // `manhattan newyork … 500` still PASSES (there are plenty of USA Structures heights in
        // Midtown) while every NYC tower silently loses ~100 m. A count gate cannot see that; this can.
        expect(stamp).toMatch(/const ch = usOpenChannelForPoint\(fp\.clon, fp\.clat\);/);
        const pure = readFileSync(resolve(HERE, '../heights/usOpenHeights.mjs'), 'utf8');
        const fn = pure.match(/export function usOpenChannelForPoint\([^)]*\)\s*\{([\s\S]*?)\n\}/);
        expect(fn, 'usOpenChannelForPoint').not.toBeNull();
        expect(fn![1]).toMatch(/const city = usOpenMetroForPoint\(lon, lat, cities\);\s*\n\s*if \(city\) return city;/);
    });

    it('the metro rows they replaced are GONE, so nothing double-bakes the same ground', () => {
        for (const gone of RETIRED_METROS) {
            expect(bake, `${gone} metro row must be retired`).not.toMatch(new RegExp(`\\{\\s*name:\\s*'${gone}'\\s*,\\s*pbfUrl`));
        }
    });

    it('the WORKING SET is unchanged — US_OPEN_CITY_BBOXES keeps the three metro boxes byte for byte', () => {
        // Two lanes have now moved what these boxes HANG ON (metro row → state row → national join) and
        // neither re-derived a number. If a box here ever changes, the change is a new measurement and
        // must arrive with the probe that produced it.
        const ws = readFileSync(resolve(HERE, '../heights/usOpenHeights.mjs'), 'utf8');
        const block = ws.slice(ws.indexOf('export const US_OPEN_CITY_BBOXES'));
        expect(block).toMatch(/city: 'newyork',\s*metro: 'newyork',\s*region: 'newyork',\s*bbox: \[-74\.03, 40\.70, -73\.91, 40\.82\]/);
        expect(block).toMatch(/city: 'sanfrancisco',\s*metro: 'sanfrancisco',\s*region: 'california',\s*bbox: \[-122\.52, 37\.70, -122\.36, 37\.83\]/);
        expect(block).toMatch(/city: 'boston',\s*metro: 'boston',\s*region: 'massachusetts',\s*bbox: \[-71\.20, 42\.22, -70\.98, 42\.40\]/);
    });

    it("⛔ no row declares 'us_open' and bake.mjs no longer dispatches it (a row on it re-opens the hole)", () => {
        expect(bake).not.toMatch(/heightJoin: 'us_open'/);
        expect(bake).not.toMatch(/us_open: \{ stamp:/);
        expect(bake).not.toMatch(/import \{ stampUsOpenHeightsOnGeojsonseq \}/);
        // The pinned dispatch chain must still not have been extended for any US key.
        expect(bake).not.toMatch(/r\.heightJoin === 'us_open'\) res = await/);
    });
});

describe('§US-OPEN-HEIGHTS — heightSources.mjs sends every US row to the LIVE national source', () => {
    it("REGION_SOURCE maps the three city states AND illinois / texas to 'usas_national'", () => {
        // Several regions share one REGION_SOURCE line (`newyork: …, california: …,`), so anchor on a
        // preceding line start / whitespace, not on the line start alone.
        for (const name of [...CITY_STATES, 'illinois', 'texas']) {
            expect(hs, name).toMatch(new RegExp(`(^|[\\s,])${name}:\\s*'usas_national'`, 'm'));
        }
    });

    it("SOURCES keeps us_open_heights (impl:'live') — its channels are live inside the national stamp", () => {
        // ⚠ NO REGION MAPS TO IT ANY MORE, and that normally means dead. It is not: all three adapters
        // are read on every US bake through usOpenChannelForPoint. The entry documents them, and says so.
        expect(hs).toMatch(/us_open_heights:\s*\{\s*\n?\s*country:\s*'us'[^\n]*impl:\s*'live'/);
        expect(hs).toMatch(/NO REGION MAPS HERE ANY MORE, and the three channels are NOT switched/);
        expect(hs).toMatch(/usas_national:\s*\{\s*\n?\s*country:\s*'us'[^\n]*impl:\s*'live'/);
    });

    it('resolveHeights points a US region at the join that actually covers it', () => {
        expect(hs).toMatch(/source === 'us_open_heights'/);
        expect(hs).toMatch(/declares heightJoin:'usas' in bake\.mjs \(with stampBboxesFor → US_NATIONAL_BBOXES\)/);
    });

    it('heightSources.mjs EXPORTS the join helpers the stamp modules borrow (shared, not copied)', () => {
        const exp = hs.match(/^export \{([^}]*)\};/gm) ?? [];
        const names = exp.join(' ');
        for (const h of ['footprintFromFeature', 'stampAreasFor', 'inAnyArea', 'bucketRecords', 'httpGetSafe', 'statsOf', 'appendFileInto']) {
            expect(names, `heightSources.mjs must export ${h}`).toMatch(new RegExp(`\\b${h}\\b`));
        }
        expect(hs).toMatch(/^export const MEASURED_HEIGHT_SRC_TAG = 'pryzm:height_src';/m);
        expect(hs).toMatch(/loadJoinFootprintsBounded \} from '\.\/geojsonseqRead\.mjs';/);
    });
});

describe('§US-OPEN-HEIGHTS — both CI gates refuse a US bake that ships no measured heights', () => {
    it('context-bake.yml and context-merge-publish.yml carry the three CITY gate rows, each naming its STATE region', () => {
        // A gate row is `<city> <region> <lat,lon> <minMeasured>`. The REGION column had to move with
        // the bake row (§BAKE-US-STATES) or the gate would hunt for measured heights in a region that
        // no longer exists — which is exactly how the 2026-09-05 publish failed on ten German rows.
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*manhattan newyork 40\.7580,-73\.9855 500$/m);
            expect(text, wf).toMatch(/^\s*sanfrancisco california 37\.7900,-122\.4000 500$/m);
            expect(text, wf).toMatch(/^\s*boston massachusetts 42\.3510,-71\.0750 500$/m);
        }
    });

    it('…and the two NON-metro rows that make "the big cities are stamped" insufficient', () => {
        for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
            const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
            expect(text, wf).toMatch(/^\s*oakpark illinois 41\.8850,-87\.7840 200$/m);
            expect(text, wf).toMatch(/^\s*pasadenatx texas 29\.6910,-95\.2090 200$/m);
        }
    });
});
