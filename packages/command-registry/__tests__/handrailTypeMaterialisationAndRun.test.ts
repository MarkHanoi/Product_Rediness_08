/**
 * §FEAT-HANDRAIL-CREATION-PARITY / §FEAT-HANDRAIL-TYPE-LIBRARY-20 (C95 D4+D5).
 *
 * TWO DEFECTS AND ONE NEW CAPABILITY, all executed through PRODUCTION code.
 *
 * ── L-983: A CATALOGUE TYPE WAS HALF-APPLIED (C84 EI-2) ─────────────────────
 * `HandrailTypeDefinition` describes a balustrade — the baluster's SHAPE, its
 * WIDTH, its pitch, and the code's maximum clear gap. `CreateHandrailCommand` —
 * the ONE creation authority (C95 §4.2), reached from the 3-D tool, the plan tool,
 * the IFC importer and the project loader — accepted `height`, `thickness`,
 * `baseOffset`, `fillType`, `railProfile`, `railDiameter`, `postSpacing` and
 * `materialColor`, AND NOTHING ELSE. So a user who picked "Timber Picket Railing"
 * got its height and its post spacing, and 20 mm generic balusters at the
 * historical 0.11 m default, because the only path from the catalogue to the
 * record dropped the rest on the floor. `materialId` was dropped the same way,
 * even though `HandrailFragmentBuilder.resolveColour` reads it.
 *
 * ── THE RUN, AND ITS JOIN (founder, D4) ────────────────────────────────────
 * A multi-segment run is N two-point handrails (`baseLine` is a 2-tuple and this
 * lane does not pretend otherwise). `HandrailFragmentBuilder` posts BOTH ends of
 * every segment, so a shared vertex used to take two coincident posts. The run
 * command + `suppressStartPost` give exactly one post per vertex — asserted here
 * by COUNTING THE MESHES THE REAL BUILDER EMITS, not by re-reading the flag.
 *
 * ── ONE GESTURE, ONE UNDO ENTRY (C16 §8.6) ─────────────────────────────────
 * One `undo()` on the run command removes every record it created — asserted
 * against the REAL `HandrailStore`, not a Map that pretends to be one. (The
 * sibling suite `handrailDeleteLeavesGraphEdges.test.ts` uses a hand-written
 * store double; this one deliberately does not, because the thing under test is
 * exactly what a double would paper over.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { ProjectContext } from '@pryzm/core-app-model';
import { HandrailStore, handrailTypeStore } from '@pryzm/core-app-model/stores';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '@pryzm/geometry-handrail';
import { segmentsFromVertices, rectangleLoopVertices } from '@pryzm/geometry-handrail';
import { CreateHandrailCommand } from '../src/handrails/CreateHandrailCommand';
import { CreateHandrailRunCommand } from '../src/handrails/CreateHandrailRunCommand';
// L-987 — the THREE byte-identical handrail snapshot implementations, imported by
// path because two of them are unreachable by name from their own barrels (see
// each file's header). Relative paths, not package specifiers: the packages'
// `exports` maps do not publish these paths, which is itself part of the
// measurement — two of the three cannot be imported by a normal consumer at all.
import {
    serializeHandrailSnapshot as serializeAuthority,
    deserializeHandrailSnapshot as deserializeAuthority,
} from '../../core-app-model/src/stores/HandrailSnapshotUtils';
import {
    serializeHandrailSnapshot as serializeDup2,
    deserializeHandrailSnapshot as deserializeDup2,
} from '../../core-app-model/src/stores/handrailSnapshotUtils2';
import {
    serializeHandrailSnapshot as serializeDup3,
    deserializeHandrailSnapshot as deserializeDup3,
} from '../../geometry-stair/src/handrailSnapshotUtils';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'L0';

let _seq = 0;
const nextId = (): string => `handrail-mat-${_seq++}`;

function makeCtx(): { ctx: CommandContext; store: HandrailStore } {
    const store = new HandrailStore(new ProjectContext());
    const ctx = {
        stores: { handrailStore: store },
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? { id, elevation: 0 } : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
        },
        projectContext: { activeLevelId: LEVEL_ID },
    } as unknown as CommandContext;
    return { ctx, store };
}

/** Count the POST meshes the real builder emits for a set of handrails. */
function buildAndCountPosts(rails: readonly HandrailData[]): number {
    const scene = new THREE.Scene();
    const builder = new HandrailFragmentBuilder(scene, {
        getLevelById: () => ({ elevation: 0 }),
    } as never);
    for (const r of rails) builder.updateHandrail(r);
    let posts = 0;
    scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && (o.userData as { member?: string }).member === 'post') posts++;
    });
    return posts;
}

describe('L-983 — a catalogue handrail type reaches the record WHOLE (C84 EI-2)', () => {
    it('the type library ships exactly the 20 types the founder asked for, and the 5 original ids survive', () => {
        const all = handrailTypeStore.getAll();
        expect(all).toHaveLength(20);
        for (const legacyId of [
            'glass-guardrail', 'stainless-handrail', 'timber-baluster',
            'steel-guardrail', 'stair-handrail',
        ]) {
            expect(all.some((t) => t.id === legacyId)).toBe(true);
        }
        // Every type must be BUILDABLE: its fillType is one the builder implements.
        for (const t of all) {
            expect(['glass', 'panel', 'baluster', 'open']).toContain(t.fillType);
            expect(t.height).toBeGreaterThanOrEqual(0.3);
            expect(t.height).toBeLessThanOrEqual(2.5);
        }
        // Every id is unique — a duplicate would silently shadow in the Map.
        expect(new Set(all.map((t) => t.id)).size).toBe(20);
    });

    it('THE TOOTH: every field of a real catalogue type is on the stored record', () => {
        const type = handrailTypeStore.getById('timber-picket');
        expect(type).toBeDefined();
        const { ctx, store } = makeCtx();
        const id = nextId();

        new CreateHandrailCommand({
            id,
            start: { x: 0, z: 0 },
            end: { x: 4, z: 0 },
            height: type!.height,
            thickness: type!.thickness,
            baseOffset: type!.baseOffset,
            fillType: type!.fillType,
            railProfile: type!.railProfile,
            railDiameter: type!.railDiameter,
            postSpacing: type!.postSpacing,
            materialColor: type!.materialColor,
            balusterShape: type!.balusterShape,
            balusterWidth: type!.balusterWidth,
            balusterSpacing: type!.balusterSpacing,
            infillMaxGap: type!.infillMaxGap,
            levelId: LEVEL_ID,
        }).execute(ctx);

        const rec = store.getById(id)!;
        expect(rec).toBeDefined();
        // These four were DROPPED before the fix — the command had no slot for them.
        expect(rec.balusterShape).toBe(type!.balusterShape);
        expect(rec.balusterWidth).toBe(type!.balusterWidth);
        expect(rec.infillMaxGap).toBe(type!.infillMaxGap);
        // ...and these were already carried; asserted so a future widening cannot
        // trade one drop for another.
        expect(rec.height).toBe(type!.height);
        expect(rec.postSpacing).toBe(type!.postSpacing);
        expect(rec.fillType).toBe(type!.fillType);
        expect(rec.railProfile).toBe(type!.railProfile);
        expect(rec.materialColor).toBe(type!.materialColor);
    });

    it('materialId reaches the record, so the builder can resolve a repository colour', () => {
        const { ctx, store } = makeCtx();
        const id = nextId();
        new CreateHandrailCommand({
            id, start: { x: 0, z: 0 }, end: { x: 3, z: 0 },
            height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
            materialId: 'mat-brushed-steel',
        }).execute(ctx);
        expect(store.getById(id)!.materialId).toBe('mat-brushed-steel');
    });

    it('infillMaxGap is HONOURED by the builder: the derived pitch leaves exactly that clear gap', () => {
        // 0.099 m max clear gap with 0.016 m bars => 0.115 m centre pitch.
        // Over a 4 m rail: floor(4 / 0.115) - 1 = 33 balusters.
        const rail: HandrailData = {
            id: nextId(), type: 'handrail' as never, levelId: LEVEL_ID,
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            height: 1.1, thickness: 0.05, baseOffset: 0,
            fillType: 'baluster', railProfile: 'rectangular',
            balusterShape: 'rectangular', balusterWidth: 0.016,
            infillMaxGap: 0.099,
        } as HandrailData;

        const scene = new THREE.Scene();
        new HandrailFragmentBuilder(scene, { getLevelById: () => ({ elevation: 0 }) } as never)
            .updateHandrail(rail);

        let balusters = 0;
        scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh && (o.userData as { member?: string }).member === 'baluster') balusters++;
        });
        expect(balusters).toBe(Math.floor(4 / (0.099 + 0.016)) - 1);
        expect(balusters).toBe(33);
    });

    it('an AUTHORED pitch still wins over infillMaxGap — no existing handrail changes shape', () => {
        const rail: HandrailData = {
            id: nextId(), type: 'handrail' as never, levelId: LEVEL_ID,
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            height: 1.1, thickness: 0.05, baseOffset: 0,
            fillType: 'baluster', balusterSpacing: 0.5,
            balusterWidth: 0.016, infillMaxGap: 0.099,
        } as HandrailData;
        const scene = new THREE.Scene();
        new HandrailFragmentBuilder(scene, { getLevelById: () => ({ elevation: 0 }) } as never)
            .updateHandrail(rail);
        let balusters = 0;
        scene.traverse((o) => {
            if ((o as THREE.Mesh).isMesh && (o.userData as { member?: string }).member === 'baluster') balusters++;
        });
        expect(balusters).toBe(Math.floor(4 / 0.5) - 1); // 7 — the authored pitch
    });
});

describe('§FEAT-HANDRAIL-CREATION-PARITY — a run is ONE command, ONE undo entry, ONE post per vertex', () => {
    let ctxPair: ReturnType<typeof makeCtx>;
    beforeEach(() => { ctxPair = makeCtx(); });

    function squareRun(): CreateHandrailRunCommand {
        const verts = rectangleLoopVertices({ x: 0, z: 0 }, { x: 4, z: 3 });
        const { segments } = segmentsFromVertices(verts, true);
        expect(segments).toHaveLength(4);
        return new CreateHandrailRunCommand({
            segments: segments.map((s) => ({
                id: nextId(), start: s.start, end: s.end,
                suppressStartPost: s.suppressStartPost,
            })),
            height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
            fillType: 'open', railProfile: 'round', railDiameter: 0.042,
            postSpacing: 0, label: 'Square handrail run',
        });
    }

    it('creates every segment, and one undo removes ALL of them', () => {
        const { ctx, store } = ctxPair;
        const cmd = squareRun();
        expect(cmd.canExecute(ctx).ok).toBe(true);

        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toHaveLength(4);
        expect(store.getAll()).toHaveLength(4);

        cmd.undo(ctx);
        expect(store.getAll()).toHaveLength(0);

        // ...and redo puts all four back (create/delete symmetry, C84 EI-4/EI-5).
        cmd.execute(ctx);
        expect(store.getAll()).toHaveLength(4);
    });

    it('THE JOIN: the closed loop builds 4 posts — one per corner — not 8', () => {
        const { ctx, store } = ctxPair;
        squareRun().execute(ctx);
        const rails = store.getAll();
        expect(rails).toHaveLength(4);
        // Three of the four suppress their start post; the loop rule suppresses all
        // four, since the last segment's END post stands on the first's start.
        expect(rails.filter((r) => r.suppressStartPost === true)).toHaveLength(4);
        expect(buildAndCountPosts(rails)).toBe(4);
    });

    it('an OPEN run posts BOTH ends: an L of 2 segments builds 3 posts, not 4', () => {
        const { ctx, store } = ctxPair;
        const { segments } = segmentsFromVertices(
            [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }], false,
        );
        new CreateHandrailRunCommand({
            segments: segments.map((s) => ({
                id: nextId(), start: s.start, end: s.end,
                suppressStartPost: s.suppressStartPost,
            })),
            height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
            fillType: 'open', railProfile: 'round', railDiameter: 0.042, postSpacing: 0,
        }).execute(ctx);
        expect(buildAndCountPosts(store.getAll())).toBe(3);
    });

    it('WITHOUT the join rule the same loop doubles every post — the defect this closes', () => {
        // The control: identical geometry, `suppressStartPost` left unset. This is
        // what a naive N-segment decomposition produces, and it is 8, not 4.
        const { ctx, store } = ctxPair;
        const verts = rectangleLoopVertices({ x: 0, z: 0 }, { x: 4, z: 3 });
        const { segments } = segmentsFromVertices(verts, true);
        new CreateHandrailRunCommand({
            segments: segments.map((s) => ({ id: nextId(), start: s.start, end: s.end })),
            height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
            fillType: 'open', railProfile: 'round', railDiameter: 0.042, postSpacing: 0,
        }).execute(ctx);
        expect(buildAndCountPosts(store.getAll())).toBe(8);
    });

    it('REFUSES BY NAME rather than creating nothing quietly (C16 CA-18)', () => {
        const { ctx } = ctxPair;
        const empty = new CreateHandrailRunCommand({
            segments: [], height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
        });
        const v = empty.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/no segments/i);

        const tooShort = new CreateHandrailRunCommand({
            segments: [{ id: nextId(), start: { x: 0, z: 0 }, end: { x: 0.02, z: 0 } }],
            height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
        });
        const v2 = tooShort.canExecute(ctx);
        expect(v2.ok).toBe(false);
        expect(v2.reason).toMatch(/no segment is buildable/i);
        expect(v2.reason).toMatch(/0\.1 m/);
    });

    it('a partially-refused run still creates what it can, and SAYS what it skipped', () => {
        const { ctx, store } = ctxPair;
        const cmd = new CreateHandrailRunCommand({
            segments: [
                { id: nextId(), start: { x: 0, z: 0 }, end: { x: 4, z: 0 } },
                { id: nextId(), start: { x: 4, z: 0 }, end: { x: 4.01, z: 0 } }, // < 0.1 m
            ],
            height: 1.1, thickness: 0.05, levelId: LEVEL_ID,
        });
        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);
        expect(store.getAll()).toHaveLength(1);
        expect((res.info ?? []).join(' ')).toMatch(/segment 1 skipped/);
    });

    it('EI-9: a run segment and a hand-drawn single rail on the same line are the same record', () => {
        const { ctx, store } = makeCtx();
        const type = handrailTypeStore.getById('metal-balustrade-round')!;
        const shared = {
            height: type.height, thickness: type.thickness, baseOffset: type.baseOffset,
            fillType: type.fillType, railProfile: type.railProfile,
            railDiameter: type.railDiameter, postSpacing: type.postSpacing,
            balusterShape: type.balusterShape, balusterWidth: type.balusterWidth,
            infillMaxGap: type.infillMaxGap, materialColor: type.materialColor,
            levelId: LEVEL_ID,
        };
        const singleId = nextId();
        new CreateHandrailCommand({
            id: singleId, start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, ...shared,
        }).execute(ctx);

        const runId = nextId();
        new CreateHandrailRunCommand({
            segments: [{ id: runId, start: { x: 0, z: 0 }, end: { x: 4, z: 0 } }],
            ...shared,
        }).execute(ctx);

        const strip = (h: HandrailData): unknown => {
            const c = structuredClone(h) as Record<string, unknown>;
            delete c.id;
            delete c.properties;              // carries the auto-incrementing HR mark
            delete c.ifcData;                 // carries a per-element GUID by design
            return c;
        };
        expect(strip(store.getById(runId)!)).toEqual(strip(store.getById(singleId)!));
    });
});


describe('L-987 — three byte-identical handrail snapshot implementations, PINNED not merged (C84 EI-9)', () => {
    // A rich record: every field this lane added, plus the pre-existing ones, so a
    // future whitelist introduced into ANY of the three fails here rather than
    // silently dropping a field on the next Ctrl+Z.
    const rich = {
        id: 'hr-pin', type: 'handrail', levelId: LEVEL_ID, parentId: LEVEL_ID,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0.5, z: 1 }],
        height: 1.1, thickness: 0.05, baseOffset: 0.03,
        fillType: 'baluster', railProfile: 'round', railDiameter: 0.042,
        postSpacing: 1.5, balusterShape: 'round', balusterWidth: 0.016,
        balusterSpacing: 0.115, infillMaxGap: 0.099, suppressStartPost: true,
        materialColor: '#5a5f66', materialId: 'mat-x',
        properties: { mark: 'HR001' },
    } as unknown as HandrailData;

    it('all three serialize identically', () => {
        const a = serializeAuthority(rich);
        expect(serializeDup2(rich)).toBe(a);
        expect(serializeDup3(rich)).toBe(a);
    });

    it('all three round-trip the record WHOLE — no field whitelist in any of them', () => {
        for (const [ser, de] of [
            [serializeAuthority, deserializeAuthority],
            [serializeDup2, deserializeDup2],
            [serializeDup3, deserializeDup3],
        ] as const) {
            expect(de(ser(rich))).toEqual(rich);
        }
    });

    it('THE TOOTH: the fields this lane added survive the round trip', () => {
        const back = deserializeAuthority(serializeAuthority(rich)) as unknown as Record<string, unknown>;
        expect(back.infillMaxGap).toBe(0.099);
        expect(back.suppressStartPost).toBe(true);
        expect(back.balusterShape).toBe('round');
        expect(back.balusterWidth).toBe(0.016);
        // ⇒ an UpdateHandrailCommand undo restores them without further work.
    });
});
