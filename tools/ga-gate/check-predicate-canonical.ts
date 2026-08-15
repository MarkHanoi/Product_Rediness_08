#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-predicate-canonical.ts
 *
 * C73 §3 / §5.2 — **one implementation per geometric predicate family**, counted
 * STRUCTURALLY, one family per PR.
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * The same predicate, written sixty-odd times, is sixty-odd definitions of
 * "inside". `apps/editor/src/ui/geospatial/CesiumViewport.ts` makes the cost
 * concrete: it contains THREE copies of the even-odd ray cast with THREE
 * different degenerate-divide guards —
 *
 *     :9621   / ((yj - yi) || 1e-12)
 *     :10317  / (nj - ni || 1e-9)
 *     :12842  / (zj - zi)            ← NO GUARD AT ALL
 *
 * A horizontal edge is therefore "inside" under one copy, "outside" under
 * another, and a division by zero under the third — in one file, on one
 * polygon, in one session. That is the C3 arm below, and it fires today.
 *
 * COUNTING IS THE POINT (the lesson `check-offset-implementations.ts` recorded
 * and C73 §0.3 turns into a rule): a correctness gate on the surviving
 * implementation cannot see this class of defect at all, because every copy
 * passes its own package's tests. Only a gate on the NUMBER OF THEM can.
 *
 * ─── HOW TO RE-DERIVE EVERY NUMBER BELOW ─────────────────────────────────────
 *
 *     npx tsx tools/ga-gate/check-predicate-canonical.ts
 *
 * It prints its recipe, every counted body with its file:line, and the guard
 * each one uses. To regenerate the ledger after a GENUINE reduction:
 *
 *     npx tsx tools/ga-gate/check-predicate-canonical.ts --write-baseline
 *
 * That writes `tools/ga-gate/predicate-canonical-baseline.json`. SHRINK-ONLY:
 * every entry is `file:line::signature`, never a bare count, so a reviewer sees
 * WHICH body left rather than a number that could hide one removal and one
 * addition (C69 §7.c).
 *
 * ─── THE RECIPE — structural, never name-based (C73 §3.2, §7.e) ──────────────
 * A name-based count counts call sites and re-exports and is defeated by a
 * rename. This gate matches ARITHMETIC that only an implementation can contain.
 *
 * A POINT-IN-POLYGON BODY is a line region (comment-stripped, then re-joined so
 * a body wrapped across lines is still seen as one) containing the even-odd
 * VERTICAL STRADDLE test — two comparisons of the same query ordinate against
 * two consecutive vertex ordinates, XOR'd:
 *
 *     (yi > y) !== (yj > y)
 *
 * in any operand shape (`a.z`/`p[1]`/`segs[i+1]`/bare identifier) and either
 * comparison direction. That is the ray cast's defining step and no caller or
 * re-export contains it.
 *
 * The straddle test ALONE over-matches: a segment/segment crossing test
 * (`(d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)`) has the same shape. Those
 * are excluded STRUCTURALLY, not by filename — see SEGMENT_CROSS_SHAPE below —
 * because they are a DIFFERENT §3.1 family (segment/segment intersection) that
 * gets its own arm when its turn comes, and folding them in here would inflate
 * this ratchet with bodies no point-in-polygon fix can ever remove.
 *
 * ─── COUNTING UNIT = (file × body), not files and not lines ──────────────────
 * Not lines: one ray cast spans two or three lines and a reformat would move
 * the number. Not files either: `CesiumViewport.ts` holds THREE independent
 * copies, and calling that "one implementation" because they share a file would
 * understate exactly the divergence this gate measures — it is also the file
 * that motivates C3. Bodies are separated by their straddle-test line, so two
 * straddles in one file are two bodies.
 *
 * ─── Baseline ────────────────────────────────────────────────────────────────
 * PINNED AT THIS GATE'S OWN MEASURED READING (C73 §3.4 — a ratchet above its own
 * reading is not a ratchet, it is free slots, and that error has already been
 * made once in this repo and caught by re-measurement).
 *
 * ⚠ C73 §0.2 states **61 distinct ray-cast bodies across 56 files**. This gate
 * does not reproduce that number and does not pretend to: §0.2 gives no recipe,
 * so 61 is not re-derivable from the contract as written — the same defect §0.1
 * carries an amendment for. This gate therefore pins at ITS OWN reading, prints
 * that reading with every body named, and prints the production/test split so
 * anyone re-running §0.2's sweep can see which choice moves the number. §0.2's
 * ARGUMENT — dozens of rival bodies, disagreeing guards, no canonical file — is
 * unchanged and is what this gate ratchets.
 *
 * ─── The arms (C73 §5.2) ─────────────────────────────────────────────────────
 *  C0 *(exit 2)*  minFiles floor — the gate can never pass by looking nowhere.
 *      A SECOND floor applies: ≥ 30 point-in-polygon subjects. Falling under it
 *      means the STRUCTURAL DETECTOR BROKE, not that the repo got clean; a
 *      collapse from dozens to a handful is a regex regression every time, and
 *      reporting it as progress is the exact lie exit 2 exists to prevent.
 *  C1 *(ratchet, named, per family)*  non-canonical body count, pinned at the
 *      measured reading, shrink-only, listed by file:line.
 *  C2 *(hard)*  each family names its canonical file and its exclusions
 *      individually with reasons (C73 §3.3). Point-in-polygon's canonical file
 *      was named by the collapse PR (see the FAMILIES entry):
 *      `packages/geometry-kernel/src/pure/pointInPolygon.ts`. C2 now also
 *      asserts the canonical file's INTEGRITY — it must hold EXACTLY ONE
 *      production body: 0 means the collapse is fiction, ≥2 means a rival was
 *      minted inside the one file no outside ratchet watches.
 *  C3 *(hard)*  within ONE file, no family may appear twice with DIFFERING
 *      degenerate-divide guards (C73 §2.4) — the CesiumViewport finding,
 *      generalised. This is the arm that measures ACTIVE DISAGREEMENT rather
 *      than mere duplication: two identical copies compute the same answer,
 *      two copies with different guards do not.
 *
 * ─── The other §3.1 families — NOT-YET-COUNTED, with named reasons ───────────
 * C73 §3.5 is explicit: ONE FAMILY PER PR. A gate that lit up five families at
 * once would be a mass-refactor brief with no oracle and no bisect, landing on
 * top of a live behavioural disagreement (§7.g). Each is declared below with
 * the reason it is not counted YET, and each reason is a piece of work, not an
 * excuse. They are printed on every run so a family cannot be quietly forgotten.
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (gates doc §2.2) ───────────────
 * `selfTest()` drives the same analyser over synthetic trees:
 *   • C1 detect: a planted ray cast in any of four operand shapes is counted.
 *   • C1 reject: a planted segment/segment crossing test is NOT counted — the
 *     over-match this recipe's one real ambiguity would otherwise produce.
 *   • C1 reject: a planted CALLER (`if (pointInPolygon(p, ring))`) is NOT
 *     counted — proof the detector is structural, not name-based (§3.2).
 *   • C3 detect: two ray casts in one file with `|| 1e-12` and `|| 1e-9` must
 *     be reported as a guard DISAGREEMENT naming both guards; the same two with
 *     the SAME guard must NOT be.
 *   • C1 zero: a tree with no ray cast at all must read 0 — the zero reading
 *     must be reachable, or the floor above it is decoration.
 * If any control fails to fire the gate exits 2 as a BLIND COMPARATOR.
 *
 * ─── What this gate CANNOT see (C73 §5.4a) ───────────────────────────────────
 *   • whether the surviving body is CORRECT. Counting gates are deliberately
 *     blind to correctness; the family also needs an ORACLE FIXTURE at a known
 *     answer, as offset has at 300 mm. There is none yet. NOT PROVEN.
 *   • a ray cast built out of a helper called in a loop, where the straddle
 *     test lives in the helper — counted once, at the helper, which is right,
 *     but the gate cannot tell that from a genuinely single implementation.
 *   • a point-in-polygon done by winding number or by a library call.
 *   • GPU-side containment — anything decided in a shader.
 *
 * Exit 0 clean · 1 exactly the declared ledger · 2 MISCONFIGURED · 3 exceeded or
 * stale. 2 and 3 are never absorbable as declared debt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-predicate-canonical';
const DIRS = ['packages', 'apps', 'plugins', 'src'] as const;
const BASELINE = resolve(HERE, 'predicate-canonical-baseline.json');
const WRITE = process.argv.includes('--write-baseline');

/**
 * An operand: identifier, member access, or index — `y`, `a.z`, `p[1]`,
 * `segs[i + 1]`, `p.next.y`. Bounded repetition, never `.*`, so the straddle
 * pattern cannot run away across an unrelated expression.
 */
const OPERAND = '\\w+(?:\\.\\w+|\\[[^\\]]{1,16}\\])*';

/**
 * THE STRUCTURAL SIGNATURE of an even-odd ray cast: the vertical straddle test.
 * Two comparisons of consecutive vertex ordinates against the query ordinate,
 * XOR'd. Either comparison direction, `!=` or `!==`, any operand shape.
 */
const STRADDLE = new RegExp(
  `\\(\\s*${OPERAND}\\s*[<>]=?\\s*${OPERAND}\\s*\\)\\s*!==?\\s*\\(\\s*${OPERAND}\\s*[<>]=?\\s*${OPERAND}\\s*\\)`,
  'g',
);

/**
 * A SEGMENT/SEGMENT CROSSING test, structurally: TWO straddle-shaped tests
 * AND-ed together. `(d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)` is the
 * classic four-cross-product form.
 *
 * This is a DIFFERENT C73 §3.1 family — segment/segment intersection — which
 * gets its own arm when its turn comes (§3.5, one family per PR). It is
 * excluded STRUCTURALLY rather than by filename so that a fifth copy written
 * tomorrow in a new file is excluded for the same reason, not silently counted
 * as a point-in-polygon body it is not.
 */
const SEGMENT_CROSS_SHAPE = new RegExp(
  `\\(\\s*${OPERAND}\\s*[<>]=?\\s*${OPERAND}\\s*\\)\\s*!==?\\s*\\(\\s*${OPERAND}\\s*[<>]=?\\s*${OPERAND}\\s*\\)` +
  `\\s*&&\\s*` +
  `\\(\\s*${OPERAND}\\s*[<>]=?\\s*${OPERAND}\\s*\\)\\s*!==?\\s*\\(\\s*${OPERAND}\\s*[<>]=?\\s*${OPERAND}\\s*\\)`,
);

/**
 * The x-interpolation divide, and — CRITICALLY — its denominator, captured, so
 * the guard can be read off it. The denominator is the vertex-ordinate
 * DIFFERENCE (`yj - yi`), which is exactly the quantity that vanishes on a
 * horizontal edge, so the guard question is entirely a question about what
 * follows it inside this divisor.
 *
 * `[^;]{0,80}` is bounded, never `.*`: an unbounded tail would run past the end
 * of the divisor and read the NEXT expression's literals as this body's guard.
 */
const INTERP_DIVIDE = new RegExp(
  `\\/\\s*\\(*\\s*${OPERAND}\\s*-\\s*${OPERAND}([^;]{0,80})`,
);

/**
 * The degenerate-divide guard, applied to the captured divisor TAIL. The live
 * shapes measured in this repo, plus a bare divide (NO guard) reported as such
 * — because "no guard" is a DISTINCT convention, not a missing datum, and C3's
 * whole point is that it disagrees with the guarded copies.
 *
 * Both shapes REQUIRE the guard literal to appear before the divisor's closing
 * paren, i.e. inside the divisor, so a `1e-9` sitting in an unrelated later
 * comparison on the same line cannot be misread as this divide's guard.
 */
const GUARD_SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ['||', /^\s*\)?\s*\|\|\s*(\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i],
  ['+', /^\s*\+\s*(\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i],
];

/**
 * ─── TERM GRAMMAR for the ARITHMETIC families (segment/segment, area) ────────
 *
 * `OPERAND` above is deliberately narrow — a ray cast's straddle test compares
 * plain ordinates. The arithmetic families do NOT have that luxury: the
 * canonical bodies themselves are written in shapes `OPERAND` cannot see, and a
 * signature that misses the canonical is not a signature.
 *
 *   • `polygonSignedAreaOrdinates` accumulates `xAt(i) * yAt(j) - xAt(j) * yAt(i)`
 *     — ACCESSOR CALLS, because it is accessor-backed so every vertex shape in
 *     the estate reads one accumulation. A grammar without calls misses THE
 *     canonical shoelace body.
 *   • `intersectSegments2D` divides by `D` assigned from `rx * sy - ry * sx`
 *     — precomputed vector components, not parenthesised differences. The
 *     rivals span all three spellings (`(x1-x2)*(y3-y4)-…` in snapping,
 *     `r.x*s.z-r.z*s.x` in auto-dimension, `rX*sZ-rZ*sX` in HiddenLineRemoval).
 *
 * TERM therefore admits an atom, a bounded call, or a bounded parenthesised
 * expression, with an optional leading minus. Every repetition stays BOUNDED —
 * never `.*` — for the same reason the straddle pattern is bounded: an
 * unbounded term runs past its own expression and reads the next one's operands.
 */
const CALL = '\\w+\\s*\\([^()]{0,80}\\)';
const PAREN = '\\([^()]{1,100}\\)';
const TERM = `-?\\s*(?:${CALL}|${OPERAND}|${PAREN})`;

/**
 * THE 2D CROSS PRODUCT `A*B − C*D`. This one shape is the shared arithmetic of
 * BOTH remaining families — it is the segment/segment determinant AND the
 * shoelace term — which is precisely why they must be told apart by what
 * SURROUNDS it (a divide, or an accumulation), never by the cross alone.
 */
const CROSS_2D = `${TERM}\\s*\\*\\s*${TERM}\\s*-\\s*${TERM}\\s*\\*\\s*${TERM}`;

/**
 * A DIVISOR ASSIGNED A 2D CROSS: `const denom = rx * sy - ry * sx;`. The
 * captured name is what the parametric detector then counts divisions by.
 */
const DIVISOR_ASSIGN = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;]{0,10}${CROSS_2D}`);

/**
 * The window a PARAMETRIC segment/segment solve may span, measured — not
 * guessed — from the widest live instance: the canonical `intersectSegments2D`
 * puts `D` at :208 and `u` at :216, NINE lines apart, because the guard, the
 * cross-quad destructure and two explanatory comments sit between them.
 *
 * An 8-line window READ THE CANONICAL AS A SINGLE-QUOTIENT BODY and therefore
 * classified it as the adjacent line/line family — i.e. the first cut of this
 * arm could not see its own canonical implementation. 12 is that measured span
 * plus headroom, and it is bounded for the usual reason.
 */
const SEG_WINDOW = 12;

// ─── The families (C73 §3.1) ─────────────────────────────────────────────────

interface Family {
  readonly id: string;
  readonly what: string;
  /**
   * The canonical file this family must collapse onto. `null` = THERE IS NONE
   * YET, which is a C2 finding, stated rather than hidden.
   */
  readonly canonical: string | null;
  /** Named, individual exclusions with their reason (C73 §3.3). */
  readonly exclusions: ReadonlyArray<readonly [string, string]>;
  /** Counted this PR? C73 §3.5 — one family per PR. */
  readonly counted: boolean;
  /** If not counted, WHY not. A reason, never a blank. */
  readonly notYetReason?: string;
}

const FAMILIES: readonly Family[] = [
  {
    id: 'point-in-polygon',
    what: 'even-odd ray cast (vertical straddle + edge x-interpolation)',
    // NAMED BY THE COLLAPSE PR (C73 §3.6/§3.7), as this comment previously
    // required. The shipping consumers were identified BY NAME and migrated in
    // the same commit series that minted this file: the room-detection path
    // (`room-topology/RoomPolygonUtils.pointInPolygon` → RoomContentsService /
    // RoomRelationshipService / RoomTool / LightingRoomResolver), the slab/roof
    // coupling resolvers (`geometry-column`/`geometry-wall`), the roof builder,
    // the ai-host layout workflows (tgl / house / residential / furnish /
    // lighting / daylight), the site query service, the plan-view floor/ceiling
    // tools, the solar worker codec and the annotations plugin (via the SDK
    // facade). The guard decision (§3.7) is on the record in the canonical
    // file's header: NO degenerate-divide guard — the straddle test makes the
    // divisor structurally nonzero, so every rival `|| eps` guard was dead code
    // and every `+ eps` guard was an answer perturbation; boundary semantics
    // are HALF-OPEN with boundary-inclusive/-exclusive compositions staying at
    // the call sites that own them.
    canonical: 'packages/geometry-kernel/src/pure/pointInPolygon.ts',
    exclusions: [
      [
        // Path updated by the GE-12 triangulation collapse: the vendored earcut
        // moved to pure/triangulatePolygon.ts as THE canonical triangulation body
        // (§C73-TRIANGULATION-CANONICAL); the exclusion reason is unchanged.
        'packages/geometry-kernel/src/pure/triangulatePolygon.ts',
        'middleInside — a genuine even-odd ray cast, but inside the VENDORED mapbox/earcut port, walking the ' +
        'triangulator’s internal circular linked list mid-hole-elimination. Routing it through the kernel ' +
        'predicate would fork the vendored algorithm (and add a per-call ring materialisation in the ' +
        'triangulation hot path); its correctness is anchored to upstream earcut’s behaviour, not to kernel ' +
        'semantics. On the record here per C73 §3.3 — an excluded body, not a migrated one.',
      ],
      [
        'packages/geometry-kernel/src/pure/polygonOffset.ts',
        'findSelfIntersection — a SEGMENT/SEGMENT crossing test (four cross products, two straddles AND-ed), ' +
        'not a ray cast. A different C73 §3.1 family with its own arm. Also excluded structurally by ' +
        'SEGMENT_CROSS_SHAPE; named here so the decision is on the record even if the structural rule is edited.',
      ],
      [
        'packages/site-parcel-data/src/geometry/insetPolygon.ts',
        'segmentsCross — the same segment/segment construction, in the capsule-union erosion that ' +
        'check-offset-implementations.ts also excludes by name as a different construction for a different problem.',
      ],
    ],
    counted: true,
  },
  {
    id: 'segment-segment-intersection',
    what: 'proper crossing of two segments (cross-product straddle pair, or parametric t/u solve)',
    canonical: null,
    exclusions: [],
    counted: false,
    notYetReason:
      'NOT-YET-COUNTED as an arm, but the §3.6/§3.7 blocker is DISCHARGED (2026-08-13): the one-family ' +
      'proof (d1 = −u·D, d2 = (1−u)·D, d3 = t·D, d4 = (t−1)·D — both spellings are decision procedures over ' +
      'the same four scalars) is on the record in the canonical file ' +
      '`packages/geometry-kernel/src/pure/segmentIntersection.ts` and EXECUTED by ' +
      '`__tests__/segmentIntersection.oracle.test.ts`, which drives both rival forms over a degenerate grid. ' +
      'Nine production rivals were collapsed onto it in the same series (kernel fold-detect, the three ' +
      'WallIntersectionResolver clones, tgl sightline, ringSimplicity + RoomPolygonUtils, ' +
      'CeilingPolygonUtils). What the arm still needs before counted:true: a detector for the PARAMETRIC ' +
      'spelling (denominator cross + dual t/u range check — SEGMENT_CROSS_SHAPE only sees the straddle ' +
      'pair) with its own negative controls, and a baseline write for the deferred rivals (site-parcel-data ' +
      'EPS-signed variants under legally-scoped fixtures; snapping/auto-dimension/finish-host-tracker ' +
      'awaiting a kernel dep + lockfile sync; PlanSnapEngine/HiddenLineRemoval, whose boundary bands extend ' +
      'beyond the closed [0,1] the canonical answers). ' +
      '── UPDATE 2026-08-15: THE DETECTOR NOW EXISTS and the family HAS ITS DENOMINATOR (see CENSUS below). ' +
      'The parametric spelling is detected structurally — a divisor assigned a 2D cross, then TWO OR MORE ' +
      'quotients of that same divisor — which covers all three live determinant spellings (parenthesised ' +
      'differences, member components, bare locals) and, critically, the CANONICAL body itself. Negative ' +
      'controls execute on every run against vector normalisation, single-quotient line/line solves and ' +
      'shoelace accumulation. What remains before counted:true is NOT a detector problem: it is that the ' +
      'measured rivals cannot reach 0 in one PR (four of them need a new @pryzm/geometry-kernel dependency ' +
      'and a pnpm-lock sync, which is single-owner), so flipping the flag today would move this gate off ' +
      'hard-0 — a registration decision, not a lane decision. The census is recorded so the successor ' +
      'inherits a measured number instead of a sweep.',
  },
  {
    id: 'polygon-area-and-winding',
    what: 'shoelace signed area / orientation',
    canonical: null,
    exclusions: [],
    counted: false,
    notYetReason:
      'NOT-YET-COUNTED — C73 §3.5. `polygonSignedArea2D` IS the canonical (pure/polygonOffset.ts, barrel-' +
      'exported), now accessor-backed as `polygonSignedAreaOrdinates` so any vertex shape reads area AND ' +
      'winding (= the SIGN of the same accumulation, oracle-pinned in polygonAreaWinding.oracle.test.ts) ' +
      'without minting a copy; the kernel’s own five producer clones (slab/room/ceiling/extrude/roof-' +
      'polygon) collapsed onto it 2026-08-13. The census measured ~80 further production `+= a.x*b.z - ' +
      'b.x*a.z` accumulations across apps/plugins/packages. Still not counted because the shoelace ' +
      'accumulate step is a bare `+=` over a cross product — far weaker as a structural signature than the ' +
      'straddle test. The arm’s designed signature is the ACCUMULATION shape `+= A*B - C*D` (and the ' +
      'trapezoid spelling `(x2-x1)*(y2+y1)`) restricted to a loop over ring-successor pairs, with negative ' +
      'controls against dot-product sums, energy sums and non-cyclic accumulators — those controls must ' +
      'exist before the count can be trusted (§7.k — a tally that cannot be trusted is worse than no tally).',
  },
  {
    id: 'point-to-segment-distance',
    what: 'projection parameter t clamped to [0,1], then a distance to the clamped point',
    canonical: null,
    exclusions: [],
    counted: false,
    notYetReason:
      'NOT-YET-COUNTED — C73 §3.5. Detection is tractable (the clamped-t projection is a distinctive shape — ' +
      'CesiumViewport:12836-12840 is one instance) but this family is entangled with the tolerance policy: ' +
      'most sites compare the resulting distance against a PRIVATE epsilon, so counting bodies before ' +
      'check-epsilon-policy E2 has come down would ratchet a number that a tolerance migration is about to ' +
      'move underneath it.',
  },
  {
    id: 'polygon-containment-overlap',
    what: 'ring-in-ring containment / AABB-or-ring overlap',
    canonical: null,
    exclusions: [],
    counted: false,
    notYetReason:
      'NOT-YET-COUNTED — C73 §3.5, and this one is BLOCKED rather than merely deferred: it is almost always ' +
      'BUILT OUT OF point-in-polygon (every vertex of A inside B) or out of segment/segment intersection. ' +
      'Counting it before those two families collapse would count the same rival bodies a second time under ' +
      'a different name, and the two ratchets would then move together for one fix — which reads as two ' +
      'wins and is one. It must be counted LAST.',
  },
];

// ─── Detection ───────────────────────────────────────────────────────────────

interface Body {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  /** The degenerate-divide guard shape, or `none` — see GUARD_SHAPES. */
  readonly guard: string;
  readonly isTest: boolean;
}

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel) || /(^|\/)tests?\//.test(rel);
}

/**
 * The window of source a single body may span. A ray cast wraps across at most
 * two or three lines in every live instance measured (`straddle &&` on one
 * line, the x-interpolation on the next). Three is generous and bounded — an
 * unbounded window would let two UNRELATED bodies merge into one and undercount.
 */
const BODY_WINDOW = 3;

/**
 * Count point-in-polygon bodies. One body per straddle-test occurrence: two
 * straddles in one file are two bodies (see the COUNTING UNIT note in the
 * header — CesiumViewport is why).
 */
function detectPointInPolygon(root: string, dirs: readonly string[]): { bodies: Body[]; filesScanned: number } {
  const bodies: Body[] = [];
  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        // The body's window: this line plus the next few, joined, so a body
        // wrapped across lines is seen whole (the guard usually sits on the
        // NEXT line from the straddle).
        const window = lines.slice(i, i + BODY_WINDOW).join(' ');
        STRADDLE.lastIndex = 0;
        if (!STRADDLE.test(lines[i]!) && !STRADDLE.test(window)) continue;
        // Not on THIS line's own start? Then an earlier line already opened this
        // body — do not count it twice.
        STRADDLE.lastIndex = 0;
        if (!STRADDLE.test(lines[i]!)) continue;
        // A segment/segment crossing test is a DIFFERENT family (see the header).
        if (SEGMENT_CROSS_SHAPE.test(window)) continue;
        let guard = 'none';
        const divide = INTERP_DIVIDE.exec(window);
        if (divide) {
          const tail = divide[1] ?? '';
          for (const [id, re] of GUARD_SHAPES) {
            const g = re.exec(tail);
            if (g) { guard = `${id} ${g[1]}`; break; }
          }
        } else {
          // A straddle with NO x-interpolation divide anywhere in its window is
          // not the full ray cast — it is a straddle used for something else
          // (an elevation-mark crossing count, a bracket test). Counted anyway,
          // because the straddle IS the shared step and a body that computes
          // its crossing differently is still a rival definition of "inside";
          // marked so the reader can see which ones these are.
          guard = 'no-interpolation-divide-in-window';
        }
        bodies.push({ file: rel, line: i + 1, text: lines[i]!.trim().slice(0, 120), guard, isTest: isTestPath(rel) });
      }
    }
  }
  return { bodies, filesScanned };
}

/** C3 — one file, one family, TWO bodies, DIFFERENT guards. */
function guardDisagreements(bodies: readonly Body[]): string[] {
  const byFile = new Map<string, Body[]>();
  for (const b of bodies) {
    if (b.guard === 'no-interpolation-divide-in-window') continue; // no divide ⇒ no guard question
    const list = byFile.get(b.file) ?? [];
    list.push(b);
    byFile.set(b.file, list);
  }
  const out: string[] = [];
  for (const [file, list] of [...byFile.entries()].sort()) {
    const guards = [...new Set(list.map((b) => b.guard))];
    if (guards.length < 2) continue;
    out.push(
      `${file} — ${list.length} point-in-polygon bodies with ${guards.length} DIFFERENT degenerate-divide ` +
      `guards: ${list.map((b) => `:${b.line} → ${b.guard}`).join(' · ')}. A horizontal edge is "inside" under ` +
      'one copy and "outside" under another, in ONE file, on ONE polygon, in ONE session (C73 §2.4, §0.2). ' +
      'The guard comes from the declared numeric-zero epsilon (`EPSILON_ZERO`, geometry-kernel) or the ' +
      'predicate refuses — it is never a per-call-site choice.',
    );
  }
  return out;
}

// ─── Family "segment-segment-intersection" — the CENSUS arm (C73 §3.1) ───────

interface SegBody {
  readonly file: string;
  readonly line: number;
  /** `cross-product` (four signs) or `parametric` (two quotients of one determinant). */
  readonly form: string;
  readonly text: string;
  readonly isTest: boolean;
}

/**
 * Detect segment/segment intersection bodies in BOTH spellings the canonical
 * file's one-family proof unifies (`§C73-SEGSEG-CANONICAL`: d1 = −u·D,
 * d2 = (1−u)·D, d3 = t·D, d4 = (t−1)·D — two decision procedures over the same
 * four scalars).
 *
 *   FORM A — CROSS-PRODUCT: two straddle tests AND-ed, i.e. SEGMENT_CROSS_SHAPE,
 *     the shape the point-in-polygon arm already excludes structurally. It is
 *     counted HERE, which is the whole point of that exclusion: those bodies were
 *     never unmeasurable, they were parked until this family's turn.
 *
 *   FORM B — PARAMETRIC: a divisor assigned a 2D cross, then TWO OR MORE
 *     quotients of that same divisor in the window. Two parameters solved
 *     against one determinant IS the segment/segment solve.
 *
 * ── Why TWO quotients, and not one (the taxonomy decision, C73 §3.3) ─────────
 * A divisor-assigned-a-cross with exactly ONE quotient solves for ONE parameter
 * — that is a LINE/LINE intersection (extend both to infinity, take the point),
 * which is a DIFFERENT question: it has no [0,1] band, no "do they actually
 * cross" verdict, and 15 production instances in this tree (wall junction
 * resolvers, fillet, slab loop intersectors) that a segment/segment collapse
 * CANNOT remove, because they must keep answering the unbounded question.
 * Folding them in would inflate this census with bodies no fix in this family
 * can retire — the identical error SEGMENT_CROSS_SHAPE exists to prevent in the
 * point-in-polygon arm. They are DETECTED and PRINTED as an adjacent family
 * (so the decision is auditable and they cannot be quietly forgotten), and they
 * are NOT counted. The canonical body itself is a TWO-quotient body, which is
 * the corroboration that two is the right cut.
 *
 * ── Named blind spot (C73 §5.4a) ─────────────────────────────────────────────
 * A determinant computed by a HELPER (`const denom = cross(d1x, d1z, d2x, d2z)`
 * — `finish-host-tracker/src/reprojectFinishBoundary.ts:186` is the live
 * instance) is invisible to arithmetic matching: there is no cross product in
 * the text, only a call. Matching it would require keying on the callee NAME,
 * which C73 §3.2 forbids and a rename defeats. It is declared, not counted, and
 * not pretended away.
 */
function detectSegmentIntersection(root: string, dirs: readonly string[]): { bodies: SegBody[]; lineLine: SegBody[] } {
  const bodies: SegBody[] = [];
  const lineLine: SegBody[] = [];
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      const lines = stripCommentsToLines(src);
      const isTest = isTestPath(rel);
      for (let i = 0; i < lines.length; i++) {
        const L = lines[i]!;
        if (SEGMENT_CROSS_SHAPE.test(L)) {
          bodies.push({ file: rel, line: i + 1, form: 'cross-product', text: L.trim().slice(0, 120), isTest });
          continue;
        }
        const m = DIVISOR_ASSIGN.exec(L);
        if (!m) continue;
        const name = m[1]!;
        const window = lines.slice(i, i + SEG_WINDOW).join('\n');
        const quotients = window.match(new RegExp(`\\/\\s*${name}\\b`, 'g'))?.length ?? 0;
        const body: SegBody = { file: rel, line: i + 1, form: `parametric(${quotients} quotients)`, text: L.trim().slice(0, 120), isTest };
        if (quotients >= 2) bodies.push(body);
        else if (quotients === 1) lineLine.push(body);
      }
    }
  }
  return { bodies, lineLine };
}

// ─── Baseline ────────────────────────────────────────────────────────────────

interface Baseline {
  readonly recipe: string;
  readonly measuredAt: string;
  /** `file:line::family` → the guard shape. C1's ledger AND C3's prior state. */
  readonly bodies: Record<string, string>;
  /** C2: 1 while a counted family still has no canonical file. */
  readonly c2: number;
  /** C3's declared level — the guard disagreements known at baseline. */
  readonly c3: string[];
  /**
   * ─── CENSUS (not a ratchet) — the NOT-YET-COUNTED families' denominators ───
   *
   * C73 §3.5 allows ONE family per PR to become `counted: true`. This field is
   * the step BEFORE that: a family's measured denominator, recorded so it is
   * re-derivable and so a reviewer can diff which bodies left, WITHOUT the
   * family yet contributing findings.
   *
   * WHY RECORDED BUT NOT RATCHETED — stated plainly rather than left to be
   * inferred, because a gate that exits 0 while carrying known duplicates is
   * exactly the two-facts-one-value dishonesty this repo keeps paying for:
   * turning a census into findings would move this gate off HARD-0 (findings > 0
   * ⇒ exit 1 for as long as the debt exists, per `verdictOf`). Whether this gate
   * leaves hard-0 is a REGISTRATION decision — `gate-debt.json` requires an
   * explicit founder/architect decision, and `gate-newly-measured.json` exists
   * precisely for "the instrument arrived" — and neither is a lane's to make
   * unilaterally. So the measurement lands, the ratchet does not, and the gate's
   * printed output says the number out loud on every run so nobody reads its
   * CLEAN verdict as "no duplicates". The flip is one field: `counted: true`.
   */
  readonly census?: Record<string, { readonly production: number; readonly test: number; readonly bodies: string[] }>;
}

function keyOf(b: Body): string { return `${b.file}:${b.line}::point-in-polygon`; }

// ─── Executed controls ───────────────────────────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${m}`); };
  try {
    // ── C1 detect: four operand shapes, all real forms measured in this repo ──
    writeTree(join(base, 'shapes'), {
      'packages/a/src/member.ts':
        'export function f(p: P, a: P, b: P) { let c = false; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; return c; }\n',
      'packages/a/src/bare.ts':
        'export function g(px: number, py: number, yi: number, yj: number, xi: number, xj: number) { let s = false;\n  if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-30) + xi) s = !s;\n  return s; }\n',
      'packages/a/src/indexed.ts':
        'export function h(pt: number[], xi: number, xj: number, yi: number, yj: number) { let s = false;\n  if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) s = !s;\n  return s; }\n',
      'packages/a/src/wrapped.ts': [
        'export function k(segs: number[], px: number, pz: number) {',
        '  let inside = false;',
        '  for (let i = 0; i + 3 < segs.length; i += 4) {',
        '    const intersects = (segs[i + 1] > pz) !== (segs[i + 3] > pz)',
        '      && px < ((segs[i + 2] - segs[i]) * (pz - segs[i + 1])) / (segs[i + 3] - segs[i + 1]) + segs[i];',
        '    if (intersects) inside = !inside;',
        '  }',
        '  return inside;',
        '}',
      ].join('\n'),
    });
    const shapes = detectPointInPolygon(join(base, 'shapes'), ['packages']);
    const shapeFiles = [...new Set(shapes.bodies.map((b) => b.file))].sort();
    lines.push(`C1 detect (four operand shapes): ${shapes.bodies.length} bod(ies) in [${shapeFiles.map((f) => f.split('/').pop()).join(', ')}]`);
    for (const want of ['member.ts', 'bare.ts', 'indexed.ts', 'wrapped.ts']) {
      if (!shapeFiles.some((f) => f.endsWith(want))) fail(`C1 did not detect the planted ray cast in ${want} — the structural signature misses a live operand shape.`);
    }

    // ── C1 reject: a segment/segment crossing test, and a NAMED CALLER ───────
    writeTree(join(base, 'reject'), {
      'packages/b/src/segcross.ts':
        'export function x(d1: number, d2: number, d3: number, d4: number) { return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0); }\n',
      'packages/b/src/caller.ts': [
        "import { pointInPolygon } from './lib.js';",
        'export function inRoom(p: P, ring: P[]) {',
        '  if (pointInPolygon(p.x, p.z, ring)) return true;',
        '  const isPointInside = pointInPolygon;',
        '  return isPointInside(p.x, p.z, ring);',
        '}',
      ].join('\n'),
    });
    const rej = detectPointInPolygon(join(base, 'reject'), ['packages']);
    lines.push(`    C1 reject (segment/segment cross + a named CALLER): ${rej.bodies.length} bod(ies) — expected 0`);
    if (rej.bodies.some((b) => b.file.endsWith('segcross.ts'))) fail('C1 counted a SEGMENT/SEGMENT crossing test as a point-in-polygon body — the other §3.1 family would inflate this ratchet with bodies no PIP fix can remove.');
    if (rej.bodies.some((b) => b.file.endsWith('caller.ts'))) fail('C1 counted a CALL SITE of `pointInPolygon` — the detector is name-based, which C73 §3.2 forbids and a rename defeats.');

    // ── C1 zero: the zero reading must be reachable ──────────────────────────
    writeTree(join(base, 'clean'), { 'packages/c/src/plain.ts': 'export const area = (w: number, h: number) => w * h;\n' });
    const clean = detectPointInPolygon(join(base, 'clean'), ['packages']);
    lines.push(`    C1 zero (a tree with no ray cast): ${clean.bodies.length} bod(ies) — expected 0`);
    if (clean.bodies.length !== 0) fail('C1 counted a body in a tree that contains no ray cast at all — the zero reading is unreachable, so the floor above it is decoration.');

    // ── C3 detect: two bodies, two guards, one file ──────────────────────────
    writeTree(join(base, 'guards'), {
      'packages/d/src/two.ts': [
        'export function a(yi: number, yj: number, lat: number, lon: number, xi: number, xj: number) { let inside = false;',
        '  if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;',
        '  return inside; }',
        'export function b(ni: number, nj: number, n: number, e: number, ei: number, ej: number) { let inside = false;',
        '  if ((ni > n) !== (nj > n) && e < ((ej - ei) * (n - ni)) / (nj - ni || 1e-9) + ei) inside = !inside;',
        '  return inside; }',
      ].join('\n'),
    });
    const two = detectPointInPolygon(join(base, 'guards'), ['packages']);
    const dis = guardDisagreements(two.bodies);
    lines.push(`    C3 detect (one file, guards 1e-12 vs 1e-9): ${dis.length} disagreement(s) over ${two.bodies.length} bodies, guards read [${two.bodies.map((b) => b.guard).join(', ')}]`);
    if (two.bodies.length !== 2) fail(`C3 fixture did not yield 2 bodies (got ${two.bodies.length}) — the per-body counting unit is broken, so C3 has nothing to compare.`);
    // Assert the guard VALUES, not just the disagreement count. The first cut of
    // this gate read `|| 1e-12` as "no guard" and an unguarded divide as "none"
    // too — which COLLAPSED both onto one value and made C3 read 0
    // disagreements on the very file that motivates it. A control that only
    // counted disagreements would have passed on some other fixture; only
    // reading the extracted guards back catches a guard extractor that returns
    // a constant.
    const readGuards = two.bodies.map((b) => b.guard).sort();
    if (!readGuards.some((g) => /1e-12/.test(g))) fail(`C3's guard EXTRACTOR did not read \`|| 1e-12\` off the divisor (got [${readGuards.join(', ')}]) — a guard extractor that returns a constant makes C3 blind on exactly the file it exists for.`);
    if (!readGuards.some((g) => /1e-9/.test(g))) fail(`C3's guard EXTRACTOR did not read \`|| 1e-9\` off the divisor (got [${readGuards.join(', ')}]).`);
    if (dis.length !== 1) fail('C3 did not report two ray casts in ONE file using DIFFERENT degenerate-divide guards — the CesiumViewport finding would go unseen.');
    else if (!/1e-12/.test(dis[0]!) || !/1e-9/.test(dis[0]!)) fail('C3 fired but did not NAME both guards; "guards differ" without the two values is a shrug, not a refusal (C73 §4.4).');

    // ── C3 reject: the SAME guard twice is duplication, not disagreement ─────
    writeTree(join(base, 'sameguard'), {
      'packages/e/src/two.ts': [
        'export function a(yi: number, yj: number, lat: number, lon: number, xi: number, xj: number) { let inside = false;',
        '  if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-9) + xi) inside = !inside;',
        '  return inside; }',
        'export function b(ni: number, nj: number, n: number, e: number, ei: number, ej: number) { let inside = false;',
        '  if ((ni > n) !== (nj > n) && e < ((ej - ei) * (n - ni)) / ((nj - ni) || 1e-9) + ei) inside = !inside;',
        '  return inside; }',
      ].join('\n'),
    });
    const same = guardDisagreements(detectPointInPolygon(join(base, 'sameguard'), ['packages']).bodies);
    lines.push(`    C3 reject (one file, the SAME guard twice): ${same.length} disagreement(s) — expected 0`);
    if (same.length !== 0) fail('C3 reported two copies using the SAME guard as a disagreement — that is duplication (C1 counts it), not the divergence C3 measures.');

    // ── C3: an UNGUARDED divide must read `none`, distinct from a guarded one ─
    // This is the THIRD live CesiumViewport convention and it is the dangerous
    // one — a horizontal edge divides by zero rather than reading wrong. It is
    // only visible to C3 if "no guard" is a DISTINCT value from every guard,
    // never a fallback the extractor also returns on failure.
    writeTree(join(base, 'noguard'), {
      'packages/f/src/two.ts': [
        'export function a(zi: number, zj: number, pz: number, px: number, xi: number, xj: number) { let inside = false;',
        '  const intersects = (zi > pz) !== (zj > pz)',
        '    && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;',
        '  if (intersects) inside = !inside; return inside; }',
        'export function b(ni: number, nj: number, n: number, e: number, ei: number, ej: number) { let inside = false;',
        '  if ((ni > n) !== (nj > n) && e < ((ej - ei) * (n - ni)) / (nj - ni || 1e-9) + ei) inside = !inside;',
        '  return inside; }',
      ].join('\n'),
    });
    const ng = detectPointInPolygon(join(base, 'noguard'), ['packages']).bodies;
    const ngDis = guardDisagreements(ng);
    lines.push(`    C3 detect (one file, UNGUARDED divide vs \`|| 1e-9\`): ${ngDis.length} disagreement(s), guards read [${ng.map((b) => b.guard).join(', ')}]`);
    if (!ng.some((b) => b.guard === 'none')) fail(`C3 did not read an UNGUARDED divide as \`none\` (got [${ng.map((b) => b.guard).join(', ')}]) — the third CesiumViewport convention, and the one that divides by zero.`);
    if (ngDis.length !== 1) fail('C3 did not report an UNGUARDED ray cast alongside a guarded one as a disagreement — "no guard" must be a DISTINCT convention, not a missing datum.');

    // ── SEGMENT/SEGMENT census: detect BOTH spellings, in all three live
    //    determinant shapes, and REJECT the three things that look like it ────
    //
    // The canonical body's own spelling is fixture #3 (`rx * sy - ry * sx`,
    // nine lines from determinant to second quotient). That is not decoration:
    // the first cut of this arm used an 8-line window and read THE CANONICAL as
    // a single-quotient line/line solve — the arm could not see the very
    // implementation it exists to collapse onto. This control is what would have
    // caught it, so it is pinned here in the canonical's exact shape.
    writeTree(join(base, 'segseg'), {
      'packages/a/src/crossprod.ts':
        'export function x(d1: number, d2: number, d3: number, d4: number) { return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0); }\n',
      'packages/a/src/paramDiffs.ts': [
        'export function a(x1: number, x2: number, x3: number, x4: number, y1: number, y2: number, y3: number, y4: number) {',
        '  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);',
        '  if (Math.abs(denom) < 1e-10) return null;',
        '  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;',
        '  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;',
        '  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;',
        '}',
      ].join('\n'),
      'packages/a/src/paramMembers.ts': [
        'export function b(r: V, s: V, qp: V) {',
        '  const denom = r.x * s.z - r.z * s.x;',
        '  if (Math.abs(denom) < 1e-9) return false;',
        '  const t = (qp.x * s.z - qp.z * s.x) / denom;',
        '  const u = (qp.x * r.z - qp.z * r.x) / denom;',
        '  return t > 0 && t < 1 && u > 0 && u < 1;',
        '}',
      ].join('\n'),
      // The canonical's OWN shape and span — determinant to second quotient is
      // NINE lines, because a guard, a destructure and two comments sit between.
      'packages/a/src/paramCanonicalSpan.ts': [
        'export function c(rx: number, ry: number, sx: number, sy: number, d1: number, d3: number) {',
        '  const D = rx * sy - ry * sx;',
        '  // the declared numeric-zero epsilon guards the divide;',
        '  // the five rival per-site guards are retired by the collapse.',
        '  if (Math.abs(D) < 1e-9) return null;',
        '  const quad = { d1, d3 };',
        '  const t = quad.d3 / D;',
        '  // `+ 0` canonicalises IEEE -0 to +0 so a touch at a segment start',
        '  // reports u = 0, not -0; exact identity for every other value.',
        '  const u = -quad.d1 / D + 0;',
        '  if (t < 0 || t > 1 || u < 0 || u > 1) return null;',
        '  return { t, u };',
        '}',
      ].join('\n'),
    });
    const seg = detectSegmentIntersection(join(base, 'segseg'), ['packages']);
    const segFiles = [...new Set(seg.bodies.map((b) => b.file.split('/').pop()))].sort();
    lines.push(`    SEGSEG detect (cross-product + three determinant spellings): ${seg.bodies.length} bod(ies) in [${segFiles.join(', ')}]`);
    for (const want of ['crossprod.ts', 'paramDiffs.ts', 'paramMembers.ts', 'paramCanonicalSpan.ts']) {
      if (!segFiles.some((f) => f === want)) fail(`SEGSEG did not detect the planted segment/segment body in ${want} — the signature misses a live determinant spelling${want === 'paramCanonicalSpan.ts' ? ', and this one is THE CANONICAL BODY’S OWN shape and 9-line span: an arm blind to its own canonical cannot assert a collapse' : ''}.`);
    }

    // ── SEGSEG reject: the three near-misses ────────────────────────────────
    //   1. NORMALISATION — two quotients of one divisor, but the divisor is a
    //      LENGTH, not a cross. This is the over-match that sinks a naive
    //      "two divisions by the same name" rule; it is everywhere in this tree.
    //   2. LINE/LINE — a cross divisor with exactly ONE quotient. Adjacent
    //      family, reported separately, never counted (see the detector's note).
    //   3. SHOELACE — a 2D cross ACCUMULATED, not divided by. The other
    //      remaining family shares this exact arithmetic; only the surrounding
    //      operator tells them apart, so a cross-only rule would merge two
    //      families and double-count every body in both.
    writeTree(join(base, 'segreject'), {
      'packages/b/src/normalise.ts': [
        'export function n(dx: number, dz: number) {',
        '  const len = Math.hypot(dx, dz);',
        '  if (len < 1e-9) return null;',
        '  const nx = dx / len;',
        '  const nz = dz / len;',
        '  return { nx, nz };',
        '}',
      ].join('\n'),
      'packages/b/src/lineline.ts': [
        'export function l(d1: V, d2: V, ax: number, az: number) {',
        '  const det = d1.x * d2.z - d1.z * d2.x;',
        '  if (Math.abs(det) < 1e-9) return null;',
        '  const t = (ax * d2.z - az * d2.x) / det;',
        '  return { x: ax + t * d1.x, z: az + t * d1.z };',
        '}',
      ].join('\n'),
      'packages/b/src/shoelace.ts': [
        'export function s(poly: P[]) {',
        '  let a = 0;',
        '  for (let i = 0; i < poly.length; i++) {',
        '    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;',
        '    a += p.x * q.z - q.x * p.z;',
        '  }',
        '  return a / 2;',
        '}',
      ].join('\n'),
    });
    const segRej = detectSegmentIntersection(join(base, 'segreject'), ['packages']);
    lines.push(`    SEGSEG reject (normalisation / line-line / shoelace): ${segRej.bodies.length} counted, ${segRej.lineLine.length} adjacent line-line — expected 0 and 1`);
    if (segRej.bodies.some((b) => b.file.endsWith('normalise.ts'))) fail('SEGSEG counted a VECTOR NORMALISATION (two quotients of one length) as a segment/segment solve — the divisor must be a CROSS, or this census is mostly normalisations.');
    if (segRej.bodies.some((b) => b.file.endsWith('lineline.ts'))) fail('SEGSEG counted a single-quotient LINE/LINE solve as a segment/segment body — an adjacent family whose 15 production instances no segment/segment collapse can remove.');
    if (segRej.bodies.some((b) => b.file.endsWith('shoelace.ts'))) fail('SEGSEG counted a SHOELACE accumulation as a segment/segment body — both families are built on the same 2D cross, so merging them double-counts every body in both.');
    if (!segRej.lineLine.some((b) => b.file.endsWith('lineline.ts'))) fail('SEGSEG did not REPORT the single-quotient line/line solve as the adjacent family — an excluded body must stay visible, or it is forgotten rather than decided (C73 §3.3).');

    // ── SEGSEG zero: the zero reading must be reachable ──────────────────────
    const segClean = detectSegmentIntersection(join(base, 'clean'), ['packages']);
    lines.push(`    SEGSEG zero (a tree with no intersection body): ${segClean.bodies.length} bod(ies) — expected 0`);
    if (segClean.bodies.length !== 0) fail('SEGSEG counted a body in a tree containing none — the zero reading is unreachable, so the census cannot be trusted (C73 §7.k).');
  } catch (e) {
    ok = false; lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (gates doc §2.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const pip = FAMILIES.find((f) => f.id === 'point-in-polygon')!;
const excluded = new Set(pip.exclusions.map(([f]) => f));
const detected = detectPointInPolygon(ROOT, DIRS);

// ─── The segment/segment CENSUS (measured, printed, recorded — NOT ratcheted) ─
const SEGSEG_CANONICAL = 'packages/geometry-kernel/src/pure/segmentIntersection.ts';
const segAll = detectSegmentIntersection(ROOT, DIRS);
const segProduction = segAll.bodies.filter((b) => !b.isTest);
const segRivals = segProduction.filter((b) => b.file !== SEGSEG_CANONICAL);
const segCanonical = segProduction.filter((b) => b.file === SEGSEG_CANONICAL);
const segLineLine = segAll.lineLine.filter((b) => !b.isTest);
const bodies = detected.bodies.filter((b) => !excluded.has(b.file));
const production = bodies.filter((b) => !b.isTest);
// C3 runs over ALL production bodies INCLUDING the canonical file, so a rival
// minted inside the canonical file with a different guard still fires it.
const disagreements = guardDisagreements(production);
// C1 counts RIVALS — bodies outside the named canonical file. The canonical
// file's own body count is a separate HARD integrity arm (see c2Integrity):
// exactly 1 when a canonical is named. 0 means the canonical implementation
// vanished (or the detector stopped seeing it — either way the collapse is
// fiction); ≥2 means a second rival was minted INSIDE the canonical file,
// which no ratchet outside it would ever catch.
const canonicalBodies = production.filter((b) => b.file === pip.canonical);
const rivalProduction = pip.canonical === null
  ? production
  : production.filter((b) => b.file !== pip.canonical);

const RECIPE =
  'a POINT-IN-POLYGON body = the even-odd VERTICAL STRADDLE test `(yi > y) !== (yj > y)` in any operand ' +
  'shape/direction, comment-stripped, over a 3-line window so a wrapped body is seen whole; a two-straddle ' +
  'AND (segment/segment crossing) is a DIFFERENT §3.1 family and is excluded structurally; counting unit = ' +
  '(file × body), so N straddles in one file are N bodies; dirs packages,apps,plugins,src; tests counted ' +
  'separately and NOT ratcheted.';

if (WRITE) {
  const next: Baseline = {
    recipe: RECIPE,
    measuredAt: new Date().toISOString().slice(0, 10),
    bodies: Object.fromEntries(rivalProduction.map((b) => [keyOf(b), b.guard])),
    c2: FAMILIES.filter((f) => f.counted && f.canonical === null).length,
    c3: disagreements.map((d) => d.split(' — ')[0]!),
    census: {
      'segment-segment-intersection': {
        production: segRivals.length,
        test: segAll.bodies.filter((b) => b.isTest).length,
        bodies: segRivals.map((b) => `${b.file}:${b.line}::${b.form}`),
      },
    },
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`\n[${GATE}] wrote ${relPath(ROOT, BASELINE)} — ${Object.keys(next.bodies).length} production bod(ies), ${next.c3.length} guard disagreement(s). SHRINK-ONLY: a reviewer must see this diff go DOWN.`);
}

const prior: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline)
  : { recipe: RECIPE, measuredAt: 'never', bodies: {}, c2: 0, c3: [] };

const measured = new Set(rivalProduction.map(keyOf));
const priorKeys = new Set(Object.keys(prior.bodies));
const stale = [...priorKeys].filter((k) => !measured.has(k));
const added = [...measured].filter((k) => !priorKeys.has(k));

const byFile = new Map<string, Body[]>();
for (const b of rivalProduction) {
  const l = byFile.get(b.file) ?? [];
  l.push(b);
  byFile.set(b.file, l);
}

const c2Missing = FAMILIES.filter((f) => f.counted && f.canonical === null);
// C2's second arm — canonical-file INTEGRITY, hard, never baselined: a named
// canonical file must hold EXACTLY ONE production body of its family.
const c2Integrity: string[] = [];
if (pip.canonical !== null && canonicalBodies.length !== 1) {
  c2Integrity.push(
    `point-in-polygon — canonical file ${pip.canonical} holds ${canonicalBodies.length} ` +
    `production bod(ies); it must hold EXACTLY 1. ` +
    (canonicalBodies.length === 0
      ? 'Zero means the canonical implementation vanished or the detector stopped seeing it — either way the collapse is fiction, not progress.'
      : `More than one means a second rival was minted INSIDE the canonical file (${canonicalBodies.map((b) => `:${b.line}`).join(' · ')}) — the one place no ratchet outside it would ever catch.`),
  );
}

const lines: string[] = [];
lines.push(`RECIPE: ${RECIPE}`);
lines.push(`RE-RUN: npx tsx tools/ga-gate/${GATE}.ts   ·   REBASELINE (downward only): --write-baseline`);
lines.push(`baseline: ${relPath(ROOT, BASELINE)} (measured ${prior.measuredAt})`);
lines.push('');
lines.push(`files scanned: ${detected.filesScanned} across ${DIRS.join(', ')}`);
lines.push(`  ⚠ C73 §0.2 states 61 bodies across 56 files for a recipe it does not specify. This gate pins at ITS OWN reading and prints it in full. §0.2 remains the authority for the ORDERING, this gate for the NUMBER (same split §0.1 already carries).`);
lines.push('');
lines.push('── FAMILIES (C73 §3.1) — one per PR (§3.5) ──');
for (const f of FAMILIES) {
  if (f.counted) {
    lines.push(`  ✓ COUNTED  ${f.id} — ${f.what}`);
    lines.push(`       canonical file: ${f.canonical ?? 'NONE YET — C2 finding, see below'}`);
    for (const [file, reason] of f.exclusions) lines.push(`       excluded: ${file}\n           ↳ ${reason}`);
  } else {
    lines.push(`  · NOT-YET-COUNTED  ${f.id} — ${f.what}`);
    lines.push(`       ↳ ${f.notYetReason}`);
  }
}
lines.push('');
lines.push(`C1  ${measured.size} non-canonical point-in-polygon bod(ies) in PRODUCTION across ${byFile.size} file(s) (baseline ${priorKeys.size}) · new: ${added.length} · struck: ${stale.length}`);
if (pip.canonical !== null) {
  lines.push(`      (canonical file ${pip.canonical} holds ${canonicalBodies.length} body — asserted EXACTLY 1 by C2's integrity arm, and never counted as a rival.)`);
}
lines.push(`      (+ ${bodies.length - production.length} in tests — measured and printed, deliberately NOT ratcheted: a test asserting containment with its own local ray cast is a fixture, not a rival definition shipped to a user. They are listed at the end so the split is auditable.)`);
for (const [file, list] of [...byFile.entries()].sort()) {
  lines.push(`      ${file}  (${list.length} bod${list.length === 1 ? 'y' : 'ies'})`);
  for (const b of list) lines.push(`          :${b.line}  guard=${b.guard}`);
}
for (const k of added) lines.push(`      + NEW SINCE BASELINE: ${k}`);
lines.push('');
lines.push(`C2  ${c2Missing.length} counted famil(ies) with NO named canonical file · ${c2Integrity.length} canonical-file integrity violation(s).`);
for (const f of c2Missing) {
  lines.push(
    `      ✗ ${f.id} — there is no canonical implementation to collapse onto. C73 §0.2 records TWO rival ` +
    '"shared" point-in-polygon implementations with three consumers between them; both were written to end ' +
    'the duplication and neither did. Minting a third here would be §7.h — fixing the copy the shipping path ' +
    'cannot reach. The canonical file is named by the COLLAPSE PR, which must first identify the shipping ' +
    'consumer by name (§3.6) and state which guard behaviour is canonical and why (§3.7).',
  );
}
for (const v of c2Integrity) lines.push(`      ✗ ${v}`);
lines.push('');
// ─── CENSUS — measured, printed, recorded; deliberately NOT ratcheted ────────
const priorSeg = prior.census?.['segment-segment-intersection'];
lines.push(
  `CENSUS  segment-segment-intersection — ${segRivals.length} production rival bod(ies) across ` +
  `${new Set(segRivals.map((b) => b.file)).size} file(s)` +
  (priorSeg ? ` (recorded ${priorSeg.production})` : ' (not yet recorded)') +
  `, + ${segCanonical.length} in the canonical file ${SEGSEG_CANONICAL}, ` +
  `+ ${segAll.bodies.filter((b) => b.isTest).length} in tests.`,
);
lines.push(
  '        ⚠ THIS IS A DENOMINATOR, NOT A VERDICT. These bodies do NOT contribute findings, so the ' +
  'CLEAN/hard-0 line below covers point-in-polygon ONLY — it is not a claim that this family is collapsed. ' +
  'Ratcheting it would move this gate off hard-0 for as long as the debt exists (findings > 0 ⇒ exit 1), and ' +
  'that is a REGISTRATION decision (gate-debt.json needs an explicit founder/architect decision; ' +
  'gate-newly-measured.json is the "the instrument arrived" category) — not a lane\'s to take unilaterally. ' +
  'The measurement lands so the successor inherits a number instead of a sweep. FLIP: set counted:true on the ' +
  'family and add these to `findings`, in the commit that registers the gate\'s new state.',
);
for (const b of segRivals) lines.push(`        · ${b.file}:${b.line}  ${b.form}`);
if (priorSeg) {
  const now = new Set(segRivals.map((b) => `${b.file}:${b.line}::${b.form}`));
  const grew = [...now].filter((k) => !priorSeg.bodies.includes(k));
  const left = priorSeg.bodies.filter((k) => !now.has(k));
  if (grew.length) lines.push(`        + ${grew.length} NEW since the recorded census: ${grew.join(' · ')}`);
  if (left.length) lines.push(`        − ${left.length} GONE since the recorded census (rebaseline to bank it): ${left.join(' · ')}`);
}
lines.push(
  `        ADJACENT, NOT COUNTED: ${segLineLine.length} production single-quotient LINE/LINE solves (one ` +
  'parameter against one determinant — the unbounded question, no [0,1] band). A segment/segment collapse ' +
  'cannot retire them, so counting them here would inflate the census with bodies no fix in this family can ' +
  'remove — the same argument SEGMENT_CROSS_SHAPE makes against folding this family into point-in-polygon.',
);
for (const b of segLineLine) lines.push(`        · (adjacent) ${b.file}:${b.line}`);
lines.push(
  '        BLIND SPOT (C73 §5.4a): a determinant computed by a HELPER — `const denom = cross(d1x, d1z, d2x, ' +
  'd2z)` at packages/finish-host-tracker/src/reprojectFinishBoundary.ts:186 — carries no cross product in its ' +
  'text, only a call. Seeing it would require keying on the callee NAME, which §3.2 forbids and a rename ' +
  'defeats. Declared, not counted, not pretended away.',
);
lines.push('');
lines.push(`C3  ${disagreements.length} file(s) holding the SAME family twice with DIFFERENT degenerate-divide guards (C73 §2.4).`);
for (const d of disagreements) lines.push(`      ✗ ${d}`);
lines.push('');
const testBodies = bodies.filter((b) => b.isTest);
lines.push(`test-tree bodies (not ratcheted, listed for audit): ${testBodies.length}`);
for (const b of testBodies) lines.push(`      · ${b.file}:${b.line}`);
lines.push('');
lines.push(
  'EXIT CONDITION (C73 §6) — this family exits when C1 reads 0, C2 names the canonical file, C3 reads 0, ' +
  'and the family has an ORACLE FIXTURE at a known answer (the state polygon offset is in). ' +
  'NOT PROVEN by this gate: correctness of the surviving body (C73 §5.4a) — counting gates are blind to it by design.',
);

const floors: Floor[] = [
  { what: 'source files scanned', measured: detected.filesScanned, min: 500 },
  // The DETECTOR-BROKE floor, RE-ANCHORED 2026-08-13 — read this before touching it.
  //
  // It used to read `measured: bodies.length, min: 30` — ALL detected bodies,
  // production + test + canonical. Its own comment named the day it would have to
  // change: "when the collapse genuinely lands and C1 approaches 0, this floor is
  // what must be REMOVED — in the same commit, with the reason — not quietly
  // lowered." That day is here: C1 went 51 → 7 and total subjects fell 39 → 22, so
  // the floor fired exit 2 on a repo that is CLEANER, not on a broken regex.
  //
  // It is RE-ANCHORED rather than removed, because removal would leave the recipe
  // with no count-shaped liveness check at all. The defect in the old form was not
  // the threshold, it was the DENOMINATOR: it measured a quantity this gate exists
  // to drive to zero, so it was guaranteed to collide with its own success and the
  // only available moves would be "lower it" (the lie it was written to prevent) or
  // "delete it". The new denominator is the TEST-TREE bodies — explicitly NOT
  // ratcheted, never migrated by a collapse PR, and therefore a subject set the
  // gate's own progress cannot erode. A regex regression still drives it to 0 and
  // still exits 2; a completed collapse does not touch it. Lowering THIS floor
  // would be the lie; it must not be, and it has no reason to be.
  //
  // The PRIMARY liveness proof is the executed control below (synthetic fixtures in
  // four operand shapes, plus two negative controls) — a positive control on inputs
  // the repo cannot change, which is stronger than any census. This floor is the
  // cheap corroborating one.
  { what: 'test-tree point-in-polygon bodies detected (NOT migratable — the liveness anchor a collapse cannot erode)', measured: bodies.filter((b) => b.isTest).length, min: 10 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
  // The segment/segment census's liveness anchor. Same reasoning as the
  // test-tree floor above: the CANONICAL body is a subject no collapse in this
  // family can ever remove — collapsing rivals ONTO it can only keep it at 1 —
  // so this floor cannot collide with the gate's own success, and it goes to 0
  // exactly when the detector breaks. It is deliberately NOT a floor on the
  // rival count, which IS what the family exists to drive to zero.
  { what: 'segment/segment bodies detected in the canonical file (NOT migratable — the census liveness anchor)', measured: segCanonical.length, min: 1 },
];

// c2Integrity is HARD — it is never part of `declared`, so any integrity
// violation pushes findings above the declared ledger and the gate exits red.
const findings = measured.size + c2Missing.length + c2Integrity.length + disagreements.length;
const declared = priorKeys.size + prior.c2 + prior.c3.length;

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings,
  declared,
  findingNames: [
    ...[...measured].map((k) => `C1::${k}`),
    ...c2Missing.map((f) => `C2::${f.id} has no canonical file`),
    ...c2Integrity.map((v) => `C2::${v.split(' — ')[0]} canonical-file integrity`),
    ...disagreements.map((d) => `C3::${d.split(' — ')[0]}`),
  ],
  stale: stale.map((k) => `C1::${k}`),
};

process.exit(reportGate(result));
