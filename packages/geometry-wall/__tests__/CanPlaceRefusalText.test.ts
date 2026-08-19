// §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8, C73 §4.4)
//
// `WallOccupancyStore.canPlace` resolves a CLOSED six-member union
// (`CanPlaceRefusalCode`) carefully — and then every consumer flattened it to
// prose one call before the user, with a manufactured `?? 'opening placement
// rejected'` fallback on top. That fallback is the exact "shrug wearing the
// grammatical shape of an explanation" GE-09 names: it is emitted when the
// validator refused AND said nothing, and it is indistinguishable from the case
// where the validator refused AND said why. C58 §1.13.8: "the resolver's
// distinction MUST reach the card."
//
// These tests pin the ONE renderer that carries the identity across that seam:
//   1) every member of the closed union renders distinctly and carries its code;
//   2) the renderer is EXHAUSTIVE — a seventh code cannot be added silently;
//   3) a refusal with no code at all is reported AS a missing identity, never
//      papered over with a generic sentence.

import { describe, expect, it } from 'vitest';
import {
  canPlaceRefusalText,
  CAN_PLACE_REFUSAL_CODES,
  type CanPlaceRefusalCode,
  type CanPlaceResult,
} from '../src/WallOccupancyStore';

describe('canPlaceRefusalText — the refusal identity reaches the render (GE-09)', () => {
  it('renders every member of the closed union, each carrying its own code', () => {
    const texts = CAN_PLACE_REFUSAL_CODES.map((code) =>
      canPlaceRefusalText({ valid: false, conflictIds: [], code, reason: `why-${code}` }),
    );
    // Each names its code …
    CAN_PLACE_REFUSAL_CODES.forEach((code, i) => {
      expect(texts[i]).toContain(code);
      expect(texts[i]).toContain(`why-${code}`);
    });
    // … and no two collapse onto one sentence.
    expect(new Set(texts).size).toBe(CAN_PLACE_REFUSAL_CODES.length);
  });

  it('the closed union and the code roster are the same set (exhaustiveness)', () => {
    // If a seventh member is added to `CanPlaceRefusalCode` without joining
    // CAN_PLACE_REFUSAL_CODES, this assignment stops compiling — the roster is
    // typed as covering the union exactly.
    const roster: readonly CanPlaceRefusalCode[] = CAN_PLACE_REFUSAL_CODES;
    // 6 → 7 on 2026-08-14: §C83-S1 added `OCC_CROSSES_HOSTED_OPENING`, the
    // WALL-SIDE arm (a proposed wall crossing an existing door/window). The
    // count is deliberately hard-coded rather than derived from the roster —
    // deriving it would make this assertion tautological, and the point is that
    // a member cannot join the union without a human editing this number.
    //
    // 7 → 8 on 2026-08-19: §OPENING-PROFILE (L-1200) added `OCC_PROFILE_UNSUPPORTED` — the
    // VOID-SHAPE arm. It fires when the host cannot carry the requested opening PROFILE (a
    // curved wall, whose bands are sliced in arc-length space, refuses a circular or arched
    // void permanently — C86 §10.1 PR-5) or when the profile's own dimensions are impossible
    // (a "circular" opening 2 m wide and 1 m tall — PR-8/R-12).
    //
    // ⭐ THE GUARD WORKED EXACTLY AS DESIGNED. This number, plus the `Record<CanPlaceRefusalCode,
    // string>` sentence map and the roster's `satisfies`, caught all three places the new member
    // had to be declared — at COMPILE time, before a single test ran. A derived count would
    // have caught none of them. That is the argument for keeping it hand-written, restated
    // rather than re-litigated.
    expect(roster.length).toBe(8);
    expect(new Set(roster).size).toBe(8);
    expect(roster).toContain('OCC_CROSSES_HOSTED_OPENING');
    expect(roster).toContain('OCC_PROFILE_UNSUPPORTED');
  });

  it('names a MISSING identity as missing — never a generic sentence', () => {
    // The under-reporting validator must stay visible. A refusal that arrived
    // without a code is a DEFECT in the producer, and the text says so rather
    // than hiding it behind "opening placement rejected".
    const text = canPlaceRefusalText({ valid: false, conflictIds: [] } as CanPlaceResult);
    expect(text).toMatch(/OCC_UNIDENTIFIED/);
    expect(text).not.toMatch(/^opening placement rejected$/);
  });

  it('a valid result has no refusal text', () => {
    expect(canPlaceRefusalText({ valid: true, conflictIds: [] })).toBeUndefined();
  });

  it('names the conflicting sibling ids when the refusal is an overlap', () => {
    const text = canPlaceRefusalText({
      valid: false,
      conflictIds: ['op_a', 'op_b'],
      code: 'OCC_OVERLAPS_SIBLING',
      reason: 'overlaps',
    });
    expect(text).toContain('op_a');
    expect(text).toContain('op_b');
  });
});
