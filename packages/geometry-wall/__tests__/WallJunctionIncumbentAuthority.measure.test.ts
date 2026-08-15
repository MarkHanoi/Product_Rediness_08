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
