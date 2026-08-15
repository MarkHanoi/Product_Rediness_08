// ─── §MEASURED-INCUMBENT-RESOLVE — L-920 PROBE (founder architectural rule) ──
//
// FOUNDER RULE (§JOINT-AUTHORITY-IS-THE-INCUMBENT):
//   "The perimeter wall joints NEVER should be changed after creation because an
//    interior wall is created. NO MATTER the mitre joint. NO MATTER the type of
//    wall. The 3rd wall created needs to ADAPT and connect with the FACE of the
//    wall originally there."
//
// So: an existing junction is AUTHORITATIVE. A wall created later ADAPTS to it;
// it never modifies it. This file MEASURES whether that holds today, because if
// the incumbent L-pair is re-solved when a third wall arrives, then the
// §JUNCTION-VERTEX-CLAMP (the sibling commit) is treating a SYMPTOM — a
// clamped-but-still-re-solved incumbent is still wrong, it just looks less
// broken.
//
// METHOD: resolve the L-pair ALONE, record every number that decides its
// rendered corner (resolved baseline endpoints + both mitre normals). Then add a
// third wall at the same corner and resolve again. Byte-identical incumbent =
// rule upheld. Anything else = the incumbent was re-solved.
//
// TWO SEPARATE AXES, measured separately (verification != dispatch != rendering):
//   (a) MITRE/BASELINE re-solve — does WallJoinResolver change W1/W2?
//   (b) INFILL PRISM — does a patch appear over a corner that had none?
//
// This file is the §10.4 "incumbent-unchanged assertion" that C83 makes MANDATORY
// for every junction-touching change. It was built from the founder's rule before
// §10 was minted (5527827c) and is kept as that section's first instance.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED AT HEAD — THE VERDICT, and it is a C83 §10.2.1 violation:
//
//   AXIS (a) MITRE — VIOLATED. The incumbent L alone resolves to a correct
//   45-degree bisector mitre (eMN = sMN = (0.707107, 0.707107)). Add a third wall
//   at that corner and BOTH normals become null: the incumbent pair reverts to
//   SQUARE CAPS. The infill prism is then dropped over the hole that leaves —
//   which is the founder's "really bad" plan joint and the 3D triangle at once.
//
//   AXIS (a) BASELINE — HELD. The incumbents' baselines are byte-identical. Only
//   the mitre is destroyed, not the geometry's position. Recorded separately
//   because a successor must restore the mitre WITHOUT starting to move baselines
//   (the §CLAMP-COSHARE-WELD reverted-fix hazard).
//
//   AXIS (b) INFILL — a corner that had NO prism (2-wall clusters are skipped)
//   gains one the moment a third wall arrives.
//
//   CONTROL — a THINNER newcomer does NOT destroy the mitre. So the re-solve is
//   conditional on how cluster/T classification lands, not an unconditional
//   property of adding a third wall. Stated so the finding is not over-claimed.
//
// THE MECHANISM, named at file:line (read-only; fixing it is NOT this lane):
//   `WallJoinResolver.resolveLevel` runs `_handleMultiWallClusters` FIRST
//   (WallJoinResolver.ts:258-261) and returns `handledEndpointKeys`; `_detect` is
//   then told to SKIP those endpoints (:278-279). So once a third endpoint joins
//   the cluster, the incumbent L-corner's endpoints are "already handled" and the
//   pair-wise `_applyCorner` — the ONLY thing that writes startMN/endMN — never
//   runs for them. The corner is demoted from a mitred L to a consensus-trimmed
//   square-cap pair. This is precisely C83 §10.2.1's "a third wall re-clustering a
//   correct 2-wall L into a 3-wall problem is the mechanism, not a side effect".
//
// WHY THE CLAMP/BOUND COMMIT DOES NOT CLOSE THIS: §JUNCTION-VERTEX-BOUND stops
// the prism being CORRUPTED. It does not stop the incumbent's mitre being
// destroyed, and it does not stop a prism appearing over a corner that must not
// change. Bounding the symptom and refusing the degenerate case is the safety
// net; the re-solve above is the root, and it lives in WallJoinResolver.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { computeJunctionInfillsDetailed } from '../src/WallJunctionInfill';
import type { WallData } from '../src/WallTypes';

const T = 0.375;
const SNAP = 0.5;
const P = { x: 5, z: 0 };

let _seq = 0;
function layeredWall(id: string, s: [number, number], e: [number, number], thickness = T): WallData {
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: [
            { name: 'render-ext', thickness: thickness * 0.04 },
            { name: 'core',       thickness: thickness * 0.92 },
            { name: 'render-int', thickness: thickness * 0.04 },
        ],
        metadata: { createdAt: ++_seq },
    } as unknown as WallData;
}

/** The incumbent L: W1 arrives at the corner, W2 leaves it. Created FIRST. */
function incumbentL(): WallData[] {
    return [
        layeredWall('W1', [0, 0], [P.x, P.z]),
        layeredWall('W2', [P.x, P.z], [P.x, P.z + 5]),
    ];
}

/** The newcomer, joining the SAME corner at `deg` (CCW from +x). Created LAST. */
function newcomer(deg: number, thickness = T): WallData {
    const r = (deg * Math.PI) / 180;
    return layeredWall('W3', [P.x, P.z], [P.x + 5 * Math.cos(r), P.z + 5 * Math.sin(r)], thickness);
}

/** Every number that decides how an incumbent wall's corner renders. */
function corner(walls: WallData[], id: string): string {
    const jd = WallJoinResolver.resolveLevel(walls, { snapRadius: SNAP }).get(id);
    if (!jd) return 'ABSENT';
    const f = (n: number | undefined | null): string => (n == null ? 'null' : n.toFixed(6));
    const b = (jd as any).baseLine;
    const mn = (m: any): string => (m ? `(${f(m.nx)},${f(m.nz)})` : 'null');
    return [
        `s=(${f(b?.[0]?.x)},${f(b?.[0]?.z)})`,
        `e=(${f(b?.[1]?.x)},${f(b?.[1]?.z)})`,
        `sMN=${mn((jd as any).startMN)}`,
        `eMN=${mn((jd as any).endMN)}`,
    ].join(' ');
}

describe('§MEASURED-INCUMBENT-RESOLVE — is an existing junction authoritative? (L-920)', () => {

    it('§MEASURED-INCUMBENT-RESOLVE — the incumbent L LOSES ITS MITRE when a newcomer arrives', () => {
        // The incumbent L, alone: a correct 45-degree bisector mitre at the corner.
        const before = corner(incumbentL(), 'W1');
        expect(before).toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=(0.707107,0.707107)');
        expect(corner(incumbentL(), 'W2'))
            .toBe('s=(5.000000,0.000000) e=(5.000000,5.000000) sMN=(0.707107,0.707107) eMN=null');

        // A perpendicular newcomer joins — the founder's literal "another wall joins".
        const withW3 = [...incumbentL(), newcomer(-90)];

        // PINNED WRONG (C83 §10.2.1 violation). The incumbent corner's mitre normals
        // are GONE — both walls revert to SQUARE CAPS, and the infill prism is then
        // dropped over the hole that leaves. That is the founder's "really bad" plan
        // joint and the 3D triangle, in one measurement.
        //   DESIRED: byte-identical to `before` — the incumbent is authoritative.
        expect(corner(withW3, 'W1'))
            .toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=null');
        expect(corner(withW3, 'W2'))
            .toBe('s=(5.000000,0.000000) e=(5.000000,5.000000) sMN=null eMN=null');

        // The BASELINES do survive byte-identical — only the mitre is destroyed.
        // Recording which half moved and which did not is the point: a successor
        // fixing this must restore the mitre WITHOUT starting to move baselines
        // (the §CLAMP-COSHARE-WELD reverted-fix hazard).
        expect(withW3[0].baseLine).toEqual(incumbentL()[0].baseLine);
        expect(withW3[1].baseLine).toEqual(incumbentL()[1].baseLine);
    });

    it('§MEASURED-INCUMBENT-RESOLVE — same loss for an ACUTE newcomer (the spike geometry)', () => {
        const withW3 = [...incumbentL(), newcomer(85)];   // 5 deg off W2
        //   DESIRED: eMN=(0.707107,0.707107) / sMN=(0.707107,0.707107) — unchanged.
        expect(corner(withW3, 'W1'))
            .toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=null');
        expect(corner(withW3, 'W2'))
            .toBe('s=(5.000000,0.000000) e=(5.000000,5.000000) sMN=null eMN=null');
    });

    it('CONTROL — a THINNER newcomer does NOT destroy the mitre, so the loss is not universal', () => {
        // This is the control that stops the finding being over-claimed: the same
        // corner, the same newcomer direction, only the thickness changed, and the
        // incumbent mitre SURVIVES. So the re-solve is conditional on how the
        // cluster/T classification lands, not an unconditional property of adding a
        // third wall — a successor must not "fix" it by assuming it always fires.
        const before = { w1: corner(incumbentL(), 'W1'), w2: corner(incumbentL(), 'W2') };
        const withW3 = [...incumbentL(), newcomer(-90, 0.1)];
        expect({ w1: corner(withW3, 'W1'), w2: corner(withW3, 'W2') }).toEqual(before);
    });

    it('AXIS (c) PLAN — the incumbent\'s rendered PLAN FOOTPRINT changes too', () => {
        // Which VIEWS are proven, measured rather than assumed. The plan footprint of
        // a legacy-resolved (layered) wall is baseLine + thickness projected onto the
        // MITRE PLANES — so destroying the mitre normals changes the plan polygon,
        // not just the 3D prism. This is the founder's photo 1 (layer lines failing
        // to resolve into a clean T) and photo 2 (the 3D triangle) sharing ONE root.
        const planCorner = (walls: WallData[], id: string): string => {
            const jd: any = WallJoinResolver.resolveLevel(walls, { snapRadius: SNAP }).get(id);
            const [s, e] = jd.baseLine;
            const dx = e.x - s.x, dz = e.z - s.z;
            const len = Math.hypot(dx, dz);
            const ux = dx / len, uz = dz / len;
            const nx = -uz * (T / 2), nz = ux * (T / 2);
            // The two cap corners at the JOINING end (W1's end), projected onto the
            // mitre plane when one exists, square-capped when it does not.
            const proj = (px: number, pz: number): string => {
                const mn = jd.endMN;
                if (!mn) return `${px.toFixed(6)},${pz.toFixed(6)}`;
                const dot = mn.nx * ux + mn.nz * uz;
                const t = ((e.x - px) * mn.nx + (e.z - pz) * mn.nz) / dot;
                return `${(px + t * ux).toFixed(6)},${(pz + t * uz).toFixed(6)}`;
            };
            return `${proj(e.x + nx, e.z + nz)} | ${proj(e.x - nx, e.z - nz)}`;
        };

        const before = planCorner(incumbentL(), 'W1');
        const after  = planCorner([...incumbentL(), newcomer(-90)], 'W1');

        // PINNED WRONG — the mitred end face (one corner pulled forward to the
        // bisector) collapses to a flat square cap the moment the newcomer arrives.
        expect(before).toBe('4.812500,0.187500 | 5.187500,-0.187500');
        expect(after).toBe('5.000000,0.187500 | 5.000000,-0.187500');
        expect(after).not.toBe(before);   // DESIRED: identical
    });

    it('AXIS (b) — the incumbent corner had NO infill prism; does one appear?', () => {
        // Two walls never produce an infill: `wallIdsInCluster.length < 3` skips.
        const before = computeJunctionInfillsDetailed(incumbentL());
        expect(before.infills).toHaveLength(0);

        // Adding a third wall makes the SAME corner a 3-wall cluster, and a prism
        // is emitted ACROSS it — geometry the incumbent corner did not have before.
        const after = computeJunctionInfillsDetailed([...incumbentL(), newcomer(-90)]);
        expect(after.infills).toHaveLength(1);

        // This is the axis that is NOT fixed by the clamp: the clamp bounds the
        // prism's SIZE, it does not stop the prism from being added over a corner
        // the founder's rule says must not change. Pinned as the open root.
        expect(after.infills[0].clusterKey).toBe('W1|W2|W3');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §MEASURED-PRODUCTION-FAITHFUL (L-923, 2026-08-15) — THE REFUTATION.
//
// Everything above builds `WallData` BY HAND and omits ONE field: `joinIntent`.
// That field is not decoration. L-251 added it at the single element-creation
// chokepoint (C11) — `CreateWallCommand.ts:415-444` — for EXACTLY this defect,
// and its comment records the same numbers this file measures:
//
//   "L-251: the corner's miter normals went `707107,707107` -> `null` the instant
//    a same-type wall joined it ... The disambiguating fact is not geometric, it
//    is HISTORICAL, and it is knowable exactly HERE and nowhere else: at the
//    moment this wall is created, did a committed junction already exist at that
//    endpoint? ... Captured ONCE, at creation, and thereafter carried on the
//    record — never re-inferred from geometry on a later resolve pass, which is
//    what made every previous attempt a heuristic."
//
// The resolver reads it back as `_buttsHere` -> `newcomerButtsOntoCorner`, one of
// the `freezeExistingCorner` terms. So a newcomer that PRODUCTION creates onto a
// committed corner carries `joinIntent.start = 'butt'` and the corner is frozen.
// A hand-built newcomer that omits the field does not — and that, measured below,
// is the whole of the L-920 "defect". The figure measured a wall production never
// emits.
//
// This is stated as a REFUTATION rather than a fix because it is falsifiable in
// one line: stamp the field the way the chokepoint stamps it, change nothing else,
// and the mitre survives byte-identical at HEAD.
//
// WHY IT STILL MATTERS (do not read this as "nothing is wrong"): the ONLY writer
// of `joinIntent` is `CreateWallCommand`. Any wall reaching the store by another
// route — generators/importers that write the store directly, and any wall created
// BEFORE L-251 landed and persisted without the field — is a newcomer production
// cannot distinguish, and for those the mitre still dies exactly as pinned above.
// That residue is a CREATION-PATH coverage gap, not a resolver defect, and it is
// named in §MEASURED-JOININTENT-COVERAGE below rather than "fixed" in the resolver
// by re-inferring history from geometry — the move L-251 explicitly forbids.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replicates `CreateWallCommand.ts:415-444` EXACTLY (EPS 20 mm, ">= 2 existing
 * endpoints at the node ⇒ a corner was already committed there"). Kept as a
 * faithful copy rather than an import because the command lives in
 * `@pryzm/command-registry` (L2) and this is an L1-package test — the copy is the
 * thing under test, so a drift between them is itself a finding.
 */
function stampJoinIntentAsProductionDoes(newWall: WallData, existing: readonly WallData[]): WallData {
    const EPS = 0.02;                       // 20 mm — the endpoint-coincidence radius
    const levelWalls = existing.filter(w => w.levelId === newWall.levelId && w.id !== newWall.id);
    const committedEndpointsAt = (p: { x: number; z: number }): number => {
        let n = 0;
        for (const w of levelWalls) {
            for (const e of [w.baseLine[0], w.baseLine[1]]) {
                if (Math.hypot(e!.x - p.x, e!.z - p.z) <= EPS) n++;
            }
        }
        return n;
    };
    const startIsOntoCommitted = committedEndpointsAt(newWall.baseLine[0] as { x: number; z: number }) >= 2;
    const endIsOntoCommitted   = committedEndpointsAt(newWall.baseLine[1] as { x: number; z: number }) >= 2;
    if (startIsOntoCommitted || endIsOntoCommitted) {
        (newWall as { joinIntent?: { start?: 'butt'; end?: 'butt' } }).joinIntent = {
            ...(startIsOntoCommitted ? { start: 'butt' as const } : {}),
            ...(endIsOntoCommitted   ? { end:   'butt' as const } : {}),
        };
    }
    return newWall;
}

describe('§MEASURED-PRODUCTION-FAITHFUL — is the L-920 figure what production emits? (L-923)', () => {

    it('the newcomer production emits carries joinIntent.start = butt (the L-251 stamp fires here)', () => {
        const inc = incumbentL();
        const w3 = stampJoinIntentAsProductionDoes(newcomer(-90), inc);
        // W1's END and W2's START both sit at (5,0) ⇒ 2 committed endpoints ⇒ butt.
        expect((w3 as unknown as { joinIntent?: unknown }).joinIntent).toEqual({ start: 'butt' });
    });

    it('§MEASURED-MITRE-DEATH does NOT reproduce on the production-faithful newcomer — the incumbent mitre SURVIVES', () => {
        const beforeW1 = corner(incumbentL(), 'W1');
        const beforeW2 = corner(incumbentL(), 'W2');
        expect(beforeW1).toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=(0.707107,0.707107)');

        const inc = incumbentL();
        const withW3 = [...inc, stampJoinIntentAsProductionDoes(newcomer(-90), inc)];

        // BYTE-IDENTICAL — C83 §10.4's incumbent-unchanged assertion, on the MITRE
        // NORMALS and not merely the baselines (a baseline-only assertion reads green
        // straight through this defect, which is how it survived previous fixes).
        expect(corner(withW3, 'W1')).toBe(beforeW1);
        expect(corner(withW3, 'W2')).toBe(beforeW2);
        expect(withW3[0]!.baseLine).toEqual(incumbentL()[0]!.baseLine);
        expect(withW3[1]!.baseLine).toEqual(incumbentL()[1]!.baseLine);
    });

    it('holds on BOTH thickness directions — same-thickness AND thicker AND thinner newcomer', () => {
        // L-920 measured the thickness axis as the hot trigger: a THINNER newcomer
        // survived (the §FIX-WALL-LCORNER-COLLINEAR-STEP term) while SAME-thickness
        // died. With the production stamp the axis goes flat — pinned in all three
        // directions so no successor re-keys the freeze on thickness.
        const before = { w1: corner(incumbentL(), 'W1'), w2: corner(incumbentL(), 'W2') };
        for (const th of [T, T * 2, 0.1]) {           // same, thicker, thinner
            const inc = incumbentL();
            const withW3 = [...inc, stampJoinIntentAsProductionDoes(newcomer(-90, th), inc)];
            expect({ w1: corner(withW3, 'W1'), w2: corner(withW3, 'W2') },
                `newcomer thickness=${th}`).toEqual(before);
        }
    });

    it('holds for the ACUTE newcomer (the spike geometry) too', () => {
        const before = { w1: corner(incumbentL(), 'W1'), w2: corner(incumbentL(), 'W2') };
        const inc = incumbentL();
        const withW3 = [...inc, stampJoinIntentAsProductionDoes(newcomer(85), inc)];
        expect({ w1: corner(withW3, 'W1'), w2: corner(withW3, 'W2') }).toEqual(before);
    });

    it('AXIS (c) PLAN — the plan footprint does NOT collapse for the production-faithful newcomer', () => {
        // The founder's photo 1. The plan footprint of a layered wall is baseLine +
        // thickness projected onto the MITRE PLANES, so a dead mitre collapses
        // `4.812500,0.187500 | 5.187500,-0.187500` to a flat `5.000000,… | 5.000000,…`
        // square cap. Proving the plan half rather than assuming both photos share a
        // root: this asserts the collapse does not happen.
        const planCorner = (walls: WallData[], id: string): string => {
            const jd: any = WallJoinResolver.resolveLevel(walls, { snapRadius: SNAP }).get(id);
            const [s, e] = jd.baseLine;
            const dx = e.x - s.x, dz = e.z - s.z;
            const len = Math.hypot(dx, dz);
            const ux = dx / len, uz = dz / len;
            const nx = -uz * (T / 2), nz = ux * (T / 2);
            const proj = (px: number, pz: number): string => {
                const mn = jd.endMN;
                if (!mn) return `${px.toFixed(6)},${pz.toFixed(6)}`;
                const dot = mn.nx * ux + mn.nz * uz;
                const t = ((e.x - px) * mn.nx + (e.z - pz) * mn.nz) / dot;
                return `${(px + t * ux).toFixed(6)},${(pz + t * uz).toFixed(6)}`;
            };
            return `${proj(e.x + nx, e.z + nz)} | ${proj(e.x - nx, e.z - nz)}`;
        };
        const inc = incumbentL();
        const before = planCorner(incumbentL(), 'W1');
        const after  = planCorner([...inc, stampJoinIntentAsProductionDoes(newcomer(-90), inc)], 'W1');
        expect(before).toBe('4.812500,0.187500 | 5.187500,-0.187500');
        expect(after).toBe(before);                        // NOT the 5.000000 collapse
    });

    it('§MEASURED-JOININTENT-COVERAGE — the residue: an UNSTAMPED newcomer still kills the mitre', () => {
        // The honest bound on the refutation. `joinIntent` has exactly ONE writer
        // (CreateWallCommand). A wall that reaches the store by any other route —
        // generator/importer direct writes, or a wall persisted BEFORE L-251 landed —
        // carries no stamp, and for it the L-920 measurement stands unchanged. This is
        // the OPEN half, pinned so it cannot be mistaken for closed, and it is a
        // creation-path coverage gap rather than a resolver defect.
        const withUnstamped = [...incumbentL(), newcomer(-90)];   // no stamp
        expect(corner(withUnstamped, 'W1'))
            .toBe('s=(0.000000,0.000000) e=(5.000000,0.000000) sMN=null eMN=null');
    });
});
