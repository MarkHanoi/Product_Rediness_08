/**
 * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — THE MODEL, AND ITS REFUSAL.
 *
 * The founder asked for two things minutes apart — a window box that extrudes past the
 * façade, and reveals that splay inward at a per-side angle "which will define the size of
 * the glass". `WindowReveal.ts` models them as ONE thing. This file pins that model, and in
 * particular pins the three claims the feature is worth nothing without:
 *
 *   1. **An unauthored window is untouched.** Not "close to" — the resolver reports
 *      `active: false` and every derived quantity is the identity, so consumers can
 *      short-circuit. The 3-D half of this claim is pinned by SHA-256 in
 *      `WindowRevealLeaf.test.ts`; this is the pure half.
 *   2. **The angle defines the glass, and nothing else does.** That is the founder's own
 *      sentence, and it is the reason the panel shows the glass size read-only.
 *   3. **Degenerate is REFUSED, naming BOTH numbers, and never clamped.** C83's IMPOSSIBLE
 *      tier. A silent clamp here produces a window whose glazing is invisible and whose
 *      panel says everything worked.
 *
 * ⚠ NON-VACUITY: every refusal assertion is paired with a control that must NOT refuse, so
 * a `windowRevealRefusal` that returned a string unconditionally would fail this file.
 */

import { describe, it, expect } from 'vitest';
import {
    resolveWindowReveal, windowRevealRefusal, windowRevealAdvisory, isRevealAuthored,
    EXTERIOR_LOCAL_Z, REVEAL_SIDES, MAX_REVEAL_SPLAY_DEG,
} from '../src/WindowReveal';

/** A 300 mm wall ⇒ a 150 mm reveal run, the number every expectation below is built on. */
const T = 0.3;
const BASE = { width: 1.2, height: 1.4 };

describe('§FEAT-WINDOW-REVEAL — the unauthored window is the identity', () => {
    it('reports active:false and leaves every derived quantity at its pre-feature value', () => {
        const r = resolveWindowReveal(BASE, T);
        expect(r.active).toBe(false);
        expect(r.hasSplay).toBe(false);
        expect(r.hasProjection).toBe(false);
        // The glazing plane is the WALL CENTRE — exactly where `WindowBuilder` has always
        // put the pane (`addSweptBox(..., 0)`), which is what makes the short circuit a
        // short circuit rather than a coincidence.
        expect(r.zGlazing).toBe(0);
        // The unauthored lip sits AT the chosen wall face — outdoor by default, so +T/2.
        expect(r.zOuterFace).toBeCloseTo(T / 2, 12);
        expect(r.glazingWidth).toBe(BASE.width);
        expect(r.glazingHeight).toBe(BASE.height);
        for (const s of REVEAL_SIDES) expect(r.inset[s]).toBe(0);
    });

    it('treats explicit zeros exactly like absent fields — a saved project cannot drift', () => {
        // Every window persisted before today parses through the schema and gains
        // `revealProjection: 0` and four zero angles. That record must be indistinguishable
        // from one that never had the fields, or the first save after this ships would
        // silently re-author the whole model.
        const zeroed = {
            ...BASE, revealProjection: 0,
            revealSplayHead: 0, revealSplaySill: 0,
            revealSplayJambLeft: 0, revealSplayJambRight: 0,
        };
        expect(isRevealAuthored(zeroed)).toBe(false);
        expect(resolveWindowReveal(zeroed, T)).toEqual(resolveWindowReveal(BASE, T));
        expect(windowRevealRefusal(zeroed, T)).toBeNull();
        expect(windowRevealAdvisory(zeroed, T)).toBeNull();
    });

    it('NON-VACUITY: one non-zero field flips it, so the predicate is not a constant', () => {
        expect(isRevealAuthored({ ...BASE, revealProjection: 0.4 })).toBe(true);
        expect(isRevealAuthored({ ...BASE, revealSplayHead: 30 })).toBe(true);
        expect(isRevealAuthored({ ...BASE, revealSplayJambRight: 1 })).toBe(true);
    });
});

describe('§FEAT-WINDOW-REVEAL — the projecting box (the founder\'s first ask)', () => {
    // ⚠ ⚠ THE THREE ASSERTIONS BELOW WERE INVERTED ON 2026-08-22 (L-3410), NOT DELETED, AND
    // THE REASON IS THE POINT OF KEEPING THEM.
    //
    // They pinned `EXTERIOR_LOCAL_Z === -1` and every consequence of it, and they PASSED
    // throughout — while the founder was looking at a projecting box growing into his
    // ROOM. A green test over a wrong axis is worth recording, because it shows exactly how
    // the defect survived: the suite asserted the model AGREED WITH ITSELF (the constant
    // said −1, the arithmetic used −1, the test asserted −1) and nothing in the chain was
    // ever compared against a rendered frame. Three self-consistent statements of one wrong
    // fact are not three pieces of evidence.
    //
    // A second tell was on the page the whole time and was recorded rather than resolved:
    // ADR-0342 logged L-1926, `_addSillBoard` placing the sill at `+z` commented "toward
    // exterior", DIRECTLY contradicting the constant. The contradiction was written down and
    // the code left alone. It is resolved now, in the sill board's favour, by the founder's
    // observation of the running app.
    //
    // ⭐ AND THE SUITE NOW ASSERTS THE THING THAT WAS MISSING: that the two DIRECTIONS are
    // exact mirrors (§FEAT-REVEAL-DIRECTION below). A mirror test is falsifiable by a sign
    // error in a way "−1 is −1" never was.
    it('slides the outer lip proud of the CHOSEN face and carries the glazing with it', () => {
        const r = resolveWindowReveal({ ...BASE, revealProjection: 0.4 }, T);
        expect(r.active).toBe(true);
        // The default face is OUTDOOR, which is local +Z (see EXTERIOR_LOCAL_Z's header for
        // why this literal moved and what evidence moved it).
        expect(EXTERIOR_LOCAL_Z).toBe(1);
        expect(r.direction).toBe('outdoor');
        expect(r.outwardSign).toBe(1);
        expect(r.zOuterFace).toBeCloseTo(0.15 + 0.4, 12);
        // …and the pane rides out with the box, staying one reveal run behind the lip.
        expect(r.zGlazing).toBeCloseTo(0.4, 12);
        expect(Math.abs(r.zOuterFace - r.zGlazing)).toBeCloseTo(r.run, 12);
        expect(r.run).toBeCloseTo(T / 2, 12);
    });

    it('a NEGATIVE projection recesses the window, and the run is unchanged', () => {
        const r = resolveWindowReveal({ ...BASE, revealProjection: -0.1 }, T);
        expect(r.zOuterFace).toBeCloseTo(0.05, 12);    // 100 mm inside the outdoor face
        expect(r.zGlazing).toBeCloseTo(-0.1, 12);      // …and the pane follows it inward
        expect(r.run).toBeCloseTo(T / 2, 12);
    });

    it('THE PROJECTION DOES NOT TOUCH THE GLASS SIZE — the two parameters compose', () => {
        // The whole reason the run is `t/2` and not `p + t/2`: deepening the box must not
        // shrink the pane, or one attribute silently changes another's meaning.
        const shallow = resolveWindowReveal({ ...BASE, revealProjection: 0.05 }, T);
        const deep    = resolveWindowReveal({ ...BASE, revealProjection: 1.20 }, T);
        expect(shallow.glazingWidth).toBe(deep.glazingWidth);
        expect(shallow.glazingHeight).toBe(deep.glazingHeight);
        expect(shallow.run).toBe(deep.run);
    });
});

describe('§FEAT-WINDOW-REVEAL — the splay (the founder\'s second ask)', () => {
    it('THE ANGLE DEFINES THE SIZE OF THE GLASS, at exactly run × tan(θ) per side', () => {
        const r = resolveWindowReveal({ ...BASE, revealSplayJambLeft: 45, revealSplayJambRight: 45 }, T);
        // 45° over a 150 mm run = 150 mm off each jamb.
        expect(r.inset.jambLeft).toBeCloseTo(0.15, 9);
        expect(r.inset.jambRight).toBeCloseTo(0.15, 9);
        expect(r.glazingWidth).toBeCloseTo(1.2 - 0.3, 9);
        // …and an unsplayed axis is untouched. This is what makes "multiple" free.
        expect(r.glazingHeight).toBe(BASE.height);
        expect(r.glazingCentreX).toBeCloseTo(0, 12);
    });

    it('PER SIDE, AND UNEQUAL SIDES MOVE THE PANE — his photo is a raking head over square jambs', () => {
        const r = resolveWindowReveal({ ...BASE, revealSplayHead: 45 }, T);
        expect(r.inset.head).toBeCloseTo(0.15, 9);
        expect(r.inset.sill).toBe(0);
        expect(r.inset.jambLeft).toBe(0);
        expect(r.inset.jambRight).toBe(0);
        expect(r.glazingHeight).toBeCloseTo(1.4 - 0.15, 9);
        expect(r.glazingWidth).toBe(BASE.width);
        // The pane's centre drops by half the head inset, so its SILL edge stays put — the
        // sill is not splayed, and a symmetric shrink would have moved an edge nobody touched.
        expect(r.glazingCentreY).toBeCloseTo(-0.075, 9);
        expect(r.glazingCentreY - r.glazingHeight / 2).toBeCloseTo(-BASE.height / 2, 9);
    });

    it('the splay run is HALF the wall thickness, so a thicker wall splays further', () => {
        const thin  = resolveWindowReveal({ ...BASE, revealSplayHead: 30 }, 0.2);
        const thick = resolveWindowReveal({ ...BASE, revealSplayHead: 30 }, 0.6);
        expect(thick.inset.head).toBeCloseTo(thin.inset.head * 3, 9);
    });
});

describe('§FEAT-WINDOW-REVEAL — C83: IMPOSSIBLE is refused, naming BOTH numbers', () => {
    it('refuses when the two jamb splays MEET, and never clamps to a sliver', () => {
        // 0.6 m wall ⇒ 0.3 m run. 80° each side ⇒ 2 × 1.70 m of inset on a 1.2 m opening.
        const win = { ...BASE, revealSplayJambLeft: 80, revealSplayJambRight: 80 };
        const why = windowRevealRefusal(win, 0.6);
        expect(why).toBeTruthy();
        expect(why).toContain('80');            // the angle the user asked for…
        expect(why).toContain('1.200');         // …and the width that makes it degenerate.
        expect(why).toMatch(/no width/i);
        // ⛔ AND THE RESOLVER DID NOT QUIETLY FIX IT. A clamp would have produced a
        // positive width here and hidden the refusal from anyone who only looks at geometry.
        expect(resolveWindowReveal(win, 0.6).glazingWidth).toBeLessThanOrEqual(0);
    });

    it('refuses when head and sill MEET, naming the height', () => {
        const why = windowRevealRefusal({ ...BASE, revealSplayHead: 80, revealSplaySill: 80 }, 0.6);
        expect(why).toBeTruthy();
        expect(why).toContain('1.400');
        expect(why).toMatch(/no height/i);
    });

    it('refuses a recess deeper than the wall can carry, naming the depth AND the wall', () => {
        const why = windowRevealRefusal({ ...BASE, revealProjection: -0.2 }, T);
        expect(why).toBeTruthy();
        expect(why).toContain('0.200');   // the recess asked for
        expect(why).toContain('0.300');   // the wall that cannot carry it
    });

    it('NON-VACUITY: the same shapes one notch inside the boundary are ACCEPTED', () => {
        // A gate that refuses everything is not a gate. Each of these is the buildable
        // neighbour of a refusal above.
        expect(windowRevealRefusal({ ...BASE, revealSplayJambLeft: 45, revealSplayJambRight: 45 }, T)).toBeNull();
        expect(windowRevealRefusal({ ...BASE, revealSplayHead: 45, revealSplaySill: 45 }, T)).toBeNull();
        expect(windowRevealRefusal({ ...BASE, revealProjection: -0.14 }, T)).toBeNull();
        expect(windowRevealRefusal({ ...BASE, revealProjection: 2.0 }, T)).toBeNull();
    });

    it('the schema\'s angle cap is representability, NOT the design limit', () => {
        // 85° is where `tan` stops being usable. Whether 85° is buildable is a question
        // about THIS window, and only the geometric refusal can answer it — which is why a
        // wide opening accepts an angle a narrow one refuses.
        const wide   = { width: 6, height: 1.4, revealSplayJambLeft: MAX_REVEAL_SPLAY_DEG };
        const narrow = { width: 0.4, height: 1.4, revealSplayJambLeft: MAX_REVEAL_SPLAY_DEG };
        expect(windowRevealRefusal(wide, 0.2)).toBeNull();
        expect(windowRevealRefusal(narrow, 0.6)).toBeTruthy();
    });
});

describe('§FEAT-WINDOW-REVEAL — C83: INADVISABLE is SAID, not enforced', () => {
    it('warns on a deep cantilever, and names the check that is NOT built', () => {
        const note = windowRevealAdvisory({ ...BASE, revealProjection: 0.9 }, T);
        expect(note).toBeTruthy();
        // The honesty clause: it must not imply a boundary check happened.
        expect(note).toMatch(/property boundary/i);
        expect(note).toContain('L-1927');
        // …and it is an advisory, so the edit is still permitted.
        expect(windowRevealRefusal({ ...BASE, revealProjection: 0.9 }, T)).toBeNull();
    });

    it('warns when the splay eats more than half the glass', () => {
        // 60° over a 250 mm run removes 433 mm per jamb from a 1.2 m opening — leaving a
        // real 334 mm pane, i.e. 28% of the glass. Deliberately NOT the degenerate case:
        // that one is a REFUSAL, and an advisory that only ever fires alongside a refusal
        // would be untestable in the tier it belongs to.
        const note = windowRevealAdvisory({ ...BASE, revealSplayJambLeft: 60, revealSplayJambRight: 60 }, 0.5);
        expect(note).toBeTruthy();
        expect(note).toMatch(/% of the opening/);
    });

    it('NON-VACUITY: an ordinary reveal produces NO advisory', () => {
        expect(windowRevealAdvisory({ ...BASE, revealProjection: 0.15 }, T)).toBeNull();
        expect(windowRevealAdvisory({ ...BASE, revealSplayHead: 20 }, T)).toBeNull();
    });
});

// ── ⭐ §FEAT-REVEAL-DIRECTION (L-3410 … L-3416, founder 2026-08-22) ──────────────────────
//
// *"the reveal projection and splay are applied to the WRONG SIDE — both currently modify
//  the INDOOR face … I want an explicit direction option (Indoor / Outdoor), like the
//  door's Swing: Inward | Outward."*
//
// ⛔ THE ONE THING THIS BLOCK EXISTS TO GUARD is ADR-0342's binding rule: the projecting
// box and the splay are ONE geometry rule with ONE glazing plane, and a direction flag must
// not fork them into two. A fork would show up here as the projection mirroring and the
// splay not, or as the glazing rectangle changing size with the direction — so the mirror
// is asserted on ALL of it, not just on the lip.
describe('§FEAT-REVEAL-DIRECTION — the two faces are exact mirrors, and the glass is not touched', () => {
    const OUT = { ...BASE, revealProjection: 0.4, revealSplayHead: 30, revealSplayJambLeft: 20 };
    const IN  = { ...OUT, revealDirection: 'indoor' as const };

    it('the direction resolves, and an absent field is OUTDOOR', () => {
        expect(resolveWindowReveal(OUT, T).direction).toBe('outdoor');
        expect(resolveWindowReveal(IN, T).direction).toBe('indoor');
        expect(resolveWindowReveal({ ...OUT, revealDirection: 'nonsense' as never }, T).direction).toBe('outdoor');
    });

    it('⭐ every z flips sign, and NOTHING else changes', () => {
        const o = resolveWindowReveal(OUT, T);
        const i = resolveWindowReveal(IN, T);

        expect(i.zOuterFace).toBeCloseTo(-o.zOuterFace, 12);
        expect(i.zGlazing).toBeCloseTo(-o.zGlazing, 12);
        expect(i.outwardSign).toBe(-o.outwardSign);

        // THE GLASS IS NOT TOUCHED — this is the fork detector. The founder's own rule is
        // that the ANGLE defines the size of the glass; the FACE must not.
        expect(i.glazingWidth).toBeCloseTo(o.glazingWidth, 12);
        expect(i.glazingHeight).toBeCloseTo(o.glazingHeight, 12);
        expect(i.glazingCentreX).toBeCloseTo(o.glazingCentreX, 12);
        expect(i.glazingCentreY).toBeCloseTo(o.glazingCentreY, 12);
        expect(i.run).toBe(o.run);
        for (const s of REVEAL_SIDES) expect(i.inset[s]).toBeCloseTo(o.inset[s], 12);
    });

    it('⛔ NON-VACUITY — the two are genuinely different, not two reads of one object', () => {
        const o = resolveWindowReveal(OUT, T);
        const i = resolveWindowReveal(IN, T);
        expect(i.zOuterFace).not.toBeCloseTo(o.zOuterFace, 6);
        expect(o.zOuterFace).toBeGreaterThan(0);
        expect(i.zOuterFace).toBeLessThan(0);
    });

    it('the SPLAY mirrors too — a direction that moved only the box would be the ADR-0342 fork', () => {
        const oSplay = resolveWindowReveal({ ...BASE, revealSplayHead: 45 }, T);
        const iSplay = resolveWindowReveal({ ...BASE, revealSplayHead: 45, revealDirection: 'indoor' }, T);
        // same wedge, opposite side of the wall
        expect(iSplay.inset.head).toBeCloseTo(oSplay.inset.head, 12);
        expect(iSplay.zOuterFace).toBeCloseTo(-oSplay.zOuterFace, 12);
        expect(iSplay.zGlazing).toBeCloseTo(-oSplay.zGlazing, 12);
    });

    it('an UNAUTHORED window is byte-identical on both faces — C84 EI-2', () => {
        // Nothing authored means the short circuit fires before any sign is read, so a
        // record that never had a reveal renders exactly as it did before this feature no
        // matter what direction it nominally carries.
        const a = resolveWindowReveal(BASE, T);
        const b = resolveWindowReveal({ ...BASE, revealDirection: 'indoor' }, T);
        expect(a.active).toBe(false);
        expect(b.active).toBe(false);
        expect(a.glazingWidth).toBe(b.glazingWidth);
        expect(a.glazingHeight).toBe(b.glazingHeight);
        expect(a.zGlazing).toBe(b.zGlazing);
    });

    it('the C83 refusal names the face the USER chose, not a hard-coded one', () => {
        const deepRecess = { ...BASE, revealProjection: -0.5, revealDirection: 'indoor' as const };
        const reason = windowRevealRefusal(deepRecess, T);
        expect(reason).toBeTruthy();
        expect(String(reason)).toContain('indoor');
        const outdoorReason = windowRevealRefusal({ ...deepRecess, revealDirection: 'outdoor' }, T);
        expect(String(outdoorReason)).toContain('outdoor');
    });
});
