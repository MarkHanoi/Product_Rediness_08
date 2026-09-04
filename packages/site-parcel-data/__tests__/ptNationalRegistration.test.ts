// §PT-NATIONAL-REGISTRATION (lane ENVELOPE-IBERIA, 2026-09-04) — the tests that FAIL before the
// registration lands.
//
// ⭐ THE SAMPLE IS NOT HAND-WRITTEN. The `fabric` frame below is read from the committed artefact
// of `tools/envelope-slot-coverage/measurePt.ts`, which drew its points with the PROVEN two-stage
// sampler in `tools/city-completion/parcelSampleProbe.mjs` (equal-probability tile draw ×
// footprint-area-proportional point draw) over REAL OSM non-public building footprints in Lisboa
// and Porto. A hand-picked list of "obviously Portuguese" points would prove only that the author
// can pick points (§tolerance-from-measured-error-not-the-test, §corpus-never-jittered).
//
// ⚠ IF THE ARTEFACT IS ABSENT the fabric test FAILS rather than skipping. A silently-skipped
// coverage assertion is indistinguishable from a passing one, which is the whole failure class
// this lane's harness exists to remove.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    resolveRegisteredJurisdictionAt,
    resolveZoneDisposition,
    listJurisdictionCoverage,
} from '../src/rulepacks/registry.js';
import { envelopePublicationAuthorisation } from '../src/rulepacks/envelopeAuthorisation.js';
import {
    PT_PDM_JURISDICTION_ID,
    isInPortugalByBoundary,
    ptNationalNoRulePackRefusal,
} from '../src/rulepacks/ptNationalRegistration.js';
import { isInPortugal } from '../src/parcelProviders/dgtParcelProvider.js';
import { resolveNationalJurisdiction } from '../src/jurisdiction/nationalJurisdictionResolver.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PT_SLOTS_JSON = path.resolve(
    HERE,
    '../../../tools/envelope-slot-coverage/out/pt.slots.json',
);

function jurisdictionIdAt(lat: number, lon: number): string {
    const c = resolveRegisteredJurisdictionAt(lat, lon);
    if (c.kind === 'resolved') return c.jurisdiction.jurisdictionId;
    if (c.kind === 'ambiguous') {
        return `ambiguous(${c.candidates.map((x) => x.jurisdictionId).join('|')})`;
    }
    return 'none';
}

describe('§PT-NATIONAL-REGISTRATION — Portugal is claimed, so the §L-663 guard can fire', () => {
    it('is registered exactly once, at national resolution', () => {
        const rows = listJurisdictionCoverage().filter(
            (j) => j.jurisdictionId === PT_PDM_JURISDICTION_ID,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.countryCode).toBe('PT');
        expect(rows[0]!.extentResolution).toBe('national');
        // EMPTY BY CONSTRUCTION — there is no national Portuguese envelope instrument to pack.
        expect(rows[0]!.packZoneCodes).toEqual([]);
    });

    it('⭐ every real Lisboa/Porto fabric point the sampler drew now resolves to `pt-pdm`', () => {
        // BEFORE this registration: `resolveRegisteredJurisdictionAt` answered `'none'` for all of
        // them, so `applyEstimatedZoning` published 3,0/1,5/3,0 m + FAR 2,00 + 50 % coverage on
        // Portuguese soil. That measurement is the artefact's own `out/pt.slots.md`.
        expect(
            fs.existsSync(PT_SLOTS_JSON),
            `Missing ${PT_SLOTS_JSON} — re-run: npx tsx tools/envelope-slot-coverage/measurePt.ts ` +
                '--frame both --n 120 --seed 20260903',
        ).toBe(true);
        const artefact = JSON.parse(fs.readFileSync(PT_SLOTS_JSON, 'utf8')) as {
            frames: Record<string, { points: ReadonlyArray<{ lat: number; lon: number }> }>;
        };
        const fabric = artefact.frames['fabric'];
        expect(fabric, 'the `fabric` frame is the built-fabric sample; it must be present').toBeTruthy();
        expect(fabric!.points.length).toBeGreaterThanOrEqual(100);

        const unclaimed = fabric!.points.filter(
            (p) => jurisdictionIdAt(p.lat, p.lon) !== PT_PDM_JURISDICTION_ID,
        );
        expect(
            unclaimed.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`),
            'Every point drawn over real Lisboa/Porto building fabric must be claimed by the ' +
                'Portuguese registration — an unclaimed one still reaches the estimated triple.',
        ).toEqual([]);
    });

    it('⛔ §PT-SPILL-CLOSED-BY-POLYGON — PORTUGAL_BBOX claims Spain; the registration does not', () => {
        // ⭐ EVERY POINT BELOW WAS MEASURED INSIDE `PORTUGAL_BBOX` BEFORE IT WAS WRITTEN HERE (the
        // first draft of this test listed Ourense, Vigo, Salamanca and Zamora and was WRONG about
        // all four — they fall outside 36.9–42.2 °N × −9.6–−6.1 °E, so they proved nothing. The
        // premise assertion below is what caught it, which is why it stays in the test rather than
        // in a comment).
        //
        // Registering on the bbox alone would have answered these with a Portuguese instrument AND
        // — worse — suppressed §ES-SIU-GUARD, which runs after the §L-663 guard inside
        // `applyEstimatedZoning`, so Spanish land would have lost its own land-class check.
        const spanishInsideThePtBox: ReadonlyArray<readonly [string, number, number]> = [
            ['Badajoz', 38.8794, -6.9707],
            ['Mérida', 38.916, -6.343],
            ['Cáceres', 39.4753, -6.3724],
            ['Zafra', 38.425, -6.417],
            ['Olivenza', 38.684, -7.1],
            ['Huelva', 37.2614, -6.9447],
            ['Ciudad Rodrigo', 40.598, -6.532],
            ['Verín', 41.941, -7.438],
            ['Puebla de Sanabria', 42.053, -6.632],
        ];
        for (const [name, lat, lon] of spanishInsideThePtBox) {
            expect(isInPortugal(lat, lon), `${name} is inside PORTUGAL_BBOX (the premise)`).toBe(true);
            expect(isInPortugalByBoundary(lat, lon), `${name} must NOT be claimed for Portugal`).toBe(
                false,
            );
            expect(jurisdictionIdAt(lat, lon)).not.toBe(PT_PDM_JURISDICTION_ID);
        }
    });

    it('the border band REFUSES rather than picking a side — measured, and deliberately not closed', () => {
        // ⚠ THE HOLE, PINNED SO IT CANNOT BE MISTAKEN FOR SOLVED. Within the dataset's MEASURED
        // 1500 m positional tolerance the resolver returns `within-dataset-tolerance-of-rival`, so
        // Portugal does not claim, so such a point still reaches `applyEstimatedZoning` exactly as
        // it did before this registration. That is unchanged behaviour on a ~1.5 km strip, traded
        // for ~92 000 km² that stops being fabricated over. Closing it needs FINER geometry — never
        // a wider rectangle, and never a guess about which side of the Raia a point sits on.
        for (const [name, lat, lon] of [
            ['Tui (Miño, ES side)', 42.047, -8.643],
            ['Ayamonte (Guadiana, ES side)', 37.21, -7.405],
            ['Sanlúcar de Guadiana (ES side)', 37.47, -7.46],
        ] as ReadonlyArray<readonly [string, number, number]>) {
            const v = resolveNationalJurisdiction(lat, lon);
            expect(v.ok, `${name} sits inside the 1500 m border tolerance`).toBe(false);
            if (!v.ok) expect(v.reason).toBe('within-dataset-tolerance-of-rival');
            // A refusal is a NO. "We cannot say which country this is" must never become "Portugal".
            expect(isInPortugalByBoundary(lat, lon), name).toBe(false);
        }
    });

    it('claims real Portuguese cities across the whole mainland, not just the two studied ones', () => {
        for (const [name, lat, lon] of [
            ['Lisboa Baixa', 38.7107, -9.1395],
            ['Porto Aliados', 41.1476, -8.6109],
            ['Braga', 41.5503, -8.4265],
            ['Faro', 37.0161, -7.9351],
            ['Bragança', 41.8061, -6.7567],
        ] as ReadonlyArray<readonly [string, number, number]>) {
            expect(jurisdictionIdAt(lat, lon), name).toBe(PT_PDM_JURISDICTION_ID);
        }
    });

    it('every Portuguese zone gets a COVERAGE refusal — `legallyGrounded: false`, never a number', () => {
        // The four legends below are VERBATIM from the live CRUS probe recorded in the artefact —
        // not invented, and deliberately including the doubled spaces and en-dashes the service
        // actually serves.
        const legends = [
            'Solo Urbano - Espaço Central e Habitacional - Traçado Urbano A Consolidado',
            'Solo Urbano  – Espaços centrais –  Área de frente urbana contínua tipo I',
            'Solo Urbano  – Espaços centrais – Área de edifícios de tipo moradia',
            'Espaço urbano',
        ];
        for (const legend of legends) {
            const d = resolveZoneDisposition(PT_PDM_JURISDICTION_ID, legend, { zoneLabel: legend });
            expect(d.kind, legend).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            expect(d.refusal.code).toBe('no-rule-pack');
            // ⭐ FALSE, and this is the load-bearing assertion. A `true` here would tell a user the
            // LAW forbids building on land the PDM in fact zones for building.
            expect(d.refusal.legallyGrounded).toBe(false);
            expect(d.refusal.detail).toContain(legend);
            expect(d.refusal.ordinanceRef).toBeTruthy();
        }
    });

    it('the refusal never carries a number a user could read as an allowance (C58 knownFacts)', () => {
        const r = ptNationalNoRulePackRefusal('Espaço urbano', 'Espaço urbano', [
            'Município: 1106 Lisboa',
        ]);
        expect(r.knownFacts).toEqual(['Município: 1106 Lisboa']);
        // No setback / FAR / coverage figure may appear anywhere in the user-visible copy.
        const copy = `${r.headline} ${r.detail}`;
        expect(copy).not.toMatch(/\b\d+([.,]\d+)?\s*m\b/);
        expect(copy).not.toMatch(/FAR|\d+\s*%/);
    });

    it('is authorised BY RECORD, not by a signature — and authorisation draws nothing', () => {
        // `packsByZone` is empty, so `authorised: true` cannot produce a figure. The row exists so
        // Portugal cannot reach `unknown-jurisdiction`; it is not a publication decision about any
        // Portuguese number, and a municipal pack must bring its OWN gate.
        expect(envelopePublicationAuthorisation(PT_PDM_JURISDICTION_ID)).toEqual({
            authorised: true,
            reason: 'ungated-by-record',
        });
    });
});
