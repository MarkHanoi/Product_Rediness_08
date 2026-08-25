// probe-wjfix96-01 — lane WJFIX96 (READ-ONLY diagnostic; committed as evidence).
//
// L-11329 claims: `WallFragmentBuilder.ts:~4594-4600` and `:~4734-4740` stamp
// `role:'geometry'` with NO `elementType`, and that this is "the PLAIN-WALL twin
// of the defect §WJFIX92 F-1 fixed for the layered arm", i.e. that the
// §DIAG-OPENING-VOID scan "stays blind to plain walls and keeps routing their
// window edits to the whole-level rebuild".
//
// TWO INDEPENDENT QUESTIONS, measured separately, because the answers differ:
//
//   Q1 — does a PLAIN wall WITH an opening read bodyParts=0 / voidCut=false at
//        `WallRebuildCoordinator._flushOpeningsOnly`'s census?  (L-11329's stated
//        mechanism.)
//   Q2 — do those two unstamped sites reach ANY consumer that classifies by
//        `elementType`?  The nearest one is `EdgeProjectorService`'s per-mesh ISO
//        layer resolution, whose own header records this exact failure family
//        THREE times (L-257, L-261, L-275): a mesh that resolves to no layer is
//        dropped out of A-WALL, out of the pen table, out of the cut gate and out
//        of the poché, all at once and with no error.
//
// Run: cd packages/geometry-wall && node ../../node_modules/tsx/dist/cli.mjs \
//        probes/probe-wjfix96-01-plain-arm-elementtype.local.mts

import './_wj91-shim.local.mts';
import * as THREE from '@pryzm/renderer-three/three';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData, Opening } from '../src/WallTypes';

const OPENING: Opening = {
    id: 'op-1', type: 'window', offset: 2.0, width: 1.2, height: 1.5,
    sillHeight: 0.9, elementId: 'win-1',
} as Opening;

const levelProvider = {
    getLevelById: (id: string) => ({ id, name: 'G', elevation: 0, height: 3, childrenIds: [] }),
    getLevels: () => [{ id: 'L0', name: 'G', elevation: 0, height: 3, childrenIds: [] }],
};

function wall(id: string, s: [number, number], e: [number, number], withOpening: boolean): WallData {
    return {
        id, type: 'wall', levelId: 'L0', properties: {},
        childrenIds: withOpening ? ['win-1'] : [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: 0.3, baseOffset: 0,
        openings: withOpening ? [OPENING] : [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'probe', version: 1 },
    } as unknown as WallData;
}

// ── CONSUMER 1: WallRebuildCoordinator §DIAG-OPENING-VOID, transcribed verbatim ──
// Source: apps/editor/src/engine/WallRebuildCoordinator.ts, `_flushOpeningsOnly`.
// NOTE the guard the transcription must NOT drop: the census is only consulted
// `if (_openings.length > 0)`.
function voidCutScan(group: THREE.Group): { bodyParts: number; isHidden: boolean; voidCut: boolean } {
    let bodyParts = 0;
    const isHidden = group.visible === false || (group.userData as { __wjrNaNHidden?: boolean })?.__wjrNaNHidden === true;
    for (const child of group.children) {
        const ud = (child as { userData?: { elementType?: string } }).userData;
        if (ud?.elementType === 'WallPart' || ud?.elementType === 'WallLayer') bodyParts++;
    }
    return { bodyParts, isHidden, voidCut: !isHidden && bodyParts > 0 };
}

// ── CONSUMER 2: EdgeProjectorService ISO-layer resolution, transcribed ──────────
// Source: apps/editor/src/engine/views/EdgeProjectorService.ts
//   :2866-2877 — rawElementType ?? (wallId && layerIndex ? 'WallLayer' : undefined)
//   :313-316   — resolveProjectionLayer: canonical-key lookup, else FALLBACK.
const WALL_LAYER_KEYS = new Set(['wall', 'wallpart', 'layeredwall', 'walllayer', 'walledges', 'curtainwall']);
const FALLBACK_NATIVE_LAYER = 'projection-visible';
function projectionLayerOf(mesh: THREE.Object3D): string {
    const ud = mesh.userData as { elementType?: string; wallId?: string; layerIndex?: number };
    const elementType = ud?.elementType
        ?? (ud?.wallId !== undefined && ud?.layerIndex !== undefined ? 'WallLayer' : undefined);
    if (!elementType) return FALLBACK_NATIVE_LAYER;
    const key = elementType.toLowerCase().replace(/[-_\s]/g, '');
    return WALL_LAYER_KEYS.has(key) ? 'A-WALL' : FALLBACK_NATIVE_LAYER;
}

function census(label: string, group: THREE.Group, openings: number): void {
    console.log(`\n── ${label} (store openings = ${openings}) ─────────────────────────`);
    const seen = new Map<string, number>();
    for (const child of group.children) {
        const ud = (child as { userData?: Record<string, unknown> }).userData ?? {};
        const isMesh = (child as THREE.Mesh).isMesh === true;
        const key = `${child.type}${isMesh ? '' : ' (not a Mesh)'} elementType=${String(ud.elementType ?? 'NONE')} `
            + `role=${String(ud.role ?? 'NONE')} pipelineV2=${String(ud.pipelineV2 ?? '-')} `
            + `holeExtrude=${String(ud.holeExtrudeBody ?? '-')} → ISO layer ${isMesh ? projectionLayerOf(child) : 'n/a'}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [k, n] of seen) console.log(`  ${n} × ${k}`);
    const scan = voidCutScan(group);
    console.log(`  §DIAG-OPENING-VOID census → bodyParts=${scan.bodyParts} isHidden=${scan.isHidden} voidCut=${scan.voidCut}`);
    console.log(`  …but the coordinator only CONSULTS that census when openings > 0 ⇒ `
        + `${openings > 0 ? 'CONSULTED — this reading is live' : 'NOT CONSULTED — this reading is unreachable'}`);
    const meshes = group.children.filter((c) => (c as THREE.Mesh).isMesh);
    const dropped = meshes.filter((m) => projectionLayerOf(m) === FALLBACK_NATIVE_LAYER);
    console.log(`  EdgeProjector: ${meshes.length} mesh(es); ${dropped.length} resolve to `
        + `'${FALLBACK_NATIVE_LAYER}' instead of A-WALL (no pen, no cut gate, no poché).`);
}

const scene = new THREE.Scene();
const builder = new WallFragmentBuilder(scene, levelProvider as never);
// W1 hosts the opening, W3 does not; both are JOINED to W2 so the mitred arm runs.
const walls = [
    wall('W1', [0, 0], [6, 0], true),
    wall('W2', [6, 0], [6, 4], false),
    wall('W3', [6, 4], [0, 4], false),
];
const joins = WallJoinResolver.resolveLevel(
    walls.map((w) => ({ ...w })) as never, { snapRadius: 0.5 },
) as Map<string, unknown>;
for (const w of walls) builder.buildWall(w, (joins.get(w.id) ?? null) as never, undefined, 0);

const groupOf = (id: string) =>
    scene.children.find((c) => (c.userData as { id?: string })?.id === id) as THREE.Group;

census('W1 — PLAIN wall WITH a window (the openings>0 arm)', groupOf('W1'), 1);
census('W3 — PLAIN wall with NO openings (createWallBodyFragment, the two cited sites)', groupOf('W3'), 0);

const w1 = voidCutScan(groupOf('W1'));
console.log(`
VERDICT Q1 (L-11329's stated mechanism): a PLAIN wall WITH an opening reads
  bodyParts=${w1.bodyParts} voidCut=${w1.voidCut}
  ⇒ ${w1.voidCut ? 'NO false positive. L-11329 as written is REFUTED: the two cited sites live in'
    + '\n     `createWallBodyFragment`, whose SOLE call site is guarded by `wall.openings.length === 0`,'
    + '\n     so a wall that reaches the void census never took that code path at all.'
    : 'FALSE POSITIVE CONFIRMED for the plain arm.'}

VERDICT Q2 (the residual, and it is real): the openings-FREE plain body mesh carries no
  \`elementType\`, no \`wallId\` and no \`layerIndex\`, so EdgeProjectorService resolves it to
  '${FALLBACK_NATIVE_LAYER}' — outside A-WALL. That is L-275's founder symptom
  ("no door → a hollow outline; door → a properly filled poché") reached by ABSENCE
  rather than by case, which L-275's canonical-key normaliser cannot fix.`);
