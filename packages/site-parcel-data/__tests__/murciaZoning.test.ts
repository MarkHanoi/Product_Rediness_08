// Murcia zoning → envelope disposition.
//
// The fixtures are VERBATIM attribute sets returned by an exact point-intersect query
// against https://geoserver.murcia.es/geoserver/wfs on 2026-07-31 (n = 2 points; the
// Catedral control returns a DIFFERENT calificación, which is what proves the query
// discriminates rather than answering the same thing everywhere).

import { describe, expect, it } from 'vitest';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    isInForce,
    isRemittedAmbito,
    murciaEnvelopeDisposition,
    parseSectorCode,
    type MurciaCalificacionFeature,
    type MurciaSectorFeature,
} from '../src/providers/murciaZoningProvider.js';
import { detectDerivedPlanMarkers } from '../src/rulepacks/esMurciaEnvelope.js';

const ASOF = '2026-07-31';

/** Founder parcel 3481104XH6038S — Murcia:pgou_alineaciones, verbatim. */
const PARCEL_CAL: MurciaCalificacionFeature = {
    calificacion: 'RR',
    descripcion: 'Residencial, ordenación remitida al planeamiento anterior',
    uso_global: 'Residencial',
    sector: 'TA-379',
    url: 'RR.pdf',
    f_inicial: '2021-09-09Z',
    f_fin: '2999-12-30Z',
};

/** Founder parcel — Murcia:pgou_sectores, verbatim. */
const PARCEL_SECTOR: MurciaSectorFeature = {
    sector: 'TA-379',
    clase_suelo: 'Urbanizable',
    categoria: 'Urbanizable Transitorio',
    uso_global: 'Residencial',
    pedania: 'EL PUNTAL',
    superficie: 383313,
    f_inicial: '2024-01-17Z',
    f_fin: '2999-12-30Z',
};

/** CONTROL — Catedral de Murcia. A different answer, from the same two layers. */
const CONTROL_CAL: MurciaCalificacionFeature = {
    calificacion: 'MC',
    descripcion: 'Centro Histórico de Murcia',
    uso_global: 'Residencial',
    sector: 'UH',
    url: 'MC.pdf',
    f_inicial: '2021-09-09Z',
    f_fin: '2999-12-30Z',
};
const CONTROL_SECTOR: MurciaSectorFeature = {
    sector: 'UH',
    clase_suelo: 'Urbano',
    categoria: 'Urbano Consolidado',
    uso_global: 'Residencial',
    pedania: 'MURCIA',
    superficie: 29386,
    f_inicial: '2026-04-15Z',
    f_fin: '2999-12-30Z',
};

describe('sector code parsing (Art. 6.6.2 — the digits ARE the expediente)', () => {
    it('splits TA-379 into prefix and expediente', () => {
        expect(parseSectorCode('TA-379')).toEqual({ prefix: 'TA', expediente: '379' });
    });

    it('handles a bare prefix with no expediente', () => {
        expect(parseSectorCode('UH')).toEqual({ prefix: 'UH', expediente: null });
    });

    it('returns null rather than guessing on empty input', () => {
        expect(parseSectorCode(null)).toBeNull();
        expect(parseSectorCode('')).toBeNull();
    });

    it('classifies the remitted ámbito families', () => {
        for (const s of ['TA-379', 'TM-12', 'UA-217', 'UH', 'UM-262']) {
            expect(isRemittedAmbito(s)).toBe(true);
        }
        for (const s of ['ZM-SV2', 'PERI-UM-114', 'PI-Ed1', null]) {
            expect(isRemittedAmbito(s)).toBe(false);
        }
    });
});

describe('temporal validity — Murcia\'s legal-status attribute', () => {
    it('treats f_fin 2999-12-30 as in force', () => {
        expect(isInForce('2021-09-09Z', '2999-12-30Z', ASOF)).toBe(true);
    });

    it('treats a passed f_fin as superseded', () => {
        expect(isInForce('2001-01-01Z', '2012-01-01Z', ASOF)).toBe(false);
    });

    it('treats a future f_inicial as not yet in force', () => {
        expect(isInForce('2030-01-01Z', '2999-12-30Z', ASOF)).toBe(false);
    });

    it('returns null — NOT true — when no interval is published', () => {
        // ⚠ An undatable record must never default to "in force"; quoting it would risk
        // publishing a repealed rule under a current-sounding citation.
        expect(isInForce(null, null, ASOF)).toBeNull();
    });
});

describe('the founder parcel → a LEGALLY GROUNDED derived-plan refusal', () => {
    const d = murciaEnvelopeDisposition(PARCEL_CAL, PARCEL_SECTOR, ASOF);

    it('refuses, and grounds the refusal in the ordinance itself', () => {
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(d.refusal.code).toBe('derived-plan');
        // ⚠ TRUE here, unlike the coverage refusal: the PGOU ANSWERED, and its answer was
        // "the earlier instrument governs". That is a statement about the law.
        expect(d.refusal.legallyGrounded).toBe(true);
    });

    it('carries a real article citation, not a bare plan name', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(d.refusal.ordinanceRef).toContain('6.6.2');
        expect(d.refusal.ordinanceRef).toContain('5.24.5'); // because the calificación is RR
    });

    it('names the expediente of the instrument the user must obtain', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(d.refusal.detail).toContain('expediente 379');
    });

    it('surfaces the land class Murcia itself publishes', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        // ⚠ Murcia's OWN service says Urbanizable / Urbanizable Transitorio. A listing and a
        // competitor report both said "suelo urbano consolidado". The two disagree; PRYZM
        // reports what the municipal source says and does not silently pick the other.
        expect(d.refusal.knownFacts.join(' ')).toContain('Urbanizable');
        expect(d.refusal.knownFacts.join(' ')).toContain('Urbanizable Transitorio');
    });

    it('folds in the derived plan named by the cadastral address', () => {
        const markers = detectDerivedPlanMarkers('PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)');
        const withPlan = murciaEnvelopeDisposition(PARCEL_CAL, PARCEL_SECTOR, ASOF, markers);
        if (withPlan.kind !== 'refusal') throw new Error('unreachable');
        expect(withPlan.refusal.detail).toContain('Plan Parcial CR-5');
    });

    it('publishes NO buildable number — not even a conservative one', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        const prose = `${d.refusal.headline} ${d.refusal.detail} ${d.refusal.knownFacts.join(' ')}`;
        // A competitor published ~262 m² here as a "proxy PGOU". Under Art. 6.6.2 that cites
        // the wrong instrument entirely, so we publish nothing of the kind.
        expect(prose).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:m²|m2)\s*(?:edificable|construible)/i);
        expect(prose).not.toMatch(/\b262\b/);
    });

    it('validates against the schema', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(() => EnvelopeRefusalSchema.parse(d.refusal)).not.toThrow();
    });
});

describe('the control point produces a DIFFERENT disposition', () => {
    const d = murciaEnvelopeDisposition(CONTROL_CAL, CONTROL_SECTOR, ASOF);

    it('is still a remitted ámbito (UH is in Título 5 Cap. 24) but cites the UA/UH/UM chapter', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(d.refusal.code).toBe('derived-plan');
        expect(d.refusal.ordinanceRef).toContain('Título 5');
        // MC is not RR, so the RR article must NOT be cited here.
        expect(d.refusal.ordinanceRef).not.toContain('5.24.5');
    });

    it('reports the control\'s own calificación and land class, not the parcel\'s', () => {
        if (d.kind !== 'refusal') throw new Error('unreachable');
        const facts = d.refusal.knownFacts.join(' ');
        expect(facts).toContain('MC');
        expect(facts).toContain('Centro Histórico de Murcia');
        expect(facts).toContain('Urbano Consolidado');
        expect(facts).not.toContain('TA-379');
    });
});

describe('a non-remitted ámbito is a COVERAGE refusal, not a legal one', () => {
    it('downgrades legallyGrounded for e.g. a PERI ámbito', () => {
        const d = murciaEnvelopeDisposition(
            { ...PARCEL_CAL, calificacion: 'RA', descripcion: 'Residencial', sector: 'ZM-SV2' },
            { ...PARCEL_SECTOR, sector: 'ZM-SV2', clase_suelo: 'Urbano', categoria: null },
            ASOF,
        );
        if (d.kind !== 'refusal') throw new Error('unreachable');
        expect(d.refusal.code).toBe('no-rule-pack');
        expect(d.refusal.legallyGrounded).toBe(false);
        expect(d.refusal.ordinanceRef).toBeNull();
    });
});

describe('no data at the point is UNRESOLVED, never "no constraint"', () => {
    it('does not fabricate an absence of rules', () => {
        const d = murciaEnvelopeDisposition(null, null, ASOF);
        expect(d.kind).toBe('unresolved');
        if (d.kind !== 'unresolved') throw new Error('unreachable');
        expect(d.reason).toContain('not "no rules"');
    });
});
