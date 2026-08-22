/**
 * §NAV-FRAME-IS-NOT-CPU (L-5900) + §NAV-PROFILER-BUCKETS-THE-WRONG-LISTENER (L-5901)
 * + §NAV-BACKEND-ON-EVERY-PERF-LINE (L-5902) — lane NAV24, 2026-08-22.
 *
 * ═══ WHAT THIS SUITE MAKES EXECUTABLE ═════════════════════════════════════════
 *
 * The founder's report is *"the performance of navigation … is not yet good"*, on
 * *"webGPU and webGL — both"*. The only per-frame instrument he can read is
 * `[FrameProfiler]`, and it had three defects that between them made it unable to
 * answer either half of that sentence:
 *
 *   1. It measured TICK CPU and labelled it `frame=`, computing `worst`, `p95` and
 *      `hitches` from it. On BOTH backends the expensive part of a heavy frame is
 *      off this thread (WebGPU encodes+submits; WebGL2 hands work to the driver),
 *      so a GPU-bound scene reads ✅ smooth while the user watches it stutter.
 *   2. `unified-frame-loop` — `apps/editor`'s ENTIRE render path — bucketed to
 *      `other`, so `render=` read 0.0 on every editor session; and the one
 *      editor-adjacent id that DID reach `render` was `renderer.scene-reconcile`,
 *      which draws nothing.
 *   3. The line carried no backend label, so two pasted readings could not be
 *      compared — which is the entire method for a two-backend investigation.
 *
 * ⭐ EVERY TEST BELOW IS WRITTEN AS A NON-VACUITY GUARD WHERE ONE IS AVAILABLE:
 * it asserts that the OLD behaviour would have issued a FALSE ALL-CLEAR, and then
 * that the new behaviour does not. Without that first half the new assertions
 * could pass by accident and this suite would prove nothing — the discipline the
 * sibling `frame-profiler-distribution.test.ts` established for §NAV-SMOOTHNESS.
 *
 * ⚠ WHAT IT DOES NOT ESTABLISH. There is no rAF, no GPU and no browser here.
 * Intervals and costs are INJECTED. This proves the instrument computes and
 * surfaces the right quantity, never that any particular scene is smooth on any
 * particular backend. Only the founder's own console can say that — which is
 * exactly why the instrument has to be right before he reads it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FrameProfiler, LISTENER_BUCKETS, bucketForListenerId } from '../src/FrameProfiler.js';

const g = globalThis as { __pryzmFrameProfile?: boolean; pryzmRendererBackend?: string };
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Drive one full 1 s window and return the single line logged.
 *
 * `frames` is a list of `[cpuMs, intervalMs]` pairs — the two durations the
 * profiler now takes. The window clock advances by the INTERVAL, because that is
 * what wall-clock time actually does.
 */
function runWindow(frames: readonly (readonly [number, number])[]): string {
    const prof = new FrameProfiler();
    prof.isOn();
    let now = 0;
    prof.beginFrame(now);
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        lines.push(a.map(String).join(' '));
    });
    try {
        for (let i = 0; i < frames.length; i++) {
            const [cpu, interval] = frames[i]!;
            now += interval;
            // Last frame carries the clock past the 1 s boundary so the line emits.
            if (i === frames.length - 1) now = Math.max(now, 1001);
            prof.endFrame(cpu, now, interval);
        }
    } finally {
        spy.mockRestore();
    }
    expect(lines, 'expected exactly one summary line').toHaveLength(1);
    return lines[0]!;
}

/** Parse one `key=value` numeric field out of the summary line. */
function field(line: string, key: string): number {
    const m = new RegExp(`${key}=([\\d.]+)`).exec(line);
    expect(m, `field "${key}" missing from: ${line}`).toBeTruthy();
    return Number(m![1]);
}

beforeEach(() => { g.__pryzmFrameProfile = true; });
afterEach(() => { delete g.__pryzmFrameProfile; delete g.pryzmRendererBackend; });

// ─────────────────────────────────────────────────────────────────────────────
describe('§NAV-FRAME-IS-NOT-CPU — the distribution is computed on the INTERVAL', () => {
    /**
     * The GPU-bound session: the main thread is nearly free (4 ms ticks) but the
     * frames land 50 ms apart because the GPU cannot keep up. This is precisely the
     * shape a too-heavy WebGPU pipeline or an over-drawn WebGL2 scene produces, and
     * it is the shape the founder is describing.
     */
    const GPU_BOUND: (readonly [number, number])[] =
        Array.from({ length: 20 }, () => [4, 50] as const);

    it('the OLD quantity issues a FALSE ALL-CLEAR on a GPU-bound session', () => {
        // NON-VACUITY GUARD. Replay the old contract exactly: one duration, the tick
        // CPU cost, used for everything. `endFrame(cpu, now)` with no third argument
        // IS the old behaviour, preserved as the documented headless default.
        const prof = new FrameProfiler();
        prof.isOn();
        prof.beginFrame(0);
        const lines: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
            lines.push(a.map(String).join(' '));
        });
        let now = 0;
        for (let i = 0; i < GPU_BOUND.length; i++) {
            now += GPU_BOUND[i]![1];
            if (i === GPU_BOUND.length - 1) now = Math.max(now, 1001);
            prof.endFrame(GPU_BOUND[i]![0], now); // ← CPU only, the old call
        }
        spy.mockRestore();
        const old = lines[0]!;
        // 4 ms ticks: nothing is over the 32 ms hitch threshold, so the old
        // instrument declares the session smooth. The user saw 20 fps.
        expect(old).toContain('hitches=0/20');
        expect(old).toContain('smooth');
        expect(field(old, 'worst')).toBeCloseTo(4, 1);
    });

    it('the NEW quantity sees the same session as a hitch storm', () => {
        const line = runWindow(GPU_BOUND);
        expect(line).toContain('hitches=20/20');
        expect(line).not.toContain('✅ smooth');
        expect(field(line, 'worst')).toBeCloseTo(50, 1);
        expect(field(line, 'frame')).toBeCloseTo(50, 1);
    });

    it('`cpu` and `frame` are reported SEPARATELY — one number cannot carry both', () => {
        const line = runWindow(GPU_BOUND);
        expect(field(line, 'cpu')).toBeCloseTo(4, 1);
        expect(field(line, 'frame')).toBeCloseTo(50, 1);
        // ⭐ The pair IS the two-backend method: same gesture, both backends. If `cpu`
        // matches and `frame` does not, the difference is GPU-side and no bucket can
        // explain it. Neither question is answerable from a single number.
        expect(field(line, 'frame')).toBeGreaterThan(field(line, 'cpu'));
    });

    it('names the MAIN-THREAD-bound regime when the tick really is the frame', () => {
        // 45 ms of tick inside a 50 ms frame — the main thread IS the limiter.
        const line = runWindow(Array.from({ length: 20 }, () => [45, 50] as const));
        expect(line).toContain('MAIN-THREAD bound');
        expect(line).not.toContain('NOT main-thread bound');
    });

    it('names the NOT-main-thread regime, and refuses to call the residual "GPU time"', () => {
        const line = runWindow(GPU_BOUND);
        expect(line).toContain('NOT main-thread bound');
        // ⛔ JS cannot separate vsync wait from GPU wait from compositor wait. The line
        // must NOT claim a measurement it does not have. It offers the comparison
        // instead, which is the honest instrument.
        expect(line).not.toMatch(/gpu\s*=\s*[\d.]/i);
        expect(line).toContain('compare this line on the other backend');
    });

    it('a vsync-paced session attributes NOTHING — a 10 ms residual at 60 fps is idle wait', () => {
        // 6 ms tick, 16.7 ms frame: a perfectly healthy session. The residual is the
        // loop waiting for the display. Calling that "not main-thread bound" would be
        // technically true and completely misleading, so the verdict declines.
        const line = runWindow(Array.from({ length: 60 }, () => [6, 16.6] as const));
        expect(line).toContain('vsync-paced');
        expect(line).not.toContain('MAIN-THREAD bound');
        expect(line).not.toContain('NOT main-thread bound');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§NAV-BACKEND-ON-EVERY-PERF-LINE — the line says which backend produced it', () => {
    it('prints the resolved backend when `pryzmRendererBackend` is published', () => {
        g.pryzmRendererBackend = 'webgl-fallback';
        expect(runWindow([[5, 20], [5, 1000]])).toContain('backend=webgl-fallback');
    });

    it('prints `unknown` rather than guessing when it is absent', () => {
        // ⛔ `UnifiedFrameLoop` printed a HARDCODED "WebGPU" on every WebGL2 session
        // (corrected 2026-08-19, INSTR1) and sent a perf investigation after a
        // pipeline problem that could not exist. The honest form of "I do not know
        // which" is saying so.
        expect(runWindow([[5, 20], [5, 1000]])).toContain('backend=unknown');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§NAV-PROFILER-BUCKETS-THE-WRONG-LISTENER — the editor render is not "other"', () => {
    it('`unified-frame-loop` is a RENDER — it holds the whole editor draw', () => {
        // The measured defect: this id contains none of the substrings the old
        // classifier looked for, so `render=` read 0.0 on every editor session.
        expect(bucketForListenerId('unified-frame-loop')).toBe('render');
    });

    it('`renderer.scene-reconcile` is NOT a render — it reconciles the scene GRAPH', () => {
        // The other half of the same defect, in the opposite direction: this was the
        // ONLY editor-adjacent id the old substring rule filed as `render`.
        expect(bucketForListenerId('renderer.scene-reconcile')).toBe('other');
    });

    it('the post-FX composers land in the post-FX bucket, not in `other`', () => {
        expect(bucketForListenerId('enhanced-bloom-service')).toBe('shadow');
        expect(bucketForListenerId('ssgi-service')).toBe('shadow');
    });

    it('generated `once:` ids still fall through to the substring rule', () => {
        // `scheduleOnce()` mints `once:<reason>:<seq>`; those cannot be enumerated,
        // so the fallback must survive. This is the arm the explicit table replaces
        // for PERSISTENT listeners and deliberately does not replace for one-shots.
        expect(bucketForListenerId('once:engine-bootstrap-wall-flush:4f')).toBe('wallFlush');
        expect(bucketForListenerId('once:some-shadow-slice:1a')).toBe('shadow');
        expect(bucketForListenerId('once:totally-unknown-thing:9z')).toBe('other');
    });

    it('shadow is matched BEFORE render in the fallback, so a shadow-render is a shadow', () => {
        // ⚠ This reverses the old fallback order. MEASURED inert on the real corpus:
        // no `scheduleOnce` reason string in packages/ apps/ plugins/ contains
        // "shadow" (checked 2026-08-22), so nothing observable changes today. It is
        // ordered this way so the more specific label wins if one ever does.
        expect(bucketForListenerId('once:shadow-slice-render:2b')).toBe('shadow');
    });

    it('§NAV-BUCKET-THAT-NEVER-PRINTS — EVERY bucket the table can name is on the line', () => {
        // ⭐ THE CONSERVATION GUARD. `overlay` was a `FrameBucketKey`, was zeroed by
        // `_ZERO_BUCKETS()`, and was accumulable by `recordListener()` — and the
        // summary line did not print it. It was harmless only because nothing ever
        // returned `'overlay'`; the moment the census classified the eleven real
        // secondary surfaces, their cost would have vanished silently and the columns
        // would have summed to less than the frame with nothing to say so.
        //
        // So: drive ONE frame per distinct bucket in the table, then require every one
        // of those bucket names to appear as a `key=` field. This is derived from
        // LISTENER_BUCKETS itself, so a bucket added tomorrow and left unprinted fails
        // here rather than silently swallowing a subsystem.
        const prof = new FrameProfiler();
        prof.isOn();
        prof.beginFrame(0);
        const lines: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
            lines.push(a.map(String).join(' '));
        });
        for (const id of Object.keys(LISTENER_BUCKETS)) prof.recordListener(id, 1);
        prof.recordDrain(1);
        prof.endFrame(1, 1001, 16);
        spy.mockRestore();
        const line = lines[0]!;
        const buckets = new Set<string>(Object.values(LISTENER_BUCKETS));
        buckets.add('drain');
        for (const b of buckets) {
            expect(line, `bucket "${b}" is accumulated but never printed`).toMatch(
                new RegExp(`\\b${b}=`),
            );
        }
        // Non-vacuity: the arm must be looking at a line that really carries numbers.
        expect(buckets.size).toBeGreaterThanOrEqual(4);
        expect(field(line, 'overlay')).toBeGreaterThan(0);
    });

    it('a secondary surface lands in `overlay`, NOT in the main-viewport `render` column', () => {
        // The eleven ids that paint something other than the viewport. If any of these
        // regressed to `render`, the founder's `render=` column would blame the main
        // draw for a second WebGL context's cost — the exact inversion L-5901 fixed.
        for (const id of [
            'plan-view-manager', 'split-view-manager', 'annotation-render-layer',
            'pip-renderer-loop', 'floating-object-carousel-loop', 'panorama-panel-render',
            'view-cube-rotation', 'pryzm.graph-overlay', 'pryzm.living-graph',
        ]) {
            expect(bucketForListenerId(id), `${id} should be an overlay`).toBe('overlay');
        }
        expect(bucketForListenerId('unified-frame-loop')).toBe('render');
    });

    it('the fallback sends an unenumerable `overlay` id to `overlay`, not to `render`', () => {
        // ⛔ This arm previously read `id.includes('render') || id.includes('overlay')`
        // → 'render', folding every secondary surface into the viewport's column. That
        // single line is why the `overlay` bucket was unreachable and its silence went
        // unnoticed. Ordered before the `render` arm so the specific label wins.
        expect(bucketForListenerId('once:some-overlay-thing:3c')).toBe('overlay');
        expect(bucketForListenerId('once:some-render-thing:3c')).toBe('render');
    });

    it('attributes a recorded listener cost to the bucket the table names', () => {
        // End-to-end through the public API, not just the classifier: a 10 ms
        // `unified-frame-loop` tick must show up under `render=`, not `other=`.
        const prof = new FrameProfiler();
        prof.isOn();
        prof.beginFrame(0);
        const lines: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
            lines.push(a.map(String).join(' '));
        });
        prof.recordListener('unified-frame-loop', 10);
        prof.endFrame(10, 1001, 16);
        spy.mockRestore();
        expect(field(lines[0]!, 'render')).toBeCloseTo(10, 1);
        expect(field(lines[0]!, 'other')).toBeCloseTo(0, 1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§NAV-PROFILER-BUCKETS-THE-WRONG-LISTENER — the CENSUS GUARD', () => {
    /**
     * ⭐ THE REASON THIS ARM EXISTS AND THE PINNED TABLE IS NOT ENOUGH.
     *
     * This repo has recorded repeatedly that a classifier keyed on NAMES can be
     * satisfied by RENAMING (CLAUDE.md P4, the three rival `commandManager`
     * counters). An explicit table fixes today's misattribution and rots the moment
     * someone adds a per-frame listener without touching `LISTENER_BUCKETS` — the
     * SAME defect, one commit later, with a table to hide behind.
     *
     * So the table is guarded by a repo SCAN, not by a number: every string-literal
     * id passed to `addTickListener(` anywhere in `packages/`, `apps/` or `plugins/`
     * must be classified explicitly. Adding a per-frame listener is therefore a
     * decision that has to be made TWICE — once at the call site and once here —
     * which is the discipline §FEAT-LIFT-COMPOUND-SYSTEM's census guard applies to
     * lift types. When this goes red, ADD THE ROW; do not relax the assertion.
     */
    const SKIP_DIRS = new Set([
        'node_modules', 'dist', 'build', '.git', 'coverage', '__tests__', 'bench',
    ]);

    /**
     * ⭐ §PROSE-IS-NOT-A-REGISTRATION (lane NAV29, 2026-08-22) — strip comments before
     * matching, because the scan was reading DOCUMENTATION as production evidence.
     *
     * MEASURED, both directions, on the corpus this guard is pointed at:
     *   · FALSE POSITIVE — `annotation-render-layer` was attributed to
     *     `UnifiedFrameLoop.ts`, which merely shows it in an `@example` JSDoc block.
     *     The real registration is `plugins/annotations/src/AnnotationRenderLayer.ts:343`.
     *     The id was real, so nothing failed; the FILE NAME the guard printed was
     *     simply wrong, which sends the next reader to the wrong package.
     *   · FALSE POSITIVE WITH TEETH — `engine-loading-progress` appears ONLY inside a
     *     `//` comment (`EngineLoadingOverlay.ts:90`) narrating a bug that was fixed.
     *     The id registered at runtime is `engine-loading-progress-${seq}`, a template
     *     literal minted PER INSTANCE (§FIX-OVERLAY-DUP-ID). Classifying the commented
     *     string would have added a permanently DEAD row to `LISTENER_BUCKETS` while
     *     the ids that actually exist kept falling through the substring arm.
     *
     * A census that counts prose has the same defect as a gate that classifies by name:
     * it can be satisfied by writing, not by doing. Only two comment shapes are removed
     * — `/* … *\/` blocks, and lines whose TRIMMED form starts with `//` or `*` — so a
     * `//` inside a string literal (a URL) can never truncate a line of real code.
     */
    function stripComments(src: string): string {
        return src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter((l) => { const t = l.trimStart(); return !t.startsWith('//') && !t.startsWith('*'); })
            .join('\n');
    }

    /**
     * ⭐ §RENDERER-DRAW-IS-NOT-DEAD (lane NAV29, 2026-08-22) — the third call shape.
     *
     * The mirror arm reported `renderer.draw` as a row with no registering call site.
     * ⛔ IT IS REGISTERED. `packages/renderer/src/Renderer.ts:157` declares
     * `attachTo(scheduler, listenerId = 'renderer.draw')` and calls `addTickListener`
     * INSIDE itself; `apps/editor/src/bootstrap.render.ts:83` and
     * `bootstrap.render.everything.ts:188` both invoke `renderer.attachTo(scheduler,
     * 'renderer.draw')`. The scan looked only for ids adjacent to the literal token
     * `addTickListener(`, so an id that reaches the scheduler through ONE wrapper was
     * invisible to it.
     *
     * ⭐ THE MIRROR ARM CAUGHT THE SCANNER, NOT THE TABLE — which is the whole argument
     * for comparing SETS IN BOTH DIRECTIONS rather than counting. Run forwards only and
     * this hole never surfaces; run backwards and it presents as a false "dead row",
     * whose tempting fix is to DELETE a live row and blind the `render=` column to the
     * L4 renderer. CLAUDE.md records the same shape five times over as a correct count
     * sitting on top of a wrong range.
     *
     * ⚠ NOT GENERAL. This is one named indirection, not a solution to indirection. A
     * second wrapper would be invisible again — and would, again, present as a dead row
     * rather than as silence, which is the property worth keeping.
     */
    const CALL_SHAPES: readonly RegExp[] = [
        // scheduler.addTickListener('id', cb, 'phase')            — FrameScheduler
        /addTickListener\(\s*['"]([^'"]+)['"]/g,
        // unifiedFrameLoop.addTickListener({ id: 'id', … })       — UnifiedFrameLoop
        /addTickListener\(\s*\{[\s\S]{0,200}?\bid:\s*['"]([^'"]+)['"]/g,
        // renderer.attachTo(scheduler, 'renderer.draw')           — Renderer wrapper
        /\battachTo\(\s*[A-Za-z_$][\w$.]*\s*,\s*['"]([^'"]+)['"]/g,
    ];

    /**
     * Every string-literal id handed to a tick-listener registration in production
     * source. Memoised: the walk touches several thousand files and all three arms
     * below ask the same question — re-walking once per `it()` made the non-vacuity
     * arm exceed vitest's 5 s default and fail as a TIMEOUT rather than on its merits.
     */
    let _scanCache: Map<string, string> | null = null;
    function scanTickListenerIds(): Map<string, string> {
        if (_scanCache) return _scanCache;
        const found = new Map<string, string>(); // id -> first file it was seen in
        const walk = (dir: string): void => {
            let entries: string[];
            try { entries = readdirSync(dir); } catch { return; }
            for (const name of entries) {
                if (SKIP_DIRS.has(name)) continue;
                const full = join(dir, name);
                let st;
                try { st = statSync(full); } catch { continue; }
                if (st.isDirectory()) { walk(full); continue; }
                if (extname(full) !== '.ts' && extname(full) !== '.tsx') continue;
                if (/\.(test|spec|bench)\.tsx?$/.test(name)) continue;
                let raw: string;
                try { raw = readFileSync(full, 'utf8'); } catch { continue; }
                if (!raw.includes('addTickListener') && !raw.includes('attachTo(')) continue;
                const src = stripComments(raw);
                for (const re of CALL_SHAPES) {
                    re.lastIndex = 0;
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(src)) !== null) {
                        if (!found.has(m[1]!)) found.set(m[1]!, full.slice(REPO_ROOT.length));
                    }
                }
            }
        };
        for (const root of ['packages', 'apps', 'plugins']) walk(join(REPO_ROOT, root));
        _scanCache = found;
        return found;
    }

    it('the scan is NON-VACUOUS — it finds the ids this lane measured by hand', () => {
        // ⛔ A repo scan that silently matches nothing is a green test that guards
        // nothing. Pin the floor and three known members before trusting the arm.
        const ids = scanTickListenerIds();
        expect(ids.size).toBeGreaterThanOrEqual(8);
        expect([...ids.keys()]).toContain('unified-frame-loop');
        expect([...ids.keys()]).toContain('enhanced-bloom-service');
        expect([...ids.keys()]).toContain('physics-engine-loop');
    });

    it('§RENDERER-DRAW-IS-NOT-DEAD — the scan sees an id registered through `attachTo`', () => {
        // ⛔ NON-VACUITY FOR THE THIRD CALL SHAPE. Without this arm, deleting the
        // `attachTo` regex would turn the mirror test green again by RE-HIDING a live
        // listener, and the next reader would delete the `renderer.draw` row believing
        // the guard. Pin the id AND the file, so the arm cannot pass on a coincidence.
        const ids = scanTickListenerIds();
        expect([...ids.keys()]).toContain('renderer.draw');
        expect(ids.get('renderer.draw')).toMatch(/bootstrap\.render(\.everything)?\.ts$/);
    });

    it('§PROSE-IS-NOT-A-REGISTRATION — an id that exists only in a comment is NOT counted', () => {
        // `engine-loading-progress` appears ONLY at `EngineLoadingOverlay.ts:90`, inside
        // a `//` comment narrating a fixed bug. The id that actually registers is
        // `engine-loading-progress-${seq}` — a per-instance template literal. Counting
        // the prose would have minted a permanently dead `LISTENER_BUCKETS` row.
        expect([...scanTickListenerIds().keys()]).not.toContain('engine-loading-progress');
        // …and the ids that DO register are served by the fallback, deliberately.
        expect(bucketForListenerId('engine-loading-progress-1')).toBe('overlay');
        expect(bucketForListenerId('engine-loading-progress-2')).toBe('overlay');
    });

    it('every PERSISTENT tick listener in the repo is classified explicitly', () => {
        const ids = scanTickListenerIds();
        // Template-literal and per-instance ids cannot be enumerated; they are
        // generated per call and correctly served by the substring fallback.
        const unclassified = [...ids.entries()]
            .filter(([id]) => !(id in LISTENER_BUCKETS))
            .map(([id, file]) => `${id}  (${file})`);
        expect(
            unclassified,
            'Unclassified per-frame tick listener(s). ADD A ROW to LISTENER_BUCKETS in ' +
            'FrameProfiler.ts naming the bucket — do NOT relax this assertion. An ' +
            'unclassified listener falls through to the substring fallback, which is ' +
            'exactly how `unified-frame-loop` came to be filed as "other".',
        ).toEqual([]);
    });

    it('no row in the table is dead — every classified id still exists in the repo', () => {
        // The mirror arm. A table row for a listener nobody registers any more is a
        // stale claim, and a set comparison must run in BOTH directions or a correct
        // count can sit on top of a wrong range (CLAUDE.md records that failure five
        // times over).
        const ids = scanTickListenerIds();
        const dead = Object.keys(LISTENER_BUCKETS).filter((id) => !ids.has(id));
        expect(dead, 'LISTENER_BUCKETS row(s) with no registering call site').toEqual([]);
    });
});
