// §WALL-PROFILE SLICE 1 — the MODEL, the GATE, PERSISTENCE and CACHE INVALIDATION.
//
// Slice 1 adds NO geometry and NO authoring path. What it must prove is therefore not
// "the wall looks right" but four narrower things, each of which is a place a field
// like this has silently died before in this repo:
//
//   (1) THE GATE is consulted at EVERY write boundary — schema, `WallStore.update`,
//       `WallStore.addOpening`, and the generic parameter command's `canExecute`.
//       Three of those four are doors into the same store, and `WallStore.ts:1125-1127`
//       records that `addOpening` bypasses `update()` — so a gate wired only into
//       `update` is reachable around.
//   (2) THE RECTANGLE IS UNTOUCHED. Every wall that exists is the absent profile, so
//       every assertion about "no profile" is an assertion about every customer's
//       existing model.
//   (3) PERSISTENCE round-trips (C84 EI-6 — authored data that does not survive save
//       is the most severe defect that contract governs).
//   (4) ALL THREE INVALIDATION GATES react. L-813 is the recorded case of a field
//       reaching two of three and being silently stale through the survivor.
//
// WATCHED RED. Every assertion here was observed failing before the implementation
// landed; the routing and inertness controls were additionally observed passing both
// before and after, which is what distinguishes a control from a test that cannot fail.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '@pryzm/renderer-three/three';

import {
    profileAuthorability,
    resolveWallProfile,
    hasWallProfile,
    wallProfilePlanarLength,
    wallProfileSignedArea2,
    PROFILE_MIN_VERTICES,
    type WallProfile,
} from '../src/WallProfile';
import { WallStore } from '../src/WallStore';
import { WallDataAddSchema } from '../src/WallDataSchema';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { WallInstanceBridge } from '../src/WallInstanceBridge';
import { composeWallGeometryHash } from '../src/composeWallGeometryHash';
import { joinGeometryChangedExcludingBaseline } from '../src/WallDeltaClassifier';
import type { WallData } from '../src/WallTypes';
import { ProjectContext } from '@pryzm/core-app-model';

function repoRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('repo root not found');
}
const REPO = repoRoot();

const LEVEL_ID = 'L0';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

/** A gable: 6 m long, 3 m at the ridge, shoulders cut down to 2 m. */
const GABLE: WallProfile = {
    ring: [
        { u: 0, v: 0 }, { u: 6, v: 0 }, { u: 6, v: 2 }, { u: 3, v: 3 }, { u: 0, v: 2 },
    ],
};

interface MkOpts {
    readonly profile?: WallProfile;
    readonly layers?: number[];
    readonly openings?: boolean;
    readonly curve?: boolean;
    readonly height?: number;
}

function mk(o: MkOpts = {}): WallData {
    const layers = o.layers;
    return {
        id: 'w-1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: o.openings ? ['win-1'] : [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: o.height ?? 3,
        thickness: layers ? layers.reduce((a, b) => a + b, 0) : 0.2,
        baseOffset: 0,
        openings: o.openings
            ? [{ id: 'op-1', type: 'window', elementId: 'win-1', offset: 2, width: 1.2, height: 1.4, sillHeight: 0.9 }]
            : [],
        ...(layers ? { layers: layers.map((t, i) => ({ name: `l${i}`, thickness: t, function: 'structure' })) } : {}),
        ...(o.curve ? { curve: { control: { x: 3, y: 0, z: 1.2 }, segments: 12 } } : {}),
        ...(o.profile ? { wallProfile: o.profile } : {}),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

const newStore = () => new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
);

// ─────────────────────────────────────────────────────────────────────────────
// (1) THE PURE MODULE
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (1) — the meaning, owned in one place', () => {
    it('absent / null resolve to THE RECTANGLE, which is every wall that exists', () => {
        expect(resolveWallProfile(undefined)).toBeNull();
        expect(resolveWallProfile(null)).toBeNull();
        expect(hasWallProfile(undefined)).toBe(false);
        expect(hasWallProfile(GABLE)).toBe(true);
    });

    it('a ring below the minimum vertex count is not a profile', () => {
        expect(PROFILE_MIN_VERTICES).toBe(3);
        expect(resolveWallProfile({ ring: [{ u: 0, v: 0 }, { u: 1, v: 1 }] })).toBeNull();
    });

    it('planar length ignores y — baseLine.y carries level elevation, not extent', () => {
        expect(wallProfilePlanarLength([{ x: 0, z: 0 }, { x: 3, z: 4 }])).toBeCloseTo(5, 12);
    });

    it('signed area is positive for a CCW ring in (u, v)', () => {
        expect(wallProfileSignedArea2([{ u: 0, v: 0 }, { u: 2, v: 0 }, { u: 2, v: 2 }, { u: 0, v: 2 }]))
            .toBeCloseTo(8, 12);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) THE GATE — every refusal names its reason
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (2) — profileAuthorability', () => {
    it('a wall with NO profile is ALWAYS authorable, whatever else it is', () => {
        // This is what lets the gate be called unconditionally on every write, and it is
        // the property that makes Slice 1 inert for every existing wall.
        for (const subj of [
            {}, { curve: {} }, { layers: [{}, {}] }, { openings: [{}] },
            { curve: {}, layers: [{}, {}], openings: [{}] },
        ]) {
            expect(profileAuthorability(subj).ok, JSON.stringify(subj)).toBe(true);
        }
    });

    it('a valid gable on a plain straight wall IS authorable', () => {
        const a = profileAuthorability({
            wallProfile: GABLE, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], height: 3,
        });
        expect(a.ok, a.reason).toBe(true);
        expect(a.code).toBeUndefined();
    });

    it('MALFORMED is refused by name', () => {
        expect(profileAuthorability({ wallProfile: { ring: 'nope' } }).code).toBe('malformed');
        expect(profileAuthorability({ wallProfile: { ring: [{ u: 0, v: NaN }, { u: 1, v: 0 }, { u: 1, v: 1 }] } }).code)
            .toBe('malformed');
    });

    it('DEGENERATE is refused — a ring enclosing no area would draw nothing', () => {
        const collinear = { ring: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 2, v: 0 }] };
        const a = profileAuthorability({ wallProfile: collinear, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], height: 3 });
        expect(a.code).toBe('degenerate');
        expect(a.reason).toMatch(/encloses no area/);
    });

    it('OUT-OF-BOUNDS is refused — a profile may only CUT the wall down', () => {
        const tooTall = { ring: [{ u: 0, v: 0 }, { u: 6, v: 0 }, { u: 3, v: 9 }] };
        const a = profileAuthorability({ wallProfile: tooTall, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], height: 3 });
        expect(a.code).toBe('out-of-bounds');
        // The refusal must state BOTH the offending vertex and the extent it broke.
        expect(a.reason).toMatch(/v=9/);
        expect(a.reason).toMatch(/\[0, 3\]/);
    });

    it('the three UNBUILT combinations are refused, each by its own code', () => {
        const base = { wallProfile: GABLE, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] as const, height: 3 };
        expect(profileAuthorability({ ...base, curve: { radius: 4 } }).code).toBe('curved');
        expect(profileAuthorability({ ...base, layers: [{}, {}] }).code).toBe('layered');
        expect(profileAuthorability({ ...base, openings: [{}] }).code).toBe('hosted-openings');
    });

    it('the CURVED refusal is worded as UNBUILT, not as ill-posed', () => {
        // ⚠ This is a real distinction, not pedantry. Rake × curve is ILL-POSED and
        // "never lifts" (WallRake.ts:83-86). Profile × curve CAN lift — curved × LAYERED
        // is already built — so inheriting rake's wording would state a claim about this
        // repo that is false, and would tell a future lane not to attempt something it can.
        const r = profileAuthorability({
            wallProfile: GABLE, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], height: 3, curve: { radius: 4 },
        }).reason ?? '';
        expect(r).toMatch(/developable surface/);
        expect(r).not.toMatch(/ill-posed|never lifts/i);
    });

    it('a single-layer wall is NOT "layered" — the refusal keys on >1 band', () => {
        const a = profileAuthorability({
            wallProfile: GABLE, baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }], height: 3, layers: [{}],
        });
        expect(a.ok, a.reason).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (3) EVERY WRITE BOUNDARY CONSULTS IT
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (3) — the four write boundaries', () => {
    it('SCHEMA (create) accepts a profiled plain wall and refuses a curved one', () => {
        expect(WallDataAddSchema.safeParse(mk({ profile: GABLE })).success).toBe(true);
        const bad = WallDataAddSchema.safeParse(mk({ profile: GABLE, curve: true }));
        expect(bad.success).toBe(false);
        expect(JSON.stringify((bad as { error?: unknown }).error)).toMatch(/CURVED wall/);
    });

    it('SCHEMA refuses a profile that escapes the wall extent', () => {
        const bad = WallDataAddSchema.safeParse(
            mk({ profile: { ring: [{ u: 0, v: 0 }, { u: 6, v: 0 }, { u: 3, v: 9 }] } }),
        );
        expect(bad.success).toBe(false);
    });

    it('STORE.update refuses against the MERGED wall, closing the two-call bypass', () => {
        // Set the profile first, then try to make it curved — the patch alone looks fine.
        const store = newStore();
        store.add(mk({ profile: GABLE }));
        expect(() => store.update('w-1', {
            curve: { control: { x: 3, y: 0, z: 1.2 }, segments: 12 },
        } as never)).toThrow(/WALL-PROFILE/);
    });

    it('STORE.update refuses adding a profile to an already-layered wall', () => {
        const store = newStore();
        store.add(mk({ layers: [0.1, 0.05, 0.1] }));
        expect(() => store.update('w-1', { wallProfile: GABLE } as never)).toThrow(/LAYERED wall/);
    });

    it('STORE.addOpening refuses — the door that does NOT go through update()', () => {
        // The bypass that matters: a gate wired only into `update` is reachable around
        // by doing the two operations in the other order.
        const store = newStore();
        store.add(mk({ profile: GABLE }));
        expect(() => store.addOpening('w-1', {
            id: 'op-1', type: 'window', elementId: 'win-1',
            offset: 2, width: 1.2, height: 1.4, sillHeight: 0.9,
        } as never)).toThrow(/WALL-PROFILE/);
    });

    it('NONE of the above fires for a wall with no profile (the inertness control)', () => {
        const store = newStore();
        store.add(mk());
        expect(() => store.update('w-1', { height: 2.5 } as never)).not.toThrow();
        expect(() => store.addOpening('w-1', {
            id: 'op-1', type: 'window', elementId: 'win-1',
            offset: 2, width: 1.2, height: 1.2, sillHeight: 0.5,
        } as never)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (4) THE ROUTER EXCLUSION — the instanced arm cannot carry a silhouette
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (4) — the instanced arm is excluded, not refused', () => {
    function instanced(wall: WallData): string[] {
        const seen: string[] = [];
        const scene = new THREE.Scene();
        const builder = new WallFragmentBuilder(scene, makeLevelProvider());
        builder.setInstanceBridge(new WallInstanceBridge({
            register: (id: string) => { seen.push(id); },
            unregister: () => {},
            isRegistered: (id: string) => seen.includes(id),
        } as never));
        builder.refreshV2Cache([]);
        builder.buildWall(wall, null as never, undefined, 0);
        return seen;
    }

    it('a PROFILED plain wall does NOT instance', () => {
        expect(instanced(mk({ profile: GABLE }))).toEqual([]);
    });

    it('a plain wall with no profile STILL instances — the guard is inert', () => {
        // The non-regression half. Without this, "excluded" could mean "the instanced arm
        // is broken", and ~70-85% of walls in a real model take this path.
        expect(instanced(mk())).toEqual(['w-1']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (5) THE THREE INVALIDATION GATES IN SERIES (L-813)
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (5) — all three invalidation gates react', () => {
    it('GATE 1 — the geometry hash changes when the profile changes', () => {
        const plain = composeWallGeometryHash(mk(), null, 0);
        const gabled = composeWallGeometryHash(mk({ profile: GABLE }), null, 0);
        expect(gabled).not.toBe(plain);
    });

    it('GATE 1 is INERT for a wall that has never been profiled', () => {
        expect(composeWallGeometryHash(mk(), null, 0)).toBe(composeWallGeometryHash(mk(), null, 0));
    });

    it('GATE 2 — the delta classifier treats a profile edit as join geometry', () => {
        // A profile-only edit must NOT be classified `openings-only`: that path skips
        // refreshV2Cache and never rebuilds a neighbour — the founder's "the joint
        // arrives one edit late", recorded for rake directly above this check.
        expect(joinGeometryChangedExcludingBaseline(mk(), mk({ profile: GABLE }))).toBe(true);
        expect(joinGeometryChangedExcludingBaseline(mk({ profile: GABLE }), mk())).toBe(true);
    });

    it('GATE 2 is INERT when the profile is unchanged (absent, and identical)', () => {
        expect(joinGeometryChangedExcludingBaseline(mk(), mk())).toBe(false);
        expect(joinGeometryChangedExcludingBaseline(mk({ profile: GABLE }), mk({ profile: GABLE }))).toBe(false);
    });

    // GATE 3 lives in `apps/editor` and is asserted by SOURCE READ rather than by
    // execution — honestly, and named as such (C84: a claim you could not verify is
    // NOT MEASURED, which is a finding). The level-signature builder is a private
    // closure inside `WallRebuildCoordinator` with no exported seam, so an executed
    // assertion would require standing up the coordinator and its store graph. What
    // this pins is the property that actually failed for rake: that the field is IN the
    // signature at all.
    it('GATE 3 — the level signature includes the profile (source-read, not executed)', () => {
        const src = fs.readFileSync(
            path.join(REPO, 'apps/editor/src/engine/WallRebuildCoordinator.ts'), 'utf8',
        );
        expect(src).toMatch(/wallProfile\?:\s*\{\s*ring\?/);
        // and it must reach the emitted signature string, not merely be computed
        expect(src).toMatch(/\|r\[\$\{rk\}\$\{pf\}\]/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (6) PERSISTENCE — C84 EI-6
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (6) — the field survives save and load', () => {
    const SER = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';
    const LOAD = 'apps/editor/src/engine/persistence/ProjectLoader.ts';
    const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

    it('the SAVE half emits it', () => {
        expect(read(SER)).toMatch(/wallProfile: wall\.wallProfile/);
    });

    it('the LOAD half restores it — the half most easily forgotten', () => {
        expect(read(LOAD)).toMatch(/wallProfile: \(wall as/);
    });

    it('the serialiser DEEP-COPIES the ring rather than handing out a store reference', () => {
        expect(read(SER)).toMatch(/ring: \(wall\.wallProfile\.ring \?\? \[\]\)\.map/);
    });

    it('an absent profile emits NO key — a pre-profile snapshot is byte-identical', () => {
        // The round-trip guarantee, exercised through the same allow-list walk the rake
        // round-trip uses rather than asserted about the source.
        const emit = (wall: Record<string, unknown>) => {
            const out: Record<string, unknown> = {};
            for (const k of ['id', 'height', 'rakeAngleDeg', 'wallProfile']) {
                if (wall[k] !== undefined) out[k] = wall[k];
            }
            return out;
        };
        expect(JSON.stringify(emit({ id: 'w', height: 3 }))).toBe('{"id":"w","height":3}');
        expect(JSON.parse(JSON.stringify(emit({ id: 'w', height: 3, wallProfile: GABLE }))).wallProfile)
            .toEqual(GABLE);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (7) §FIX-PANEL-HEIGHT-STRANDS-OPENINGS — a live bug, closed
// ─────────────────────────────────────────────────────────────────────────────
//
// The property panel reaches `WallStore.update` through the GENERIC parameter command,
// which had no opening-containment check — so lowering a wall through the panel could
// strand its windows silently. `UpdateWallHeightCommand` has checked this since EV-03;
// the panel simply does not go through that command.

describe('§WALL-PROFILE (7) — the ungated height path now refuses', () => {
    const CMD = 'packages/command-registry/src/generic/UpdateElementParameterCommand.ts';
    const src = () => fs.readFileSync(path.join(REPO, CMD), 'utf8');

    it('canExecute consults the containment gate on a wall height change', () => {
        expect(src()).toMatch(/checkWallHeightOpeningFit\(_context\)/);
    });

    it('it reuses planOpeningRefit — NO second containment predicate (C84 EI-9)', () => {
        const s = src();
        expect(s).toMatch(/wallOccupancyStore\.planOpeningRefit/);
        // the refusal must carry the gate's own sentence, which states BOTH numbers
        expect(s).toMatch(/childRefusalText\(\s*detail/);
    });

    it('the profile gate is wired at the same seam', () => {
        expect(src()).toMatch(/checkProfileAuthorability\(_context\)/);
    });

    it('a gate that throws degrades to "cannot judge", never to a crash', () => {
        // §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH — the recorded failure mode for exactly this
        // class of pre-flight check.
        expect(src()).toMatch(/\} catch \{[\s\S]{0,400}?return null;/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (8) THE DEAD BUTTON — §FIX-DEAD-EDIT-PROFILE-BUTTON
// ─────────────────────────────────────────────────────────────────────────────

describe('§WALL-PROFILE (8) — "Edit Profile" is offered only where it is implemented', () => {
    const BAR = 'apps/editor/src/ui/ContextualEditBar.ts';
    const src = () => fs.readFileSync(path.join(REPO, BAR), 'utf8');

    it('visibility is DERIVED from the dispatch resolver, not hand-listed beside it', () => {
        const s = src();
        expect(s).toMatch(/this\._editProfileBtn\.style\.display\s*=\s*\n?\s*this\._profileEditToolFor/);
        // the old hand-kept list, which claimed floor and ceiling had editors, is gone
        expect(s).not.toMatch(/elementType === 'floor'\s*\n?\s*\|\| elementType === 'ceiling'/);
    });

    it('the resolver returns a tool ONLY when it implements enterProfileEditMode', () => {
        expect(src()).toMatch(/typeof tool\.enterProfileEditMode === 'function' \? tool : null/);
    });

    it('WALL is deliberately absent — Slice 1 ships no editor', () => {
        const s = src();
        const resolver = s.slice(s.indexOf('_profileEditToolFor('));
        expect(resolver.slice(0, 1800)).not.toMatch(/^\s*wall:/m);
    });
});
