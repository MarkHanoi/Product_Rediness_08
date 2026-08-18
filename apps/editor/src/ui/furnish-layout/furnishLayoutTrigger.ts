// Furnish Layout — single shared trigger (mirrors apartmentLayoutTrigger).
//
// Used by:
//   • The console command `window.pryzmFurnishAllRooms()`.
//   • Auto-fire after `ceiling.layout-executed` so the full apartment
//     pipeline (apartment → CEIL → furnish → light) is one continuous flow
//     (architect-friendly). Furniture now runs AFTER ceilings settle so
//     the architect sees an enclosed shell before furniture appears.
//   • Any future AI-panel UI button.
//
// Owns the per-session executor singleton so attaching is idempotent no matter
// which entry point fires. Always logs a [furnish-layout] marker + always
// surfaces a toast, so the trigger can never silently do nothing.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { FurnishLayoutExecutor } from './FurnishLayoutExecutor.js';
import { isHouseFanoutActive } from '../house-layout/houseFanoutGuard.js';
import { FurnishScopeModal, type FurnishScope } from './furnishScopeModal.js';
import {
    driveFurnishAllFloors,
    summariseFurnishCoverage,
    type FurnishLevelCoverage,
    type FurnishCoverageSummary,
} from './furnishAllFloorsDriver.js';

/**
 * §FURNISH-ALL-FLOORS-HONESTY — what the every-floor pass actually did.
 *
 * This function used to return `Promise<void>` while computing a full
 * `FurnishCoverageSummary` and dropping it into a toast and the console. The
 * chat seam above therefore had nothing to consult and reported the canned
 * "Furnished every floor — the per-floor coverage report is in the console",
 * INCLUDING when no runtime was ready, when no levels existed, and when the
 * driver threw. Same defect as the floor-finish one, one arm over.
 */
export type FurnishAllFloorsOutcome =
    /** The driver ran and produced per-floor evidence — including a floor that
     *  timed out, which the summary names rather than hides. */
    | { readonly status: 'covered'; readonly summary: FurnishCoverageSummary }
    /** Nothing ran, and this is why. */
    | { readonly status: 'refused'; readonly reason: string };

const _executor = new FurnishLayoutExecutor();
const _scopeModal = new FurnishScopeModal();

/** Per-storey furnish wait budget — matches runHousePostGenChain's
 *  FURNISH_TIMEOUT_MS so a bare floor (no rooms ⇒ no `furnish.layout-executed`)
 *  never strands the all-floors loop. */
const FURNISH_TIMEOUT_MS = 12_000;

/** §VALIDATE-CACHE (2026-05-29): last `furnish.layout-executed` warnings,
 *  cached in-memory so the user can review them after they scroll past in
 *  the console. Exposed via `window.pryzmShowFurnishWarnings()`. */
let _lastValidationWarnings: readonly string[] = [];
let _lastValidationAt: Date | null = null;

declare global {
    interface Window {
        // `runtime` is already declared as `any` elsewhere — don't re-declare it.
        pryzmFurnishAllRooms?: () => void;
        pryzmShowFurnishWarnings?: () => void;
        /** A.21.D28 #7 — console parity for the AI-panel "all floors" scope. */
        pryzmFurnishAllFloors?: () => void;
        /** §FULL-PIPELINE — furnish + auto-chained lighting in one call
         *  (manual-walls case; lighting fires off `furnish.layout-executed`). */
        pryzmFurnishAndLightAllRooms?: () => void;
    }
}

/** Fire the deterministic furniture-layout engine on every furnishable room
 *  on the active level. Safe from the AI panel or the DevTools console. */
export function triggerFurnishLayout(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    try {
        console.log('[furnish-layout] trigger invoked');
        if (!rt) { toast('Runtime not ready — reload the project.', 'error'); return; }
        _executor.attach(rt);
        toast('Furnishing rooms…', 'info');
        rt.events.emit('furnish.layout-execute', {});
    } catch (err) {
        console.error('[furnish-layout] trigger threw:', err);
        toast(`Furnish trigger failed: ${String(err)}`, 'error');
    }
}

interface ProjectContextLike { activeLevelId?: string | null }
interface LevelLike { id?: string; elevation?: number }

/** Enumerate every level id, ground-first, from whichever store is available
 *  (same sources the BottomActionMenu uses). */
function getAllLevelIds(): string[] {
    // Typed-global reads (L-845): `bimManager` / `wallStore` are declared
    // `unknown` on the Window augmentation (apps/editor/src/types/globals.d.ts),
    // `projectContext` on src/global-window.d.ts — narrow each read locally.
    const levels =
        (window.bimManager as { getLevels?: () => LevelLike[] } | undefined)?.getLevels?.() ??
        (window.wallStore as { getLevels?: () => LevelLike[] } | undefined)?.getLevels?.() ??
        (window.projectContext as { levels?: LevelLike[] } | undefined)?.levels ??
        [];
    return levels
        .slice()
        .sort((a, b) => Number(a.elevation ?? 0) - Number(b.elevation ?? 0))
        .map(l => (l?.id ? String(l.id) : ''))
        .filter(id => id.length > 0);
}

/** Wait for `furnish.layout-executed` for `levelId`, or resolve after
 *  `timeoutMs` regardless (mirrors runHousePostGenChain.waitForEvent). Resolves
 *  with the per-level coverage report (§FIX-FURNISH-ALL-FLOORS-COVERAGE, L-101)
 *  so the driver can enumerate every unit that was furnished / skipped. */
function waitForFurnishDone(
    rt: PryzmRuntime, levelId: string, timeoutMs: number,
): Promise<FurnishLevelCoverage> {
    const events = rt.events as unknown as {
        on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
    };
    return new Promise<FurnishLevelCoverage>(resolve => {
        let done = false;
        const sub = events.on?.('furnish.layout-executed', (payload: unknown) => {
            const p = payload as Partial<FurnishLevelCoverage> & { levelId?: string } | undefined;
            // The executor stamps the levelId; accept it (or any furnish event if
            // the payload lacks one) so the loop always advances.
            if (!p?.levelId || p.levelId === levelId) finish(p);
        });
        const off: () => void = typeof sub === 'function' ? sub : () => { /* */ };
        function finish(p?: Partial<FurnishLevelCoverage>, timedOut = false): void {
            if (done) return; done = true; off();
            resolve({
                levelId,
                placedCount: p?.placedCount ?? 0,
                roomCount: p?.roomCount ?? 0,
                roomsFurnished: p?.roomsFurnished ?? 0,
                roomsSkipped: p?.roomsSkipped ?? 0,
                skipped: p?.skipped ?? [],
                timedOut,
            });
        }
        setTimeout(() => finish(undefined, true), timeoutMs);
    });
}

/** Furnish EVERY floor in sequence (A.21.D28 #7). For each level: set it active
 *  (the way the level panels + post-gen chain do), fire furnish, await this
 *  storey's `furnish.layout-executed` (or the per-storey timeout), then advance.
 *  Restores the originally-active level when done. P6: mutation still flows
 *  through the executor's command-bus dispatch — this only sets the session
 *  active-level (same path ActiveLevelHUD / LevelManagerPanel use). */
export async function triggerFurnishAllFloors(
    runtimeArg?: PryzmRuntime | null,
): Promise<FurnishAllFloorsOutcome> {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };
    if (!rt) {
        const reason = 'Runtime not ready — reload the project.';
        toast(reason, 'error');
        return { status: 'refused', reason };
    }

    const levelIds = getAllLevelIds();
    if (levelIds.length === 0) {
        const reason = 'No levels found — open a project first.';
        toast(reason, 'error');
        return { status: 'refused', reason };
    }
    // §FURNISH-ALL-FLOORS-HONESTY — the `levelIds.length === 1` shortcut used to
    // call the fire-and-forget `triggerFurnishLayout` and return `void`, so a
    // single-floor project produced NO coverage at all and the chat seam above
    // reported the canned "Furnished every floor" for it. One level now goes
    // through the SAME measured driver as five: `furnishOne` awaits that
    // storey's own `furnish.layout-executed` and yields real counts. The only
    // difference from the old shortcut is that the execute event carries an
    // explicit `levelId` — which is exactly what every level in the multi-floor
    // path already sends, including the active one (§FIX-FURNISH-ALL-FLOORS-
    // COVERAGE, L-101: correctness must not hinge on the active-level switch).

    _executor.attach(rt);
    const pc = window.projectContext as ProjectContextLike | undefined;
    const originalActive = pc?.activeLevelId ?? undefined;
    const setActive = (id: string): void => {
        try { if (pc) pc.activeLevelId = id; } catch (e) { console.warn('[furnish-layout] could not set active level', id, e); }
    };

    console.log('[furnish-layout] all-floors furnish across', levelIds.length, 'level(s):', levelIds);
    toast(levelIds.length === 1 ? 'Furnishing rooms…' : `Furnishing all ${levelIds.length} floors…`, 'info');

    // §FIX-FURNISH-ALL-FLOORS-COVERAGE (L-101): each level is furnished
    // EXPLICITLY (levelId threaded into the event) so a floor no longer depends
    // on the global active-level switch actually landing. setActive still runs
    // so the UI/HUD follows along, but correctness does not hinge on it. The
    // pure driver sequences the floors + tolerates a per-floor failure.
    const furnishOne = async (levelId: string): Promise<FurnishLevelCoverage> => {
        setActive(levelId);
        console.log('[furnish-layout] all-floors → furnishing level', levelId);
        const done = waitForFurnishDone(rt, levelId, FURNISH_TIMEOUT_MS);
        // Defer one tick so the active-level change settles before furnish reads it.
        await new Promise<void>(r => setTimeout(r, 0));
        rt.events.emit('furnish.layout-execute', { levelId });
        return done;
    };

    let coverage: FurnishLevelCoverage[] = [];
    let threw: string | null = null;
    try {
        coverage = await driveFurnishAllFloors(levelIds, furnishOne);
    } catch (err) {
        console.error('[furnish-layout] all-floors furnish threw:', err);
        threw = String((err as Error)?.message ?? err);
        toast(`All-floors furnish failed: ${threw}`, 'error');
    } finally {
        if (typeof originalActive === 'string' && originalActive.length > 0) setActive(originalActive);
    }
    // §FURNISH-ALL-FLOORS-HONESTY — a throw that produced no coverage is a
    // refusal, not "furnished every floor". Previously this fell through to the
    // summary of an EMPTY coverage array and the caller reported success.
    if (threw !== null && coverage.length === 0) {
        return { status: 'refused', reason: `the all-floors furnish failed: ${threw}` };
    }

    // Per-unit coverage report — one line per floor + a roll-up.
    const summary = summariseFurnishCoverage(coverage);
    console.log('[furnish-layout] §COVERAGE-ALL-FLOORS report:');
    for (const line of summary.lines) console.log('[furnish-layout] §COVERAGE   ' + line);
    console.log(
        `[furnish-layout] §COVERAGE-ALL-FLOORS totals: floors=${summary.floors} ` +
        `rooms_furnished=${summary.totalFurnished} rooms_skipped=${summary.totalSkipped} items=${summary.totalPlaced}`,
    );
    toast(
        `Furnished ${summary.floors} floors — ${summary.totalFurnished} rooms, ${summary.totalPlaced} items` +
        (summary.totalSkipped > 0 ? `, ${summary.totalSkipped} rooms skipped` : '') +
        (summary.timedOutFloors > 0 ? ` (${summary.timedOutFloors} floor(s) timed out)` : '') + '.',
        summary.totalSkipped > 0 || summary.timedOutFloors > 0 ? 'info' : 'success',
    );
    // The summary is the EVIDENCE. Handing it back is what lets the chat seam
    // report the engine's own numbers instead of a sentence written in advance.
    return { status: 'covered', summary };
}

/** Show the scope chooser ("Active floor" vs "All floors") then run the chosen
 *  furnish path (A.21.D28 #7). With a single level the modal is skipped — there
 *  is no meaningful choice — and the active-floor path runs directly. */
export function triggerFurnishWithPrompt(runtimeArg?: PryzmRuntime | null): void {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const floorCount = getAllLevelIds().length;
    if (floorCount <= 1) { triggerFurnishLayout(rt); return; }
    _scopeModal.show({
        onChoose: (scope: FurnishScope) => {
            if (scope === 'all') void triggerFurnishAllFloors(rt);
            else triggerFurnishLayout(rt);
        },
    }, floorCount);
}

/** §VALIDATE-CACHE — review the last furnish run's circulation gate
 *  warnings. Prints a table to console + a single summary line. Empty cache
 *  ⇒ "no warnings" message. */
function showFurnishWarnings(): void {
    if (_lastValidationAt === null) {
        console.log('[furnish-layout] §VALIDATE no furnish has run yet — try pryzmFurnishAllRooms() first.');
        return;
    }
    if (_lastValidationWarnings.length === 0) {
        console.log(`[furnish-layout] §VALIDATE last run at ${_lastValidationAt.toISOString()} — 0 warnings (clean).`);
        return;
    }
    console.log(
        `[furnish-layout] §VALIDATE last run at ${_lastValidationAt.toISOString()} ` +
        `— ${_lastValidationWarnings.length} warning(s):`,
    );
    for (const w of _lastValidationWarnings) console.warn('[furnish-layout] §VALIDATE  -', w);
}

/** Install the DevTools console command `window.pryzmFurnishAllRooms()`,
 *  AND auto-fire furnishing after every apartment-layout build. Idempotent. */
export function installFurnishLayoutTrigger(runtime: PryzmRuntime | null): void {
    if (typeof window !== 'undefined') {
        window.pryzmFurnishAllRooms = () => triggerFurnishLayout(runtime);
        // A.21.D28 #7 — console parity for the "all floors" path the AI-panel
        // scope modal offers.
        window.pryzmFurnishAllFloors = () => { void triggerFurnishAllFloors(runtime); };
        window.pryzmShowFurnishWarnings = showFurnishWarnings;
        console.log('[furnish-layout] console command ready — run pryzmFurnishAllRooms() to furnish all rooms.');
        console.log('[furnish-layout] console command ready — run pryzmFurnishAllFloors() to furnish every floor.');
        console.log('[furnish-layout] §VALIDATE console command ready — run pryzmShowFurnishWarnings() to review last furnish\'s circulation warnings.');
        // §FULL-PIPELINE shortcut: chain furniture + lighting on demand for the
        // manual-walls test case (architect drew walls themselves; the
        // apartment generator never fired, so the auto-chain didn't start).
        window.pryzmFurnishAndLightAllRooms = (): void => {
            triggerFurnishLayout(runtime);
            // The furnish run emits 'furnish.layout-executed' which auto-fires
            // the lighting trigger — no explicit lighting call needed.
        };
        console.log('[furnish-layout] full-pipeline shortcut ready — run pryzmFurnishAndLightAllRooms() to furnish + auto-light in one go.');
    }
    if (runtime) {
        _executor.attach(runtime);
        // §VALIDATE-CACHE — capture every furnish run's warnings so the user
        // can `pryzmShowFurnishWarnings()` later without re-running. The
        // event is emitted by FurnishLayoutExecutor at the end of every
        // furnish — both success + empty-placement paths.
        const evts = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        evts.on?.('furnish.layout-executed', (payload: unknown) => {
            const p = payload as { validationWarnings?: readonly string[] } | undefined;
            _lastValidationWarnings = Array.isArray(p?.validationWarnings)
                ? [...p!.validationWarnings] : [];
            _lastValidationAt = new Date();
            // §VALIDATE-TOAST (2026-05-29) — give the user a visual signal when
            // the circulation gate flagged something. Without this the warnings
            // sit silently in the in-memory cache until the user happens to
            // remember `pryzmShowFurnishWarnings()`. Severity is `info` (not
            // `error`) — the gate flags risk, not failure; the furnish still
            // succeeded. The 'warning' severity isn't part of the toast schema.
            const n = _lastValidationWarnings.length;
            if (n > 0) {
                runtime.events.emit('pryzm:toast', {
                    message: `Furnish complete with ${n} circulation warning${n === 1 ? '' : 's'} — run pryzmShowFurnishWarnings() to review.`,
                    severity: 'info',
                });
            }
        });
        // Auto-fire AFTER the ceiling pass settles. The ceiling layout
        // executor emits `ceiling.layout-executed` AFTER its runBatch, so
        // by the time furnishing starts the shell is enclosed (and the
        // room redetect from apartment.layout-executed has long settled).
        //
        // §CHAIN-TIMEOUT (2026-05-29) — auto-fire-chain reliability. If the
        // ceiling stage throws / never emits its done event, the OLD trigger
        // would silently never fire furnish. The fallback timer below fires
        // furnish 12 s after apartment.layout-executed REGARDLESS, with a
        // warning, so a single bad stage doesn't strand the whole pipeline.
        // Idempotency: `state.fired` flips on whichever path lands first; the
        // other one becomes a no-op.
        interface ChainState { fired: boolean; timer: ReturnType<typeof setTimeout> | null }
        const state: ChainState = { fired: false, timer: null };
        const FALLBACK_MS = 12_000;
        /** §FURNISH-DROP-SURFACING (2026-08-13) — what the cascade knows about
         *  the ceiling stage that preceded furnish; same shape as the furnish
         *  outcome the lighting cascade carries (lightingLayoutTrigger), one
         *  stage upstream. A dropped stage travels WITH its reason (C75 §1.4)
         *  instead of dying in a console.warn. */
        type CeilingOutcome =
            | { state: 'completed'; placedCount: number; roomCount?: number }
            | { state: 'dropped'; reason: string };
        const fireFurnish = (source: 'ceiling-event' | 'fallback-timeout', ceilingOutcome?: CeilingOutcome): void => {
            if (state.fired) return;
            state.fired = true;
            if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
            if (source === 'fallback-timeout') {
                console.warn(`[furnish-layout] §CHAIN-TIMEOUT — no ceiling.layout-executed within ${FALLBACK_MS} ms — firing furnish anyway.`);
            } else {
                console.log('[furnish-layout] ceiling.layout-executed → auto-furnishing.');
            }
            // Emit through the untyped narrowing (same as `.on` below): the
            // `ceilingOutcome` field is ahead of the PryzmEventMap typing in
            // packages/runtime-composer/src/types.ts (out of L-CHAIN territory).
            setTimeout(() => {
                (runtime.events as unknown as { emit?: (k: string, p: unknown) => void } | undefined)
                    ?.emit?.('furnish.layout-execute', { ceilingOutcome });
            }, 0);
        };
        /** Read the ceiling outcome off a `ceiling.layout-executed` payload:
         *  prefer an explicit `outcome` stamp, fall back to legacy counts, and
         *  return undefined for a payload that says nothing — never fabricate
         *  a completed outcome from silence (C70 §2.2). */
        const outcomeFromCeilingPayload = (payload: unknown): CeilingOutcome | undefined => {
            const p = payload as {
                outcome?: { state?: string; placedCount?: number; roomCount?: number; reason?: string };
                placedCount?: number; roomCount?: number;
            } | undefined;
            const o = p?.outcome;
            if (o?.state === 'dropped' && typeof o.reason === 'string') {
                return { state: 'dropped', reason: o.reason };
            }
            if (o?.state === 'completed' && typeof o.placedCount === 'number') {
                return { state: 'completed', placedCount: o.placedCount, roomCount: o.roomCount };
            }
            if (typeof p?.placedCount === 'number') {
                return { state: 'completed', placedCount: p.placedCount, roomCount: p.roomCount };
            }
            return undefined;
        };
        const events = runtime.events as unknown as {
            on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
        };
        events.on?.('apartment.layout-executed', () => {
            // New chain — clear any leftover state from a previous run.
            if (state.timer !== null) clearTimeout(state.timer);
            state.fired = false;
            state.timer = setTimeout(() => {
                state.timer = null;
                fireFurnish('fallback-timeout', {
                    state: 'dropped',
                    reason: `no ceiling.layout-executed within ${FALLBACK_MS} ms (§CHAIN-TIMEOUT fallback fired)`,
                });
            }, FALLBACK_MS);
        });
        events.on?.('ceiling.layout-executed', (payload) => {
            // §A.21.i — during a HOUSE post-gen fan-out, runHousePostGenChain
            // drives furnish itself per storey; skip the cascade so furniture
            // isn't placed twice. Apartment runs leave the guard false → unchanged.
            if (isHouseFanoutActive()) return;
            // §CHAIN-NO-DOUBLE-FIRE — unlike the lighting cascade's furnish
            // handler, this handler deliberately does NOT reset `state.fired`:
            // a LATE ceiling event after the fallback already fired furnish for
            // this run is dedup'd by `fired` and must stay that way (locked by
            // furnishCascadeOutcome.test.ts).
            fireFurnish('ceiling-event', outcomeFromCeilingPayload(payload));
        });
        console.log('[furnish-layout] auto-fire on ceiling.layout-executed: wired (§CHAIN-TIMEOUT fallback: ' + FALLBACK_MS + ' ms).');
    }
}
