// THE WIRE — the static links that make §ENVELOPE-WALLS-FOLLOW / §ENVELOPE-PARTITIONS-FOLLOW
// REACHABLE from a gesture on EITHER site view.
// C80 · C114 §6a · C84 EI-9 · P6 · [[committed-is-not-reachable]] · [[authored-but-unwired]].
//
// Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEANS THE CONTEXT WALLS -
// PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY A SOURCE-ASSERTION TEST, AND WHY IT IS NOT AN APOLOGY FOR ONE.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `spaceEnvelopeProfileEditWire.spec.ts` established the precedent for this family and states the
// reason in its own words: *"a missing static link still breaks the chain, and a chain is only as
// good as the link nobody tested."* `initTools` cannot be imported in a unit test — it constructs
// a renderer, a camera and thirty tools — so the alternative to reading its source is not a better
// test, it is NO test. And the failure that leaves open is the one THIS lane exists to close: a
// planner that is authored, committed, green in its own spec, and consuming an event nobody raises.
//
// ⛔ THE ORDERING ARM IS THE ONE THAT FOUND A REAL DEFECT, and it is why this file exists rather
// than four more greps. `installSpaceEnvelopeWallFollow` used to sit BELOW
// `attachSpaceEnvelopeRender`, which dereferences `world.scene.three`,
// `world.renderer.three.domElement` and `world.camera.three` with no `try`. Any boot where the
// THREE world is not fully up threw there and the cascade NEVER INSTALLED — and the 3-D Site,
// which needs no THREE at all, would then raise `pryzm:spaceEnvelope:faceMoved` into an empty
// listener set: the founder drags a face, the envelope moves, the building does not follow, and
// he is told NOTHING. That is not a hypothetical ordering preference; it is the difference between
// the feature working on the view he uses and silently not.
//
// ✅ ESTABLISHES: `initTools` arms the consumer, and does so BEFORE the THREE render attach; BOTH
//    surfaces raise the event through the ONE exported emit helper; the composition reads the same
//    graph the recorder wrote and dispatches through the BUS (P6); the verb it dispatches is
//    REGISTERED by the wall plugin; and the install is idempotent, because a second registration
//    would be two cascades and two undo entries for one drag.
// ⛔ DOES NOT ESTABLISH: that any wall moves on screen. Source is not behaviour, and nothing in
//    this family is browser-verified (C114 §14d).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPACE_ENVELOPE_FACE_MOVED_EVENT } from '../spaceEnvelopeDragSurface';
import { WALL_CASCADE_BASELINE_COMMAND } from '../spaceEnvelopeWallFollow';
import {
    installSpaceEnvelopeWallFollow,
    __resetSpaceEnvelopeWallFollowForTests,
} from '../spaceEnvelopeWallFollowComposition';

// ⛔ THE TWO SINGLETONS ARE STUBBED, AND THAT IS THE POINT OF ARM (5), NOT A DODGE.
// `@pryzm/core-app-model` and `@pryzm/geometry-wall` are the real production readers and they are
// exercised for real by `designEnvelopeWallLink.spec.ts` and the wall family's own suites. What
// this arm tests is the LATCH — that installing twice subscribes once — and loading a semantic
// graph and a wall store to find that out costs ~10 s of transform per run and proves nothing
// extra. The stubs are never CALLED here; they exist so the module graph resolves.
vi.mock('@pryzm/core-app-model', () => ({ semanticGraphManager: { getAll: () => [] } }));
vi.mock('@pryzm/geometry-wall', () => ({ wallStore: { getById: () => undefined } }));

const EDITOR_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = path.resolve(EDITOR_SRC, '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(EDITOR_SRC, rel), 'utf8');
const readRepo = (rel: string): string => fs.readFileSync(path.join(REPO, rel), 'utf8');
/** Source with `//` line comments removed — see the spelling assertion for why. */
const code = (src: string): string => src.replace(/^\s*\/\/.*$/gm, '');

describe('(1) ⛔ the consumer is ARMED, and armed BEFORE anything that can throw on THREE', () => {
    const init = read('engine/initTools.ts');

    it('initTools installs the cascade at all', () => {
        expect(init).toMatch(/installSpaceEnvelopeWallFollow\(\s*\(\)\s*=>\s*runtime/);
    });

    it('⭐ passes the runtime as a THUNK — a captured reference dies at the next project switch', () => {
        // §L-545-SITE-CAPTURE / §L-12916. A spec that only checked the call would go green on
        // `installSpaceEnvelopeWallFollow(runtime)`, which works exactly once per process.
        expect(init).not.toMatch(/installSpaceEnvelopeWallFollow\(\s*runtime\s*[,)]/);
    });

    it('⛔⛔ the install comes BEFORE `attachSpaceEnvelopeRender` — the ordering defect this found', () => {
        const install = init.indexOf('installSpaceEnvelopeWallFollow(');
        const attach = init.indexOf('attachSpaceEnvelopeRender({');
        expect(install).toBeGreaterThan(-1);
        expect(attach).toBeGreaterThan(-1);
        // ⛔ If this ever inverts again, the 3-D Site's face drag stops moving walls on any boot
        // where the THREE viewport is not up — silently, with no message to the user.
        expect(install).toBeLessThan(attach);
    });

    it('⛔ the attach it now precedes really does dereference THREE with no `try` — the premise', () => {
        // The assertion above is only worth having if `attachSpaceEnvelopeRender` can actually
        // throw. Pin the premise, or the ordering rule becomes cargo cult the first time someone
        // wraps that call and wonders why this file still insists.
        const attachCall = init.slice(init.indexOf('attachSpaceEnvelopeRender({'));
        expect(attachCall).toMatch(/scene:\s*world\.scene\.three/);
        expect(attachCall).toMatch(/domElement:\s*world\.renderer\.three\.domElement/);
    });
});

describe('(2) ⭐ BOTH site views raise the event — one gesture, one name, two surfaces', () => {
    const init = read('engine/initTools.ts');
    const gis = read('ui/layout/GISAreaLayout.ts');

    it('the BIM 3-D viewport forwards its committed move to the ONE emit helper', () => {
        expect(init).toMatch(/onFaceMoveCommitted:\s*\(ev\)\s*=>\s*\{/);
        expect(init).toMatch(/emitSpaceEnvelopeFaceMoved\(/);
    });

    it('⭐ the 3-D SITE does too — the view the founder actually dragged on', () => {
        expect(gis).toMatch(/onCommitted:\s*\(ev\)\s*=>\s*\{/);
        expect(gis).toMatch(/emitSpaceEnvelopeFaceMoved\(/);
    });

    it('⛔ NEITHER surface spells the event name itself — one literal, in one file', () => {
        // A mis-spelled event name fails SILENTLY at both ends, which is why the constant is
        // declared beside the gesture. A wiring site that re-typed it would pass its own test.
        //
        // ⚠ COMMENTS ARE STRIPPED FIRST. A doc comment that QUOTES the channel name is prose, not
        // a second spelling — and a spec that could not tell the two apart would push the next
        // author to write a worse comment to keep it green.
        expect(code(init)).not.toContain(SPACE_ENVELOPE_FACE_MOVED_EVENT);
        expect(code(gis)).not.toContain(SPACE_ENVELOPE_FACE_MOVED_EVENT);
        expect(SPACE_ENVELOPE_FACE_MOVED_EVENT).toBe('pryzm:spaceEnvelope:faceMoved');
    });
});

describe('(3) the composition reads what the RECORDER wrote, and mutates only through the bus', () => {
    const comp = read('engine/spaceEnvelopeWallFollowComposition.ts');

    it('⭐ ONE reader for the links — the same function `designEnvelopeWallLink.ts` writes with', () => {
        // Not a second query and not a re-derivation: one producer, one reader, or the cascade
        // moves walls the recorder never recorded (C84 EI-9).
        expect(comp).toMatch(/readWallsDerivedFromEnvelope\(/);
        expect(comp).toMatch(/from '\.\.\/ui\/site\/designEnvelopeWallLink'/);
    });

    it('reads the wall baseline from the wall store, and copies it rather than aliasing', () => {
        expect(comp).toMatch(/wallStore\.getById\(wallId\)/);
    });

    it('⛔ P6 — the ONLY mutation is `bus.executeCommand`, never a store write', () => {
        expect(comp).toMatch(/bus\.executeCommand\(command, payload\)/);
        expect(comp).not.toMatch(/wallStore\.(set|update|applyPatch|delete)/);
    });
});

describe('(4) ⛔ the verb it dispatches is REGISTERED — an unknown command is not a refusal', () => {
    it('`wall.cascadeBaseline` is in the wall plugin’s handler registration list', () => {
        const handlers = readRepo('plugins/wall/src/handlers/index.ts');
        expect(handlers).toContain(WALL_CASCADE_BASELINE_COMMAND);
        expect(WALL_CASCADE_BASELINE_COMMAND).toBe('wall.cascadeBaseline');
    });

    it('⭐ and it carries a sync disposition — a cascade nobody replicates is a local-only edit', () => {
        const disp = readRepo('packages/sync-client/src/syncDisposition.ts');
        expect(disp).toContain(`'${WALL_CASCADE_BASELINE_COMMAND}'`);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// (5) THE ONE BEHAVIOURAL ARM — the install itself, driven with a fake runtime.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('(5) ⭐ the install subscribes ONCE and refuses to double', () => {
    beforeEach(() => { __resetSpaceEnvelopeWallFollowForTests(); });

    it('subscribes to the ONE channel the gesture raises', () => {
        const seen: string[] = [];
        const ok = installSpaceEnvelopeWallFollow(() => ({
            events: { on: (name: string) => { seen.push(name); return undefined; } },
        }));
        expect(ok).toBe(true);
        expect(seen).toEqual([SPACE_ENVELOPE_FACE_MOVED_EVENT]);
    });

    it('⛔ a SECOND install is REFUSED — two subscriptions would be two undo entries for one drag', () => {
        // And worse: the second cascade would be planned against a store the first had already
        // moved, so every wall would read as `authored-since-generation` and STAY.
        const seen: string[] = [];
        const events = { on: (name: string) => { seen.push(name); return undefined; } };
        expect(installSpaceEnvelopeWallFollow(() => ({ events }))).toBe(true);
        expect(installSpaceEnvelopeWallFollow(() => ({ events }))).toBe(false);
        expect(seen).toHaveLength(1);
    });

    it('⛔ a runtime with NO event channel is refused OUT LOUD, never silently', () => {
        // §AUTHORED-BUT-UNWIRED: without a `false` here, a cascade that never installed is
        // indistinguishable from one that never fires.
        expect(installSpaceEnvelopeWallFollow(() => null)).toBe(false);
        expect(installSpaceEnvelopeWallFollow(() => ({}))).toBe(false);
    });
});
