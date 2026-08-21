// @pryzm/auto-dimension — §GA-EDITORIAL-LAYER (L-1621) — SPEC-AUTODIMENSION §12.12,
// THE OPTIMISATION PASS.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS: A WARNING IS NOT A RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────
// SPEC §13 gap 7 states it exactly: "Stage-8 emits *warnings* (34 of them on this plate)
// and STOPS — it reports unreadability rather than resolving it." Thirty-four warnings on
// one plate is not a diagnostic success; it is the engine correctly noticing it produced
// an unreadable drawing and shipping it anyway. §12.12 is the missing half:
//
//     detect overlaps → remove duplicate dimensions → straighten dimension chains →
//     align tags → push dimensions outward where possible → …
//     REPEAT UNTIL NO FURTHER READABILITY IMPROVEMENT IS POSSIBLE.
//
// ─────────────────────────────────────────────────────────────────────────────
// "REPEAT UNTIL" — WHY THIS ONE CANNOT SPIN
// ─────────────────────────────────────────────────────────────────────────────
// A fixpoint loop over a layout is the classic place to write an oscillation: pass B
// straightens a chain by pulling two strings onto one row, pass C resolves their overlap
// by pushing one off it, and the two trade the same string forever. The bound would then
// hide the bug rather than prevent it.
//
// So the row a string occupies is split into two INDEPENDENT, MONOTONE-INCREASING terms:
//
//     rowIndex = min(baseRow + push, MAX_ROWS)
//
//   • `baseRow` is owned by STRAIGHTEN and only ever rises (it is a per-cohort maximum);
//   • `push`    is owned by PUSH-OUTWARD and only ever rises;
//   • REMOVE only deletes.
//
// Neither pass can undo the other, so the state is a well-founded descending chain and
// the fixpoint is reached in at most `MAX_ROWS · groups` iterations REGARDLESS of the
// bound. `maxIterations` is therefore a genuine belt-and-braces guard rather than the
// termination argument, and if it is ever hit that is a defect — so it is REPORTED
// (`optimisation-unconverged`), never swallowed.
//
// ─────────────────────────────────────────────────────────────────────────────
// SCOPE — WHAT THIS PASS DOES AND DOES NOT DO
// ─────────────────────────────────────────────────────────────────────────────
// Implemented here: **remove duplicate dimensions · straighten dimension chains · push
// dimensions outward where possible**, to fixpoint. That is the dimension half of §12.12
// and it is all this package can do: "align tags", "verify room labels remain readable"
// and "ensure no annotation crosses a door swing" are about TAGS, which
// `@pryzm/auto-dimension` does not emit (they belong to the tag populators in
// `apps/editor`, which should call `gaPriority.ts` for the order). Stated here, and in
// SPEC-AUTODIMENSION §13, so "the optimisation pass exists" is never read as "§12.12 is
// met".
//
// PURE (INV-2) + DETERMINISTIC (INV-1): every scan is over an explicitly sorted array;
// no Map/Set iteration order reaches the output.

import type { PlacedString, ValidationWarning } from './types.js';
import { dedupKey } from './planners.js';
import { gaClassOfDimensionImpl, gaPriorityOfImpl } from './gaPriority.js';
import { tierOfRank } from './tiers.js';
import { withAutoDimSpan } from './tracing.js';

/** Matches `conflicts.ts` — the stack is bounded at 8 rows (§1.5). */
const MAX_ROWS = 8;
/** Belt-and-braces bound. See the header: it is NOT the termination argument. */
export const DEFAULT_MAX_OPTIMISE_ITERATIONS = 8;
/** Two dim lines within a millimetre are the SAME line (mirrors EPSILON_M). */
const POS_EPS_M = 0.001;

export interface OptimiseResult {
  readonly placed: readonly PlacedString[];
  readonly dropped: readonly { readonly id: string; readonly reason: string }[];
  readonly notes: readonly ValidationWarning[];
  /** Iterations actually run (≥1). */
  readonly iterations: number;
  /** True when a full iteration changed nothing — i.e. a real fixpoint was reached. */
  readonly converged: boolean;
}

interface Slot { p: PlacedString; baseRow: number; push: number; alive: boolean }

function rowOf(s: Slot): number {
  return Math.min(s.baseRow + s.push, MAX_ROWS);
}

/** §12.1 rank of a dimension. Interior strings were re-stamped by `editorial.ts`. */
function priorityOf(p: PlacedString): number {
  const placement = p.autoMode === 'room-bounding' ? 'interior' : 'exterior';
  return gaPriorityOfImpl(gaClassOfDimensionImpl(p.kind, placement));
}

const q = (v: number): number => Math.round(v / POS_EPS_M);

/**
 * The identity of the LINE this string draws: same orientation, same side, same two
 * endpoints, same row. Two strings with this key are literally the same line drawn twice
 * — §12.12's "remove duplicate dimensions", and the only removal that is safe to make
 * without consulting the drawing, because it removes nothing the reader can see.
 */
function lineKey(s: Slot): string {
  const p = s.p;
  const a = `${q(p.p1.x)},${q(p.p1.z)}`;
  const b = `${q(p.p2.x)},${q(p.p2.z)}`;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${p.orientation}|${p.side}|${lo}|${hi}|${rowOf(s)}`;
}

/** 1-D label interval overlap on a shared row (mirrors `conflicts.ts`). */
function labelsOverlap(a: PlacedString, b: PlacedString): boolean {
  const aLo = a.labelCentre - a.labelHalfM, aHi = a.labelCentre + a.labelHalfM;
  const bLo = b.labelCentre - b.labelHalfM, bHi = b.labelCentre + b.labelHalfM;
  return aLo < bHi - 1e-9 && bLo < aHi - 1e-9;
}

/** Total order used by every scan, so each pass visits slots identically each run. */
function scanKey(s: Slot): string {
  const p = s.p;
  return `${p.orientation}|${p.side}|${String(rowOf(s)).padStart(2, '0')}|` +
    `${p.labelCentre.toFixed(6)}|${String(priorityOf(p)).padStart(2, '0')}|${dedupKey(p)}`;
}

/**
 * §12.12 — run the readability optimisation to FIXPOINT over an already-placed dimension
 * set.
 *
 * Returns the optimised strings plus everything removed (INV-3: no silent omission) and
 * any note the pass could not resolve. `converged: false` means the iteration bound was
 * reached — a defect signal, deliberately surfaced rather than hidden.
 *
 * P8 (INV-6) — opens a `pryzm.autodim.conflict` span.
 */
export function optimiseDimensionSet(
  placed: readonly PlacedString[],
  maxIterations: number = DEFAULT_MAX_OPTIMISE_ITERATIONS,
): OptimiseResult {
  return withAutoDimSpan('conflict', (span): OptimiseResult => {
    const bound = Number.isFinite(maxIterations) && maxIterations > 0
      ? Math.floor(maxIterations)
      : DEFAULT_MAX_OPTIMISE_ITERATIONS;

    // ⚠ THE SPLIT MUST BE MADE HERE, NOT AT `p.rowIndex`. The incoming `rowIndex` is the
    // string's TIER *plus* whatever Stage-7 already pushed it to resolve an overlap.
    // Seeding `baseRow` with the sum let STRAIGHTEN — whose job is to pull a cohort onto
    // one continuous line — flatten Stage-7's bump and put the two labels back on top of
    // each other. (Caught by `planAutoDimensions.test.ts`'s bump test, which is exactly
    // what it is for.) The tier is the cohort BASELINE; a bump is a per-string PUSH; the
    // two are different axes and only stay independent if they are stored separately.
    const slots: Slot[] = placed.map((p) => {
      const tier = tierOfRank(p.rank);
      return { p, baseRow: tier, push: Math.max(0, p.rowIndex - tier), alive: true };
    });
    const dropped: { id: string; reason: string }[] = [];
    const notes: ValidationWarning[] = [];

    let iterations = 0;
    let converged = false;
    for (; iterations < bound; iterations++) {
      let changed = false;
      changed = removeDuplicates(slots, dropped) || changed;
      changed = straightenChains(slots) || changed;
      changed = pushOutward(slots, notes) || changed;
      if (!changed) { converged = true; break; }
    }
    if (iterations === 0) iterations = 1;   // one pass always ran
    if (!converged) {
      notes.push({
        code: 'optimisation-unconverged',
        detail: `§12.12 fixpoint not reached in ${bound} iterations — the drawing may still be improvable`,
      });
    }

    const out = slots
      .filter((s) => s.alive)
      .map((s): PlacedString => (rowOf(s) === s.p.rowIndex ? s.p : { ...s.p, rowIndex: rowOf(s) }));

    span.setAttribute('pryzm.autodim.optimise_iterations', iterations);
    span.setAttribute('pryzm.autodim.optimise_dropped', dropped.length);
    span.setAttribute('pryzm.autodim.optimise_converged', converged);
    return { placed: out, dropped, notes, iterations, converged };
  });
}

/**
 * §12.12 pass A — REMOVE DUPLICATE DIMENSIONS.
 *
 * Deliberately narrow: it removes only strings that draw the SAME LINE between the SAME
 * two points on the SAME row. `conflicts.ts` already dedupes by `(orientation, axisId,
 * span)`; that key is blind to two strings on DIFFERENT axisIds — e.g. the same party
 * wall emitted once by each of two abutting apartment cells, which is exactly what
 * `ResidentialBuildingExecutor._buildCellPerimeter` produces (it has no cell-to-cell edge
 * dedup). Keeps the higher §12.1 priority, `dedupKey` as the total-order tiebreak.
 */
function removeDuplicates(slots: Slot[], dropped: { id: string; reason: string }[]): boolean {
  const live = slots.filter((s) => s.alive).sort((a, b) => (scanKey(a) < scanKey(b) ? -1 : 1));
  const seen = new Map<string, Slot>();
  let changed = false;
  for (const s of live) {
    const key = lineKey(s);
    const kept = seen.get(key);
    if (!kept) { seen.set(key, s); continue; }
    const loser = priorityOf(kept.p) <= priorityOf(s.p) ? s : kept;
    const winner = loser === s ? kept : s;
    seen.set(key, winner);
    loser.alive = false;
    dropped.push({ id: dedupKey(loser.p), reason: '§12.12 duplicate-dimension' });
    changed = true;
  }
  return changed;
}

/**
 * §12.12 pass B — STRAIGHTEN DIMENSION CHAINS (with §12.10's "no floating annotations").
 *
 * Every string of the same §12.1 class sharing a stack group must sit on ONE continuous
 * line. Fragmented chains — three segments of one façade string on three different rows —
 * are the single most legible symptom of an undrafted drawing, and §12.2 names it:
 * "align them continuously; avoid fragmented chains".
 *
 * Raises each cohort's `baseRow` to the cohort maximum. Monotone by construction, so it
 * can never undo pass C (see the header).
 */
function straightenChains(slots: Slot[]): boolean {
  const cohorts = new Map<string, Slot[]>();
  for (const s of slots) {
    if (!s.alive) continue;
    const key = `${s.p.groupKey}|${priorityOf(s.p)}`;
    const list = cohorts.get(key);
    if (list) list.push(s); else cohorts.set(key, [s]);
  }
  let changed = false;
  for (const key of [...cohorts.keys()].sort()) {
    const cohort = cohorts.get(key)!;
    let max = 0;
    for (const s of cohort) if (s.baseRow > max) max = s.baseRow;
    if (max > MAX_ROWS) max = MAX_ROWS;
    for (const s of cohort) {
      if (s.baseRow < max) { s.baseRow = max; changed = true; }
    }
  }
  return changed;
}

/**
 * §12.12 pass C — PUSH DIMENSIONS OUTWARD WHERE POSSIBLE.
 *
 * §12.9 rules that dimensions STAY FIXED against tags — but two dimensions colliding with
 * each other is the case §12.9 leaves to §12.12, and `gaPriority.resolveGaCollision`
 * reports it as `bothFixed`. The tie is then broken by §12.1's rank: the LOWER-priority
 * dimension is the one pushed one row further out (an internal dimension yields to an
 * opening dimension, which yields to a structural one, which yields to the overall).
 *
 * That ordering is the point of the exercise. `conflicts.ts`'s existing bump uses the
 * ENGINE's rank (1 overall … 5 fallback); this uses the FOUNDER's §12.1 table, which is
 * the declared order — and where the two disagree, §12.1 is the standard.
 *
 * Monotone: `push` only ever rises. Bounded at `MAX_ROWS`; a pair that cannot be
 * separated is REPORTED, not silently overlapped.
 */
function pushOutward(slots: Slot[], notes: ValidationWarning[]): boolean {
  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    if (!s.alive) continue;
    const list = groups.get(s.p.groupKey);
    if (list) list.push(s); else groups.set(s.p.groupKey, [s]);
  }
  let changed = false;
  for (const gKey of [...groups.keys()].sort()) {
    const group = [...groups.get(gKey)!].sort((a, b) => (scanKey(a) < scanKey(b) ? -1 : 1));
    // ONE push per group per iteration, at the deterministically-FIRST colliding pair
    // (the same discipline `conflicts.ts` uses). Resolving every pair in one sweep would
    // over-push: separating the first pair frequently clears the rest, and a string
    // pushed further than the drawing needs is a readability defect of its own.
    let pushedThisGroup = false;
    for (let i = 0; i < group.length && !pushedThisGroup; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!, b = group[j]!;
        if (rowOf(a) !== rowOf(b)) continue;
        if (!labelsOverlap(a.p, b.p)) continue;
        const pa = priorityOf(a.p), pb = priorityOf(b.p);
        const yielder = pa !== pb
          ? (pa > pb ? a : b)
          : (dedupKey(a.p) > dedupKey(b.p) ? a : b);
        if (rowOf(yielder) >= MAX_ROWS) {
          notes.push({ code: 'text-overlap-unresolved', detail: dedupKey(yielder.p) });
          continue;
        }
        yielder.push += 1;
        changed = true;
        pushedThisGroup = true;
        break;
      }
    }
  }
  return changed;
}
