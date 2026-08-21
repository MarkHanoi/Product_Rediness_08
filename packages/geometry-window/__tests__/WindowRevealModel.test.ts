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
        expect(r.zOuterFace).toBeCloseTo(-T / 2, 12);
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
    it('slides the outer lip proud of the EXTERIOR face and carries the glazing with it', () => {
        const r = resolveWindowReveal({ ...BASE, revealProjection: 0.4 }, T);
        expect(r.active).toBe(true);
        // Exterior is local −Z (the authored layer-stack axis; see EXTERIOR_LOCAL_Z), so a
        // POSITIVE projection must make the lip MORE negative, never less.
        expect(EXTERIOR_LOCAL_Z).toBe(-1);
        expect(r.zOuterFace).toBeCloseTo(-0.15 - 0.4, 12);
        // …and the pane rides out with the box, staying one reveal run behind the lip.
        expect(r.zGlazing).toBeCloseTo(-0.4, 12);
        expect(r.zGlazing - r.zOuterFace).toBeCloseTo(r.run, 12);
        expect(r.run).toBeCloseTo(T / 2, 12);
    });

    it('a NEGATIVE projection recesses the window, and the run is unchanged', () => {
        const r = resolveWindowReveal({ ...BASE, revealProjection: -0.1 }, T);
        expect(r.zOuterFace).toBeCloseTo(-0.05, 12);   // 100 mm inside the exterior face
        expect(r.zGlazing).toBeCloseTo(0.1, 12);       // …and the pane follows it inward
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
