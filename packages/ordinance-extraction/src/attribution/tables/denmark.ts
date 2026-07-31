// Denmark — instrument precedence + the BYGGEFELT BINDINGNESS STATE MACHINE.
//
// Denmark is the reference model for this whole layer, and it is also the
// jurisdiction that needs the LEAST of it: the register answers the bindingness
// question directly, so almost nothing has to be inferred from text.
//
// Source: `dk/findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md`, VERIFIED-LIVE
// 2026-07-31 against `https://geoserver.plandata.dk/geoserver/wfs`.
// `DescribeFeatureType` on `theme_pdk_byggefelt_vedtaget` exposes two booleans:
//
//   `bygkunifelt`   — *byggeri kun i felt* — building ONLY within the field → binding
//   `bygvejledende` — the byggefelt is *vejledende* — advisory → illustrative
//
// n = 57,035 adopted byggefelter: 23.9 % binding, 64.7 % advisory, 10.7 % neither,
// 0.31 % contradictory (both true), 0.36 % null. This module does not re-verify those
// counts; it transcribes the §4 state machine.
//
// ⚠ INHERITED ASSERTED-UNVERIFIED (probe §7 O1): the reading of the two Danish field
// NAMES is a strong inference from the names plus the observed mutual-exclusivity
// pattern. It is NOT confirmed against Plandata's published data specification / UML
// model. That confirmation is still outstanding, and this module does not close it.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { type InstrumentPriorityTable } from '../priority.js';
import { type LegalStatus, type LegalStatusSource } from '../types.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

export const DENMARK_PRIORITY_TABLE: InstrumentPriorityTable = {
    jurisdiction: 'dk',
    displayName: 'Denmark (Planloven / Plandata)',
    citation:
        'Plandata publishes bindingness as metadata — BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md ' +
        '§2/§4 (VERIFIED-LIVE 2026-07-31).',
    rank: {
        // The lokalplan is the binding instrument.
        'binding-plan': 0,
        // Bygningsreglementet (BR18) — national code above the lokalplan.
        statute: 1,
        'superseded-plan': 2,
    },
    note:
        'Denmark barely uses this table: `legalStatus` arrives already decided from ' +
        'published metadata (`legalStatusSource: "metadata"`), so most byggefelt questions ' +
        'are settled at the status stage before any ranking happens. UNRANKED: ' +
        '`catalogue-overlay`, `depiction`, `special-plan` — no Danish equivalent researched.',
};

/**
 * The two published booleans, as the register gives them. `null` is a THIRD state and
 * is NOT `false` — a missing flag means the metadata is unavailable, not that the
 * field is non-binding (the `failure ≠ absence` family, L-422/457/467/469).
 */
export interface ByggefeltFlags {
    /** `bygkunifelt` — building only within the field. */
    readonly bygkunifelt: boolean | null;
    /** `bygvejledende` — the field is advisory. */
    readonly bygvejledende: boolean | null;
}

/** The state machine's verdict: a legal status, its source, and why. */
export interface ByggefeltVerdict {
    readonly legalStatus: LegalStatus;
    /** Always `'metadata'` — Denmark is the jurisdiction where the register says so. */
    readonly legalStatusSource: LegalStatusSource;
    readonly detail: string;
}

/**
 * The byggefelt bindingness state machine — probe §4, implemented exactly.
 *
 * | `bygkunifelt` | `bygvejledende` | → `legalStatus`               |
 * |---|---|---|
 * | `true`  | `false` | `binding`      — published explicit-area geometry |
 * | any     | `true`  | `illustrative` — an explicit municipal declaration |
 * | `false` | `false` | `unknown`      — the register declines to classify |
 * | `true`  | `true`  | `unknown`      — DATA CONFLICT; refuse to infer     |
 * | `null` on either  | `unknown`      — metadata unavailable; `null` ≠ `false` |
 *
 * ⚠ DO NOT text-classify the 64.7 % advisory set. `bygvejledende=true` is an explicit
 * MUNICIPAL DECLARATION that the geometry is advisory. Overriding it with a text
 * heuristic would second-guess the publishing authority — the inverse of what this
 * architecture exists to do. Advisory records drop to weaker evidence honestly.
 *
 * ⚠ The 0.31 % `(true, true)` set is a DATA CONFLICT, not a tie to break. It resolves
 * to `unknown` and belongs in a QA list, published, not silently resolved (probe O3).
 */
export function dkByggefeltLegalStatus(flags: ByggefeltFlags): ByggefeltVerdict {
    const span = tracer.startSpan('pryzm.ordinance-extraction.dkByggefeltLegalStatus');
    try {
        const { bygkunifelt, bygvejledende } = flags;

        // `null` ≠ `false`. Metadata unavailable is its own answer, checked FIRST so a
        // missing flag can never be read as a negative one.
        if (bygkunifelt === null || bygvejledende === null) {
            span.setAttribute('pryzm.dk.byggefelt', 'metadata-unavailable');
            return {
                legalStatus: 'unknown',
                legalStatusSource: 'metadata',
                detail:
                    'Metadata unavailable: bygkunifelt=' +
                    `${String(bygkunifelt)}, bygvejledende=${String(bygvejledende)}. ` +
                    'A null flag is NOT a false flag — the register did not answer.',
            };
        }

        // Both true: the register contradicts itself. 179 of 57,035 nationally.
        if (bygkunifelt && bygvejledende) {
            span.setAttribute('pryzm.dk.byggefelt', 'contradictory');
            return {
                legalStatus: 'unknown',
                legalStatusSource: 'metadata',
                detail:
                    'DATA CONFLICT: bygkunifelt=true AND bygvejledende=true. The register ' +
                    'states the field is both binding-only and advisory. Refuse to infer; ' +
                    'emit as QA output (probe §7 O3 — 179 records nationally).',
            };
        }

        // Advisory: an explicit municipal declaration. Never overridden by text.
        if (bygvejledende) {
            span.setAttribute('pryzm.dk.byggefelt', 'advisory');
            return {
                legalStatus: 'illustrative',
                legalStatusSource: 'metadata',
                detail:
                    'bygvejledende=true — the municipality declares this byggefelt advisory. ' +
                    'Drops to weaker evidence; do NOT text-classify it away (probe §4).',
            };
        }

        // Binding: byggeri kun i felt.
        if (bygkunifelt) {
            span.setAttribute('pryzm.dk.byggefelt', 'binding');
            return {
                legalStatus: 'binding',
                legalStatusSource: 'metadata',
                detail:
                    'bygkunifelt=true AND bygvejledende=false — building only within the ' +
                    'field. Published explicit-area geometry (23.9 % of 57,035 nationally).',
            };
        }

        // Both false: the register declines to classify. 10.7 % — and this, not the
        // 64.7 % advisory set, is the correctly-scoped target for a lokalplan text parser.
        span.setAttribute('pryzm.dk.byggefelt', 'unclassified');
        return {
            legalStatus: 'unknown',
            legalStatusSource: 'metadata',
            detail:
                'bygkunifelt=false AND bygvejledende=false — the register declines to ' +
                'classify. Needs lokalplan text (10.7 % nationally, ~6,100 records — the ' +
                'correctly-scoped text-parser target, NOT the 57,000-record population).',
        };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
