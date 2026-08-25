/**
 * §OUTLINE80 (SPEC-WINDOW-CUSTOM-OUTLINE D1–D3, D12) — the `custom` opening profile: its
 * validator, its outline production, its family restriction (window only, D12), and the ONE
 * schema gate every store write passes through (`WallStore.addOpening` → `OpeningSchema`).
 *
 * These pin the PURE layer — `CustomOutline.ts` and `OpeningProfile.ts`'s `custom` arm — not the
 * THREE-based wall-body builders (arms A/B/C), which need their own geometric PR-4 pins as a
 * follow-up (named, not silently skipped: see the ISSUE-LOG row this commit adds).
 */
import { describe, it, expect } from 'vitest';
import {
    validateCustomOutline,
    normaliseCustomOutlineWinding,
    type CustomOutline,
} from '../src/CustomOutline';
import {
    openingOutline,
    openingProfilesFor,
    OPENING_PROFILE_KINDS,
} from '../src/OpeningProfile';
import { OpeningSchema } from '../src/WallDataSchema';

/** Apex-up triangle touching all four unit-square edges: u∈[0,1], v∈[0,1]. */
const TRIANGLE: CustomOutline = { vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 1 }] };

describe('§OUTLINE80 — validateCustomOutline (D3, the ONE predicate)', () => {
    it('a valid triangle passes (returns null)', () => {
        expect(validateCustomOutline(TRIANGLE)).toBeNull();
    });

    it('null/undefined/empty → too-few-vertices', () => {
        expect(validateCustomOutline(null)?.code).toBe('too-few-vertices');
        expect(validateCustomOutline(undefined)?.code).toBe('too-few-vertices');
        expect(validateCustomOutline({ vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }] })?.code)
            .toBe('too-few-vertices');
    });

    it('a non-finite vertex → non-finite-vertex', () => {
        const ring: CustomOutline = { vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: NaN, v: 1 }] };
        expect(validateCustomOutline(ring)?.code).toBe('non-finite-vertex');
    });

    it('the closing vertex repeating the first → closing-vertex-repeated (implicit closure, same convention as OpeningOutline.points)', () => {
        const ring: CustomOutline = {
            vertices: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0.5, v: 1 }, { u: 0, v: 0 }],
        };
        expect(validateCustomOutline(ring)?.code).toBe('closing-vertex-repeated');
    });

    it('a self-crossing ring (bowtie) → self-intersecting', () => {
        // A bowtie touching all four edges: (0,0)→(1,1)→(1,0)→(0,1)→back — edges 0-1 and 2-3 cross.
        const bowtie: CustomOutline = {
            vertices: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 1, v: 0 }, { u: 0, v: 1 }],
        };
        expect(validateCustomOutline(bowtie)?.code).toBe('self-intersecting');
    });

    it('a ring not touching all four unit-square edges → loose-bbox (D2: width/height must not misreport the shape)', () => {
        // A triangle entirely inside [0.2, 0.8] × [0.2, 0.8] — never reaches u=0/u=1/v=0/v=1.
        const inset: CustomOutline = {
            vertices: [{ u: 0.2, v: 0.2 }, { u: 0.8, v: 0.2 }, { u: 0.5, v: 0.8 }],
        };
        expect(validateCustomOutline(inset)?.code).toBe('loose-bbox');
    });

    it('a sliver whose area falls below the floor → degenerate-area', () => {
        // The two opposite corners (0,0) and (1,1) alone satisfy all four bbox touches, so the
        // third vertex can sit arbitrarily close to that diagonal without losing the bbox check —
        // isolating the area floor from every other rule.
        const sliver: CustomOutline = {
            vertices: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 0.5, v: 0.5 + 1e-8 }],
        };
        expect(validateCustomOutline(sliver)?.code).toBe('degenerate-area');
    });

    it('every refusal names the failing rule in prose, never a bare code', () => {
        const refusal = validateCustomOutline({ vertices: [] });
        expect(refusal?.reason).toMatch(/at least 3 vertices/);
    });
});

describe('§OUTLINE80 — normaliseCustomOutlineWinding (D3: normalised on commit, never refused)', () => {
    it('a clockwise triangle comes back counter-clockwise', () => {
        const cw: CustomOutline = { vertices: [{ u: 0, v: 0 }, { u: 0.5, v: 1 }, { u: 1, v: 0 }] };
        const signedArea2 = (r: CustomOutline): number => {
            let a = 0;
            for (let i = 0; i < r.vertices.length; i++) {
                const p = r.vertices[i]!, q = r.vertices[(i + 1) % r.vertices.length]!;
                a += p.u * q.v - q.u * p.v;
            }
            return a;
        };
        expect(signedArea2(cw)).toBeLessThan(0);
        const fixed = normaliseCustomOutlineWinding(cw);
        expect(signedArea2(fixed)).toBeGreaterThan(0);
        // Already-CCW input is returned unchanged (same vertex order).
        const already = normaliseCustomOutlineWinding(TRIANGLE);
        expect(already.vertices).toEqual(TRIANGLE.vertices);
    });
});

describe('§OUTLINE80 — openingOutline() with the custom kind (D1, D2)', () => {
    it('scales the normalised ring to the opening\'s width × height, in the wall-local frame', () => {
        const o = openingOutline({
            profile: 'custom', offset: 2, width: 4, height: 3, sillHeight: 0.9,
            customOutline: TRIANGLE,
        });
        expect(o).not.toBeNull();
        expect(o!.isRectangular).toBe(false);
        // width=4 → x spans a 4 m range; height=3 → y spans a 3 m range from the sill.
        const xs = o!.points.map((p) => p.x);
        const ys = o!.points.map((p) => p.y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 6);
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3, 6);
        expect(Math.min(...ys)).toBeCloseTo(0.9, 6); // v=0 sits at the sill
    });

    it('resizing the opening stretches the shape (D2\'s stated consequence), not translates a fixed size', () => {
        const wide = openingOutline({
            profile: 'custom', offset: 0, width: 8, height: 3, sillHeight: 0, customOutline: TRIANGLE,
        })!;
        const xs = wide.points.map((p) => p.x);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8, 6);
    });

    it('a ring the validator refuses produces no outline (null), never a fabricated rectangle (C86 §10.1 WO-G-5)', () => {
        const insetRing: CustomOutline = {
            vertices: [{ u: 0.2, v: 0.2 }, { u: 0.8, v: 0.2 }, { u: 0.5, v: 0.8 }],
        };
        const o = openingOutline({
            profile: 'custom', offset: 0, width: 1, height: 1, sillHeight: 0, customOutline: insetRing,
        });
        expect(o).toBeNull();
    });

    it('no customOutline supplied for a custom profile → null (never a bbox rectangle stand-in)', () => {
        const o = openingOutline({ profile: 'custom', offset: 0, width: 1, height: 1, sillHeight: 0 });
        expect(o).toBeNull();
    });
});

describe('§OUTLINE80 — family restriction (D12): custom is WINDOW-only', () => {
    it('openingProfilesFor("window") offers custom; ("door") does not', () => {
        expect(openingProfilesFor('window')).toContain('custom');
        expect(openingProfilesFor('door')).not.toContain('custom');
    });

    it('OPENING_PROFILE_KINDS (the one authority) still carries all five, so nothing re-lists them', () => {
        expect(OPENING_PROFILE_KINDS).toEqual(
            ['rectangular', 'round-arch', 'segmental-arch', 'circular', 'custom'],
        );
    });
});

describe('§OUTLINE80 — OpeningSchema (D1): the ONE gate every WallStore write passes through', () => {
    const base = {
        id: 'op1', type: 'window' as const, offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9,
        elementId: 'win1',
    };

    it('openingProfile "custom" WITH a customOutline parses cleanly', () => {
        const result = OpeningSchema.safeParse({ ...base, openingProfile: 'custom', customOutline: TRIANGLE });
        expect(result.success).toBe(true);
    });

    it('openingProfile "custom" with NO customOutline is refused — "one AXIS, plus its carrier" (D1)', () => {
        const result = OpeningSchema.safeParse({ ...base, openingProfile: 'custom' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('customOutline'))).toBe(true);
        }
    });

    it('a NON-custom profile carrying a stray customOutline is refused — no second field for one axis (C86 §9 WO-Voc-4)', () => {
        const result = OpeningSchema.safeParse({ ...base, openingProfile: 'rectangular', customOutline: TRIANGLE });
        expect(result.success).toBe(false);
    });

    it('an opening with neither field (pre-L-1200 shape) still parses — additive, byte-identical (C47 §1.2)', () => {
        const result = OpeningSchema.safeParse(base);
        expect(result.success).toBe(true);
    });
});
