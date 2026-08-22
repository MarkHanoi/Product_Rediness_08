/**
 * §ANALYSIS-AREA-STANDARDS (L-3640) + §ANALYSIS-CENTRELINE-PLANE (L-3641).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE ONE THING THESE ARMS EXIST TO STOP
 * ═════════════════════════════════════════════════════════════════════════════
 * A number labelled GFA that is not GFA.
 *
 * PRYZM measures room polygons on the WALL CENTRELINE — measured, not assumed:
 *   grep -n centerline packages/geometry-kernel/src/producers/room.ts
 *   :59 "Wall ids whose CENTERLINE edge contributed to the boundary"
 *   :64 "Half-edge graph from wall CENTERLINES"
 * Every published standard measures to a FACE. So the sum this product can
 * produce is a real, exact measurement of a real thing, and it is not any class
 * of any standard. The arms below pin that the surface says so — in the figure's
 * basis, in its qualifiers, and in the class ledger — and that the correction
 * between the two planes is reported as a BRACKET rather than a point value.
 *
 * ⚠ Source-text and read-model arms. happy-dom paints nothing; nothing here
 * establishes that any of it is legible on screen.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  AREA_STANDARDS,
  DEFAULT_AREA_STANDARD,
  areaCoverageRows,
  areaStandard,
  areaStandardById,
  setAreaStandard,
} from '../areaStandards';
import { getRoomAreas, invalidateAnalysisReadModel, runQuery } from '../analysisReadModel';
import { widgetById } from '../widgetCatalogue';

const REPO = resolve(__dirname, '../../../../../..');

const AREA_QUERY = {
  id: 'area:level',
  source: 'area',
  groupBy: 'level',
  measure: 'quantity',
  unit: 'm2',
  cost: 'O(n)',
} as const;

interface Row { [k: string]: unknown }
const listStore = (rows: Row[]): { getAll: () => Row[] } => ({ getAll: () => rows });

function installModel(): void {
  window.roomStore = listStore([
    // 20 m², 18 m perimeter, bounded by two walls of 0.10 and 0.30 m.
    { id: 'r1', levelId: 'L0', area: 20, perimeter: 18, boundingWallIds: ['w1', 'w2'] },
    // 10 m², 13 m perimeter, one wall of 0.20 m.
    { id: 'r2', levelId: 'L0', area: 10, perimeter: 13, boundingWallIds: ['w3'] },
    // On another storey.
    { id: 'r3', levelId: 'L1', area: 30, perimeter: 22, boundingWallIds: ['w1'] },
    // ⛔ No bounding wall resolves — must NOT contribute a zero correction.
    { id: 'r4', levelId: 'L0', area: 5, perimeter: 9, boundingWallIds: ['ghost'] },
  ]) as never;
  window.wallStore = listStore([
    { id: 'w1', thickness: 0.1 },
    { id: 'w2', thickness: 0.3 },
    { id: 'w3', thickness: 0.2 },
  ]) as never;
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }, { id: 'L1', name: 'First floor' }] } as never;
  invalidateAnalysisReadModel();
}

describe('§ANALYSIS-AREA-STANDARDS — the standard is DECLARED, and the default is recorded', () => {
  afterEach(() => setAreaStandard(DEFAULT_AREA_STANDARD));

  it('SIA 416 is the default, and it is switchable', () => {
    expect(DEFAULT_AREA_STANDARD).toBe('sia-416');
    expect(areaStandard().id).toBe('sia-416');
    setAreaStandard('rics-comp');
    expect(areaStandard().id).toBe('rics-comp');
  });

  it('an unknown standard id is IGNORED, never adopted', () => {
    setAreaStandard('sia-416');
    setAreaStandard('bs-1192' as never);
    expect(areaStandard().id, 'an unknown rulebook must not silently become the active one').toBe('sia-416');
    expect(areaStandardById('bs-1192')).toBeUndefined();
  });

  it('⛔ EVERY class of EVERY published standard is NOT_MEASURED, and says why', () => {
    // The honest state of this build. If one of these ever flips to MEASURED it
    // must be because the measurement plane changed, not because a label did.
    for (const std of AREA_STANDARDS) {
      if (std.id === 'pryzm-centreline') continue;
      for (const c of std.classes) {
        expect(c.state, `${std.id} / ${c.code} claims to be measured`).toBe('NOT_MEASURED');
        expect(c.note.length, `${std.id} / ${c.code} refuses without a reason`).toBeGreaterThan(40);
      }
    }
  });

  it('⭐ the ONE standard that measures is labelled as NOT a published standard', () => {
    const p = areaStandardById('pryzm-centreline')!;
    expect(p.label).toContain('NOT a published standard');
    expect(p.jurisdiction).toContain('NONE');
    expect(p.classes.some((c) => c.state === 'MEASURED')).toBe(true);
    expect(p.classes.find((c) => c.code === 'RCA')!.plane).toBe('centreline');
  });

  it('the coverage row carries the class PLANE, because the plane is the argument', () => {
    setAreaStandard('sia-416');
    const rows = areaCoverageRows();
    expect(rows.some((r) => r.family.includes('NGF') && r.family.includes('internal-face'))).toBe(true);
    expect(rows.every((r) => r.family.includes('plane:'))).toBe(true);
  });

  it('⛔ no ratio is offered with an unmeasured operand', () => {
    // ADR-0343 §D.6 H3. A gauge drawn at zero is a confident dial reporting a
    // standard this product has never implemented.
    for (const std of AREA_STANDARDS) {
      for (const c of std.classes.filter((x) => x.plane === 'derived' && x.code.includes(':'))) {
        expect(c.state, `${std.id} / ${c.code} offers a ratio`).toBe('NOT_MEASURED');
      }
    }
  });
});

describe('§ANALYSIS-CENTRELINE-PLANE — the figure says what plane it is on', () => {
  beforeEach(installModel);
  afterEach(() => {
    delete (window as { roomStore?: unknown }).roomStore;
    delete (window as { wallStore?: unknown }).wallStore;
    invalidateAnalysisReadModel();
  });

  it('sums room areas per storey, with a NAMED group for rooms with no storey', () => {
    const r = runQuery(AREA_QUERY);
    const ground = r.figures.find((f) => f.key === 'L0')!;
    expect(ground.label).toBe('Ground floor');
    expect(ground.value).toBe(35); // 20 + 10 + 5
    expect(ground.unit).toBe('m2');
    expect(ground.elementIds).toEqual(['r1', 'r2', 'r4']);
  });

  it('⛔ the BASIS names the centreline — a bare "floor area" is not a basis (H1)', () => {
    const r = runQuery(AREA_QUERY);
    for (const f of r.figures) {
      expect(f.basis).toContain('CENTRELINE');
      expect(f.basis).toContain('producers/room.ts:64');
    }
  });

  it('⭐ every figure carries the OVERSTATES/UNDERSTATES qualifier', () => {
    // The sign of the error is known. Publishing the number without it is how a
    // centreline sum gets quoted as NIA.
    const r = runQuery(AREA_QUERY);
    const q = r.figures.flatMap((f) => f.qualifiers).join(' ');
    expect(q).toContain('OVERSTATES');
    expect(q).toContain('UNDERSTATES');
  });

  it('⛔ the face correction is a BRACKET, and the arithmetic is the stated one', () => {
    // Ground floor: r1 18 m × [0.10, 0.30] / 2 = [0.90, 2.70]
    //               r2 13 m × [0.20, 0.20] / 2 = [1.30, 1.30]
    //               r4 no bounding wall resolved -> contributes NOTHING
    //               → [2.20, 4.00]
    const r = runQuery(AREA_QUERY);
    const q = r.figures.find((f) => f.key === 'L0')!.qualifiers.join(' ');
    expect(q).toContain('2.20');
    expect(q).toContain('4.00');
    expect(q).toContain('BOUND, not an estimate');
  });

  it('⛔ a room with NO resolvable wall contributes no zero — it is counted apart', () => {
    // A zero contribution would narrow the interval and make the bracket claim
    // more than it knows. It is excluded and the exclusion is reported.
    const a = getRoomAreas();
    expect(a.roomsWithoutBracket).toBe(1);
    const q = runQuery(AREA_QUERY).figures.find((f) => f.key === 'L0')!.qualifiers.join(' ');
    expect(q).toContain('1 room(s) on this storey resolved no bounding wall thickness');
    expect(q).toContain('narrower than the true one');
  });

  it('⛔ an unreadable ROOM store makes the figures a floor; an unreadable WALL store does NOT', () => {
    // Two different failures. Collapsing them would suppress a real area sum
    // over a missing correction.
    delete (window as { wallStore?: unknown }).wallStore;
    invalidateAnalysisReadModel();
    const r = runQuery(AREA_QUERY);
    expect(r.complete, 'a missing bracket is not a missing measurement').toBe(true);
    expect(r.unreachable.join(' ')).toContain('bracket only');

    delete (window as { roomStore?: unknown }).roomStore;
    invalidateAnalysisReadModel();
    const r2 = runQuery(AREA_QUERY);
    expect(r2.complete).toBe(false);
    expect(r2.unreachable).toContain('roomStore');
  });

  it('⛔ the area source REFUSES an axis it does not project, rather than returning empty', () => {
    expect(() => runQuery({ ...AREA_QUERY, groupBy: 'category' } as never)).toThrow(/only the "level" axis/);
  });

  it('the ledger shipped with the figures is the SELECTED standard, not the take-off', () => {
    setAreaStandard('ipms');
    invalidateAnalysisReadModel();
    const r = runQuery(AREA_QUERY);
    expect(r.coverage.some((c) => c.family.includes('IPMS 1'))).toBe(true);
    setAreaStandard(DEFAULT_AREA_STANDARD);
  });
});

describe('§ANALYSIS-AREA-STANDARDS — the refusals that were CORRECTED, and the one that stands', () => {
  it('⛔ the change table is STILL not built, and still names the missing model', () => {
    // The founder's brief is explicit that a change table on the session
    // mutation log would be "the wrong number under the right title". Shipping
    // the area family must not have quietly relaxed that.
    const w = widgetById('change-table')!;
    expect(w.notBuilt).not.toBeNull();
    expect(w.query).toBeNull();
    expect(w.notBuilt!.need.join(' ')).toContain('Stable element ids across saved versions');
    expect(w.notBuilt!.close).toContain('wrong number under the right title');
  });

  it('⭐ the SIA card no longer claims "zero occurrences of SIA in this repository"', () => {
    // That claim was true when written and this lane made it false. A refusal
    // whose stated reason has expired is a refusal nobody can act on.
    const w = widgetById('sia-416')!;
    expect(w.subtitle).not.toContain('Zero occurrences');
    expect(w.notBuilt!.lede).toContain('BOTH ARE NOW FALSE');
    // …and the real remaining blocker is named.
    expect(w.notBuilt!.need.join(' ')).toContain('SU Nutzfläche');
  });

  it('⭐ the GFA card no longer says the standard question is OPEN', () => {
    const w = widgetById('gfa-nia')!;
    expect(w.notBuilt!.lede).toContain('Measured-area standard');
    expect(w.notBuilt!.need.join(' ')).toContain('ANSWERED, not open');
  });

  it('the centreline claim is checkable against the kernel it cites', () => {
    // C01 §6 rule 6 — "X does not exist" (and "X is measured on plane P") is a
    // MEASUREMENT. This arm re-runs it, so the citation cannot rot into prose.
    const src = readFileSync(join(REPO, 'packages/geometry-kernel/src/producers/room.ts'), 'utf8');
    expect(src).toContain('Half-edge graph from wall centerlines');
    expect(src).toContain('centerline edge contributed to the boundary');
  });
});
