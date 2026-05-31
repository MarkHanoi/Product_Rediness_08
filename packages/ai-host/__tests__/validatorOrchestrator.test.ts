// Apartment-layout VALIDATOR ORCHESTRATOR tests.
//
// Pins the contract of `validateApartmentLayout` — the single-call aggregator
// that runs the 15 shipped validators
// (G-1/2/3/5/6/7/8/10 + A-1/2/3/4/5/6/7) on a canonical apartment layout
// and returns one `AggregatedViolationReport`.
//
// Test policy:
//   • Use realistic, apartment-grade geometry — not unit-grid toys — so the
//     "healthy layout" baseline doubles as a smoke test that the underlying
//     per-validator thresholds (limits.ts + the A-class tables) admit a
//     sensible residential plan.
//   • Construct rooms via a `room()` helper so each test stays small + each
//     defect is one-line obvious.
//   • Assert AGGREGATE counts (`errors`, `warnings`, `total`,
//     `violationsByClass`) — the per-validator emit shape is already pinned
//     by `dimensionalValidators.test.ts` + `topologyMandatoryAdjacency.test.ts`.

import { describe, expect, it } from 'vitest';
import {
    passesLegality,
    summarise,
    validateApartmentLayout,
    type AdjacencyEdge,
    type ApartmentLayoutForValidation,
    type ApartmentLayoutRoom,
} from '../src/workflows/apartmentLayout/validators/index.js';

// ── Test helpers ────────────────────────────────────────────────────────────

/**
 * Build a `ApartmentLayoutRoom` with healthy defaults for any unspecified
 * field. Callers override exactly the fields the test cares about, so each
 * defect is visible at the call site.
 */
function room(
    id: string,
    type: string,
    overrides: Partial<Omit<ApartmentLayoutRoom, 'id' | 'type'>> = {},
): ApartmentLayoutRoom {
    const areaM2 = overrides.areaM2 ?? 10;
    // Default glazed area to 15% of floor area (above G-10's 0.10 floor) so
    // larger rooms don't accidentally trip lighting just because the helper
    // hardcoded a fixed 2 m². Smaller rooms still get a floor of 2 m².
    const defaultGlazedAreaM2 = Math.max(2, areaM2 * 0.15);
    return {
        id,
        type,
        areaM2,
        widthM: overrides.widthM ?? 3,
        lengthM: overrides.lengthM ?? 4,
        longestUsableWallM: overrides.longestUsableWallM ?? 3,
        externalFrontageM: overrides.externalFrontageM ?? 3,
        hasExteriorEdge: overrides.hasExteriorEdge ?? true,
        glazedAreaM2: overrides.glazedAreaM2 ?? defaultGlazedAreaM2,
    };
}

const edge = (aId: string, bId: string): AdjacencyEdge => ({ aId, bId });

/**
 * The canonical "healthy" 5-room apartment used as the passing baseline.
 * Architect-grade geometry that satisfies every G/A check in the orchestrator.
 *
 * Topology:
 *   entrance_hall ── corridor ── bedroom ── bathroom
 *        │              │           │
 *     living_room       └─ bathroom │
 */
function healthyApartment(): ApartmentLayoutForValidation {
    const rooms: ApartmentLayoutRoom[] = [
        // entrance_hall (hall): 6 m², 2×3 — within all caps + has wall ≥ 1.0 m
        room('h', 'entrance_hall', {
            areaM2: 6, widthM: 2, lengthM: 3,
            longestUsableWallM: 1.5, externalFrontageM: 0,
        }),
        // corridor: skips G-3/G-5/G-7; G-1 ≤ 8, G-2 ≤ 2.5, G-6 ≥ 1.0
        room('c', 'corridor', {
            areaM2: 4, widthM: 1.2, lengthM: 3.3,
            longestUsableWallM: 0, externalFrontageM: 0,
        }),
        // living_room: 25 m², 5×5
        room('l', 'living_room', {
            areaM2: 25, widthM: 5, lengthM: 5,
            longestUsableWallM: 3.0, externalFrontageM: 3.0,
        }),
        // bedroom: 12 m², 3×4
        room('b', 'bedroom', {
            areaM2: 12, widthM: 3, lengthM: 4,
            longestUsableWallM: 2.0, externalFrontageM: 2.0,
        }),
        // bathroom: 5 m², 2×2.5
        room('ba', 'bathroom', {
            areaM2: 5, widthM: 2, lengthM: 2.5,
            longestUsableWallM: 1.5, externalFrontageM: 0,
        }),
    ];
    const edges: AdjacencyEdge[] = [
        edge('h', 'c'),    // entrance ↔ corridor  (A-1: entrance reaches circulation)
        edge('h', 'l'),    // entrance ↔ living    (A-1 backup)
        edge('c', 'b'),    // corridor ↔ bedroom   (A-4: bedroom has semi-public neighbour)
        edge('c', 'ba'),   // corridor ↔ bathroom  (A-1: bathroom reaches circulation)
        edge('b', 'ba'),   // bedroom ↔ bathroom   (A-2: morning-routine adjacency)
    ];
    return { rooms, edges };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('validateApartmentLayout — orchestrator aggregate', () => {

    // ─── Empty / healthy baselines ─────────────────────────────────────────
    it('empty apartment (no rooms, no edges) → zeroed report', () => {
        const r = validateApartmentLayout({ rooms: [], edges: [] });
        expect(r.errors).toBe(0);
        expect(r.warnings).toBe(0);
        expect(r.total).toBe(0);
        expect(r.dimensional).toEqual([]);
        expect(r.topology).toEqual([]);
        expect(r.violationsByClass).toEqual({});
    });

    it('healthy apartment passes every validator (zero violations)', () => {
        const r = validateApartmentLayout(healthyApartment());
        // If this ever fails, the message will list the offenders.
        expect({
            errors: r.errors,
            warnings: r.warnings,
            dimensional: r.dimensional.map(v => `${v.classId} ${v.roomId}`),
            topology: r.topology.map(v => `${v.classId} ${v.roomAId}↔${v.roomBTypeName}`),
        }).toEqual({
            errors: 0,
            warnings: 0,
            dimensional: [],
            topology: [],
        });
        expect(r.total).toBe(0);
        expect(passesLegality(r)).toBe(true);
    });

    // ─── Single-defect scenarios ───────────────────────────────────────────
    it('single G-1 violation (corridor 12 m²) → errors=1, dimensional=1, topology=0', () => {
        const base = healthyApartment();
        const rooms = base.rooms.map(r =>
            r.id === 'c' ? { ...r, areaM2: 12 } : r);
        const r = validateApartmentLayout({ rooms, edges: base.edges });
        expect(r.errors).toBe(1);
        expect(r.warnings).toBe(0);
        expect(r.total).toBe(1);
        expect(r.dimensional).toHaveLength(1);
        expect(r.topology).toHaveLength(0);
        expect(r.dimensional[0]!.classId).toBe('G-1');
        expect(r.violationsByClass).toEqual({ 'G-1': 1 });
    });

    it('single A-2 (preferred) WARNING → warnings=1, errors=0', () => {
        // Drop the b↔ba edge from the healthy baseline → preferred
        // bedroom↔bathroom adjacency now violates as a warning.
        const base = healthyApartment();
        const edges = base.edges.filter(e =>
            !((e.aId === 'b' && e.bId === 'ba') || (e.aId === 'ba' && e.bId === 'b')));
        const r = validateApartmentLayout({ rooms: base.rooms, edges });
        expect(r.errors).toBe(0);
        expect(r.warnings).toBe(1);
        expect(r.total).toBe(1);
        expect(r.dimensional).toHaveLength(0);
        expect(r.topology).toHaveLength(1);
        expect(r.topology[0]!.classId).toBe('A-2');
        expect(r.topology[0]!.severity).toBe('warning');
        expect(r.violationsByClass).toEqual({ 'A-2': 1 });
    });

    // ─── Multi-defect across both arrays ───────────────────────────────────
    it('multiple defects across dimensional + topology → aggregate counts correct', () => {
        // G-1 fail: corridor 12 m² (error)
        // G-7 fail: bedroom externalFrontage 0.5 m (error)
        // A-2 fail: drop bedroom↔bathroom edge (warning)
        const base = healthyApartment();
        const rooms = base.rooms.map(r => {
            if (r.id === 'c') return { ...r, areaM2: 12 };
            if (r.id === 'b') return { ...r, externalFrontageM: 0.5 };
            return r;
        });
        const edges = base.edges.filter(e =>
            !((e.aId === 'b' && e.bId === 'ba') || (e.aId === 'ba' && e.bId === 'b')));
        const r = validateApartmentLayout({ rooms, edges });
        expect(r.errors).toBe(2);   // G-1 + G-7
        expect(r.warnings).toBe(1); // A-2
        expect(r.total).toBe(3);
        expect(r.dimensional).toHaveLength(2);
        expect(r.topology).toHaveLength(1);
    });

    // ─── violationsByClass tally ───────────────────────────────────────────
    it('violationsByClass groups correctly across dimensional + topology', () => {
        // Two G-1 violations: corridor 12 + bathroom 18.
        // One A-2 violation: drop bedroom↔bathroom edge.
        const base = healthyApartment();
        const rooms = base.rooms.map(r => {
            if (r.id === 'c') return { ...r, areaM2: 12 };
            if (r.id === 'ba') return { ...r, areaM2: 18 };
            return r;
        });
        const edges = base.edges.filter(e =>
            !((e.aId === 'b' && e.bId === 'ba') || (e.aId === 'ba' && e.bId === 'b')));
        const r = validateApartmentLayout({ rooms, edges });
        expect(r.violationsByClass).toEqual({ 'G-1': 2, 'A-2': 1 });
        expect(r.total).toBe(3);
    });

    // ─── Immutability ──────────────────────────────────────────────────────
    it('report shape is frozen — mutation throws in strict mode', () => {
        const r = validateApartmentLayout({ rooms: [], edges: [] });
        // The report object itself is frozen.
        expect(Object.isFrozen(r)).toBe(true);
        // Both violation arrays are frozen too.
        expect(Object.isFrozen(r.dimensional)).toBe(true);
        expect(Object.isFrozen(r.topology)).toBe(true);
        expect(Object.isFrozen(r.violationsByClass)).toBe(true);
        // Vitest test files run as ESM ⇒ strict mode ⇒ push() throws.
        expect(() => {
            (r.dimensional as unknown as Array<unknown>).push({});
        }).toThrow();
        expect(() => {
            (r.topology as unknown as Array<unknown>).push({});
        }).toThrow();
    });

    // ─── passesLegality predicate ──────────────────────────────────────────
    it('passesLegality is TRUE when only warnings, FALSE on any error', () => {
        // Warnings only — drop bedroom↔bathroom for an A-2 warning.
        const base = healthyApartment();
        const warnEdges = base.edges.filter(e =>
            !((e.aId === 'b' && e.bId === 'ba') || (e.aId === 'ba' && e.bId === 'b')));
        const warnReport = validateApartmentLayout({ rooms: base.rooms, edges: warnEdges });
        expect(warnReport.errors).toBe(0);
        expect(warnReport.warnings).toBeGreaterThan(0);
        expect(passesLegality(warnReport)).toBe(true);

        // Inject a G-1 error → legality fails.
        const errRooms = base.rooms.map(r =>
            r.id === 'c' ? { ...r, areaM2: 12 } : r);
        const errReport = validateApartmentLayout({ rooms: errRooms, edges: base.edges });
        expect(errReport.errors).toBeGreaterThan(0);
        expect(passesLegality(errReport)).toBe(false);
    });

    // ─── Single edge fires BOTH A-3 (error) + A-5 (warning) ────────────────
    it('a single kitchen↔bedroom edge co-fires A-3 (error) AND A-5 (warning)', () => {
        // Minimal layout: only the two rooms + the offending edge. Strip the
        // ambient mandatory-adjacency rules by not introducing entrance_hall
        // / bathroom / etc. (kitchen + bedroom alone don't trigger A-1).
        const rooms: ApartmentLayoutRoom[] = [
            room('k', 'kitchen', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 3, externalFrontageM: 3,
            }),
            // Give the bedroom a corridor neighbour later — but here we
            // explicitly KEEP it adjacent only to kitchen to isolate co-firing.
            room('bd', 'bedroom', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 2, externalFrontageM: 2,
            }),
        ];
        const r = validateApartmentLayout({
            rooms,
            edges: [edge('k', 'bd')],
        });
        // The kitchen↔bedroom edge MUST appear in BOTH A-3 + A-5.
        const a3 = r.topology.filter(v => v.classId === 'A-3');
        const a5 = r.topology.filter(v => v.classId === 'A-5');
        expect(a3).toHaveLength(1);
        expect(a5).toHaveLength(1);
        expect(a3[0]!.severity).toBe('error');
        expect(a5[0]!.severity).toBe('warning');
        // The aggregates must reflect co-firing.
        expect(r.violationsByClass['A-3']).toBe(1);
        expect(r.violationsByClass['A-5']).toBe(1);
        // At minimum 1 error from A-3 and 1 warning from A-5 (other A-4 fires
        // are not under test here — we assert the lower bound).
        expect(r.errors).toBeGreaterThanOrEqual(1);
        expect(r.warnings).toBeGreaterThanOrEqual(1);
    });

    // ─── Topology-empty edges ──────────────────────────────────────────────
    it('empty edges + populated rooms → topology may fire (A-1 always rules), dimensional runs normally', () => {
        // Healthy rooms with NO edges: dimensional should produce zero
        // violations (geometry is healthy); topology will surface A-1
        // 'always' rules (entrance_hall must reach social/circulation +
        // bathroom must reach corridor) because we removed every edge.
        const base = healthyApartment();
        const r = validateApartmentLayout({ rooms: base.rooms, edges: [] });
        expect(r.dimensional).toEqual([]);
        // Topology must contain at least the entrance_hall + bathroom A-1
        // failures (mandatory 'always' rules).
        const a1 = r.topology.filter(v => v.classId === 'A-1');
        expect(a1.length).toBeGreaterThanOrEqual(2);
        // No dimensional defects ⇒ all defects came from topology.
        expect(r.total).toBe(r.topology.length);
    });

    // ─── Determinism ───────────────────────────────────────────────────────
    it('same input ⇒ same report shape (pure)', () => {
        const a = validateApartmentLayout(healthyApartment());
        const b = validateApartmentLayout(healthyApartment());
        expect(a.total).toBe(b.total);
        expect(a.errors).toBe(b.errors);
        expect(a.warnings).toBe(b.warnings);
        expect(a.violationsByClass).toEqual(b.violationsByClass);
    });

    // ─── Input not mutated ─────────────────────────────────────────────────
    it('input rooms + edges are NOT mutated by the orchestrator', () => {
        const input = healthyApartment();
        const roomsBefore = JSON.stringify(input.rooms);
        const edgesBefore = JSON.stringify(input.edges);
        validateApartmentLayout(input);
        expect(JSON.stringify(input.rooms)).toBe(roomsBefore);
        expect(JSON.stringify(input.edges)).toBe(edgesBefore);
    });

    // ─── Dimensional ordering (G-1 → G-2 → G-3 → G-5 → G-6 → G-7 → G-8 → G-10) ─
    it('dimensional violations are emitted in fixed validator order', () => {
        // Trigger ONE violation per dimensional validator so we can assert the
        // emit order without ambiguity:
        //   G-1:  corridor too big (area 12)
        //   G-2:  corridor too wide (width 3.0)
        //   G-3:  bedroom 6×1 (aspect 6:1)
        //   G-5:  bedroom usable wall too short (0.5 m)
        //   G-6:  another corridor too narrow (width 0.5)
        //   G-7:  living frontage too short (0.5 m)
        //   G-8:  social ≤ private (living 12 vs master 14) → fires on living
        //   G-10: bedroom glazed-to-floor ratio below 0.10
        const rooms: ApartmentLayoutRoom[] = [
            // For G-1+G-2 — single corridor over both caps (width 3.0 > 2.5,
            // area 12 > 8). Aspect skipped (corridor → Infinity).
            room('c1', 'corridor', {
                areaM2: 12, widthM: 3.0, lengthM: 4.0,
                longestUsableWallM: 0, externalFrontageM: 0,
            }),
            // G-3 + G-5 — long thin bedroom (6×1 aspect 6:1, usable wall 0.5 m).
            // Also trips G-10: glazedAreaM2 explicitly 0 (no daylight).
            room('b1', 'bedroom', {
                areaM2: 6, widthM: 1, lengthM: 6,
                longestUsableWallM: 0.5, externalFrontageM: 2,
                glazedAreaM2: 0,
            }),
            // G-6 — separate corridor under 1.0 m circulation floor.
            room('c2', 'corridor', {
                areaM2: 2, widthM: 0.5, lengthM: 4.0,
                longestUsableWallM: 0, externalFrontageM: 0,
            }),
            // G-7 + G-8 (rule a) — living with 0.5 m external frontage AND
            // smaller than the master (12 < 14) so the apartment-level
            // hierarchy rule fires on the largest social room.
            room('l1', 'living_room', {
                areaM2: 12, widthM: 4, lengthM: 3,
                longestUsableWallM: 3, externalFrontageM: 0.5,
            }),
            // The "private" reference for the G-8 hierarchy rule — must be
            // strictly larger than living_room. Otherwise healthy.
            room('m1', 'master_bedroom', {
                areaM2: 14, widthM: 3.5, lengthM: 4,
                longestUsableWallM: 2.0, externalFrontageM: 2.0,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        // The orchestrator runs G-1 → G-2 → G-3 → G-5 → G-6 → G-7 → G-8 → G-10.
        // Collect the emitted classIds in order and confirm each class shows
        // up exactly where expected (and earlier than later-class entries).
        const order = r.dimensional.map(v => v.classId);
        const firstIndexOf = (cls: string) => order.indexOf(cls);
        expect(firstIndexOf('G-1')).toBeGreaterThanOrEqual(0);
        expect(firstIndexOf('G-2')).toBeGreaterThan(firstIndexOf('G-1'));
        expect(firstIndexOf('G-3')).toBeGreaterThan(firstIndexOf('G-2'));
        expect(firstIndexOf('G-5')).toBeGreaterThan(firstIndexOf('G-3'));
        expect(firstIndexOf('G-6')).toBeGreaterThan(firstIndexOf('G-5'));
        expect(firstIndexOf('G-7')).toBeGreaterThan(firstIndexOf('G-6'));
        expect(firstIndexOf('G-8')).toBeGreaterThan(firstIndexOf('G-7'));
        expect(firstIndexOf('G-10')).toBeGreaterThan(firstIndexOf('G-8'));
    });

    // ─── summarise() helper ────────────────────────────────────────────────
    it('summarise: empty report ⇒ "0 violations"', () => {
        const r = validateApartmentLayout({ rooms: [], edges: [] });
        expect(summarise(r)).toBe('0 violations');
    });

    it('summarise: mixed errors + warnings ⇒ correct sentence + per-class tally', () => {
        const rooms: ApartmentLayoutRoom[] = [
            room('c', 'corridor', {
                areaM2: 12, widthM: 1.5, lengthM: 4,
                longestUsableWallM: 0, externalFrontageM: 0,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        // Exactly one G-1 violation, zero warnings.
        const summary = summarise(r);
        expect(summary).toMatch(/^1 violations: 1 error, 0 warnings/);
        expect(summary).toContain('G-1×1');
    });

    // ─── G-8 hierarchy (apartment-level relational) ────────────────────────
    it('G-8 hierarchy: largest social ≤ largest private surfaces under dimensional', () => {
        // living_room 10 m² is NOT larger than master_bedroom 20 m² ⇒ G-8 rule
        // (a) fires on the living_room. No kitchen ⇒ rule (b) skipped.
        const rooms: ApartmentLayoutRoom[] = [
            room('l', 'living_room', {
                areaM2: 10, widthM: 2.5, lengthM: 4,
                longestUsableWallM: 2.5, externalFrontageM: 2.5,
            }),
            room('m', 'master_bedroom', {
                areaM2: 20, widthM: 4, lengthM: 5,
                longestUsableWallM: 2.0, externalFrontageM: 2.0,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        const g8 = r.dimensional.filter(v => v.classId === 'G-8');
        expect(g8).toHaveLength(1);
        expect(g8[0]!.roomId).toBe('l');
        expect(g8[0]!.severity).toBe('error');
        // G-8 contributes to violationsByClass.
        expect(r.violationsByClass['G-8']).toBe(1);
    });

    it('G-8 hierarchy: kitchen smaller than smallest private fires rule (b)', () => {
        // Largest social (living 30) > largest private (master 25) so rule (a)
        // passes. Smallest private = bedroom 12. Kitchen 8 < 12 ⇒ rule (b)
        // fires on the kitchen.
        const rooms: ApartmentLayoutRoom[] = [
            room('l', 'living_room', {
                areaM2: 30, widthM: 5, lengthM: 6,
                longestUsableWallM: 3, externalFrontageM: 3,
            }),
            room('m', 'master_bedroom', {
                areaM2: 25, widthM: 5, lengthM: 5,
                longestUsableWallM: 2.5, externalFrontageM: 2.5,
            }),
            room('b', 'bedroom', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 2, externalFrontageM: 2,
            }),
            room('k', 'kitchen', {
                areaM2: 8, widthM: 2.5, lengthM: 3.2,
                longestUsableWallM: 2.5, externalFrontageM: 2.5,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        const g8 = r.dimensional.filter(v => v.classId === 'G-8');
        expect(g8).toHaveLength(1);
        expect(g8[0]!.roomId).toBe('k');
        expect(g8[0]!.severity).toBe('error');
    });

    // ─── G-10 lighting (per-room glazed/floor ratio) ───────────────────────
    it('G-10 lighting: living_room with glazedAreaM2=0 fires G-10 error', () => {
        const rooms: ApartmentLayoutRoom[] = [
            room('l', 'living_room', {
                areaM2: 30, widthM: 5, lengthM: 6,
                longestUsableWallM: 3, externalFrontageM: 3,
                glazedAreaM2: 0,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        const g10 = r.dimensional.filter(v => v.classId === 'G-10');
        expect(g10).toHaveLength(1);
        expect(g10[0]!.roomId).toBe('l');
        expect(g10[0]!.severity).toBe('error');
        expect(r.violationsByClass['G-10']).toBe(1);
    });

    it('G-10 lighting: SKIPS no-daylight rooms (corridor, bathroom) even with glazedAreaM2=0', () => {
        const rooms: ApartmentLayoutRoom[] = [
            room('c', 'corridor', {
                areaM2: 4, widthM: 1.2, lengthM: 3.3,
                longestUsableWallM: 0, externalFrontageM: 0,
                glazedAreaM2: 0,
            }),
            room('ba', 'bathroom', {
                areaM2: 5, widthM: 2, lengthM: 2.5,
                longestUsableWallM: 1.5, externalFrontageM: 0,
                glazedAreaM2: 0,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        expect(r.dimensional.filter(v => v.classId === 'G-10')).toHaveLength(0);
    });

    // ─── A-6 wet-cluster (warning) ─────────────────────────────────────────
    it('A-6 wet-cluster: two wet rooms with no shared edge fire one A-6 each', () => {
        // bathroom + kitchen both wet, no edge between them ⇒ each fires one
        // A-6 warning.
        const rooms: ApartmentLayoutRoom[] = [
            room('ba', 'bathroom', {
                areaM2: 5, widthM: 2, lengthM: 2.5,
                longestUsableWallM: 1.5, externalFrontageM: 0,
            }),
            room('k', 'kitchen', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 3, externalFrontageM: 3,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        const a6 = r.topology.filter(v => v.classId === 'A-6');
        expect(a6).toHaveLength(2);
        expect(a6.every(v => v.severity === 'warning')).toBe(true);
        expect(new Set(a6.map(v => v.roomAId))).toEqual(new Set(['ba', 'k']));
        expect(r.violationsByClass['A-6']).toBe(2);
    });

    it('A-6 wet-cluster: two wet rooms WITH a shared edge fire zero A-6', () => {
        const rooms: ApartmentLayoutRoom[] = [
            room('ba', 'bathroom', {
                areaM2: 5, widthM: 2, lengthM: 2.5,
                longestUsableWallM: 1.5, externalFrontageM: 0,
            }),
            room('u', 'utility_room', {
                areaM2: 6, widthM: 2, lengthM: 3,
                longestUsableWallM: 1.5, externalFrontageM: 0,
            }),
        ];
        const r = validateApartmentLayout({
            rooms,
            edges: [edge('ba', 'u')],
        });
        expect(r.topology.filter(v => v.classId === 'A-6')).toHaveLength(0);
    });

    // ─── A-7 frontage-topology (error) ─────────────────────────────────────
    it('A-7 frontage-topology: bedroom with hasExteriorEdge=false fires A-7 error', () => {
        const rooms: ApartmentLayoutRoom[] = [
            room('b', 'bedroom', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 2, externalFrontageM: 2,
                hasExteriorEdge: false,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        const a7 = r.topology.filter(v => v.classId === 'A-7');
        expect(a7).toHaveLength(1);
        expect(a7[0]!.roomAId).toBe('b');
        expect(a7[0]!.severity).toBe('error');
        expect(r.violationsByClass['A-7']).toBe(1);
    });

    it('A-7 frontage-topology: SKIPS non-habitable rooms (corridor, bathroom) without exterior edge', () => {
        const rooms: ApartmentLayoutRoom[] = [
            room('c', 'corridor', {
                areaM2: 4, widthM: 1.2, lengthM: 3.3,
                longestUsableWallM: 0, externalFrontageM: 0,
                hasExteriorEdge: false,
            }),
            room('ba', 'bathroom', {
                areaM2: 5, widthM: 2, lengthM: 2.5,
                longestUsableWallM: 1.5, externalFrontageM: 0,
                hasExteriorEdge: false,
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        expect(r.topology.filter(v => v.classId === 'A-7')).toHaveLength(0);
    });

    // ─── violationsByClass spans all 15 validator classes ──────────────────
    it('violationsByClass counts G-8 / G-10 / A-6 / A-7 alongside legacy classes', () => {
        // One violation per NEW class plus one legacy G-1 to prove the tally
        // mixes old + new classes correctly.
        const rooms: ApartmentLayoutRoom[] = [
            // G-1 — corridor over the area cap.
            room('c', 'corridor', {
                areaM2: 12, widthM: 1.5, lengthM: 4,
                longestUsableWallM: 0, externalFrontageM: 0,
            }),
            // G-8 + G-10 + A-7 — living smaller than master (G-8 rule a) AND
            // glazedAreaM2 = 0 (G-10) AND no exterior edge (A-7).
            room('l', 'living_room', {
                areaM2: 10, widthM: 2.5, lengthM: 4,
                longestUsableWallM: 2.5, externalFrontageM: 2.5,
                hasExteriorEdge: false,
                glazedAreaM2: 0,
            }),
            // The G-8 "private" reference room.
            room('m', 'master_bedroom', {
                areaM2: 20, widthM: 4, lengthM: 5,
                longestUsableWallM: 2.0, externalFrontageM: 2.0,
            }),
            // A-6 wet-cluster: bathroom + kitchen (no edge between them).
            room('ba', 'bathroom', {
                areaM2: 5, widthM: 2, lengthM: 2.5,
                longestUsableWallM: 1.5, externalFrontageM: 0,
            }),
            room('k', 'kitchen', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 3, externalFrontageM: 3,
            }),
        ];
        // No edges between bathroom + kitchen ⇒ each fires A-6.
        const r = validateApartmentLayout({ rooms, edges: [] });
        // The tally MUST contain (at minimum) the four new-class entries with
        // the expected counts. Other legacy classes may also appear (A-1
        // mandatory-adjacency fires when no edges are present) — we test the
        // new-class counts explicitly without over-constraining the others.
        // G-8 fires TWICE here: rule (a) on living (smaller than master) AND
        // rule (b) on kitchen (smaller than smallest private = master 20 m²).
        // Both attribution sites are intentional — see `hierarchy.ts` header.
        expect(r.violationsByClass['G-1']).toBe(1);
        expect(r.violationsByClass['G-8']).toBe(2);
        expect(r.violationsByClass['G-10']).toBe(1);
        expect(r.violationsByClass['A-6']).toBe(2);   // bathroom + kitchen
        expect(r.violationsByClass['A-7']).toBe(1);   // living_room
    });

    // ─── Topology ordering: A-1 → ... → A-5 → A-6 → A-7 ────────────────────
    it('topology validators are emitted in fixed validator order (A-6 then A-7 last)', () => {
        // Construct rooms that fire one of each topology class with no edges
        // (A-1 mandatory fires by default; A-6 fires for unclustered wet
        // rooms; A-7 fires for a habitable room without an exterior edge).
        const rooms: ApartmentLayoutRoom[] = [
            room('h', 'entrance_hall', {
                areaM2: 6, widthM: 2, lengthM: 3,
                longestUsableWallM: 1.5, externalFrontageM: 0,
            }),
            room('ba', 'bathroom', {
                areaM2: 5, widthM: 2, lengthM: 2.5,
                longestUsableWallM: 1.5, externalFrontageM: 0,
            }),
            room('k', 'kitchen', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 3, externalFrontageM: 3,
            }),
            room('b', 'bedroom', {
                areaM2: 12, widthM: 3, lengthM: 4,
                longestUsableWallM: 2, externalFrontageM: 2,
                hasExteriorEdge: false,   // → A-7
            }),
        ];
        const r = validateApartmentLayout({ rooms, edges: [] });
        const order = r.topology.map(v => v.classId);
        const firstIndexOf = (cls: string) => order.indexOf(cls);
        // A-1 is the first topology class to fire (entrance_hall + bathroom
        // 'always' mandatory rules trigger on the empty edge set).
        expect(firstIndexOf('A-1')).toBeGreaterThanOrEqual(0);
        // A-6 + A-7 must come AFTER any A-1…A-5 violation that fired.
        expect(firstIndexOf('A-6')).toBeGreaterThanOrEqual(0);
        expect(firstIndexOf('A-7')).toBeGreaterThan(firstIndexOf('A-6'));
        expect(firstIndexOf('A-6')).toBeGreaterThan(firstIndexOf('A-1'));
    });
});
