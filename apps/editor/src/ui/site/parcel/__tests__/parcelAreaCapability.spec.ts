// §AREA-IS-A-DECLARED-CAPABILITY (C57 §1.14, lane CADASTRAL-COVERAGE 2026-09-09) — the arms that
// BIND the area query's honesty, and the ones a green suite would otherwise never exercise.
//
// WHAT THESE PIN, AND WHY EACH ONE EARNS ITS PLACE
// ------------------------------------------------
// The whole point of `ParcelAreaOutcome` is that FOUR different situations must not draw the same
// blank overlay. Every arm below is one pair that would be indistinguishable if the mapping in
// `parcelAreaFetch.ts` were one line different:
//
//   1. `unsupported` (this register CANNOT be asked) vs `ok` with zero parcels (it WAS asked and
//      holds nothing). Collapse these and PRYZM reports a gap in its own reach as a finding about
//      the founder's land — §CONTEXT-DATA-HONESTY, L-581/L-616, the standing prohibition.
//   2. `out-of-area` vs `unsupported`. Both come back with no parcels. One means "this register's
//      territory ends before your click" — a fact about the land, `ok: []`. The other means "no
//      register here can ever answer" — a fact about the source. Mapping `out-of-area` to
//      `unsupported` would disable the chip for a whole country the first time a user panned
//      offshore, and it would look completely reasonable in review.
//   3. `unconfigured` vs `ok: []`. The deployment holds no credential, so the register was never
//      asked. `WfsParcelProvider` already makes this exact call for the POINT route; this pins
//      that the AREA route makes the same one rather than quietly inventing a second policy.
//   4. A body with NO `outcome` (an older server, a stale cache) vs a real empty answer.
//   5. `truncated` unstated vs `truncated: false`. "We did not say" is not "that is all of them"
//      (C57 §1.14.3), and the conservative arm is the required one.
//
// ⚠ AND THE INTERFACE ARM IS THE ONE THAT STOPS THE WHOLE THING REGRESSING. `fetchParcelsInArea`
// is REQUIRED on `ParcelProvider` precisely so a provider cannot stay silent; a spec that only
// exercised Catastro would pass against four silent providers ([[authored-but-unwired]]).
//
// SCRAMBLE CONTROL (L-586) — run and recorded in the lane report, not left as an assertion.

import { describe, it, expect } from 'vitest';
import { normaliseParcelAreaBody, unsupportedAreaReason } from '../parcelAreaFetch.js';
import { catastroParcelProvider } from '../CatastroParcelProvider.js';
import { dkMatrikelParcelProvider } from '../DkMatrikelParcelProvider.js';
import { footprintParcelProvider } from '../FootprintParcelProvider.js';
import { makeWfsParcelProvider } from '../WfsParcelProvider.js';
import { registryParcelProvider } from '../parcelRegistry.js';
import type { ParcelProvider } from '../ParcelProvider.js';

const LABEL = 'Catastro (Spain)';

/** A minimal but VALID server parcel row — three distinct vertices and a citable id. */
function row(refcat: string, source = 'catastro') {
    return {
        ring: [
            { lat: 41.3874, lon: 2.1686 },
            { lat: 41.3876, lon: 2.1688 },
            { lat: 41.3875, lon: 2.169 },
        ],
        refcat,
        areaM2: 1234,
        address: null,
        source,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE INTERFACE IS REQUIRED — every provider answers the area question
// ─────────────────────────────────────────────────────────────────────────────

describe('C57 §1.14 — fetchParcelsInArea is REQUIRED on every provider', () => {
    const providers: ReadonlyArray<readonly [string, ParcelProvider]> = [
        ['catastro (ES)', catastroParcelProvider],
        ['matrikel-dk (DK)', dkMatrikelParcelProvider],
        ['generic WFS (FR/NL/…)', makeWfsParcelProvider({ id: 'ign-fr', label: 'IGN (France)', endpoint: '/api/parcel/fr' })],
        ['footprint (OSM)', footprintParcelProvider],
        ['registry (the one the map uses)', registryParcelProvider],
    ];

    for (const [name, p] of providers) {
        it(`${name} implements it — a silent provider cannot exist`, () => {
            expect(typeof p.fetchParcelsInArea).toBe('function');
        });
    }

    it('the OSM footprint provider REFUSES, and its reason names the roof-vs-boundary distinction', async () => {
        // C57 §1.13.4 — the footprint layer CAN enumerate an area. It must not, under this label:
        // a building outline is a different legal object from a property boundary, and drawing
        // roof edges as "cadastral parcel boundaries" is wrong in a way the user cannot see.
        const out = await footprintParcelProvider.fetchParcelsInArea(2.1686, 41.3874, 150);
        expect(out.status).toBe('unsupported');
        if (out.status !== 'unsupported') throw new Error('unreachable');
        expect(out.reason.toLowerCase()).toMatch(/footprint|roof/);
        expect(out.reason.toLowerCase()).toMatch(/boundar/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE SEVEN SERVER OUTCOMES → THE THREE UI ARMS
// ─────────────────────────────────────────────────────────────────────────────

describe('C57 §1.14.2 — every server outcome lands on the arm that is TRUE of it', () => {
    it('ok with parcels → ok, and the rows survive with their provenance', () => {
        const out = normaliseParcelAreaBody(
            { outcome: 'ok', parcels: [row('A'), row('B')], truncated: false },
            LABEL,
        );
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels.map((p) => p.refcat)).toEqual(['A', 'B']);
        expect(out.parcels[0]!.source).toBe('catastro');
        expect(out.truncated).toBe(false);
    });

    it('⭐ ok with ZERO parcels is `ok`, NOT `unsupported` — the register answered about the land', () => {
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [], truncated: false }, LABEL);
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels).toHaveLength(0);
    });

    it('⭐ `unsupported` is `unsupported` and keeps the register’s OWN sentence', () => {
        const reason = unsupportedAreaReason('swisstopo AV (Switzerland)');
        const out = normaliseParcelAreaBody({ outcome: 'unsupported', parcels: [], reason }, LABEL);
        expect(out.status).toBe('unsupported');
        if (out.status !== 'unsupported') throw new Error('unreachable');
        expect(out.reason).toBe(reason);
        // The sentence must blame the PUBLISHING MODEL, not the plot and not the network.
        expect(out.reason.toLowerCase()).toContain('not an outage');
    });

    it('⭐⭐ THE PAIR THAT MUST NEVER COINCIDE: empty-ok and unsupported differ in STATUS', () => {
        // If this ever fails, PRYZM is drawing "we cannot ask" and "there is nothing here" as the
        // same blank map — the exact L-581/L-616 prohibition, at overlay scale.
        const empty = normaliseParcelAreaBody({ outcome: 'ok', parcels: [], truncated: false }, LABEL);
        const cannot = normaliseParcelAreaBody({ outcome: 'unsupported', parcels: [] }, LABEL);
        expect(empty.status).not.toBe(cannot.status);
    });

    it('⭐ `out-of-area` is `ok` with zero — a fact about the LAND, not about the source', () => {
        // Mapping this to `unsupported` would flatten the chip for an entire country the first
        // time someone clicked offshore.
        const out = normaliseParcelAreaBody({ outcome: 'out-of-area', parcels: [] }, LABEL);
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels).toHaveLength(0);
        // Knowably complete: the register holds nothing here, so nothing was truncated.
        expect(out.truncated).toBe(false);
    });

    it('`unknown-source` → unsupported (PRYZM has no register wired, and that is durable)', () => {
        const out = normaliseParcelAreaBody({ outcome: 'unknown-source', parcels: [] }, LABEL);
        expect(out.status).toBe('unsupported');
    });

    it('⭐ `unconfigured` → unreachable — the register was NEVER ASKED, so it is not an answer', () => {
        const out = normaliseParcelAreaBody(
            { outcome: 'unconfigured', parcels: [], reason: 'DK_KEY is not configured.' },
            LABEL,
        );
        expect(out.status).toBe('unreachable');
    });

    it('`unreachable` → unreachable, carrying the server reason', () => {
        const out = normaliseParcelAreaBody(
            { outcome: 'unreachable', parcels: [], reason: 'Catastro did not answer.' },
            LABEL,
        );
        expect(out.status).toBe('unreachable');
        if (out.status !== 'unreachable') throw new Error('unreachable');
        expect(out.reason).toBe('Catastro did not answer.');
    });

    it('⭐ `bad-input` → unreachable, NOT an empty finding — our own bug is not a fact about the land', () => {
        const out = normaliseParcelAreaBody({ outcome: 'bad-input', parcels: [] }, LABEL);
        expect(out.status).toBe('unreachable');
    });

    it('⭐ a body with NO `outcome` → unreachable — an older server is not an empty area', () => {
        // A cached response minted before the area routes existed parses to zero parcels. Reading
        // that as `ok: []` would draw a blank overlay over a city block and call it coverage.
        const out = normaliseParcelAreaBody({ parcels: [] }, LABEL);
        expect(out.status).toBe('unreachable');
        const nothing = normaliseParcelAreaBody(null, LABEL);
        expect(nothing.status).toBe('unreachable');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRUNCATION — "we did not say" is not "that is all of them"
// ─────────────────────────────────────────────────────────────────────────────

describe('C57 §1.14.3 — truncation is a fourth fact, and its default is the conservative one', () => {
    it('⭐ an `ok` body that does not state `truncated` is read as TRUNCATED', () => {
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [row('A')] }, LABEL);
        expect(out.status).toBe('ok');
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.truncated).toBe(true);
    });

    it('a stated `truncated: true` survives', () => {
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [row('A')], truncated: true }, LABEL);
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.truncated).toBe(true);
    });

    it('a non-boolean `truncated` is not trusted — it falls to the conservative arm', () => {
        const out = normaliseParcelAreaBody(
            { outcome: 'ok', parcels: [row('A')], truncated: 'no' },
            LABEL,
        );
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.truncated).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ROWS PRYZM CANNOT STAND BEHIND ARE DROPPED, NOT DRAWN
// ─────────────────────────────────────────────────────────────────────────────

describe('C57 §1.14 — an overlay row must be attributable', () => {
    it('a ring with no refcat is dropped: an unnameable outline cannot claim to be a parcel', () => {
        const bad = { ...row('X'), refcat: '' };
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [bad, row('A')], truncated: false }, LABEL);
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels.map((p) => p.refcat)).toEqual(['A']);
    });

    it('a degenerate ring (< 3 usable vertices) is dropped rather than drawn as a sliver', () => {
        const bad = { ...row('X'), ring: [{ lat: 41.4, lon: 2.1 }, { lat: 41.4, lon: 2.2 }] };
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [bad, row('A')], truncated: false }, LABEL);
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels).toHaveLength(1);
    });

    it('non-numeric vertices are filtered, and a ring that falls below 3 goes with them', () => {
        const bad = {
            ...row('X'),
            ring: [{ lat: 41.4, lon: 2.1 }, { lat: 'x', lon: 2.2 }, { lat: null, lon: 2.3 }],
        };
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [bad], truncated: false }, LABEL);
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels).toHaveLength(0);
    });

    it('a row with no `source` inherits the register label rather than shipping blank provenance', () => {
        const noSrc = { ...row('A'), source: undefined };
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [noSrc], truncated: false }, LABEL);
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels[0]!.source).toBe(LABEL);
    });

    it('⛔ the area rows carry NO fabricated confidence tier — the fields stay absent', () => {
        // `metrics`/`confidence` are computed for the SELECTED parcel, where they are read. An
        // overlay neighbour that shipped a match tier nothing measured would be
        // [[fake-more-capable-than-real]].
        const out = normaliseParcelAreaBody({ outcome: 'ok', parcels: [row('A')], truncated: false }, LABEL);
        if (out.status !== 'ok') throw new Error('unreachable');
        expect(out.parcels[0]!.confidence).toBeUndefined();
        expect(out.parcels[0]!.metrics).toBeUndefined();
    });
});
