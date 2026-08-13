// §CI-1-BANNER (SPEC-49 §4 CI-1; founder decision 2026-08-13) — the HOUSE storey
// circulation verdict + the blocking banner that names the sealed rooms.
//
// THE DECISION UNDER TEST. When every candidate layout for a house storey is
// HARD-INVALID (a room is sealed — unreachable and/or doorless) PRYZM ships the
// least-bad storey AND raises a blocking banner naming the sealed rooms and the
// failed rule. It does NOT refuse the storey. It does NOT ship silently — that was
// the one option explicitly ruled out (SPEC-49 §4, CI-1 row).
//
// METHOD (C74 §3.4 — a test whose FIXTURE supplies the value under test proves
// nothing). Every arm drives the REAL production entry `generateHouseLayout`, and
// every "is this storey actually sealed?" judgement is made by the INDEPENDENT
// predicates in `helpers/circulationPredicates.ts` — a faithful replica of the L7 UI
// predicate `computeCirculationReachability`, written from the door graph, with no
// knowledge of `LayoutOption.circulation`. So the banner is checked against a second
// opinion computed a different way, not against itself.
//
// THE STATES ARE NEVER COLLAPSED (C70 §2.2). `circulation === undefined` means NOT
// MEASURED, never "sound". ARM C drives the real engine, STRIPS the verdict, and
// asserts the report says UNKNOWN-with-a-reason and specifically NOT a pass. That is
// the single most likely way to get this feature wrong.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import {
    buildHouseCirculationReport,
    type StoreyCirculationInput,
} from '../src/workflows/houseLayout/circulationBanner.js';
import { polygonAreaM2, type ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoredLayoutOption, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';
import { reachability, doorlessRoomNames } from './helpers/circulationPredicates.js';

const CONSTRAINTS: ApartmentConstraints =
    { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights =
    { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

function mkShell(poly: Pt[]): ShellAnalysis {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z);
        x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z);
    }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
}
const rect = (w: number, d: number): Pt[] =>
    [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];

/** The SAME deterministic house sweep the §CIRCULATION-INTEGRITY-AUDIT arm uses, so
 *  the population this banner is judged over is the population SPEC-49 measured
 *  (12/24 storeys with an unreachable room, 11/24 with a doorless room). */
const PLATES: Array<[number, number]> = [[12, 10], [17.491, 13.416], [10, 8], [14, 11]];
const PROGRAMS: ApartmentProgram[] = [
    { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
    { bedrooms: 3, bathrooms: 2, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
];
const STOREY_COUNTS = [1, 2];

type House = ReturnType<typeof generateHouseLayout>;

interface SweptStorey {
    readonly label: string;
    readonly storeyIndex: number;
    readonly option: ScoredLayoutOption;
    /** The house result this storey belongs to (carries the accumulated report). */
    readonly house: House;
    /** INDEPENDENT second opinion (helpers, not `option.circulation`). */
    readonly indepUnreached: readonly string[];
    readonly indepDoorless: readonly string[];
}

/** Drive the real orchestrator across the sweep ONCE; every arm reads this. */
function sweep(): { storeys: SweptStorey[]; houses: House[] } {
    const storeys: SweptStorey[] = [];
    const houses: House[] = [];
    for (const [w, d] of PLATES) for (const prog of PROGRAMS) for (const sc of STOREY_COUNTS) {
        const shell = mkShell(rect(w, d));
        const label = `${w}x${d}-b${prog.bedrooms}-s${sc}`;
        let res: House | null = null;
        try { res = generateHouseLayout(shell, prog, CONSTRAINTS, WEIGHTS, { storeyCount: sc }); } catch { res = null; }
        if (!res) continue;
        const house = res;
        houses.push(house);
        house.perStoreyLayout.forEach((opt, i) => {
            if (!opt) return;
            storeys.push({
                label: `${label}/F${i}`,
                storeyIndex: i,
                option: opt,
                house,
                indepUnreached: reachability(opt).unreachedRoomNames,
                indepDoorless: doorlessRoomNames(opt),
            });
        });
    }
    return { storeys, houses };
}

const SWEPT = sweep();
const isSealedIndependently = (s: SweptStorey): boolean =>
    s.indepUnreached.length > 0 || s.indepDoorless.length > 0;

describe('§CI-1-BANNER — ARM A: a storey with a SEALED room produces a banner NAMING that room', () => {
    it('finds sealed storeys in the real sweep (the SPEC-49 defect is still present)', () => {
        const sealed = SWEPT.storeys.filter(isSealedIndependently);
        // eslint-disable-next-line no-console
        console.log(
            `\n[§CI-1-BANNER] ${SWEPT.storeys.length} shipped storeys across ${SWEPT.houses.length} houses; ` +
            `${sealed.length} carry a sealed room (independent predicate).\n` +
            sealed.slice(0, 6).map(s =>
                `  ${s.label}: unreached=[${s.indepUnreached.join(',')}] doorless=[${s.indepDoorless.join(',')}]`,
            ).join('\n') + '\n',
        );
        expect(SWEPT.storeys.length).toBeGreaterThanOrEqual(20);
        expect(sealed.length).toBeGreaterThan(0);
    }, 180_000);

    it('marks every independently-sealed storey SEALED and names its rooms in the banner', () => {
        const sealed = SWEPT.storeys.filter(isSealedIndependently);
        expect(sealed.length).toBeGreaterThan(0);
        for (const s of sealed) {
            const v = s.house.circulation.storeys[s.storeyIndex];
            expect(v, `${s.label}: no per-storey verdict accumulated`).toBeDefined();
            expect(v!.status, `${s.label} should be SEALED`).toBe('sealed');

            // The banner exists, blocks, and lists THIS storey.
            const banner = s.house.circulation.banner;
            expect(banner, `${s.label}: sealed storey but no banner`).not.toBeNull();
            expect(banner!.severity).toBe('blocking');
            expect(banner!.sealedStoreys.map(x => x.storeyIndex)).toContain(s.storeyIndex);

            // NAMED, not counted. Every independently-doorless room must appear by name.
            // (`doorlessRoomNames` guards the 1-room option; the verdict does not, so
            //  compare only where the independent predicate had something to say.)
            const named = new Set([...v!.unreachableRoomNames, ...v!.doorlessRoomNames]);
            for (const room of s.indepDoorless) {
                expect(named.has(room), `${s.label}: doorless room "${room}" not named`).toBe(true);
            }
            // The rendered line carries the storey, the rooms and the failed rules.
            const line = banner!.lines.find(l => l.startsWith(`Storey ${s.storeyIndex} `));
            expect(line, `${s.label}: no banner line for storey ${s.storeyIndex}`).toBeTruthy();
            for (const room of s.indepDoorless) expect(line!).toContain(room);
            // A sealed storey ALWAYS names at least one failed rule (the founder asked
            // for "the failed rule", not just the rooms).
            expect(v!.failedRules.length, `${s.label}: sealed but no rule named`).toBeGreaterThan(0);
        }
    }, 180_000);

    it('the verdict doorless set EQUALS the independent doorless set (a second opinion, not itself)', () => {
        let compared = 0;
        for (const s of SWEPT.storeys) {
            if (s.option.rooms.length <= 1) continue;   // the helper's 1-room guard
            const v = s.house.circulation.storeys[s.storeyIndex]!;
            if (v.status === 'not-measured') continue;
            expect([...v.doorlessRoomNames].sort(), s.label).toEqual([...s.indepDoorless].sort());
            compared++;
        }
        expect(compared).toBeGreaterThanOrEqual(20);
    }, 180_000);
});

describe('§CI-1-BANNER — ARM B: a CLEAN storey produces NO banner entry', () => {
    it('marks independently-clean storeys SOUND and keeps them out of the banner', () => {
        const clean = SWEPT.storeys.filter(s =>
            !isSealedIndependently(s) &&
            s.house.circulation.storeys[s.storeyIndex]!.status === 'sound');
        // eslint-disable-next-line no-console
        console.log(`[§CI-1-BANNER] SOUND storeys: ${clean.length}/${SWEPT.storeys.length}`);
        expect(clean.length, 'the sweep produced no clean storey to test against').toBeGreaterThan(0);
        for (const s of clean) {
            const banner = s.house.circulation.banner;
            if (!banner) continue;
            expect(banner.sealedStoreys.map(x => x.storeyIndex)).not.toContain(s.storeyIndex);
            expect(banner.notMeasuredStoreys.map(x => x.storeyIndex)).not.toContain(s.storeyIndex);
        }
    }, 180_000);

    it('a house whose every storey is SOUND raises NO banner at all', () => {
        // Built from REAL engine output: take a storey the independent predicate calls
        // clean, and report over it alone. The fixture supplies the OPTION (engine-made),
        // never the verdict.
        const cleanStorey = SWEPT.storeys.find(s =>
            !isSealedIndependently(s) &&
            s.house.circulation.storeys[s.storeyIndex]!.status === 'sound');
        expect(cleanStorey, 'no clean storey in the sweep').toBeTruthy();
        const report = buildHouseCirculationReport([{
            storeyIndex: 0,
            levelId: 'storey-0',
            option: cleanStorey!.option,
            optionCount: 1,
        }]);
        expect(report.banner).toBeNull();
        expect(report.storeysSound).toBe(1);
        expect(report.storeysSealed).toBe(0);
        expect(report.storeysNotMeasured).toBe(0);
    }, 180_000);
});

describe('§CI-1-BANNER — ARM C: circulation === undefined is NOT MEASURED, never a pass', () => {
    it('a shipped option with NO verdict reports UNKNOWN with a reason, not SOUND', () => {
        const any = SWEPT.storeys[0];
        expect(any, 'sweep produced no storey').toBeTruthy();
        // Real engine output with the verdict REMOVED — exactly what an AI-produced or
        // hand-built option looks like. The absence is the INPUT; the handling of it is
        // the value under test.
        const stripped = { ...any!.option } as ScoredLayoutOption;
        delete (stripped as { circulation?: unknown }).circulation;
        expect(stripped.circulation).toBeUndefined();

        const report = buildHouseCirculationReport([
            { storeyIndex: 0, levelId: 'storey-0', option: stripped, optionCount: 1 },
        ]);
        const v = report.storeys[0]!;
        expect(v.status).toBe('not-measured');
        expect(v.status).not.toBe('sound');
        expect(v.notMeasuredReason).toBe('engine-verdict-absent');
        expect((v.notMeasuredDetail ?? '').length).toBeGreaterThan(0);
        // It must NOT be counted as sound anywhere in the aggregate.
        expect(report.storeysSound).toBe(0);
        expect(report.storeysNotMeasured).toBe(1);
        // And it must SURFACE — an unmeasured storey that raises nothing IS a silent pass.
        expect(report.banner).not.toBeNull();
        expect(report.banner!.severity).toBe('unknown');
        expect(report.banner!.notMeasuredStoreys.map(x => x.storeyIndex)).toEqual([0]);
        expect(report.banner!.lines.join(' ')).toContain('NOT MEASURED');
    }, 180_000);

    it('a storey with NO layout at all is NOT MEASURED with its own distinct reason', () => {
        const report = buildHouseCirculationReport([
            { storeyIndex: 0, levelId: 'storey-0', option: null, optionCount: 0 },
        ]);
        const v = report.storeys[0]!;
        expect(v.status).toBe('not-measured');
        expect(v.notMeasuredReason).toBe('no-layout-for-storey');
        // C75 §1.2 — two different facts must never print the same value.
        expect(v.notMeasuredReason).not.toBe('engine-verdict-absent');
        expect(report.banner).not.toBeNull();
        expect(report.storeysSound).toBe(0);
    });

    it('SEALED and NOT-MEASURED in one house are both surfaced, neither collapsed', () => {
        const sealedStorey = SWEPT.storeys.find(s => s.indepDoorless.length > 0);
        expect(sealedStorey, 'no sealed storey in the sweep').toBeTruthy();
        const inputs: StoreyCirculationInput[] = [
            { storeyIndex: 0, levelId: 'storey-0', option: sealedStorey!.option, optionCount: 3 },
            { storeyIndex: 1, levelId: 'storey-1', option: null, optionCount: 0 },
        ];
        const report = buildHouseCirculationReport(inputs);
        expect(report.storeysSealed).toBe(1);
        expect(report.storeysNotMeasured).toBe(1);
        expect(report.banner!.severity).toBe('blocking');            // worst wins…
        expect(report.banner!.sealedStoreys).toHaveLength(1);
        expect(report.banner!.notMeasuredStoreys).toHaveLength(1);   // …but the other is NOT hidden
        expect(report.banner!.headline).toContain('could not be checked');
    }, 180_000);
});

describe('§CI-1-BANNER — the report is index-aligned with the storeys it judges', () => {
    it('one verdict per storey plate, in storey order, on every swept house', () => {
        expect(SWEPT.houses.length).toBeGreaterThan(0);
        for (const h of SWEPT.houses) {
            expect(h.circulation.storeys).toHaveLength(h.storeys.length);
            expect(h.circulation.storeysTotal).toBe(h.storeys.length);
            h.circulation.storeys.forEach((v, i) => {
                expect(v.storeyIndex).toBe(h.storeys[i]!.storeyIndex);
                expect(v.levelId).toBe(h.storeys[i]!.levelId);
            });
            const c = h.circulation;
            expect(c.storeysSound + c.storeysSealed + c.storeysUnsound + c.storeysNotMeasured)
                .toBe(c.storeysTotal);
        }
    }, 180_000);
});
