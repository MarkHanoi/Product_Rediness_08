/**
 * @file tools/ga-gate/lib/determinism-probe-worker.ts
 *
 * The CHILD half of `check-cross-process-determinism.ts` (GE-08, C73 §5.4b).
 *
 * Run as: `tsx determinism-probe-worker.ts <fixtureId>`
 * Prints exactly one line to stdout: `<fixtureId> <sha256-of-IEEE754-bytes>`.
 *
 * ── WHY THE FIXTURES LIVE IN THE CHILD, NOT THE PARENT ───────────────────────
 * The whole claim under test is "a fresh process computes the same bytes". If the
 * parent imported the geometry to build inputs, the parent's module state would
 * be shared with nothing and prove nothing — but worse, it would tempt the design
 * toward passing precomputed values in, which is the failure mode the probe
 * exists to catch: a memoised or lazily-initialised value that is stable WITHIN
 * one process and different in the next. Everything the fixture needs is
 * constructed here, from literals, after a cold module load.
 *
 * ── THE DIGEST IS OF BYTES, NOT OF TEXT ──────────────────────────────────────
 * Numbers are written into a `Float64Array` and hashed as raw little-endian
 * IEEE-754. `String(n)` would have hidden the two differences that matter most:
 * `0` vs `-0` print identically, and a 1-ulp difference survives `toFixed`. A
 * probe that cannot see 1 ulp cannot speak about floating-point determinism.
 * Booleans are hashed as 1.0 / 0.0 so a boolean fixture uses the same pipe.
 */

import { createHash } from 'node:crypto';

// ─── Digest ──────────────────────────────────────────────────────────────────

class ByteDigest {
    private readonly parts: Buffer[] = [];

    num(n: number): void {
        const f = new Float64Array(1);
        f[0] = n;
        this.parts.push(Buffer.from(f.buffer.slice(0)));
    }

    bool(b: boolean): void { this.num(b ? 1 : 0); }

    hex(): string {
        return createHash('sha256').update(Buffer.concat(this.parts)).digest('hex');
    }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Each fixture is a COLD computation over literal inputs. Keep them:
//   • pure — no fs, no clock, no random, no env;
//   • wide — sweep the input space rather than probing one happy value, because
//     the interesting non-determinism lives at degeneracies (collinear, zero
//     length, exactly-on-boundary), not in the middle of the domain;
//   • additive — a new fixture is a new key; NEVER edit an existing one in place,
//     or the historical digest stops meaning what it meant.

type Fixture = () => Promise<ByteDigest>;

const FIXTURES: Record<string, Fixture> = {

    /**
     * F1 — the canonical point-in-polygon over a degenerate grid.
     * Booleans, so this arm is blind to 1-ulp drift BY CONSTRUCTION; what it can
     * see is a decision FLIPPING between processes, which is what a
     * tolerance read from mutable module state would do.
     */
    'kernel.pointInRingEvenOdd.grid': async () => {
        const { pointInRingEvenOdd } = await import(
            '../../../packages/geometry-kernel/src/pure/pointInPolygon.js'
        );
        const d = new ByteDigest();
        // A concave "L" — every horizontal edge and reflex vertex is a probe target.
        const xs = [0, 6, 6, 3, 3, 0];
        const ys = [0, 0, 2, 2, 5, 5];
        const xAt = (i: number) => xs[i]!;
        const yAt = (i: number) => ys[i]!;
        for (let i = 0; i <= 60; i++) {
            for (let j = 0; j <= 50; j++) {
                // Deliberately lands EXACTLY on vertices and edges at integer steps.
                d.bool(pointInRingEvenOdd(i / 10, j / 10, 6, xAt, yAt));
            }
        }
        return d;
    },

    /**
     * F2 — arc-length of a curved wall centreline. Transcendental-heavy
     * (`Math.atan2` / `Math.sin` / `Math.cos` in the arc sampling), which is the
     * ONE family whose results V8 does not guarantee bit-identical across
     * versions. Same-binary this must be exact; the arm exists so that when the
     * probe is run on a second machine the comparison is already built.
     */
    'wall.centrelineLength.arcSweep': async () => {
        const { wallCentrelineLength } = await import(
            '../../../packages/geometry-wall/src/WallArcParam.js'
        );
        const d = new ByteDigest();
        for (let k = 0; k <= 40; k++) {
            const bulge = (k - 20) / 7;            // spans negative, zero, positive
            for (const segments of [4, 5, 12, 33]) {
                d.num(wallCentrelineLength({
                    baseLine: [{ x: 0, z: 0 }, { x: 4.317, z: 2.731 }],
                    curve: { control: { x: 2.1585, z: 1.3655 + bulge }, segments },
                }));
            }
        }
        return d;
    },

    /**
     * F3 — the local frame on a curved wall at swept arc length. Emits eight
     * floats per sample (position, unit tangent, unit normal, angle), so a
     * normalisation that drifts by one ulp is visible where the scalar length of
     * F2 might absorb it.
     */
    'wall.arcFrameAt.sweep': async () => {
        const { arcFrameAt, wallCentrelineLength } = await import(
            '../../../packages/geometry-wall/src/WallArcParam.js'
        );
        const d = new ByteDigest();
        const wall = {
            baseLine: [{ x: -3.75, z: 1.125 }, { x: 5.5, z: -2.25 }] as const,
            curve: { control: { x: 0.875, z: 3.5 }, segments: 17 },
        };
        const len = wallCentrelineLength(wall);
        for (let i = 0; i <= 120; i++) {
            const f = arcFrameAt(wall, (len * i) / 120);
            d.num(f.s); d.num(f.x); d.num(f.z);
            d.num(f.tx); d.num(f.tz);
            d.num(f.nx); d.num(f.nz);
            d.num(f.angleY);
        }
        return d;
    },

    /**
     * F4 — hosted-opening clamp. A refusal/repair path rather than a pure
     * construction: it is here because clamps are where a stale module-level
     * tolerance would show up as a DIFFERENT REPAIR, not a different last digit.
     */
    'wall.clampToWall.sweep': async () => {
        const { wallOccupancyStore } = await import(
            '../../../packages/geometry-wall/src/WallOccupancyStore.js'
        );
        const d = new ByteDigest();
        const wall = {
            id: 'w1', levelId: 'l0',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            height: 2.7, thickness: 0.2,
        } as unknown as Parameters<typeof wallOccupancyStore.clampToWall>[0];
        for (let i = 0; i <= 30; i++) {
            for (let j = 0; j <= 20; j++) {
                const r = wallOccupancyStore.clampToWall(wall, {
                    offset: (i - 5) / 3,
                    width: (j + 1) / 7,
                    height: 0.4 + j / 11,
                    sillHeight: (i - 10) / 9,
                });
                d.num(r.offset); d.num(r.width);
                d.num(r.height); d.num(r.sillHeight);
                d.bool(r.clamped);
            }
        }
        return d;
    },
    /**
     * §NEGATIVE-CONTROL — DELIBERATELY NON-DETERMINISTIC, and not geometry.
     *
     * A probe that has never been seen to fail is indistinguishable from a probe
     * that cannot fail, and this repo has the scar tissue to prove it ("0
     * violations" once meant "walked nothing"). This fixture folds the PID into
     * the digest, so every process disagrees by construction. Run it with
     * `--fixture __negative-control` and the gate must exit 1 naming three
     * distinct digests. It is EXCLUDED from the default sweep — see
     * `FIXTURE_IDS` — so it can never fail CI, only demonstrate the apparatus.
     */
    '__negative-control': async () => {
        const d = new ByteDigest();
        d.num(process.pid);
        return d;
    },
};

/** The `__`-prefixed entries are apparatus demonstrations, never part of a run. */
export const FIXTURE_IDS: readonly string[] =
    Object.keys(FIXTURES).filter((k) => !k.startsWith('__'));

/** Including the controls — `--fixture` resolves against this wider set. */
export const ALL_FIXTURE_IDS: readonly string[] = Object.keys(FIXTURES);

// ─── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const id = process.argv[2];
    if (id === '--list') {
        process.stdout.write(FIXTURE_IDS.join('\n') + '\n');
        return;
    }
    const fixture = id === undefined ? undefined : FIXTURES[id];
    if (fixture === undefined) {
        process.stderr.write(`unknown fixture: ${String(id)}\n`);
        process.exit(2);
    }
    const digest = await fixture();
    process.stdout.write(`${id} ${digest.hex()}\n`);
}

// Only run when invoked directly — importing this module (the parent does, to
// read FIXTURE_IDS) must not execute a fixture.
if (process.argv[1] !== undefined && /determinism-probe-worker/.test(process.argv[1])) {
    void main();
}
