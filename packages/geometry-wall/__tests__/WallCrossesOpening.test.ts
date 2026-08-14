// §C83-S1 — a proposed WALL versus an existing hosted OPENING.
//
// Founder report, live build a75e8e1e: "also the wall can be placed in front of
// a door still: which it should not". The fixtures below are their console,
// verbatim:
//
//   canPlace OK:  wall=wall_01M0027RDCJAMTZRY3CFWZC2T8 wallLen=21.000m
//   CONFLICT:     new=[3.590,4.516]m vs existing 254e1386-… [3.005,3.931]m
//
// ── WHAT THIS SUITE IS FOR, IN ORDER OF IMPORTANCE ────────────────────────────
// 1. §PRIOR-ART-SILENCE — the executed proof that the defect was real: the
//    pre-existing wall-side instrument is silent on the offending candidate.
//    Without this, "we fixed it" is a claim about code nobody watched fail.
// 2. The positive controls — door and window, each with the opening NAMED.
// 3. **THE SILENCE CONTROLS**, which C83 §5.1(2) marks as the tests that may
//    not be skipped. A validator that cries wolf gets muted, and a muted
//    validator is strictly worse than none: same build cost, trust budget
//    spent, false assurance delivered. Every "must stay quiet" case below is
//    load-bearing, not padding.
// 4. The grazing cases, where the tolerance ROLE (COINCIDENT_M) decides.

import { describe, expect, it } from 'vitest';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import type { WallData } from '../src/WallTypes';
import { wallOccupancyStore } from '../src/WallOccupancyStore';
import {
  evaluateWallPlacement,
  findWallOpeningCrossings,
  wallCrossesOpeningRefusalText,
  type CandidateWall,
} from '../src/WallCrossesOpening';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HOST_ID = 'wall_01M0027RDCJAMTZRY3CFWZC2T8';
const DOOR_OPENING_ID = '254e1386-f641-4bf9-9623-be3054d47b35';
const DOOR_ELEMENT_ID = 'door_01M0027RDCJAMTZRY3CFWZC2TX';
const LEVEL = 'level-0';

/** The founder's perimeter wall: 21.000 m along +x, one door at [3.005, 3.931]. */
function hostWallWithDoor(): WallData {
  return {
    id: HOST_ID,
    type: 'wall',
    levelId: LEVEL,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 21, y: 0, z: 0 },
    ],
    height: 3,
    thickness: 0.3,
    childrenIds: [DOOR_ELEMENT_ID],
    openings: [
      {
        id: DOOR_OPENING_ID,
        type: 'door',
        offset: 3.005,
        width: 0.926,
        height: 2.1,
        sillHeight: 0,
        elementId: DOOR_ELEMENT_ID,
      },
    ],
  } as unknown as WallData;
}

function hostWallWithWindow(): WallData {
  const w = hostWallWithDoor();
  return {
    ...w,
    openings: [{ ...w.openings[0], type: 'window', sillHeight: 0.9 }],
  } as unknown as WallData;
}

/**
 * An interior wall running across the host at station `centreX`, `thickness`
 * wide, so its footprint covers `[centreX - t/2, centreX + t/2]` of the host.
 */
function crossingWall(centreX: number, thickness = 0.2): CandidateWall {
  return {
    levelId: LEVEL,
    thickness,
    baseLine: [
      { x: centreX, y: 0, z: -2 },
      { x: centreX, y: 0, z: 4 },
    ],
  };
}

// ── 1. §PRIOR-ART-SILENCE — the defect, executed ──────────────────────────────

describe('§PRIOR-ART-SILENCE — what the product did before this rule existed', () => {
  it('the ONLY pre-existing wall-side instrument is silent on the offending wall', () => {
    // `planOpeningRefit` is the wall-side gate the consequence planner already
    // ran on every create ("the WALL-SIDE mirror of clampToWall"). A newly
    // created wall carries no openings of its own, so it short-circuits to a
    // clean plan — which is a CORRECT answer to the question it asks ("do MY
    // openings still fit?") and no answer at all to the founder's question
    // ("am I driving through SOMEONE ELSE'S door?").
    //
    // This is the executed record that nothing refused this wall before, and it
    // is asserted rather than asserted-about: if some other arm ever starts
    // catching this case, this test fails and the duplication gets found.
    const candidate = crossingWall(3.5);
    const refit = wallOccupancyStore.planOpeningRefit({
      id: 'wall-new',
      type: 'wall',
      levelId: LEVEL,
      baseLine: candidate.baseLine,
      height: 3,
      thickness: candidate.thickness,
      openings: [],
      childrenIds: [],
    } as unknown as WallData);

    expect(refit.ok).toBe(true);
    expect(refit.refusals).toHaveLength(0);
  });

  it('canPlace cannot even be ASKED this question — it takes one wall', () => {
    // `canPlace(wall, offsetM, widthM)` compares a span against THAT wall's own
    // `openings[]`. The host's door is invisible to a call about the new wall,
    // because the new wall's opening list is empty. Six refusal arms, none of
    // which can fire. This is the structural reason a new member was needed.
    const newWall = {
      id: 'wall-new',
      type: 'wall',
      levelId: LEVEL,
      baseLine: crossingWall(3.5).baseLine,
      height: 3,
      thickness: 0.2,
      openings: [],
      childrenIds: [],
    } as unknown as WallData;
    expect(wallOccupancyStore.canPlace(newWall, 0, 1).valid).toBe(true);
  });
});

// ── 2. Positive controls ──────────────────────────────────────────────────────

describe('a proposed wall crossing an opening is REFUSED, and the opening is NAMED', () => {
  it('crossing a DOOR refuses with OCC_CROSSES_HOSTED_OPENING', () => {
    const verdict = evaluateWallPlacement(crossingWall(3.5), [hostWallWithDoor()]);

    expect(verdict.valid).toBe(false);
    expect(verdict.code).toBe('OCC_CROSSES_HOSTED_OPENING');
    expect(verdict.violations).toHaveLength(1);

    const v = verdict.violations[0];
    expect(v.hostWallId).toBe(HOST_ID);
    expect(v.openingType).toBe('door');
    expect(v.openingId).toBe(DOOR_OPENING_ID);
    expect(v.openingElementId).toBe(DOOR_ELEMENT_ID);
    // BOTH intervals, from the founder's own console.
    expect(v.openingSpanM[0]).toBeCloseTo(3.005, 6);
    expect(v.openingSpanM[1]).toBeCloseTo(3.931, 6);
    expect(v.crossingSpanM[0]).toBeCloseTo(3.4, 6);
    expect(v.crossingSpanM[1]).toBeCloseTo(3.6, 6);
    expect(v.overlapM).toBeCloseTo(0.2, 6);
  });

  it('the sentence NAMES the door and carries both intervals', () => {
    const verdict = evaluateWallPlacement(crossingWall(3.5), [hostWallWithDoor()]);
    const text = verdict.reason ?? '';

    expect(text).toContain('OCC_CROSSES_HOSTED_OPENING');
    expect(text).toContain('door');
    expect(text).toContain(DOOR_ELEMENT_ID); // the thing the user placed
    expect(text).toContain(HOST_ID); // the wall it lives in
    expect(text).toContain('3.005'); // the door's span …
    expect(text).toContain('3.931');
    expect(text).toContain('3.400'); // … and the wall's
    expect(text).toContain('3.600');
    // It must say plainly that the wall cannot be there — not "warning", not "review".
    expect(text).toContain('cannot be placed here');
  });

  it('crossing a WINDOW refuses identically, and says WINDOW', () => {
    const verdict = evaluateWallPlacement(crossingWall(3.5), [hostWallWithWindow()]);

    expect(verdict.valid).toBe(false);
    expect(verdict.code).toBe('OCC_CROSSES_HOSTED_OPENING');
    expect(verdict.violations[0].openingType).toBe('window');
    expect(verdict.reason).toContain('window');
    // The founder's brief: "a interior wall can not be in the same place where a
    // window is … same with a door". Same verdict, different noun.
    expect(verdict.reason).not.toContain('the door');
  });

  it('THICKNESS-ONLY overlap is caught — a wall is not a line', () => {
    // Centreline at 3.98 m is CLEAR of the door ([3.005, 3.931]). A point test
    // passes it. The 0.2 m body reaches back to 3.88 m and takes 51 mm of the
    // door with it. This case is the entire reason the crossing is an interval.
    const verdict = evaluateWallPlacement(crossingWall(3.98, 0.2), [hostWallWithDoor()]);

    expect(verdict.valid).toBe(false);
    expect(verdict.violations[0].crossingSpanM[0]).toBeCloseTo(3.88, 6);
    expect(verdict.violations[0].overlapM).toBeCloseTo(0.051, 6);

    // Control: the SAME station with a zero-thickness wall is a point that misses.
    expect(evaluateWallPlacement(crossingWall(3.98, 0), [hostWallWithDoor()]).valid).toBe(true);
  });
});

// ── 3. THE SILENCE CONTROLS (C83 §5.1(2) — may not be skipped) ────────────────

describe('SILENCE — the rule stays quiet on healthy designs', () => {
  it('crossing the host at a station with NO opening produces ZERO findings', () => {
    // The single most important assertion in this file. A wall driven through a
    // clear stretch of a perimeter wall is an ordinary, correct partition, and
    // it must be as silent as if this rule did not exist.
    const verdict = evaluateWallPlacement(crossingWall(10), [hostWallWithDoor()]);

    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined).toHaveLength(0);
    expect(verdict.reason).toBeUndefined();
  });

  it('a wall that touches nothing at all produces ZERO findings', () => {
    const away: CandidateWall = {
      levelId: LEVEL,
      thickness: 0.2,
      baseLine: [
        { x: 40, y: 0, z: 40 },
        { x: 45, y: 0, z: 40 },
      ],
    };
    const verdict = evaluateWallPlacement(away, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined).toHaveLength(0);
  });

  it('a wall T-junctioning INTO a clear stretch produces ZERO findings', () => {
    // Endpoint landing on the host body at x = 10 — the commonest partition
    // gesture in the product. C83 §8 Slice 4 names this silence explicitly.
    const tee: CandidateWall = {
      levelId: LEVEL,
      thickness: 0.2,
      baseLine: [
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 0, z: 5 },
      ],
    };
    const verdict = evaluateWallPlacement(tee, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
  });

  it('a host wall with NO openings can never be violated', () => {
    const bare = { ...hostWallWithDoor(), openings: [] } as unknown as WallData;
    const verdict = evaluateWallPlacement(crossingWall(3.5), [bare]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined).toHaveLength(0);
  });

  it('a wall on ANOTHER LEVEL is silent — a storey does not cross a storey', () => {
    const upstairs: CandidateWall = { ...crossingWall(3.5), levelId: 'level-1' };
    const verdict = evaluateWallPlacement(upstairs, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined).toHaveLength(0);
  });

  it('a wall does not violate ITSELF when its own baseline is re-proposed (MOVE)', () => {
    // The move path passes the subject's id so the wall is excluded from its own
    // host list. Without this, every move of a wall that hosts a door would
    // refuse itself — the self-conflict defect `canPlace`'s `excludeId` exists
    // to stop, in its wall-side form.
    const self: CandidateWall = {
      id: HOST_ID,
      levelId: LEVEL,
      thickness: 0.3,
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 21, y: 0, z: 0 },
      ],
    };
    const verdict = evaluateWallPlacement(self, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
  });
});

// ── 4. Grazing / edge cases — where the tolerance ROLE decides ────────────────

describe('grazing — COINCIDENT_M decides, and it decides the same way canPlace does', () => {
  it('a wall stopping EXACTLY at the opening boundary is NOT a violation', () => {
    // Door ends at 3.931. A 0.2 m wall centred at 4.031 starts at exactly 3.931.
    // Touching edges are not an overlap — the identical convention that lets two
    // windows share a frame edge.
    const verdict = evaluateWallPlacement(crossingWall(4.031, 0.2), [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
  });

  it('a wall overlapping by LESS than COINCIDENT_M is NOT a violation', () => {
    const centre = 4.031 - COINCIDENT_M / 2; // 0.5 mm into the door
    expect(evaluateWallPlacement(crossingWall(centre, 0.2), [hostWallWithDoor()]).valid).toBe(true);
  });

  it('a wall overlapping by MORE than COINCIDENT_M IS a violation', () => {
    const centre = 4.031 - COINCIDENT_M * 4; // 4 mm into the door
    const verdict = evaluateWallPlacement(crossingWall(centre, 0.2), [hostWallWithDoor()]);
    expect(verdict.valid).toBe(false);
    expect(verdict.violations[0].overlapM).toBeCloseTo(COINCIDENT_M * 4, 9);
  });

  it('an OBLIQUE crossing widens the interval, as the geometry requires', () => {
    // A 45° wall of thickness t covers t·√2 of the host, not t.
    const oblique: CandidateWall = {
      levelId: LEVEL,
      thickness: 0.2,
      baseLine: [
        { x: 3.5 - 2, y: 0, z: -2 },
        { x: 3.5 + 2, y: 0, z: 2 },
      ],
    };
    const verdict = evaluateWallPlacement(oblique, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(false);
    const [c0, c1] = verdict.violations[0].crossingSpanM;
    expect(c1 - c0).toBeCloseTo(0.2 * Math.SQRT2, 6);
  });
});

// ── 5. UNDETERMINED never refuses (C83 §5.3) ──────────────────────────────────

describe('UNDETERMINED — no finding, reason recorded, never a refusal and never a pass', () => {
  it('a CURVED candidate is undetermined, not refused', () => {
    const curved: CandidateWall = {
      ...crossingWall(3.5),
      curve: { control: { x: 3.5, y: 0, z: 1 }, segments: 16 },
    };
    const verdict = evaluateWallPlacement(curved, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true); // it does NOT refuse …
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined[0].reason).toBe('CURVED_CANDIDATE'); // … and it does NOT claim clear
  });

  it('a CURVED host is undetermined — chord stations are not arc stations', () => {
    const curvedHost = {
      ...hostWallWithDoor(),
      curve: { control: { x: 10.5, y: 0, z: 3 }, segments: 16 },
    } as unknown as WallData;
    const verdict = evaluateWallPlacement(crossingWall(3.5), [curvedHost]);
    expect(verdict.valid).toBe(true);
    expect(verdict.undetermined[0].reason).toBe('CURVED_HOST');
  });

  it('a PARALLEL overlap is reported, not refused', () => {
    const parallel: CandidateWall = {
      levelId: LEVEL,
      thickness: 0.2,
      baseLine: [
        { x: 2, y: 0, z: 0 },
        { x: 6, y: 0, z: 0 },
      ],
    };
    const verdict = evaluateWallPlacement(parallel, [hostWallWithDoor()]);
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined[0].reason).toBe('NEAR_PARALLEL_OVERLAP');
  });

  it('a DEGENERATE candidate is undetermined, and claims nothing', () => {
    const degenerate: CandidateWall = {
      levelId: LEVEL,
      thickness: 0.2,
      baseLine: [
        { x: 3.5, y: 0, z: 0 },
        { x: 3.5, y: 0, z: 0 },
      ],
    };
    const verdict = evaluateWallPlacement(degenerate, [hostWallWithDoor()]);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.undetermined[0].reason).toBe('DEGENERATE_CANDIDATE');
  });
});

// ── 6. The offer (C83 §4) ─────────────────────────────────────────────────────

describe('the OFFER — a way forward, or an honest refusal to guess', () => {
  it('offers the two nearest CLEAR stations, each re-validated', () => {
    const verdict = evaluateWallPlacement(crossingWall(3.5), [hostWallWithDoor()]);
    expect(verdict.offers).toHaveLength(2);

    const [back, along] = verdict.offers;
    expect(back.shiftM).toBeLessThan(0);
    expect(along.shiftM).toBeGreaterThan(0);
    // Back: clear the door's near jamb (3.005) by the tolerance ⇒ −0.596 m.
    expect(back.shiftM).toBeCloseTo(3.005 - COINCIDENT_M - 3.6, 6);
    // Along: clear the far jamb (3.931) ⇒ +0.532 m.
    expect(along.shiftM).toBeCloseTo(3.931 + COINCIDENT_M - 3.4, 6);
    expect(back.label).toContain('back along the host wall');
    expect(along.label).toContain('further along the host wall');
  });

  it('every offered position is itself CLEAN under the same predicate', () => {
    // C83 §4.1: "an offer that would itself violate a rule cannot be presented."
    const host = hostWallWithDoor();
    const verdict = evaluateWallPlacement(crossingWall(3.5), [host]);
    for (const offer of verdict.offers) {
      const re = findWallOpeningCrossings(
        { ...crossingWall(3.5), baseLine: offer.baseLine },
        [host],
      );
      expect(re.violations).toHaveLength(0);
      expect(re.undetermined).toHaveLength(0);
    }
  });

  it('the refusal sentence CARRIES the offers', () => {
    const verdict = evaluateWallPlacement(crossingWall(3.5), [hostWallWithDoor()]);
    expect(verdict.reason).toContain('Move it');
    expect(verdict.reason).toContain('back along the host wall');
  });

  it('offers NOTHING, and says so, when the host has no clear interval', () => {
    // A 4 m wall papered end to end with doors. C83 §4.2's MUST NOT: a nearest-fit
    // guess here would land on another opening and spend the user's trust.
    const packed = {
      ...hostWallWithDoor(),
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
      ],
      openings: [
        { id: 'o1', type: 'door', offset: 0, width: 2, height: 2.1, sillHeight: 0, elementId: 'e1' },
        { id: 'o2', type: 'door', offset: 2, width: 2, height: 2.1, sillHeight: 0, elementId: 'e2' },
      ],
    } as unknown as WallData;

    const verdict = evaluateWallPlacement(crossingWall(1, 0.2), [packed]);
    expect(verdict.valid).toBe(false);
    expect(verdict.offers).toHaveLength(0);
    expect(verdict.reason).toContain('none is offered');
    expect(verdict.reason).toContain('move or resize it yourself');
  });

  it('offers NOTHING when TWO host walls are violated', () => {
    // A shift along host A moves the station on host B by a different amount, so
    // no single δ is defensible. Refuse with the reason; offer nothing.
    const hostA = hostWallWithDoor();
    const hostB = {
      ...hostWallWithDoor(),
      id: 'wall_SECOND',
      baseLine: [
        { x: 0, y: 0, z: 3 },
        { x: 21, y: 0, z: 3 },
      ],
      openings: [
        { id: 'o9', type: 'window', offset: 3.005, width: 0.926, height: 1.2, sillHeight: 0.9, elementId: 'win_9' },
      ],
    } as unknown as WallData;

    const verdict = evaluateWallPlacement(crossingWall(3.5), [hostA, hostB]);
    expect(verdict.valid).toBe(false);
    expect(verdict.violations).toHaveLength(2);
    expect(verdict.offers).toHaveLength(0);
    expect(verdict.reason).toContain('none is offered');
  });
});

// ── 7. The renderer itself ────────────────────────────────────────────────────

describe('wallCrossesOpeningRefusalText', () => {
  it('is empty for an empty violation set — nothing to say, nothing said', () => {
    expect(wallCrossesOpeningRefusalText([])).toBe('');
  });
});
