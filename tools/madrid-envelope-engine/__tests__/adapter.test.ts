// ADAPTER TESTS — against the REAL rows, captured live and committed.
//
// ⚠ These run OFFLINE against `fixtures/*.json`. Boadilla (1,958 rows), Moralzarzal (819),
// Valdemorillo (723), Majadahonda (556) and the capital's first 2,000 are complete captures
// reconciled against the service's own `numberMatched`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adaptSpacmRow, composeIne5, buildGeometricRule, type SpacmOrdenanzaRow } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmAdapter.js';
import { isDrawable, published, unknown, type EnvelopeRules } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';

const FIX = join(__dirname, '..', 'fixtures');
const load = (cd: string): { rows: SpacmOrdenanzaRow[]; numberMatched: number; rowsCaptured: number } =>
    JSON.parse(readFileSync(join(FIX, `ordenanza-${cd}.json`), 'utf8'));

const boadilla = load('022');
const majadahonda = load('080');
const madrid = load('079');
const moralzarzal = load('090');

describe('fixtures are complete captures, not truncated pages', () => {
    // ⚠ If this ever fails, every rate below is computed over the wrong denominator. A truncated
    // capture and a small municipality look identical once the numbers are quoted.
    it('reconciles each periphery capture against the service\'s own numberMatched', () => {
        for (const f of [boadilla, majadahonda, moralzarzal, load('160')]) {
            expect(f.rowsCaptured).toBe(f.numberMatched);
        }
    });

    it('records the capital as DELIBERATELY partial rather than silently short', () => {
        expect(madrid.numberMatched).toBe(22181);
        expect(madrid.rowsCaptured).toBe(2000);
        expect(madrid.rowsCaptured).toBeLessThan(madrid.numberMatched);
    });
});

describe('composeIne5 — the 3-digit key trap', () => {
    // ⛔ `CD_MUNICIPIO` is INE-5 with `28` STRIPPED. `'079'` returns 22,181 rows; `'28079'` returns
    // ZERO ON A CLEAN HTTP 200 — a wrong key and an empty municipality are the same bytes.
    it('composes the INE-5 code and never stores it', () => {
        expect(composeIne5('079')).toBe('28079');
        expect(composeIne5('022')).toBe('28022');
        expect(composeIne5('1')).toBe('28001');
    });
});

describe('determinism — the same row twice is the same record', () => {
    // A rule engine whose answer depends on when you asked is not a rule engine.
    it('produces byte-identical output for the same input, adapted twice', () => {
        for (const row of boadilla.rows.slice(0, 200)) {
            expect(JSON.stringify(adaptSpacmRow(row))).toBe(JSON.stringify(adaptSpacmRow(row)));
        }
    });

    it('is unaffected by adapting other rows in between', () => {
        const target = boadilla.rows[0];
        const a = JSON.stringify(adaptSpacmRow(target));
        boadilla.rows.slice(1, 50).forEach((r) => adaptSpacmRow(r));
        expect(JSON.stringify(adaptSpacmRow(target))).toBe(a);
    });
});

describe('MISSING IS UNKNOWN, NEVER ZERO — over the whole corpus', () => {
    // ⛔ THE CORPUS-WIDE INVARIANT. One `?? 0` anywhere in the read path breaks this on thousands
    // of rows at once, and no single-row test would find it.
    it('never emits a parameter whose value is 0', () => {
        const all = [...boadilla.rows, ...majadahonda.rows, ...moralzarzal.rows, ...madrid.rows.slice(0, 500)];
        for (const row of all) {
            const rec = adaptSpacmRow(row);
            for (const [name, p] of Object.entries(rec.rules)) {
                expect(p.value === 0, `${name} on CDID ${rec.provenance.recordId} came back 0`).toBe(false);
            }
        }
    });

    it('never emits a non-null value under an unknown/contradicted provenance', () => {
        for (const row of [...boadilla.rows, ...majadahonda.rows]) {
            for (const p of Object.values(adaptSpacmRow(row).rules)) {
                if (p.provenance === 'unknown' || p.provenance === 'contradicted') {
                    expect(p.value).toBeNull();
                }
                if (p.value !== null) {
                    expect(['published-attribute', 'derived']).toContain(p.provenance);
                }
            }
        }
    });

    it('always explains an absence — an unexplained null is indistinguishable from a bug', () => {
        for (const row of boadilla.rows.slice(0, 300)) {
            for (const p of Object.values(adaptSpacmRow(row).rules)) {
                if (p.value === null) expect(p.note, 'a null with no note').toBeTruthy();
            }
        }
    });
});

describe('CONTRADICTION IS FLAGGED — on the real Majadahonda rows', () => {
    // The census records 1,224 contradictory rows corpus-wide; the worst is MAJADAHONDA
    // "VIVIENDA UNIFAMILIAR AISLADA", NM_ALTURA=85 / NM_PLANTAS=2 = 42.5 m per storey.
    const contradictory = majadahonda.rows.filter((r) => {
        const a = Number(r.NM_ALTURA); const n = Number(r.NM_N_PLTA);
        return Number.isFinite(a) && Number.isFinite(n) && a > 0 && n > 0 && (a / n > 5 || a / n < 2.2);
    });

    it('the adversarial fixture actually contains contradictory rows', () => {
        // Without this, the assertions below would pass vacuously on an empty set.
        expect(contradictory.length).toBeGreaterThan(0);
    });

    it('refuses BOTH the height and the storeys on every contradictory row', () => {
        for (const row of contradictory) {
            const rec = adaptSpacmRow(row);
            expect(rec.contradictions.length).toBeGreaterThan(0);
            expect(rec.rules.height_m.value).toBeNull();
            expect(rec.rules.storeys.value).toBeNull();
            expect(rec.rules.height_m.provenance).toBe('contradicted');
            expect(rec.refusals.some((x) => x.reason === 'parameters-contradict')).toBe(true);
            expect(isDrawable(rec)).toBe(false);
        }
    });

    it('finds the 85 m / 2-storey row and names the 42.5 m per storey in the detail', () => {
        const worst = majadahonda.rows.find((r) => Number(r.NM_ALTURA) === 85 && Number(r.NM_N_PLTA) === 2);
        expect(worst, 'the MAJADAHONDA 85/2 row is not in the fixture').toBeDefined();
        const rec = adaptSpacmRow(worst!);
        expect(rec.contradictions[0]?.detail).toContain('42.50');
    });
});

describe('EVERY ENVELOPE CITES SOURCE + DOCUMENT + FIELD', () => {
    it('names the endpoint, the dataset and the record on every record', () => {
        for (const row of boadilla.rows.slice(0, 100)) {
            const p = adaptSpacmRow(row).provenance;
            expect(p.source).toBe('idem.comunidad.madrid/geoserver3/wfs');
            expect(p.dataset).toBe('sitcm:VPLA_V_ORDENANZA');
            expect(p.recordId).not.toBeNull();
        }
    });

    // MUTATION: emitting a static field list. `fields` must be what this row ACTUALLY read, or a
    // citation becomes decoration.
    it('lists every field the adapter actually read, including the absent ones', () => {
        const p = adaptSpacmRow(boadilla.rows[0]).provenance;
        for (const f of ['NM_ALTURA', 'NM_N_PLTA', 'NM_OCP_MX', 'NM_FDO_MX_ED',
            'NM_RTR_FRNT', 'NM_RTR_LATL', 'NM_RTR_POST', 'DS_NOMB_ORD', 'CD_MUNICIPIO']) {
            expect(p.fields).toContain(f);
        }
        expect(new Set(p.fields).size).toBe(p.fields.length); // no duplicates
    });

    it('carries the statute and the governing document where the row publishes them', () => {
        const p = adaptSpacmRow(boadilla.rows[0]).provenance;
        expect(p.statute).toBe('CM Ley 9/2001, E Ley 6/1998');
        expect(p.document).toContain('PLAN GENERAL');
        expect(p.published).toBe('2015-10-28');
    });

    it('carries the open-top constraint statement on every record without exception', () => {
        for (const row of boadilla.rows.slice(0, 50)) {
            expect(adaptSpacmRow(row).missingConstraints.length).toBe(3);
        }
    });
});

describe('THE GATE — nothing publishes while MADRID_ENVELOPE_VERIFIED is false', () => {
    it('refuses every row when the gate is closed (the default)', () => {
        for (const row of boadilla.rows.slice(0, 300)) {
            const rec = adaptSpacmRow(row);
            expect(rec.refusals.some((x) => x.reason === 'verification-gate-closed')).toBe(true);
            expect(rec.envelope).toBeNull();
            expect(isDrawable(rec)).toBe(false);
        }
    });

    // ⛔ MUTATION: making the gate short-circuit. If it did, signing it would instantly expose
    // refusals nobody had ever seen, on parcels we had implied were fine.
    it('still computes and reports the OTHER refusals while the gate is closed', () => {
        const zonaVerde = boadilla.rows.find((r) => r.DS_NOMB_ORD === 'ZONAS VERDES');
        expect(zonaVerde).toBeDefined();
        const rec = adaptSpacmRow(zonaVerde!);
        expect(rec.refusals.some((x) => x.reason === 'public-system')).toBe(true);
        expect(rec.refusals.some((x) => x.reason === 'verification-gate-closed')).toBe(true);
    });
});

describe('THE GEOMETRY HALF — with the gate hypothetically open', () => {
    // ⚠ `verificationGateOpen: true` here proves the NON-GATE logic in isolation. It does not make
    // a publication lawful; the real flip is the founder's act (L-449).
    const open = { verificationGateOpen: true };

    it('produces a shipped `kind: "setback"` rule for a real Boadilla residential row', () => {
        const row = boadilla.rows.find((r) => r.DS_NOMB_ORD === 'RESIDENCIAL UNIFAMILIAR'
            && Number(r.NM_RTR_FRNT) > 0 && Number(r.NM_ALTURA) > 0)!;
        expect(row).toBeDefined();
        const rec = adaptSpacmRow(row, open);
        expect(rec.refusals).toEqual([]);
        expect(rec.grammar).toBe('setback');
        expect(rec.envelope).toEqual({ kind: 'setback', front_m: 3, side_m: 3, rear_m: 3 });
        expect(rec.rules.height_m.value).toBe(7);
        expect(rec.rules.storeys.value).toBe(2);
        expect(isDrawable(rec)).toBe(true);
    });

    it('carries the parcel identity through when a caller supplies one', () => {
        const row = boadilla.rows.find((r) => r.DS_NOMB_ORD === 'RESIDENCIAL UNIFAMILIAR')!;
        const rec = adaptSpacmRow(row, {
            ...open, parcel: { id: 'p1', cadastralRef: '0052817VK4705A', area_m2: 800 },
        });
        expect(rec.parcel.cadastralRef).toBe('0052817VK4705A');
        expect(rec.municipality.ine5).toBe('28022');
    });

    it('leaves the cadastral reference null by default — the corpus contains NO PARCELS', () => {
        expect(adaptSpacmRow(boadilla.rows[0]).parcel.cadastralRef).toBeNull();
    });

    it('never emits an envelope alongside a refusal', () => {
        for (const row of [...boadilla.rows, ...majadahonda.rows]) {
            const rec = adaptSpacmRow(row, open);
            if (rec.refusals.length > 0) expect(rec.envelope).toBeNull();
            if (rec.envelope !== null) expect(rec.refusals).toEqual([]);
        }
    });

    // ⛔ MUTATION: back-solving an inset that yields NM_OCP_MX % of the plot. That would invent
    // boundary distances the ordinance never states AND place the building somewhere the ordinance
    // never puts it — a wrong SHAPE, not a wrong number.
    it('never coerces an occupation cap into a setback rule', () => {
        const rules: EnvelopeRules = {
            height_m: published(7, 'NM_ALTURA'), storeys: published(2, 'NM_N_PLTA'),
            occupationPct: published(70, 'NM_OCP_MX'),
            depth_m: unknown(null, 'x'), setbackFront_m: unknown(null, 'x'),
            setbackSide_m: unknown(null, 'x'), setbackRear_m: unknown(null, 'x'),
            plotRatioFAR: unknown(null, 'x'), minFrontage_m: unknown(null, 'x'),
        };
        expect(buildGeometricRule('occupation', rules)).toBeNull();
        expect(buildGeometricRule('unknown', rules)).toBeNull();
    });

    it('refuses a public-system row on the LAW even with the gate open', () => {
        const row = boadilla.rows.find((r) => r.DS_NOMB_ORD === 'RED VIARIA')!;
        const rec = adaptSpacmRow(row, open);
        const ps = rec.refusals.find((x) => x.reason === 'public-system');
        expect(ps?.legallyGrounded).toBe(true);
        expect(rec.envelope).toBeNull();
    });
});

describe('THE CAPITAL IS THIN ON THE REGIONAL LAYER — measured, not asserted', () => {
    // 8.86 % NM_ALTURA against a 79.42 % regional median. The fixture is the first 2,000 rows
    // rather than all 22,181, so the figure is asserted as a BAND, not a point.
    it('shows the capital far below the periphery on the same field', () => {
        const rate = (rows: SpacmOrdenanzaRow[]) =>
            rows.filter((r) => Number(r.NM_ALTURA) > 0).length / rows.length * 100;
        const capital = rate(madrid.rows);
        const periphery = rate(boadilla.rows);
        expect(capital).toBeLessThan(25);
        expect(periphery).toBeGreaterThan(70);
        expect(periphery / Math.max(capital, 0.01)).toBeGreaterThan(3);
    });
});
