// §CIRCULATION-INTEGRITY-AUDIT (founder production report, 2026-08-13) — SPEC-CIRCULATION-INTEGRITY.
//
// The founder's first test of the three generators reported THREE defects:
//   1. "the corridor doesn't reach the relevant bedrooms"  → UNREACHABLE ROOM
//   2. "rooms without doors"                               → DOORLESS ROOM
//   3. "furniture in front of a door"                      → BLOCKED DOOR CLEARANCE
//
// This file is the DIAGNOSTIC INSTRUMENT for defects 1 and 2 (defect 3 lives in
// `furnitureDoorClearanceAudit.test.ts`). It is NOT a fixture test: it drives the REAL
// production entry `generateDeterministicLayouts` (C74 §3.4 — a fixture that supplies the
// value under test proves nothing) over a deterministic sweep of (shell × program) combos
// and measures the SHIPPED WINNER — `options[0]`, the option the modal actually presents.
//
// WHY A NEW INSTRUMENT WHEN `circulationRobustnessSweep.test.ts` EXISTS:
// that sweep measures `enumerateLayouts` (the candidate producer) and reports its
// `sound` rate only over candidates that are ALREADY `hardValid`. It therefore cannot see
// the defect the founder is looking at, which is precisely what happens when NO candidate is
// hard-valid: `§TOPO-HARD-REJECT-ALL` deliberately ships the LEAST-BAD invalid candidate
// ("never an empty result"). This probe measures the shipped artefact unconditionally.
//
// The two predicates live in `./helpers/circulationPredicates.ts` (shared with the house +
// residential arms). `reachability` is a FAITHFUL REPLICA of the production
// `computeCirculationReachability` — REPLICATED rather than imported because the predicate
// lives at L7 (apps/editor) and this engine is L2, which is itself a finding: the generator
// that SHIPS the layout cannot call the invariant that JUDGES it.
//
// Reporting only: the assertions pin the harness's COVERAGE and the measured baselines, so a
// regression is visible. They do not hard-gate the (non-zero) defect rate — that gate is the
// SPEC's proposed work, not this audit's.

import { describe, expect, it } from 'vitest';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, LayoutOption, LayoutRoom, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';
import {
    reachability, doorlessRoomNames, type ReachVerdict,
} from './helpers/circulationPredicates.js';

const CONSTRAINTS: ApartmentConstraints =
    { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights =
    { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** Deterministic convex-quad plate width×depth with an optional shear (m). No Math.random. */
function plate(width: number, depth: number, skew: number): Array<{ x: number; z: number }> {
    return [
        { x: -skew, z: skew * 0.5 }, { x: width + skew * 0.5, z: -skew },
        { x: width - skew, z: depth + skew * 0.6 }, { x: skew * 0.4, z: depth - skew * 0.3 },
    ];
}

export interface SweepRow {
    readonly label: string;
    readonly shipped: boolean;
    readonly reach: ReachVerdict | null;
    readonly doorless: readonly string[];
    readonly option: LayoutOption | null;
}

/** Drives the REAL production entry over the deterministic (shell × program) space. */
export function sweepApartments(): SweepRow[] {
    const aspects = [1.0, 1.35, 1.75];
    const skews = [0, 0.8, 1.8];
    const areaScales = [0.92, 1.05, 1.18];
    const programs: ApartmentProgram[] = [
        { bedrooms: 1, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
        { bedrooms: 2, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
        { bedrooms: 3, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: false, livingRoom: true, entranceHall: true },
        { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: false },
    ];
    const targetAreaOf = (p: ApartmentProgram): number => 58 + p.bedrooms * 34;

    const rows: SweepRow[] = [];
    let i = 0;
    for (const prog of programs) for (const a of aspects) for (const sk of skews) for (const scale of areaScales) {
        i++;
        const area = targetAreaOf(prog) * scale;
        const w = Math.sqrt(area / a);
        const poly = plate(w, w * a, sk);
        const shell: ShellAnalysis = {
            netAreaM2: area, widthM: w, depthM: w * a, perimeter: poly, faces: [],
        };
        const label = `b${prog.bedrooms}-a${a}-s${sk}-x${scale}`;
        let out: ReturnType<typeof generateDeterministicLayouts>;
        try {
            out = generateDeterministicLayouts(shell, prog, CONSTRAINTS, WEIGHTS, 1);
        } catch { out = []; }
        if (out.length === 0) { rows.push({ label, shipped: false, reach: null, doorless: [], option: null }); continue; }
        const win = out[0]!;
        rows.push({
            label, shipped: true, option: win,
            reach: reachability(win), doorless: doorlessRoomNames(win),
        });
    }
    return rows;
}

describe('§CIRCULATION-INTEGRITY-AUDIT — apartmentLayout at HEAD', () => {
    it('measures UNREACHABLE-ROOM and DOORLESS-ROOM rates on the SHIPPED winner', () => {
        const rows = sweepApartments();
        const shipped = rows.filter(r => r.shipped);
        const noDoorGraph = shipped.filter(r => !r.reach!.hasDoorGraph);
        const unreachable = shipped.filter(r => r.reach!.fraction < 1);
        const doorless = shipped.filter(r => r.doorless.length > 0);

        const pct = (n: number, d: number): string => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
        const sample = (rs: SweepRow[], f: (r: SweepRow) => string): string =>
            rs.slice(0, 4).map(r => `${r.label}: ${f(r)}`).join(' | ') || '(none)';
        // eslint-disable-next-line no-console
        console.log(
            `\n[§CIRCULATION-INTEGRITY-AUDIT · apartmentLayout] ${rows.length} combos through ` +
            `generateDeterministicLayouts (the production entry):\n` +
            `  shipped a winner:            ${shipped.length}/${rows.length} (${pct(shipped.length, rows.length)})\n` +
            `  winner has NO door graph:    ${noDoorGraph.length}/${shipped.length} (${pct(noDoorGraph.length, shipped.length)})\n` +
            `  DEFECT 1 UNREACHABLE ROOM:   ${unreachable.length}/${shipped.length} (${pct(unreachable.length, shipped.length)}) of shipped winners\n` +
            `     e.g. ${sample(unreachable, r => r.reach!.unreachedRoomNames.join(','))}\n` +
            `  DEFECT 2 DOORLESS ROOM:      ${doorless.length}/${shipped.length} (${pct(doorless.length, shipped.length)}) of shipped winners\n` +
            `     e.g. ${sample(doorless, r => r.doorless.join(','))}\n`,
        );

        // COVERAGE pin (the contract that matters here): the harness ran the real engine broadly.
        expect(rows.length).toBeGreaterThanOrEqual(100);
        expect(shipped.length).toBeGreaterThanOrEqual(80);
        // The door graph must be present, or every number above is measuring wall-adjacency.
        expect(noDoorGraph.length).toBe(0);
    });

    // C70 §5.6 — the predicates must be watched RED. These two cases break the property
    // deliberately and assert the instrument reports the break (an always-green probe is
    // worthless). Hand-built options here are the NEGATIVE control ONLY; every measured
    // number above comes from the real engine.
    it('the reachability predicate goes RED on a sealed room (negative control)', () => {
        const sealed: LayoutOption = {
            summary: '', corridorWidthMin: 900, walls: [], doors: [],
            rooms: [
                { name: 'Hall', type: 'hall', area: 10, windowCount: 0, hasDirectAccess: true, adjacentTo: ['Living', 'Bedroom 1'], doorAdjacentTo: ['Living'] },
                { name: 'Living', type: 'living', area: 20, windowCount: 1, hasDirectAccess: true, adjacentTo: ['Hall'], doorAdjacentTo: ['Hall'] },
                { name: 'Bedroom 1', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: false, adjacentTo: ['Hall'], doorAdjacentTo: [] },
            ] as LayoutRoom[],
        };
        expect(reachability(sealed).fraction).toBeLessThan(1);
        expect(reachability(sealed).unreachedRoomNames).toEqual(['Bedroom 1']);
        expect(doorlessRoomNames(sealed)).toEqual(['Bedroom 1']);

        // …and GREEN once the door exists (the restore half of C70 §5.6).
        const fixed: LayoutOption = {
            ...sealed,
            rooms: sealed.rooms.map(r => r.name === 'Bedroom 1'
                ? { ...r, doorAdjacentTo: ['Hall'] }
                : r.name === 'Hall' ? { ...r, doorAdjacentTo: ['Living', 'Bedroom 1'] } : r),
        };
        expect(reachability(fixed).fraction).toBe(1);
        expect(doorlessRoomNames(fixed)).toEqual([]);
    });

    // §DUP-NAME-SAFE — MEASURED LIMIT OF THE PRODUCTION PREDICATE (L-855).
    //
    // §DUP-NAME-SAFE (ADR-0098) keys the BFS by ARRAY INDEX and resolves a referenced NAME to
    // ALL rooms bearing it. That fixes the collapse-to-one-node half of the old bug, but it does
    // NOT make the predicate duplicate-safe: because the reverse edge is also minted for every
    // bearer, a room whose OWN `doorAdjacentTo` is EMPTY still receives an inbound edge from any
    // neighbour that names its duplicate. Below, `Hall.doorAdjacentTo = ['Storage']` links the
    // hall to BOTH storages — so the SEALED one reads as reached and `fraction === 1`.
    //
    // This is watched-red-deliberately (C70 §5.6) and pinned as CURRENT BEHAVIOUR, not as
    // desired behaviour. It is LATENT, not active: `emitGeometry`'s §DUP-NAME-UNIQUE pass mints
    // a unique display name per space, so engine output does not currently trigger it. The next
    // test measures that guard rather than assuming it.
    it('MEASURED: a sealed DUPLICATE-NAMED room is WRONGLY counted reached (latent, name-keyed graph)', () => {
        const dup: LayoutOption = {
            summary: '', corridorWidthMin: 900, walls: [], doors: [],
            rooms: [
                { name: 'Hall', type: 'hall', area: 10, windowCount: 0, hasDirectAccess: true, adjacentTo: [], doorAdjacentTo: ['Storage'] },
                { name: 'Storage', type: 'storage', area: 4, windowCount: 0, hasDirectAccess: true, adjacentTo: [], doorAdjacentTo: ['Hall'] },
                { name: 'Storage', type: 'storage', area: 4, windowCount: 0, hasDirectAccess: false, adjacentTo: [], doorAdjacentTo: [] },
            ] as LayoutRoom[],
        };
        // The physically sealed room IS doorless — the door-count arm sees it correctly…
        expect(doorlessRoomNames(dup)).toEqual(['Storage']);
        // …but the NAME-keyed reachability BFS does not. THIS IS THE DEFECT, pinned.
        expect(reachability(dup).fraction).toBe(1);
        // Give the two storages distinct names (what §DUP-NAME-UNIQUE does) and it reads true.
        const unique: LayoutOption = {
            ...dup,
            rooms: dup.rooms.map((r, i) => (i === 2 ? { ...r, name: 'Storage 2' } : r)),
        };
        expect(reachability(unique).fraction).toBeLessThan(1);
        expect(reachability(unique).unreachedRoomNames).toEqual(['Storage 2']);
    });

    // The guard the predicate above DEPENDS ON, measured on real engine output rather than
    // assumed: every shipped winner must carry globally unique room names.
    it('shipped winners carry UNIQUE room names (the §DUP-NAME-UNIQUE guard, measured)', () => {
        const dupRows: string[] = [];
        for (const row of sweepApartments()) {
            if (!row.option) continue;
            const seen = new Set<string>(); const dups = new Set<string>();
            for (const r of row.option.rooms) { if (seen.has(r.name)) dups.add(r.name); seen.add(r.name); }
            if (dups.size > 0) dupRows.push(`${row.label}: ${[...dups].sort().join(',')}`);
        }
        // eslint-disable-next-line no-console
        console.log('\n[§CIRCULATION-INTEGRITY-AUDIT · dup-names] winners with duplicate room names: ' +
            `${dupRows.length} — ${dupRows.slice(0, 5).join(' | ') || '(none)'}\n`);
        expect(dupRows).toEqual([]);
    });
});
