/**
 * L-912 §MEASURE — WHICH branch of "wall moved onto a door" is silent, and is the
 * discriminator the OPENING TYPE or the GEOMETRY CLASS?
 *
 * ── WHY THIS FILE EXISTS BEFORE ANY FIX ───────────────────────────────────────
 * The founder reported, on the deploy that shipped L-904 (`21919312`), that
 * moving a wall onto a DOOR produced *"no notification, no message, no refusal"*
 * — while the SAME gesture onto a WINDOW produced the full card AND the chat
 * offer, verbatim:
 *
 *   [OCC_CROSSES_HOSTED_OPENING] … that window occupies 8.046–9.246 m along the
 *   wall and this wall would occupy 8.615–8.815 m, overlapping by 0.200 m …
 *   Move it 0.77 m back along the host wall, or 0.63 m further along the host wall
 *
 * Two rival explanations were live when this file was written:
 *   (T) a TYPE discriminator — doors are filtered out of, or absent from, the
 *       opening set the arm reads;
 *   (G) a GEOMETRY-CLASS discriminator — the founder's door gesture is a
 *       geometry class `segmentsProperlyCross`/the footprint clip deliberately
 *       excludes, and doors simply sit where that class occurs.
 *
 * This suite settles it by holding one variable at a time. Every case drives the
 * REAL exported predicate `evaluateWallPlacement` — no re-implementation, no
 * mock of the store: `wallOccupancyStore.getOccupiedSpans` is called for real
 * inside it.
 *
 * ⚠ NOTHING HERE ASSERTS A DESIRED FUTURE. Cases whose current behaviour is the
 * defect are asserted AT their measured value and tagged §MEASURED-SILENT, so
 * this file is a measurement first and a regression pin second. The fix commit
 * flips those assertions and says so.
 *
 * ── THE FIX LANDED (same tree as §SOLID-OVERLAP-IS-THE-QUESTION) ──────────────
 * The §MEASURED-SILENT pins are now FLIPPED, each saying so at the arm:
 *   §B-a  COLLINEAR over the door      0 → 1 violation (solid overlap, exact stations)
 *   §B-a2 PARALLEL 0.10 m solid overlap 0 → 1 violation (the centreline-clip hole)
 *   §B-g  §PRE-WELD-TRANSIENT slide     0 → 1 violation (§WELD-EXCUSES-A-JUNCTION-
 *         NOT-A-CROSSING: a clean pass-through is never a junction) — the
 *         founder's own gesture, now a hard regression pin.
 * §B-d (shared endpoint, no crossing) and §B-f (shared endpoint, near-parallel
 * body) remain EXCUSED BY DESIGN — the junction exclusions are narrowed, not
 * removed — and §B-f is now pinned at that value rather than merely measured.
 */

import { describe, expect, it } from 'vitest';
import type { WallData } from '../src/WallTypes';
import { evaluateWallPlacement, type CandidateWall } from '../src/WallCrossesOpening';

const LEVEL = 'level-0';

/** The founder's host, from their own log: a 12 m wall with ONE opening at 8.046–9.246. */
function host(type: 'door' | 'window', id = 'wall_01M00GK9H04JG9TATEEMCRQP9G'): WallData {
  return {
    id,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 12, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.3,
    childrenIds: [`${type}-element`],
    openings: [
      {
        id: `${type}-opening`,
        type,
        offset: 8.046,
        width: 1.2,
        height: type === 'door' ? 2.1 : 1.4,
        sillHeight: type === 'door' ? 0 : 0.9,
        elementId: `${type}-element`,
      },
    ],
  } as unknown as WallData;
}

/** A perpendicular candidate whose footprint (thickness 0.2) crosses the host at station `s`. */
function perpendicularAt(s: number, extra: Partial<CandidateWall> = {}): CandidateWall {
  return {
    levelId: LEVEL,
    baseLine: [
      { x: s, y: 0, z: -2 },
      { x: s, y: 0, z: 2 },
    ],
    thickness: 0.2,
    ...extra,
  };
}

function report(label: string, v: ReturnType<typeof evaluateWallPlacement>): void {
  const u = v.undetermined.map((x) => x.reason).join(',') || '—';
  // eslint-disable-next-line no-console
  console.log(
    `[L-912 §MEASURE] ${label.padEnd(58)} valid=${String(v.valid).padEnd(5)} ` +
    `violations=${v.violations.length} undetermined=${u} offers=${v.offers.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A. THE TYPE VARIABLE, held alone. Identical geometry; only `type` differs.
// ─────────────────────────────────────────────────────────────────────────────

describe('L-912 §A — is the OPENING TYPE the discriminator?', () => {
  for (const t of ['window', 'door'] as const) {
    it(`§A-CREATE-${t}: a NEW wall crossing the ${t} transversally`, () => {
      const v = evaluateWallPlacement(perpendicularAt(8.7), [host(t)]);
      report(`A-CREATE ${t}`, v);
      expect(v.valid).toBe(false);
      expect(v.code).toBe('OCC_CROSSES_HOSTED_OPENING');
      expect(v.violations[0]!.openingType).toBe(t);
    });

    it(`§A-MOVE-${t}: an EXISTING wall moved across the ${t} transversally`, () => {
      const v = evaluateWallPlacement(
        perpendicularAt(8.7, {
          id: 'wall_01M00GR2H2KM3TMEKDNWDPCMJN',
          currentBaseLine: [
            { x: 3, y: 0, z: -2 },
            { x: 3, y: 0, z: 2 },
          ],
        }),
        [host(t)],
      );
      report(`A-MOVE ${t}`, v);
      expect(v.valid).toBe(false);
      expect(v.code).toBe('OCC_CROSSES_HOSTED_OPENING');
      expect(v.violations[0]!.openingType).toBe(t);
    });
  }

  it('§A-VERDICT: door and window verdicts are BYTE-IDENTICAL modulo the noun', () => {
    const w = evaluateWallPlacement(perpendicularAt(8.7), [host('window')]);
    const d = evaluateWallPlacement(perpendicularAt(8.7), [host('door')]);
    expect(w.valid).toBe(d.valid);
    expect(w.violations.length).toBe(d.violations.length);
    expect(w.violations[0]!.crossingSpanM).toEqual(d.violations[0]!.crossingSpanM);
    expect(w.violations[0]!.overlapM).toBeCloseTo(d.violations[0]!.overlapM, 12);
    expect(w.offers.length).toBe(d.offers.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. THE GEOMETRY-CLASS VARIABLE, type held at DOOR (the founder's failing case).
// ─────────────────────────────────────────────────────────────────────────────

describe('L-912 §B — which GEOMETRY CLASS is silent?', () => {
  it('§B-a COLLINEAR OVERLAP: the moved wall lies ALONG the host, over the door span', () => {
    // Same line as the host, footprint straddling 8.046–9.246 entirely.
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 7.5, y: 0, z: 0 },
          { x: 10.5, y: 0, z: 0 },
        ],
        thickness: 0.3,
      },
      [host('door')],
    );
    report('B-a COLLINEAR OVERLAP', v);
    // §MEASURED-SILENT → FLIPPED by the fix: the solid model gives the
    // collinear case an exact station interval, so lying over the door FIRES.
    expect(v.violations.length).toBe(1);
    expect(v.valid).toBe(false);
  });

  it('§B-a2 PARALLEL, offset by less than a half-thickness (solids still overlap)', () => {
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 7.5, y: 0, z: 0.2 },
          { x: 10.5, y: 0, z: 0.2 },
        ],
        thickness: 0.3,
      },
      [host('door')],
    );
    report('B-a2 PARALLEL near-collinear', v);
    // §MEASURED-SILENT → FLIPPED by the fix: 0.10 m of shared SOLID straight
    // over the door — invisible to the centreline clip, refused by the solid
    // overlap. This was the founder's total-silence branch.
    expect(v.violations.length).toBe(1);
    expect(v.valid).toBe(false);
  });

  it('§B-b T-TOUCH: the moved wall ENDS inside the door span (no shared endpoint)', () => {
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 8.7, y: 0, z: 0 },   // endpoint ON the host centreline, inside the door
          { x: 8.7, y: 0, z: 3 },
        ],
        thickness: 0.2,
      },
      [host('door')],
    );
    report('B-b T-TOUCH endpoint-in-span', v);
    expect(v.violations.length).toBeGreaterThan(0);
  });

  it('§B-c PROPER CROSSING (the shipped arm\'s own case) still fires', () => {
    const v = evaluateWallPlacement(perpendicularAt(8.7), [host('door')]);
    report('B-c PROPER CROSSING', v);
    expect(v.valid).toBe(false);
  });

  it('§B-d SHARED ENDPOINT at the FAR corner, crossing the door 8 m away', () => {
    // The candidate is welded to the host's START corner and runs across the
    // host again at station 8.7 — where the door is. §CORNER-JOIN-IS-NOT-A-
    // CROSSING skips on a shared endpoint; the question this case asks is
    // whether it skips the WHOLE HOST or only the mitre zone.
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 0, y: 0, z: 0 },     // shared with host start
          { x: 8.7, y: 0, z: -3 },  // ...but this arm does NOT cross the door
        ],
        thickness: 0.2,
      },
      [host('door')],
    );
    report('B-d SHARED ENDPOINT (control, no crossing)', v);
    expect(v.violations.length).toBe(0);
  });

  it('§B-e OBLIQUE proper crossing at the door (no endpoint shared anywhere)', () => {
    // Crosses the host centreline at x = 8.7 — inside the door — at ~6.6°.
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 0, y: 0, z: -1 },
          { x: 17.4, y: 0, z: 1 },
        ],
        thickness: 0.2,
      },
      [host('door')],
    );
    report('B-e OBLIQUE crossing at the door', v);
    expect(v.violations.length).toBeGreaterThan(0);
  });

  it('§B-f LITERAL shared endpoint, near-parallel body lying over the door', () => {
    // Welded to the host's START corner and running 1.7° off it, so its
    // footprint lies over the host — and over the door at 8.046–9.246 m.
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 0, y: 0, z: 0 },     // exactly the host's start point
          { x: 12, y: 0, z: 0.35 },
        ],
        thickness: 0.2,
      },
      [host('door')],
    );
    report('B-f SHARED ENDPOINT + near-parallel body over the door', v);
    // EXCUSED BY DESIGN, now pinned: the body does NOT pass clean through the
    // host (its endpoint lies ON the host), so §CORNER-JOIN-IS-NOT-A-CROSSING
    // still excuses it — the junction exclusions were narrowed, not removed.
    // If this ever fires, the narrowing widened; that is a finding, not a fix.
    expect(v.violations.length).toBe(0);
    expect(v.valid).toBe(true);
  });

  it('§B-g §PRE-WELD-TRANSIENT: the moved wall CURRENTLY shares the host endpoint', () => {
    // The founder's shape: a partition welded into the door's host wall, then
    // slid ALONG it until it sits on the door. `currentBaseLine` shares the
    // host's endpoint, which §PRE-WELD-TRANSIENT uses to exclude the host.
    const v = evaluateWallPlacement(
      {
        id: 'moved',
        levelId: LEVEL,
        baseLine: [
          { x: 8.7, y: 0, z: -2 },
          { x: 8.7, y: 0, z: 2 },
        ],
        thickness: 0.2,
        currentBaseLine: [
          { x: 0, y: 0, z: 0 },   // welded to the host's START
          { x: 0, y: 0, z: 4 },
        ],
      },
      [host('door')],
    );
    report('B-g PRE-WELD-TRANSIENT slide-along', v);
    // §MEASURED-SILENT → FLIPPED by the fix (§WELD-EXCUSES-A-JUNCTION-NOT-A-
    // CROSSING): the moved wall passes CLEAN THROUGH the host — both endpoints
    // outside the host band, opposite sides — so no junction reading excuses
    // it, and the door refusal FIRES with offers. This is the founder's own
    // gesture, and it is now a hard regression pin.
    expect(v.violations.length).toBe(1);
    expect(v.valid).toBe(false);
    expect(v.offers.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Is the DOOR's opening record shaped like the window's at all?
// ─────────────────────────────────────────────────────────────────────────────

describe('L-912 §C — does the span builder see doors?', () => {
  it('§C-1 getOccupiedSpans returns the DOOR interval with a non-zero width', async () => {
    const { wallOccupancyStore } = await import('../src/WallOccupancyStore');
    const spans = wallOccupancyStore.getOccupiedSpans(host('door'));
    // eslint-disable-next-line no-console
    console.log(`[L-912 §MEASURE] C-1 door spans = ${JSON.stringify(spans)}`);
    expect(spans.length).toBe(1);
    expect(spans[0]!.type).toBe('door');
    expect(spans[0]!.endM - spans[0]!.offsetM).toBeCloseTo(1.2, 9);
  });

  it('§C-2 the window interval is identical in shape', async () => {
    const { wallOccupancyStore } = await import('../src/WallOccupancyStore');
    const spans = wallOccupancyStore.getOccupiedSpans(host('window'));
    expect(spans.length).toBe(1);
    expect(spans[0]!.type).toBe('window');
    expect(spans[0]!.endM - spans[0]!.offsetM).toBeCloseTo(1.2, 9);
  });
});
