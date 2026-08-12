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
 *      individually with reasons (C73 §3.3). RED for point-in-polygon today:
 *      THERE IS NO CANONICAL FILE — see CANONICAL below. The gate lands anyway
 *      (gates doc §2.3): deferring a gate until its subject is fixed is how a
 *      subject stays unfixed.
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
    // ⚠ RED. C73 §3.1 names point-in-polygon as the family with the most
    // duplication (61 bodies) and §0.2 records that TWO rival "shared"
    // implementations already exist with three consumers between them — both
    // written to end the duplication, neither of which did. Naming one of them
    // canonical HERE, in a gate, without first identifying the shipping
    // consumer (§3.6) would be exactly §7.h: fixing the copy the shipping path
    // cannot reach, and reading as done. The canonical file is minted by the
    // COLLAPSE PR, not by this counting PR.
    canonical: null,
    exclusions: [
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
      'NOT-YET-COUNTED — C73 §3.5, one family per PR. Its structural signature (two straddles AND-ed) is ' +
      'already WRITTEN here as SEGMENT_CROSS_SHAPE and is what keeps it out of the point-in-polygon count, ' +
      'so lighting this arm is a small change; the blocker is not detection but §3.6: the parametric (t/u) ' +
      'form and the cross-product form must be shown to be the SAME family before a single count over both ' +
      'means anything, and neither form has an identified shipping consumer yet.',
  },
  {
    id: 'polygon-area-and-winding',
    what: 'shoelace signed area / orientation',
    canonical: null,
    exclusions: [],
    counted: false,
    notYetReason:
      'NOT-YET-COUNTED — C73 §3.5. `polygonSignedArea2D` IS already exported from geometry-kernel ' +
      '(pure/polygonOffset.ts, re-exported from the barrel), so unlike point-in-polygon this family HAS a ' +
      'plausible canonical file and the work is a migration rather than a mint. Not started here because ' +
      'the shoelace accumulate step is a bare `+=` over a cross product, which is far weaker as a structural ' +
      'signature than the straddle test and will need its own negative controls against every unrelated ' +
      'running sum in the tree before its count can be trusted (§7.k — a tally that cannot be trusted is worse ' +
      'than no tally).',
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
const bodies = detected.bodies.filter((b) => !excluded.has(b.file));
const production = bodies.filter((b) => !b.isTest);
const disagreements = guardDisagreements(production);

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
    bodies: Object.fromEntries(production.map((b) => [keyOf(b), b.guard])),
    c2: FAMILIES.filter((f) => f.counted && f.canonical === null).length,
    c3: disagreements.map((d) => d.split(' — ')[0]!),
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`\n[${GATE}] wrote ${relPath(ROOT, BASELINE)} — ${Object.keys(next.bodies).length} production bod(ies), ${next.c3.length} guard disagreement(s). SHRINK-ONLY: a reviewer must see this diff go DOWN.`);
}

const prior: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline)
  : { recipe: RECIPE, measuredAt: 'never', bodies: {}, c2: 0, c3: [] };

const measured = new Set(production.map(keyOf));
const priorKeys = new Set(Object.keys(prior.bodies));
const stale = [...priorKeys].filter((k) => !measured.has(k));
const added = [...measured].filter((k) => !priorKeys.has(k));

const byFile = new Map<string, Body[]>();
for (const b of production) {
  const l = byFile.get(b.file) ?? [];
  l.push(b);
  byFile.set(b.file, l);
}

const c2Missing = FAMILIES.filter((f) => f.counted && f.canonical === null);

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
lines.push(`      (+ ${bodies.length - production.length} in tests — measured and printed, deliberately NOT ratcheted: a test asserting containment with its own local ray cast is a fixture, not a rival definition shipped to a user. They are listed at the end so the split is auditable.)`);
for (const [file, list] of [...byFile.entries()].sort()) {
  lines.push(`      ${file}  (${list.length} bod${list.length === 1 ? 'y' : 'ies'})`);
  for (const b of list) lines.push(`          :${b.line}  guard=${b.guard}`);
}
for (const k of added) lines.push(`      + NEW SINCE BASELINE: ${k}`);
lines.push('');
lines.push(`C2  ${c2Missing.length} counted famil(ies) with NO named canonical file.`);
for (const f of c2Missing) {
  lines.push(
    `      ✗ ${f.id} — there is no canonical implementation to collapse onto. C73 §0.2 records TWO rival ` +
    '"shared" point-in-polygon implementations with three consumers between them; both were written to end ' +
    'the duplication and neither did. Minting a third here would be §7.h — fixing the copy the shipping path ' +
    'cannot reach. The canonical file is named by the COLLAPSE PR, which must first identify the shipping ' +
    'consumer by name (§3.6) and state which guard behaviour is canonical and why (§3.7).',
  );
}
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
  // The DETECTOR-BROKE floor. This family measured dozens of bodies at every
  // cut. A reading in the single digits is a regex regression, not a clean
  // repo, and reporting it as progress is the exact lie exit 2 exists to
  // prevent. It is a MISCONFIGURATION detector, never a target: when the
  // collapse genuinely lands and C1 approaches 0, this floor is what must be
  // REMOVED — in the same commit, with the reason — not quietly lowered.
  { what: 'point-in-polygon subjects detected (a collapse to single digits is a BROKEN DETECTOR, not a clean repo)', measured: bodies.length, min: 30 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const findings = measured.size + c2Missing.length + disagreements.length;
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
    ...disagreements.map((d) => `C3::${d.split(' — ')[0]}`),
  ],
  stale: stale.map((k) => `C1::${k}`),
};

process.exit(reportGate(result));
