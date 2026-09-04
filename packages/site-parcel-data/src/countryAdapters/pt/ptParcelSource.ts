// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-A1-PRECEDENCE (lane ENVELOPE-IBERIA, 2026-09-04) — doctrine §11 A1 + §12 step 1: the parcel
// geometry source LADDER as data, and the resolver that walks it — and REFUSES where the doctrine
// says there is no source.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// THE LADDER (doctrine §11 A1, verbatim in substance, precedence order):
//   1. Client-supplied survey            → confidence resolved, provenance client
//   2. Cadastro Predial WFS / OGC API    → 118 CGPR + 7 SiNErGIC concelhos; `NIC` identifier
//   3. BUPi Mapa Público                 → RUSTIC / MIXED prédios ONLY
//   4. AT caderneta área total do terreno → AREA ONLY, no geometry, confidence assumed
//   ⛔ URBAN PARCELS OUTSIDE THE CADASTRO-COVERED CONCELHOS HAVE NO SOURCE. Require input or refuse.
//
// ⭐ WHAT THIS RESOLVER DOES NOT NEED, AND WHY: the list of covered concelhos. The doctrine's rule
// is applied from EVIDENCE rather than from a hard-coded roster: the Cadastro Predial WFS answering
// "no parcel here" IS the coverage fact for that point (the shipped provider already distinguishes
// a served zero from a transport failure — `dgtParcelProvider.ts`, §CONTEXT-DATA-HONESTY), and the
// classification (solo urbano / rústico) says whether rung 3 may be consulted at all. A roster
// would rot; the served answer cannot.
//
// ⛔ FAILURE ≠ EMPTY, at every rung. A source that did not ANSWER never falls through to the next
// rung: falling through would let a transient outage on the survey-grade cadastre substitute a
// declared BUPi sketch (or nothing) for a parcel that exists. `transient` ⇒ UNRESOLVED, by name.
//
// ⛔ THE WIRED PATH IS NOT MOVED. `parcelProviders/dgtParcelProvider.ts` stays the live Cadastro
// Predial reader (not this lane's file). This module is the PURE ladder the caller feeds with each
// rung's outcome; it mints no fetch and no rival provider.
//
// ⚠ WATCH FLAG (doctrine §13): BUPi free registration ends 2026-09-30 — the rung-3 population
// changes after that date. `PT_BUPI_WATCH` travels on every BUPi-sourced outcome.
//
// PURITY: L2-pure. Data + pure functions. No I/O.

import type { Pt } from '@pryzm/schemas';
import { PT_COVERAGE_CAVEAT } from '../../parcelProviders/dgtParcelProvider.js';
import type { PtTristate } from './ptRusticoFuelStrip.js';

export type PtParcelSourceRung = 'client-survey' | 'cadastro-predial' | 'bupi' | 'at-caderneta';

/** The ladder AS DATA — doctrine §11 A1, in precedence order. */
export const PT_A1_PRECEDENCE: ReadonlyArray<{
    readonly rung: PtParcelSourceRung;
    readonly rank: 1 | 2 | 3 | 4;
    readonly geometry: boolean;
    readonly confidence: 'resolved' | 'assumed';
    readonly scope: string;
    readonly source: string;
}> = [
    { rung: 'client-survey', rank: 1, geometry: true, confidence: 'resolved', scope: 'any parcel', source: 'client-supplied topographic survey' },
    { rung: 'cadastro-predial', rank: 2, geometry: true, confidence: 'resolved', scope: '118 CGPR + 7 SiNErGIC concelhos (per-município build-out); NIC identifier', source: 'DGT Cadastro Predial — SNIC INSPIRE WFS (`dgtParcelProvider.ts`)' },
    { rung: 'bupi', rank: 3, geometry: true, confidence: 'assumed', scope: 'RUSTIC / MIXED prédios ONLY (owner-declared RGG, not survey-grade)', source: 'BUPi Mapa Público WMS/WFS (daily) or GeoPackage (fortnightly)' },
    { rung: 'at-caderneta', rank: 4, geometry: false, confidence: 'assumed', scope: 'AREA ONLY — área total do terreno; no geometry', source: 'AT caderneta predial' },
] as const;

/** Doctrine §13 watch flag for the BUPi rung. */
export const PT_BUPI_WATCH = 'BUPi free registration ends 2026-09-30 — the BUPi population and its currency change after that date.';

/** One rung's answer, in the FetchOutcome discipline: found / absent / transient are DIFFERENT values. */
export type PtRungOutcome<T> =
    | { readonly status: 'found'; readonly value: T }
    /** The source ANSWERED and holds nothing here — a durable coverage fact. */
    | { readonly status: 'absent'; readonly reason?: string }
    /** The source did NOT answer — never a fall-through. */
    | { readonly status: 'transient'; readonly reason?: string }
    /** The rung was not consulted. */
    | { readonly status: 'not-queried' };

export interface PtA1Input {
    /** Rung 1 — a client survey ring in scene-XZ metres, or null. */
    readonly clientSurveyRing?: ReadonlyArray<Pt> | null;
    /** Rung 2 — the Cadastro Predial answer for the point. */
    readonly cadastroPredial: PtRungOutcome<{ readonly ring: ReadonlyArray<Pt>; readonly nic: string | null }>;
    /** Rung 3 — the BUPi answer for the point. */
    readonly bupi: PtRungOutcome<{ readonly ring: ReadonlyArray<Pt>; readonly predioId: string | null }>;
    /** Rung 4 — the caderneta's área total do terreno, m², or null. */
    readonly atCadernetaAreaM2?: number | null;
    /** B2 — solo urbano? Decides whether rung 3 (rustic/mixed only) may be consulted. null = unresolved. */
    readonly isSoloUrbano: PtTristate;
}

export type PtA1Outcome =
    | {
          readonly kind: 'geometry';
          readonly rung: Exclude<PtParcelSourceRung, 'at-caderneta'>;
          readonly ring: ReadonlyArray<Pt>;
          readonly identifier: string | null;
          readonly confidence: 'resolved' | 'assumed';
          readonly provenance: 'client' | 'dgt-cadastro-predial' | 'bupi';
          readonly caveats: readonly string[];
      }
    | {
          /** Rung 4 — an area but NO geometry: A1 stays UNRESOLVED for the envelope (step 1 refuses). */
          readonly kind: 'area-only';
          readonly areaM2: number;
          readonly rung: 'at-caderneta';
          readonly confidence: 'assumed';
          readonly refusalReason: string;
      }
    | {
          readonly kind: 'unresolved';
          readonly refusalReason: string;
          /** True when the doctrine's remedy is "require input" (no public source can exist). */
          readonly requireInput: boolean;
          /** Which rung stopped the walk (a transient source), or null when the ladder was exhausted. */
          readonly stoppedAt: PtParcelSourceRung | null;
      };

const ringOk = (r: ReadonlyArray<Pt> | null | undefined): r is ReadonlyArray<Pt> =>
    Array.isArray(r) && r.length >= 3 && r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z));

/**
 * PURE: walk the A1 ladder. TOTAL — every input lands on exactly one outcome; a `transient` rung
 * STOPS the walk as `unresolved` (never falls through); the caderneta yields `area-only`, which
 * still blocks the envelope (doctrine §12 step 1: no geometry and no client input ⇒ refuse).
 */
export function resolvePtParcelGeometrySource(input: PtA1Input): PtA1Outcome {
    // 1 — client survey
    if (ringOk(input.clientSurveyRing)) {
        return { kind: 'geometry', rung: 'client-survey', ring: input.clientSurveyRing, identifier: null, confidence: 'resolved', provenance: 'client', caveats: [] };
    }
    // 2 — Cadastro Predial
    const cp = input.cadastroPredial;
    if (cp.status === 'found') {
        if (!ringOk(cp.value.ring)) {
            return { kind: 'unresolved', refusalReason: 'Cadastro Predial answered with a degenerate ring (< 3 finite vertices) — a data defect, reported not repaired', requireInput: false, stoppedAt: 'cadastro-predial' };
        }
        return {
            kind: 'geometry', rung: 'cadastro-predial', ring: cp.value.ring, identifier: cp.value.nic,
            confidence: 'resolved', provenance: 'dgt-cadastro-predial', caveats: [PT_COVERAGE_CAVEAT],
        };
    }
    if (cp.status === 'transient') {
        return {
            kind: 'unresolved',
            refusalReason: `Cadastro Predial did not answer (${cp.reason ?? 'transient'}) — the survey-grade rung cannot be skipped on an outage; retry or supply a survey. Failure is not "no parcel".`,
            requireInput: false,
            stoppedAt: 'cadastro-predial',
        };
    }
    // 3 — BUPi: rustic / mixed ONLY
    if (input.isSoloUrbano === true) {
        // ⛔ Doctrine: urban parcels outside the cadastro-covered concelhos have NO source.
        if (typeof input.atCadernetaAreaM2 === 'number' && Number.isFinite(input.atCadernetaAreaM2) && input.atCadernetaAreaM2 > 0) {
            return {
                kind: 'area-only', areaM2: input.atCadernetaAreaM2, rung: 'at-caderneta', confidence: 'assumed',
                refusalReason:
                    'A1 UNRESOLVED for the envelope: this is SOLO URBANO, the Cadastro Predial holds no parcel here ' +
                    `(${cp.status === 'absent' ? 'served zero' : 'not queried'}), and BUPi covers rustic/mixed prédios only. ` +
                    'Only the caderneta AREA is in hand (no geometry). Doctrine §11 A1: require a client survey or refuse.',
            };
        }
        return {
            kind: 'unresolved',
            refusalReason:
                'A1 UNRESOLVED: solo urbano, no Cadastro Predial parcel at this point ' +
                `(${cp.status === 'absent' ? 'served zero — outside the cadastro-covered concelhos or an unmapped core' : 'not queried'}), ` +
                'and BUPi is rustic/mixed only. No public geometry source exists for this parcel. Require input or refuse (doctrine §11 A1 ⛔).',
            requireInput: true,
            stoppedAt: null,
        };
    }
    const bp = input.bupi;
    if (bp.status === 'found') {
        if (!ringOk(bp.value.ring)) {
            return { kind: 'unresolved', refusalReason: 'BUPi answered with a degenerate ring — a data defect, reported not repaired', requireInput: false, stoppedAt: 'bupi' };
        }
        const caveats = [
            'BUPi geometry is an owner-declared representação gráfica georreferenciada, not a survey-grade cadastre — confidence ASSUMED (doctrine §11 A1 rung 3).',
            PT_BUPI_WATCH,
        ];
        if (input.isSoloUrbano === null) {
            caveats.push('B2 classification unresolved — BUPi is valid for rustic/mixed prédios only; verify the classe before relying on this ring.');
        }
        return { kind: 'geometry', rung: 'bupi', ring: bp.value.ring, identifier: bp.value.predioId, confidence: 'assumed', provenance: 'bupi', caveats };
    }
    if (bp.status === 'transient') {
        return {
            kind: 'unresolved',
            refusalReason: `BUPi did not answer (${bp.reason ?? 'transient'}) — not a "no prédio"; retry or supply a survey.`,
            requireInput: false,
            stoppedAt: 'bupi',
        };
    }
    // 4 — caderneta (area only)
    if (typeof input.atCadernetaAreaM2 === 'number' && Number.isFinite(input.atCadernetaAreaM2) && input.atCadernetaAreaM2 > 0) {
        return {
            kind: 'area-only', areaM2: input.atCadernetaAreaM2, rung: 'at-caderneta', confidence: 'assumed',
            refusalReason:
                'A1 UNRESOLVED for the envelope: no geometry from the Cadastro Predial or BUPi ' +
                `(${cp.status}/${bp.status}); only the caderneta área total do terreno is in hand. Doctrine §12 step 1: no geometry and no client input ⇒ refuse.`,
        };
    }
    return {
        kind: 'unresolved',
        refusalReason:
            `A1 UNRESOLVED: no client survey, Cadastro Predial ${cp.status}, BUPi ${bp.status}, no caderneta area. ` +
            'Doctrine §12 step 1 — refuse (A1 unresolved).',
        requireInput: true,
        stoppedAt: null,
    };
}
