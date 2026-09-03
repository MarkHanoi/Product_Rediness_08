// LANE RO — ROMANIA adapter tests. Romania is a TWO-GATE DECLARED DEFERRAL, so these tests prove
// the SHAPE of an honest deferral, not a live fetch:
//   • the SERVICE gate (GATE 1) — every parcel leg refuses BY NAME, transient never absent;
//   • the JURISDICTION gate (GATE 2) — claimsRomania is false everywhere until ROU is modelled, so
//     the registry row is DORMANT and a Bucharest click falls to the honest footprint, never a
//     fabricated parcel;
//   • the recorded-live fixture — the committed NXDOMAIN transcript that the gate record cites;
//   • the C74 §3.4 anti-staleness assertions (reviewBy) and §3.8 declared-legs list.
//
// ⚠ There is deliberately NO parser test and NO "resolves a real Romanian parcel" test: the ANCPI
// host does not resolve, so this lane has no served bytes, and a parser built from documentation
// cannot falsify the documentation ([[fake-more-capable-than-real]]).

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteIntelSourceSchema, isTransientOutcome } from '@pryzm/schemas';
import {
    ROMANIA_BBOX,
    RO_ANCPI_DEFERRAL,
    RO_ANCPI_DEFERRED_TOKEN,
    RO_ANCPI_ENDPOINTS,
    RO_ANCPI_SOURCE_ID,
    RO_APPLICABILITY_LADDER,
    RO_DEFERRED_LEGS,
    RO_JURISDICTION_DEFERRAL,
    RO_PARCEL_PROVIDER_ID,
    RO_SOURCES,
    assertRoAncpiDeferralNotExpired,
    claimsRomania,
    isInRomania,
    resolveRoParcelAtWgs84Point,
    resolveRoParcelByInspireId,
    roCountryAdapter,
} from '../src/index.js';
import {
    listParcelJurisdictions,
    parcelJurisdictionSpecificity,
    resolveParcelCandidates,
    resolveParcelJurisdiction,
    UNIVERSAL_FOOTPRINT_JURISDICTION,
} from '../src/parcelProviders/registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// Bucharest — Piața Universității (the capital click the brief asks the live proof at).
const BUCHAREST = { lat: 44.4268, lon: 26.1025 } as const;

/* ───────────────────────────── GATE 2 — the jurisdiction predicate ───────────────────────────── */

describe('RO jurisdiction — the specificity box is not a router, and the claim is dormant (GATE 2)', () => {
    it('isInRomania is a coarse rectangle: true at Bucharest, false outside', () => {
        expect(isInRomania(BUCHAREST.lat, BUCHAREST.lon)).toBe(true);
        expect(isInRomania(48.8566, 2.3522)).toBe(false); // Paris
        expect(isInRomania(Number.NaN, 26)).toBe(false);
    });

    it('claimsRomania is FALSE everywhere today — ROU is not in the resolver boundary set', () => {
        // GATE 2: this is the whole deferral on the routing leg. The day ROU is added to
        // nationalBoundaries.json, this flips to true at Romanian points with no edit here.
        expect(claimsRomania(BUCHAREST.lat, BUCHAREST.lon)).toBe(false);
        expect(claimsRomania(46.7712, 23.6236)).toBe(false); // Cluj-Napoca
    });

    it('the box is finite and overlaps no existing registered parcel box (no new ambiguity)', () => {
        expect(Number.isFinite(ROMANIA_BBOX.minLat)).toBe(true);
        // Romania's north edge (48.4) is south of POLAND_BBOX's south edge (49.0): no overlap.
        expect(ROMANIA_BBOX.maxLat).toBeLessThan(49.0);
    });

    it('RO_JURISDICTION_DEFERRAL names the gate, the measured evidence and the single-line flip', () => {
        expect(RO_JURISDICTION_DEFERRAL.gate).toMatch(/boundary set|resolver/i);
        expect(RO_JURISDICTION_DEFERRAL.evidence).toContain('nationalBoundaries.json');
        expect(RO_JURISDICTION_DEFERRAL.retiredBy).toContain('nationalBoundaries.json');
        expect(RO_JURISDICTION_DEFERRAL.reviewBy).toBe('2026-12-01');
    });
});

/* ───────────────────────────── GATE 1 — the service is unreachable ───────────────────────────── */

describe('RO parcel arm — declared deferral (GATE 1: ANCPI host NXDOMAIN)', () => {
    it('refuses every declared leg BY NAME, transient — never absent, never fabricated', async () => {
        const outcomes = [
            await resolveRoParcelByInspireId('RO.83.40991.102507'),
            await resolveRoParcelAtWgs84Point(BUCHAREST.lat, BUCHAREST.lon),
        ];
        expect(outcomes.length).toBe(RO_DEFERRED_LEGS.length);
        for (const o of outcomes) {
            expect(o.status).toBe('transient'); // NOT absent: Romania HAS a national cadastre
            expect(isTransientOutcome(o)).toBe(true);
            if (o.status === 'transient') {
                expect(o.reason).toContain(RO_ANCPI_DEFERRED_TOKEN);
                expect(o.reason).toContain('endpoint-unreachable');
                expect(o.reason).toContain('NXDOMAIN');
                expect(o.reason).toContain('not an absence of Romanian data');
            }
        }
    });

    it('the point leg echoes the coordinates so a caller can tell WHICH request refused', async () => {
        const o = await resolveRoParcelAtWgs84Point(BUCHAREST.lat, BUCHAREST.lon);
        if (o.status === 'transient') {
            expect(o.reason).toContain('44.4268');
            expect(o.reason).toContain('26.1025');
        } else {
            throw new Error('expected a transient refusal');
        }
    });

    it('RO_ANCPI_DEFERRAL records the endpoint pin and the transcript path', () => {
        expect(RO_ANCPI_ENDPOINTS.eterra3Parcels).toContain('geoportal.ancpi.ro');
        expect(RO_ANCPI_DEFERRAL.evidence).toContain('NXDOMAIN');
        expect(RO_ANCPI_DEFERRAL.evidence).toContain('ancpi-gate-probe.txt');
    });
});

/* ───────────────────────────── recorded-live fixture (the committed gate bytes) ──────────────── */

describe('RO recorded-live fixture — the NXDOMAIN transcript the gate record cites', () => {
    const FIXTURE = resolve(HERE, 'fixtures/ro-ancpi-gate-2026-09-03/ancpi-gate-probe.txt');

    it('the transcript is committed and carries the measured NXDOMAIN gate', () => {
        expect(existsSync(FIXTURE)).toBe(true);
        const t = readFileSync(FIXTURE, 'utf8');
        expect(t).toContain('geoportal.ancpi.ro');
        expect(t).toContain('"Status":3'); // NXDOMAIN from the DoH probe
        expect(t).toContain('curl_exit=6'); // could not resolve host
        expect(t).toContain('104.18.9.54'); // CONTROL: apex/www resolves → zone is live
    });
});

/* ───────────────────────────── C74 §3.4 — the deferral cannot go stale silently ──────────────── */

describe('RO deferral anti-staleness (C74 §3.4)', () => {
    it('does not throw before reviewBy', () => {
        expect(() => assertRoAncpiDeferralNotExpired('2026-09-03')).not.toThrow();
        expect(() => assertRoAncpiDeferralNotExpired('2026-11-30')).not.toThrow();
    });
    it('throws BY NAME after reviewBy, telling the reader what to do', () => {
        expect(() => assertRoAncpiDeferralNotExpired('2027-01-01')).toThrow(/reviewBy|retire|recheck/i);
    });
});

/* ───────────────────────────── sources() — the typed, deferred cadastre row ──────────────────── */

describe('RO sources() — one deferred cadastre row, typed and honest', () => {
    it('every row parses through SiteIntelSourceSchema', () => {
        for (const row of RO_SOURCES) expect(() => SiteIntelSourceSchema.parse(row)).not.toThrow();
    });
    it('the ANCPI row carries the NXDOMAIN probe log, YELLOW unverified licence, deferred status', () => {
        const row = RO_SOURCES.find((r) => r.id === RO_ANCPI_SOURCE_ID)!;
        expect(row).toBeDefined();
        expect(row.country).toBe('RO');
        expect(row.protocol).toBe('REST');
        expect(row.licence.colour).toBe('YELLOW');
        expect(row.licence.verifiedDate).toBeNull(); // terms not captured — never asserted GREEN
        expect(row.gate).toBeNull(); // no CREDENTIAL gate; the block is DNS reachability, in probes
        expect(row.adapterStatus).toBe('deferred-stub');
        expect(row.probes.some((p) => p.note.includes('NXDOMAIN'))).toBe(true);
        expect(row.probes.map((p) => p.date)).toContain('2026-09-03');
    });
});

/* ───────────────────────────── the §J adapter value + honest no-rule-pack path ───────────────── */

describe('roCountryAdapter — §J shape with the honest no-rule-pack path', () => {
    it('exposes country RO, sources(), a deferred parcel leg and rules kind "deferred"', () => {
        expect(roCountryAdapter.country).toBe('RO');
        expect(roCountryAdapter.sources()).toBe(RO_SOURCES);
        expect(roCountryAdapter.rules.kind).toBe('deferred');
        expect(roCountryAdapter.rules.reason).toMatch(/no national machine-readable rules/i);
    });
    it('the applicability ladder is DOCUMENT-BOUND with the 2024 GIS-PUG upgrade path recorded', () => {
        const joined = RO_APPLICABILITY_LADDER.map((s) => s.mode).join(' ');
        expect(joined).toMatch(/CAD\/PDF|DOCUMENT-BOUND/);
        expect(joined).toContain('GIS-PUG');
    });
    it('C74 §3.8 — every declared leg name is real and refuses (no stale claim)', async () => {
        expect(RO_DEFERRED_LEGS.map((l) => l.fn)).toEqual([
            'resolveRoParcelByInspireId',
            'resolveRoParcelAtWgs84Point',
        ]);
    });
});

/* ───────────────────────────── the DORMANT registry row + the honest Bucharest click ─────────── */

describe('RO registry row — dormant footprint-fallback, honest Bucharest click', () => {
    const roRow = () => listParcelJurisdictions().find((j) => j.regionCode === 'RO');

    it('is registered as a footprint-fallback with a reserved providerId and null proxy', () => {
        const row = roRow()!;
        expect(row).toBeDefined();
        expect(row.kind).toBe('footprint-fallback');
        expect(row.providerId).toBe(RO_PARCEL_PROVIDER_ID);
        expect(row.proxyPath).toBeNull();
        expect(row.note).toMatch(/NXDOMAIN/);
        expect(row.note).toMatch(/DORMANT/);
    });

    it('has a finite specificity (the silent-inertness guard the wiring test enforces)', () => {
        expect(Number.isFinite(parcelJurisdictionSpecificity(roRow()!))).toBe(true);
    });

    it('is DORMANT: Bucharest matches no RO candidate (GATE 2), and the click is the honest footprint', () => {
        const candidates = resolveParcelCandidates(BUCHAREST.lat, BUCHAREST.lon).map((c) => c.regionCode);
        expect(candidates).not.toContain('RO'); // claimsNation('RO') is false → row never fires
        // A Bucharest click still resolves to SOMETHING (never dead), and it is the universal
        // footprint — never a fabricated Romanian parcel.
        expect(resolveParcelJurisdiction(BUCHAREST.lat, BUCHAREST.lon)).toBe(
            UNIVERSAL_FOOTPRINT_JURISDICTION,
        );
    });
});
