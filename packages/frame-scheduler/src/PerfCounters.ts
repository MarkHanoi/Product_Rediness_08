// §PRYZM-PERF — gesture-scoped counter / timer registry (founder request, 2026-08-19).
//
// PURPOSE
// -------
// A 367-element "create walls by slab" batch froze the viewport for 32.7 s and
// ended with the collaboration socket disconnected. The prior investigation could
// RANK the suspects but not SETTLE them, because the instruments did not exist:
// `RenderPerformanceService.getStats()` had zero callers repo-wide, nothing counted
// full-scene traversals, and nothing recorded WHY a wall fell off the instanced arm.
//
// This module is the accumulation half of that instrument. It is deliberately the
// dumbest thing that can work: a string-keyed counter map, a string-keyed timer map
// (sum + count + max), and a note map for one-shot values. It does NOT know about
// THREE, the renderer, the scene or the DOM — the READING half
// (`apps/editor/src/engine/pryzmPerfConsole.ts`) samples live state and joins it to
// these accumulators at report time.
//
// WHY IT LIVES HERE, BESIDE FrameProfiler
// ---------------------------------------
// The founder brief is explicit: follow the existing §FRAME-PROFILER convention
// rather than minting a rival one — two profiling conventions is C84 EI-8/EI-9.
// So: same flag SHAPE (`globalThis.__pryzmPerf`, sibling of `__pryzmFrameProfile`),
// same "one typed-global read when off" cost model, same package.
//
// `@pryzm/frame-scheduler` is L1 with ZERO `@pryzm/*` dependencies, which is what
// makes it the only correct home: the call sites that must bump these counters span
// L2 (`geometry-wall`, `core-app-model`) and L7 (`apps/editor`), and every one of
// those packages ALREADY declares `@pryzm/frame-scheduler` as a dependency. No
// manifest changes, no lockfile churn, and — because this file imports nothing at
// all — no barrel cycle (see the SCC "no barrel access at module load" defect class).
//
// ⛔ THE INSTRUMENT MUST NOT BECOME THE PROBLEM
// ---------------------------------------------
// The log this replaces (`[WallOccupancyStore] canPlace OK: …`) printed on EVERY
// pointermove — dozens of console writes in the hottest path in the app. Two rules
// follow, and they are binding on every call site:
//
//   1. OFF BY DEFAULT. `isPerfOn()` reads one typed global and compares it. When the
//      flag is absent — which is production, always, unless the founder armed it —
//      `bumpPerf`/`addPerfTime` return before touching a Map.
//   2. NEVER FORMAT EAGERLY. Keys MUST be literal string constants at the call site.
//      `bumpPerf(`wall.reject.${clause}`)` builds a string on every wall whether the
//      flag is on or not, because the argument is evaluated before the call. Write
//      the branch out longhand instead. The `PERF_KEYS` block below exists so call
//      sites have constants to reach for.
//
// ⭐ "NOT ARMED" IS NOT "ZERO"
// ----------------------------
// The single most dangerous failure mode for this instrument is the founder running
// a gesture WITHOUT arming, calling `report()`, seeing `traverse.total = 0`, and
// concluding no traversals happened. That is the misattribution class the brief
// forbids. So arming is TRACKED, not assumed: `perfArmedAtMs()` returns null when the
// counters were never armed, and the reporter is required to print "NOT ARMED —
// unmeasured, not zero" instead of a row of noughts.
//
// FLAG (typed global, P4 — no `(window as any)`):
//   globalThis.__pryzmPerf = true    // arm
//   delete globalThis.__pryzmPerf    // disarm
// Prefer `window.pryzmPerf.on()` / `.off()`, which also stamp the arm time.

/** Accumulated stats for one timer key. */
export interface PerfTimer {
  /** Total milliseconds accumulated across all samples. */
  totalMs: number;
  /** Number of samples. */
  count: number;
  /** Largest single sample, in milliseconds. */
  maxMs: number;
}

/** A one-shot recorded value (last write wins). Not accumulated. */
export type PerfNote = string | number | boolean;

/** Immutable view of the registry at one instant. */
export interface PerfSnapshot {
  /** Wall-clock ms since the counters were armed, or null if never armed. */
  armedForMs: number | null;
  /** True if accumulation is live RIGHT NOW. */
  on: boolean;
  counters: Record<string, number>;
  timers: Record<string, PerfTimer>;
  notes: Record<string, PerfNote>;
}

// ── State ───────────────────────────────────────────────────────────────────

const _counters = new Map<string, number>();
const _timers = new Map<string, PerfTimer>();
const _notes = new Map<string, PerfNote>();

/**
 * `performance.now()` at the moment the counters were armed, or null if they never
 * were. This is the field that lets the reporter distinguish "measured, and the
 * answer is zero" from "never measured". Never infer arming from a zero count.
 */
let _armedAtMs: number | null = null;

/** Monotonic clock, with a `Date.now()` fallback for non-DOM hosts (node tests). */
function _now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

// ── Flag ────────────────────────────────────────────────────────────────────

/**
 * The ONLY cost paid when profiling is off: one typed-global property read and a
 * `=== true` compare. Mirrors `FrameProfiler.isOn()` exactly.
 *
 * Side effect by design: if the flag was set by hand (`globalThis.__pryzmPerf =
 * true`) rather than through `armPerf()`, the first `isPerfOn()` that sees it stamps
 * the arm time. Without this, a hand-armed session would report `armedForMs: null`
 * and the reporter would call a genuinely-measured run "not armed".
 */
export function isPerfOn(): boolean {
  const on =
    (globalThis as unknown as { __pryzmPerf?: boolean }).__pryzmPerf === true;
  if (on && _armedAtMs === null) _armedAtMs = _now();
  return on;
}

/** Arm accumulation and stamp the arm time. Does NOT clear existing counters. */
export function armPerf(): void {
  (globalThis as unknown as { __pryzmPerf?: boolean }).__pryzmPerf = true;
  if (_armedAtMs === null) _armedAtMs = _now();
}

/** Disarm accumulation. Counters are RETAINED so a report still works after. */
export function disarmPerf(): void {
  delete (globalThis as unknown as { __pryzmPerf?: boolean }).__pryzmPerf;
}

/** `performance.now()` at arm time, or null if never armed since the last reset. */
export function perfArmedAtMs(): number | null {
  return _armedAtMs;
}

// ── Accumulators (hot path — keep these boring) ──────────────────────────────

/**
 * Increment a counter. No-op unless armed.
 *
 * @param key MUST be a literal constant — see the "NEVER FORMAT EAGERLY" note above.
 */
export function bumpPerf(key: string, n = 1): void {
  if (!isPerfOn()) return;
  _counters.set(key, (_counters.get(key) ?? 0) + n);
}

/**
 * Accumulate a duration sample (sum, count and max). No-op unless armed.
 *
 * `max` is carried because a batch freeze is a TAIL problem: 367 adds averaging
 * 3 ms each and 366 adds averaging 0.1 ms with one 32 s outlier produce very
 * different bugs and identical means.
 */
export function addPerfTime(key: string, ms: number): void {
  if (!isPerfOn()) return;
  const t = _timers.get(key);
  if (t === undefined) {
    _timers.set(key, { totalMs: ms, count: 1, maxMs: ms });
    return;
  }
  t.totalMs += ms;
  t.count += 1;
  if (ms > t.maxMs) t.maxMs = ms;
}

/**
 * Record a one-shot value (last write wins) — a mode string, a boolean, a size.
 * No-op unless armed.
 *
 * ⭐ Use this for "was the gesture inside a batch?". That one boolean decides
 * whether the founder paid 734 full-scene traversals or 2, and it cannot be
 * reconstructed after the fact.
 */
export function notePerf(key: string, value: PerfNote): void {
  if (!isPerfOn()) return;
  _notes.set(key, value);
}

/**
 * Time a synchronous function and attribute it to `key`.
 *
 * When disarmed this calls `fn()` and returns it with NO clock reads at all — the
 * measurement machinery is entirely inside the armed branch, so a wrapped phase
 * costs one boolean check in production.
 */
export function timePerf<T>(key: string, fn: () => T): T {
  if (!isPerfOn()) return fn();
  const t0 = _now();
  try {
    return fn();
  } finally {
    addPerfTime(key, _now() - t0);
  }
}

/**
 * Async sibling of {@link timePerf}. Same disarmed-cost guarantee: when off it
 * returns the caller's promise untouched.
 */
export async function timePerfAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!isPerfOn()) return fn();
  const t0 = _now();
  try {
    return await fn();
  } finally {
    addPerfTime(key, _now() - t0);
  }
}

// ── Read / reset ────────────────────────────────────────────────────────────

/**
 * Copy the registry out. Returns plain objects (not the live Maps) so a caller
 * cannot mutate the accumulators by holding the result.
 */
export function perfSnapshot(): PerfSnapshot {
  const counters: Record<string, number> = {};
  for (const [k, v] of _counters) counters[k] = v;
  const timers: Record<string, PerfTimer> = {};
  for (const [k, v] of _timers) timers[k] = { ...v };
  const notes: Record<string, PerfNote> = {};
  for (const [k, v] of _notes) notes[k] = v;
  return {
    armedForMs: _armedAtMs === null ? null : _now() - _armedAtMs,
    on: (globalThis as unknown as { __pryzmPerf?: boolean }).__pryzmPerf === true,
    counters,
    timers,
    notes,
  };
}

/**
 * Zero every accumulator. Arming is RE-STAMPED (not cleared) when the flag is still
 * on, so the founder's between-gesture `reset()` yields a window that starts now —
 * which is the whole point of resetting between gestures.
 */
export function resetPerfCounters(): void {
  _counters.clear();
  _timers.clear();
  _notes.clear();
  _armedAtMs =
    (globalThis as unknown as { __pryzmPerf?: boolean }).__pryzmPerf === true
      ? _now()
      : null;
}

// ── Key constants ───────────────────────────────────────────────────────────

/**
 * Canonical counter/timer keys.
 *
 * These exist so call sites reach for a constant instead of building a template
 * string in a hot path, and so the reporter and the call sites cannot drift apart
 * by a typo — a counter key that nobody reads is a silent zero, which is the exact
 * failure this instrument was built to stop.
 *
 * Grouping convention: `<subsystem>.<what>`; rejection reasons are
 * `<family>.reject.<clause>` and are counted PER FAILING CLAUSE, not per element —
 * a wall that fails three clauses bumps three keys. Read them against
 * `<family>.notInstanced`, never against each other.
 */
export const PERF_KEYS = {
  // ── Instancing: why an element did NOT take the instanced arm ─────────────
  WALL_INSTANCED: 'wall.instanced',
  WALL_NOT_INSTANCED: 'wall.notInstanced',
  WALL_REJECT_NO_BRIDGE: 'wall.reject.noInstanceBridge',
  WALL_REJECT_OPENINGS: 'wall.reject.hasOpenings',
  WALL_REJECT_CURVE: 'wall.reject.curved',
  WALL_REJECT_MITRE_START: 'wall.reject.mitreStart',
  WALL_REJECT_MITRE_END: 'wall.reject.mitreEnd',
  WALL_REJECT_RAKE: 'wall.reject.rakedNonVertical',
  WALL_REJECT_LAYERS: 'wall.reject.multiLayer',
  WALL_REJECT_PROFILE: 'wall.reject.hasProfile',

  // ── Full-scene traversals, attributed BY CALL SITE ────────────────────────
  // The prime suspect is two traversals per `bim-*-added` event, deferred ONLY
  // when batching. 367 adds x 2 = 734 walks of a growing scene.
  TRAVERSE_PER_ADD_PBR: 'traverse.perAdd.pbrCollect',
  TRAVERSE_PER_ADD_TIER: 'traverse.perAdd.tierMeshCount',
  TRAVERSE_PER_ADD_DEFERRED: 'traverse.perAdd.deferredSkipped',
  TRAVERSE_PBR_UPGRADER: 'traverse.pbrSceneUpgrader',
  TRAVERSE_SCENE_LIGHTING: 'traverse.pascalSceneLighting',
  TRAVERSE_FIT_BOUNDS: 'traverse.bimFitBounds',
  TRAVERSE_BOUNDS_CACHE: 'traverse.sceneBoundsCache',
  TRAVERSE_FRUSTUM_CULL: 'traverse.frustumCulling',
  TRAVERSE_REAL_ENV: 'traverse.realEnvironment',

  // ── Batch phase timings ───────────────────────────────────────────────────
  PHASE_GEOMETRY_BUILD: 'phase.geometryBuild',
  PHASE_DRAIN: 'phase.registrationDrain',
  PHASE_PBR_UPGRADE: 'phase.pbrUpgrade',
  PHASE_SHADOW_REACTIVATE: 'phase.shadowReactivate',
  PHASE_EVENT_FLUSH: 'phase.eventFlush',
  PHASE_SHADER_COMPILE: 'phase.shaderCompile',
  PHASE_BOUNDS_FIT: 'phase.boundsFit',

  // ── Persistence / collaboration ───────────────────────────────────────────
  AUTOSAVE_RUN: 'autosave.run',
  AUTOSAVE_MS: 'autosave.ms',
  AUTOSAVE_SERIALISE_MS: 'autosave.serialiseMs',
  AUTOSAVE_COMPRESS_MS: 'autosave.compressMs',
  AUTOSAVE_BYTES: 'autosave.compressedBytes',
  CRDT_BLACKOUT_MS: 'crdt.blackoutMs',
  SOCKET_DISCONNECT: 'socket.disconnect',
  SOCKET_RECONNECT: 'socket.reconnect',

  // ── Suspected waste paths ─────────────────────────────────────────────────
  REDETECT_ROOMS: 'waste.redetectRooms',
  REDETECT_ROOMS_AFTER_THROW: 'waste.redetectRoomsAfterThrow',
  REDETECT_ROOMS_MS: 'waste.redetectRoomsMs',
  SELECT_SELFHEAL: 'waste.selectStuckSelfHeal',
  OCCUPANCY_CANPLACE_CALLS: 'waste.occupancyCanPlaceCalls',
  OCCUPANCY_CANPLACE_OK: 'waste.occupancyCanPlaceOk',

  // ── Multi-level orchestration (§FURNISH-PERF, L-1398) ─────────────────────
  //
  // The founder's "Furnish all rooms (AI) → all floors" gesture was reported as
  // "super slow" and NONE of its hot path had a counter: not the level switch, not
  // the view activation it fans out into, not the plan re-projection, not the
  // room-tag pass. `window.pryzmPerf.report()` printed a table with nothing about
  // the gesture on it, which is why its cost had to be reasoned about from a console
  // log instead of measured. These are the keys that close that.
  //
  // ⭐ Read `level.activeLevelChanged` FIRST. One assignment to
  // `projectContext.activeLevelId` fans out synchronously into a plan-view
  // re-activation and ~5 full-scene traversals; a gesture that switches the active
  // level N times has multiplied its own cost by N before doing any work.
  LEVEL_SWITCH: 'level.activeLevelChanged',
  VIEW_ACTIVATED: 'view.activated',
  /** Full-scene walks done by the `view-activated` visibility gates. */
  TRAVERSE_VIEW_GATES: 'traverse.viewActivatedVisibilityGates',
  /** Plan/section re-projections, split by which arm the driver took. Read
   *  `full` against `graft`: the graft path is O(dirty), the full path is O(N). */
  REPROJECT_FULL: 'view.reprojectFull',
  REPROJECT_GRAFT: 'view.reprojectGraft',
  REPROJECT_MS: 'view.reprojectMs',
  ROOMTAG_POPULATE: 'roomTag.populateRuns',
  ROOMTAG_POPULATE_MS: 'roomTag.populateMs',
  FURNISH_LEVEL_RUNS: 'furnish.levelRuns',
  FURNISH_LEVEL_MS: 'furnish.levelMs',

  // ── The WALL MOVE gesture (§WALL30-MOVE-COST, L-10520) ────────────────────
  //
  // Founder, 2026-08-24: *"Move / propagates doesn't always work … looks slow,
  // not well performance."* The gesture had NO row on `window.pryzmPerf.report()`
  // at all — the same hole §FURNISH-PERF closed for the level switch. Every
  // number below is a fact one wall drag produces, so the cost can be READ
  // rather than reasoned about from a console transcript.
  //
  // ⭐ Read `wall.move.gestures` FIRST. Everything under it is a MULTIPLE of it:
  // a healthy drag is 1 gesture → 1 reweld → 1 graft → 1 topology rebuild pair.
  // Any row that is a multiple of the gesture count is duplicated work.
  WALL_MOVE_GESTURES: 'wall.move.gestures',
  /**
   * ⭐ §WALL30-DRAG-COALESCE (L-10522) — per-mousemove re-weld dispatches AVOIDED.
   *
   * `PlanElementDragController` writes the wall store on EVERY mousemove. Three
   * subsystems defer on `__wallDragInProgress`; the re-weld service did not, so
   * one drag dispatched one full `CascadeWallBaselineCommand` PER FRAME. This
   * counts the frames now deferred — read it against `wall.move.gestures`, which
   * should be 1 per drag.
   */
  WALL_MOVE_DRAG_DEFERRED: 'wall.move.dragFramesDeferred',
  /** Gestures whose re-weld ran against the memoised PRE-DRAG pose rather than
   *  the zero-delta drag-end snapshot. See §WALL30-DRAG-COALESCE. */
  WALL_MOVE_DRAG_COALESCED: 'wall.move.dragCoalescedGestures',
  WALL_MOVE_REWELD_MS: 'wall.move.reweldMs',
  /** Baseline re-seats this gesture actually dispatched (subject + partners). */
  WALL_MOVE_REWELD_ENTRIES: 'wall.move.reweldEntries',
  /** Junctions the engine REFUSED to close — left open, by name, in the log. */
  WALL_MOVE_REWELD_REFUSED: 'wall.move.reweldRefused',
  /** Partners the engine declined as not-applicable (already seated, preserved…). */
  WALL_MOVE_REWELD_NA: 'wall.move.reweldNotApplicable',
  /**
   * §L-10520 — the subject seat, split by the reason there was no entry. These
   * three were ONE indistinguishable log clause ("NO subject entry") and that
   * ambiguity is most of the founder's *"propagates doesn't always work"*: two
   * of the three are the correct answer and one is a genuine open joint.
   */
  WALL_MOVE_SUBJECT_ENTRY: 'wall.move.subjectEntryEmitted',
  WALL_MOVE_SUBJECT_ALREADY_CLOSED: 'wall.move.subjectAlreadyClosed',
  WALL_MOVE_SUBJECT_DECLINED: 'wall.move.subjectSeatDeclined',
  WALL_MOVE_SUBJECT_NO_CORNER: 'wall.move.subjectNoCornerOffered',
  WALL_MOVE_SUBJECT_COLLAPSE: 'wall.move.subjectWouldCollapse',

  // ── View re-projection: WHY the O(dirty) graft arm was not taken ──────────
  //
  // `REPROJECT_FULL` counts the declines; it does not say which of them. The
  // §DIAG-GRAFT-FALLTHROUGH line in `initScene` prints ONE sentence
  // ("graft produced nothing — the dirty elements contributed no linework")
  // for THREE different causes, and only one of them is that sentence. These
  // separate them.
  /** A second `_flush()` was requested while one was already in flight. Each
   *  overlap is a generation collision: the loser's `setIfCurrent` is rejected
   *  and it falls to the O(N) full arm. This is the count to drive to 0. */
  REPROJECT_FLUSH_OVERLAP: 'view.reprojectFlushOverlap',
  /** Flushes that offered the driver a graft-eligible element set. */
  REPROJECT_GRAFT_OFFERED: 'view.reprojectGraftOffered',
  /** Views demoted to the full arm because a NON-graft-eligible element type
   *  (door/window/furniture/stair/column/roof) touched them in the same flush. */
  REPROJECT_GRAFT_DEMOTED_TYPE: 'view.reprojectGraftDemotedByType',
  /** Views demoted because the flush also took a coarse dirtying (delete, batch,
   *  §G3 stale-id fallback). */
  REPROJECT_GRAFT_DEMOTED_COARSE: 'view.reprojectGraftDemotedCoarse',

  // ── One-shot notes ────────────────────────────────────────────────────────
  NOTE_IN_BATCH: 'note.gestureRanInsideBatch',
  NOTE_PROJECT_LOAD_ACTIVE: 'note.projectLoadActive',
} as const;

// ── Test seam ───────────────────────────────────────────────────────────────

/** Full reset INCLUDING the flag. Test-only; production uses `resetPerfCounters`. */
export function _resetPerfForTest(): void {
  disarmPerf();
  _counters.clear();
  _timers.clear();
  _notes.clear();
  _armedAtMs = null;
}
