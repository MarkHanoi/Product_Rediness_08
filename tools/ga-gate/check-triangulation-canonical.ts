#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-triangulation-canonical.ts
 *
 * GE-12 (Tier 3) · C73 §3 / §0.3 — **the triangulation family and the
 * PlanarTopologyEngine family, COUNTED**. Structural detection, named baseline,
 * shrink-only. This is the ARM; the collapse is a later PR (C73 §3.5 — one
 * family per PR, never a blind mass refactor).
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * BIM30-GAP-REGISTER row GE-12: triangulation has ~5 rival implementations and
 * `PlanarTopologyEngine` ~3, with NO instrument at all. Nothing in this suite
 * counted either family, so a sixth triangulator or a fourth planar engine
 * could land tomorrow and no run would say so. The offset precedent
 * (`check-offset-implementations.ts`) is exactly this defect one family over:
 * the fix and the shipping code were different files, every copy passed its own
 * package's tests, and only a gate on the NUMBER OF THEM could have seen it.
 *
 * The measured first reading (2026-08-14, this gate's own recipe):
 *
 *   polygon-triangulation — 7 bodies across 6 files (the register's "~5"
 *   counted files and still missed one — the offset gate's prose-"3"-measured-4
 *   error, one family over):
 *     · geometry-kernel/src/producers/_internal/earcut.ts:391     (earcut-zorder ×1)
 *       — the vendored mapbox/earcut port: linked-list, z-order hashed, handles holes.
 *     · geometry-kernel/src/producers/_internal/roof/triangulate.ts:32 (earclip-worklist ×1)
 *       — Meisters O(n²) ear clip over an index array; roof caps.
 *     · geometry-kernel/src/producers/extrude.ts:309              (earclip-worklist ×1)
 *       — a SECOND O(n²) ear clip, near-verbatim rival of the roof one; extrude caps.
 *     · geometry-kernel/src/producers/_shared/linear-structural.ts:174 (fan-index ×1)
 *       — index fan from vertex 0; column/beam profiles. Convex-only, silently
 *         wrong on a concave profile.
 *     · geometry-kernel/src/producers/room.ts:391                 (fan-centroid ×1)
 *       — centroid fan; room floor fill. Wrong on non-star-shaped rooms (an
 *         L-shaped room's fill can leak outside the boundary).
 *     · geometry-kernel/src/producers/ceiling.ts:84 + :100        (fan-centroid ×2)
 *       — the same centroid fan twice (top + bottom face); its own header calls
 *         full ear-clipping "deferred to S15+".
 *   Beyond these bodies the repo ALSO triangulates through THREE.ShapeUtils
 *   .triangulateShape (geometry-slab, geometry-roof, file-format IFC readers) —
 *   call sites into THREE's earcut, not bodies in this tree, so they are not
 *   countable here; they are named in the header so the collapse PR knows the
 *   family is wider than the body count (see WHAT THIS GATE CANNOT SEE).
 *
 *   planar-topology-engine — 4 copies. The register's ~3 are the class copies;
 *   structural detection found a FOURTH body the name would never match:
 *     · packages/room-topology/src/PlanarTopologyEngine.ts:113     (220 lines, trimmed)
 *     · packages/core-app-model/src/ai/PlanarTopologyEngine.ts:286 (477 lines)
 *     · packages/ai-host/src/PlanarTopologyEngine.ts:286           (477 lines — verbatim
 *       clone of the core-app-model copy save for the import specifier)
 *     · packages/auto-dimension/src/perimeter.ts:247 — `traceFaces()`: an
 *       INDEPENDENT reimplementation of the same left-face half-edge trace
 *       (adjacency map, `${s}→${e}` twin keys, atan2 angular sort, most-CW
 *       successor), written for auto-dimension's perimeter derivation. It is
 *       exactly what §3.2 predicts a name-based census misses.
 *   Four definitions of "what is a room's boundary face" is four answers to
 *   one question; the register's row exists because the class copies already
 *   drifted once (§AREA-THRESHOLD-2026-04 was applied to some copies later
 *   than others).
 *
 *   FIRST-RUN FALSE POSITIVES, fixed by refinement before the pin — recorded
 *   because the refinements ARE the recipe: the bare modular-predecessor walk
 *   matched nine immutable-ring walkers (two Sutherland–Hodgman clippers, three
 *   concavity/collinearity checks, a ring cleaner, sweep.ts's transport
 *   frames) until the SAME-LIST-SHRINKS conjunction was added; slab.ts's
 *   top/bottom cap emitters matched fan-centroid until the ring-successor
 *   lookbehind was added (they emit the embedded earcut's OUTPUT triples —
 *   a call-site-shaped use, not a rival); and the z-order interleave counted
 *   twice per file (one line per axis) until deduped to per-file.
 *
 * ─── HOW TO RE-DERIVE EVERY NUMBER ───────────────────────────────────────────
 *
 *     npx tsx tools/ga-gate/check-triangulation-canonical.ts
 *
 * It prints its recipe and every counted body with file:line. After a GENUINE
 * reduction:
 *
 *     npx tsx tools/ga-gate/check-triangulation-canonical.ts --write-baseline
 *
 * That writes `tools/ga-gate/triangulation-canonical-baseline.json`. SHRINK-ONLY:
 * every entry is `file:line::signature` (or `file::planar-topology-engine`),
 * never a bare count, so a reviewer sees WHICH body left rather than a number
 * that could hide one removal and one addition (C69 §7.c).
 *
 * ─── THE RECIPE — structural, never name-based (C73 §3.2, §7.e) ──────────────
 * A name-based count counts call sites and re-exports and is defeated by a
 * rename. Each signature below is anchored on arithmetic that only an
 * implementation can contain:
 *
 *   earclip-worklist — the shrinking-ring PREDECESSOR index over a mutable
 *       candidate list: `list[(k - 1 + list.length) % list.length]`. A caller
 *       has no candidate list to walk; a re-export has no index arithmetic.
 *   earcut-zorder — the Morton/z-order bit interleave `(v | (v << 8)) & 0x00ff00ff`
 *       that a hashed earcut-style triangulator uses to sort its linked list.
 *   fan-index — the index-fan emission `push(0, i, i + 1)` from a loop over
 *       ring vertices: the O(n) convex fan.
 *   fan-centroid — a NINE-ORDINATE coplanar triangle emission
 *       `push(A.x, Y, A.z, B.x, Y, B.z, C.x, Y, C.z)` — three XZ vertices at
 *       one shared height ordinate, matched across up to 6 physical lines so a
 *       wrapped call is seen whole. This is the non-indexed cap-fan shape.
 *   planar-topology-engine — a file counts when it contains BOTH:
 *       (a) the angular sort of outgoing edges about a shared vertex in XZ —
 *           `Math.atan2(P.z - V.z, P.x - V.x)`, and
 *       (b) a DIRECTED half-edge string key `${u}→${v}` (the arrow-keyed twin
 *           map the left-face trace walks).
 *       Either alone is not enough: room-topology's RoomDetectionEngine sorts
 *       polygon vertices with the same atan2 shape and is NOT a planar engine —
 *       the conjunction is what keeps it out, structurally rather than by name.
 *
 * ─── COUNTING UNIT ───────────────────────────────────────────────────────────
 * polygon-triangulation: (file × signature-occurrence) — `ceiling.ts` holds the
 * centroid fan TWICE (top and bottom face) and counting it once would understate
 * exactly the duplication this gate measures; the offset gate records the same
 * decision. planar-topology-engine: the FILE — the engine is a file-sized
 * artifact and its three copies are three files.
 *
 * ─── Baseline ────────────────────────────────────────────────────────────────
 * PINNED AT THIS GATE'S OWN MEASURED READING (C73 §3.4 — a ratchet above its own
 * reading is free slots; the offset gate's header records that error being made
 * and caught once already). The register's "~5" and "~3" both undercount by the
 * same shape as the offset gate's prose "3": name/file censuses. 7 + 4,
 * measured, is the pin — 11 C1 bodies, plus 2 C2 findings (no canonical named
 * for either family), declared level 13.
 *
 * NO CANONICAL IS DESIGNATED YET — for either family. That is a C2 finding on
 * the record (2 of them), not a blank: naming the canonical is the collapse
 * PR's decision (C73 §3.6/§3.7 — it must first identify the shipping consumers
 * by name and state which behaviour is canonical and why). The vendored earcut
 * is the obvious CANDIDATE (only body that handles holes; slab.ts already calls
 * it) but writing that name into `canonical:` before the collapse PR argues it
 * would be the gate making the decision it exists to await.
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (gates doc §2.2) ───────────────
 * `selfTest()` drives the same analyser over synthetic trees: one planted body
 * per signature (the fan-centroid plant is MULTI-LINE, the form room.ts uses),
 * a planted PTE with both anchors; and the rejects — a call-site file
 * (`triangulate(...)` / `earcut(...)` / `THREE.ShapeUtils.triangulateShape(...)`
 * plus a quad emission), an atan2-bearing-only file (no arrow key), an
 * arrow-key-only file (no angular sort), a modular-predecessor walk over an
 * IMMUTABLE ring (the Sutherland–Hodgman shape the first run miscounted nine
 * times), a shared-height emitter of earcut OUTPUT triples (the slab.ts shape),
 * and a clean tree that must read 0. If any control fails to fire the gate
 * exits 2 as a BLIND COMPARATOR.
 *
 * ─── Negative test on the REAL tree (C70 §5.6) — performed 2026-08-14 ────────
 * A duplicate O(n²) ear-clip body was planted at
 * `packages/geometry-kernel/src/producers/_internal/plantedEarClip.ts` and the
 * gate went RED — exit 3, with the plant NAMED (verbatim output):
 *
 *     C1  8 triangulation bod(ies) in PRODUCTION across 7 file(s) + 4
 *         planar-topology-engine cop(ies) (baseline total 11) · new: 1 · struck: 0
 *         + NEW SINCE BASELINE: packages/geometry-kernel/src/producers/_internal/plantedEarClip.ts:8::earclip-worklist
 *     → [3] RATCHET EXCEEDED — check-triangulation-canonical: 14 finding(s)
 *       against a declared level of 13. The ledger is SHRINK-ONLY: fix the
 *       finding, or prove it was already there and lower the ledger — never
 *       raise it.
 *
 * (13 declared = 11 C1 bodies + 2 C2 findings; the planted 12th body pushed
 * findings to 14 > 13.) The plant was then removed and the gate returned to
 * exit 1 at its declared level — `new: 0 · struck: 0`.
 *
 * ─── What this gate CANNOT see (C73 §5.4a) ───────────────────────────────────
 *   • whether any surviving body is CORRECT — counting gates are blind to
 *     correctness by design; the family also needs an ORACLE FIXTURE at a known
 *     answer (a concave polygon with a known triangle count/area) when the
 *     collapse lands. There is none yet. NOT PROVEN.
 *   • triangulation delegated to THREE.ShapeUtils.triangulateShape — a call
 *     site into THREE's bundled earcut, not a body in this tree. Those call
 *     sites (geometry-slab SlabFragmentBuilder, geometry-roof
 *     RoofGeometryBuilder, file-format IFC readers via ShapeGeometry) are rival
 *     PATHS the collapse PR must route, but no body count can see them; the
 *     facade-bypass and P2 instruments own that axis.
 *   • a triangulator using monotone decomposition or Delaunay arithmetic —
 *     no live instance measured; a new one would need a signature added here.
 *   • a REIMPLEMENTED planar engine that renames the axes (`.y` for `.z`) or
 *     keys half-edges without the arrow — the conjunction detects the three
 *     live copies and any verbatim fourth, not a from-scratch rival.
 *
 * Exit 0 clean · 1 exactly the declared ledger · 2 MISCONFIGURED · 3 exceeded
 * or stale. 2 and 3 are never absorbable as declared debt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-triangulation-canonical';
const DIRS = ['packages', 'apps', 'plugins', 'src'] as const;
const BASELINE = resolve(HERE, 'triangulation-canonical-baseline.json');
const WRITE = process.argv.includes('--write-baseline');

// ─── Structural signatures (C73 §3.2) ────────────────────────────────────────

/**
 * earclip-worklist — TWO anchors, CONJOINED ON THE SAME LIST IDENTIFIER.
 *
 * The modular-predecessor index `list[(k - 1 + list.length) % list.length]`
 * alone is NOT an ear clip: the first measurement run matched nine ring-walks
 * over IMMUTABLE rings — two Sutherland–Hodgman clippers (tgl/polySubdivide,
 * site-parcel-data/polygonClip), three concavity/collinearity checks
 * (packRoomsAlongSpine, subdivide ×2, blockRing dropCollinear), a ring cleaner
 * (CeilingLayoutExecutor) and sweep.ts's parallel-transport frames. What
 * separates an ear clip from every one of those is that its ring SHRINKS: the
 * clipped ear's vertex is REMOVED from the working list by index. So a body
 * counts only when the file also removes an interior element from the SAME
 * list the predecessor walk indexes: `list.splice(k, 1)` or
 * `list.filter((_, k) => …)`. (`.pop()` is deliberately NOT a removal — ring
 * cleaners pop the duplicated closing vertex.)
 */
const EARCLIP_WALK = /\[\s*\(\s*\w+\s*-\s*1\s*\+\s*(\w+)\.length\s*\)\s*%\s*\1\.length\s*\]/;
const EARCLIP_ID = 'earclip-worklist';
const EARCLIP_WHAT = 'O(n²) ear clip — modular predecessor over a SHRINKING candidate list (same list is spliced/filtered)';
const earclipRemovalRe = (list: string): RegExp =>
  new RegExp(`\\b${list}\\.splice\\(\\s*\\w+\\s*,\\s*1\\s*\\)|\\b${list}\\.filter\\(\\s*\\(\\s*_\\s*,\\s*\\w+\\s*\\)\\s*=>`);

/**
 * earcut-zorder — the Morton/z-order interleave step of a hashed earcut-style
 * triangulator. Counted ONCE PER FILE: the interleave is written per axis
 * (x then y — two matching lines in one `zOrder()`), and counting the pair as
 * two bodies would double one implementation.
 */
const EARCUT_ZORDER = /\(\s*(\w+)\s*\|\s*\(\s*\1\s*<<\s*8\s*\)\s*\)\s*&\s*0x00ff00ff/i;
const ZORDER_ID = 'earcut-zorder';
const ZORDER_WHAT = 'hashed earcut — z-order curve bit interleave (counted once per file; the interleave is per-axis)';

/** fan-index — the index-fan emission from vertex 0: push(0, i, i + 1). */
const FAN_INDEX = /\.push\(\s*0\s*,\s*(\w+)\s*,\s*\1\s*\+\s*1\s*\)/;
const FAN_INDEX_ID = 'fan-index';
const FAN_INDEX_WHAT = 'index fan from vertex 0 — convex-only triangulation';

/**
 * fan-centroid — TWO anchors, windowed.
 *
 * (a) a NINE-ORDINATE coplanar triangle emission
 *     `push(A.x, Y, A.z, B.x, Y, B.z, C.x, Y, C.z)` — three XZ vertices at one
 *     shared height ordinate (`\2` backreference), matched across up to
 *     FAN_WINDOW physical lines so `room.ts`'s wrapped call is seen whole; AND
 * (b) a RING-SUCCESSOR index `ring[(i + 1) % n]` within the LOOKBEHIND lines
 *     above the push — a fan triangulates one triangle PER RING EDGE, so its
 *     loop acquires the edge's far vertex by ring successor.
 *
 * (b) is what rejects `slab.ts`'s top/bottom emitters, which push the same
 * nine-ordinate shape but read their vertices from the embedded earcut's
 * OUTPUT index triples (`tri.triangles[i]`, loop stride 3, no ring successor):
 * emitting a triangulation someone else computed is a CALL-SITE-shaped use,
 * not a rival body, and the first measurement run counted it before this
 * anchor existed.
 */
const FAN_CENTROID = /\.push\(\s*(\w+)\.x\s*,\s*(\w+)\s*,\s*\1\.z\s*,\s*(\w+)\.x\s*,\s*\2\s*,\s*\3\.z\s*,\s*(\w+)\.x\s*,\s*\2\s*,\s*\4\.z\s*,?\s*\)/;
const RING_SUCCESSOR = /\[\s*\(\s*\w+\s*\+\s*1\s*\)\s*%\s*\w+(?:\.length)?\s*\]/;
const FAN_CENTROID_ID = 'fan-centroid';
const FAN_CENTROID_WHAT = 'centroid/cap fan — nine-ordinate shared-height triangle emission driven by a ring-successor walk';
/** Lines a wrapped fan push may span. room.ts spans 5; 6 is bounded headroom. */
const FAN_WINDOW = 6;
/** Lines ABOVE the push in which the ring-successor acquisition must appear. */
const FAN_LOOKBEHIND = 4;

/**
 * planar-topology-engine: a file-level CONJUNCTION. Either anchor alone
 * over-matches (RoomDetectionEngine sorts polygon vertices with the same atan2
 * shape; template arrows appear in logging) — both together are the left-face
 * half-edge trace.
 */
const PTE_ANGULAR_SORT = /Math\.atan2\(\s*(\w+)\.z\s*-\s*(\w+)\.z\s*,\s*\1\.x\s*-\s*\2\.x\s*\)/;
const PTE_HALFEDGE_KEY = /\$\{\s*\w+(?:\.\w+)?\s*\}→\$\{\s*\w+(?:\.\w+)?\s*\}/;
const PTE_ID = 'planar-topology-engine';

// ─── Families (C73 §3.1) — both counted; ONE canonical decision pending each ─

interface Family {
  readonly id: string;
  readonly what: string;
  /** `null` = NO CANONICAL YET — a C2 finding stated on the record, not hidden. */
  readonly canonical: string | null;
  /** Named, individual exclusions with their reason (C73 §3.3). */
  readonly exclusions: ReadonlyArray<readonly [string, string]>;
}

const FAMILIES: readonly Family[] = [
  {
    id: 'polygon-triangulation',
    what: 'simple-polygon → triangles (ear clip / hashed earcut / index fan / centroid fan)',
    // NOT designated. The collapse PR names it (C73 §3.6/§3.7) after identifying
    // the shipping consumers by name. Candidate on the record: the vendored
    // earcut (`_internal/earcut.ts`) — the only body that handles holes, already
    // called by produceSlab — but a gate must not make the decision it awaits.
    canonical: null,
    exclusions: [
      // None. Every body the recipe matches today IS a rival triangulator.
      // door.ts/window.ts quad emissions (`push(b, b+1, b+2, b, b+2, b+3)`) do
      // not match any signature — a fixed two-triangle rectangle is not a
      // polygon triangulation — so they need no exclusion row; the reject
      // control plants one to keep that true.
    ],
  },
  {
    id: 'planar-topology-engine',
    what: 'WallGraph → planar faces → rooms (left-face half-edge trace)',
    // NOT designated. room-topology is the layered home (L3, and the trimmed
    // 220-line copy lives there) but the two 477-line copies are the ones with
    // the fuller header contract — WHICH copy is canon is exactly the drift
    // question the collapse PR must answer, not this gate.
    canonical: null,
    exclusions: [
      [
        'packages/room-topology/src/RoomDetectionEngine.ts',
        'Sorts polygon vertices about their centroid with the same atan2-XZ shape (":1067) but contains no ' +
        'directed half-edge key and traces no faces — it PREPARES the wall graph the engines consume. ' +
        'Excluded STRUCTURALLY by the conjunction (it has anchor (a), not (b)); named here so the decision ' +
        'is on the record even if the conjunction is edited.',
      ],
    ],
  },
];

// ─── Detection ───────────────────────────────────────────────────────────────

interface Body {
  readonly file: string;
  readonly line: number;
  readonly sig: string;
  readonly what: string;
  readonly text: string;
  readonly isTest: boolean;
}

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel) || /(^|\/)tests?\//.test(rel);
}

interface Detection {
  readonly bodies: Body[];
  readonly filesScanned: number;
}

function detect(root: string, dirs: readonly string[]): Detection {
  const bodies: Body[] = [];
  let filesScanned = 0;

  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const lines = stripCommentsToLines(src);
      const isTest = isTestPath(rel);
      const whole = lines.join('\n');

      // earclip-worklist — predecessor walk over list L, AND the file removes an
      // interior element from the SAME L. One body per walk line whose L shrinks.
      for (let i = 0; i < lines.length; i++) {
        EARCLIP_WALK.lastIndex = 0;
        const m = EARCLIP_WALK.exec(lines[i]!);
        if (!m) continue;
        const list = m[1]!;
        if (!earclipRemovalRe(list).test(whole)) continue;
        bodies.push({ file: rel, line: i + 1, sig: EARCLIP_ID, what: EARCLIP_WHAT, text: lines[i]!.trim().slice(0, 120), isTest });
      }

      // earcut-zorder — ONE body per file (the interleave is written per axis).
      for (let i = 0; i < lines.length; i++) {
        EARCUT_ZORDER.lastIndex = 0;
        if (EARCUT_ZORDER.test(lines[i]!)) {
          bodies.push({ file: rel, line: i + 1, sig: ZORDER_ID, what: ZORDER_WHAT, text: lines[i]!.trim().slice(0, 120), isTest });
          break;
        }
      }

      // fan-index — one body per matching line.
      for (let i = 0; i < lines.length; i++) {
        FAN_INDEX.lastIndex = 0;
        if (FAN_INDEX.test(lines[i]!)) {
          bodies.push({ file: rel, line: i + 1, sig: FAN_INDEX_ID, what: FAN_INDEX_WHAT, text: lines[i]!.trim().slice(0, 120), isTest });
        }
      }

      // fan-centroid — multi-line window, attributed to the line the match OPENS
      // on, and REQUIRING a ring-successor acquisition in the lookbehind.
      for (let i = 0; i < lines.length; i++) {
        const window = lines.slice(i, i + FAN_WINDOW).join('\n');
        FAN_CENTROID.lastIndex = 0;
        const m = FAN_CENTROID.exec(window);
        if (!m) continue;
        // Only count when the match starts on THIS line — an earlier line
        // already counted a match that merely extends into this window.
        if (m.index >= lines[i]!.length + 1 && i + 1 < lines.length) continue;
        // Anchor (b): the fan's loop walks ring edges — the far vertex comes
        // from a ring-successor index just above the push. An emitter of
        // someone else's triangle soup (slab.ts) has no such line.
        const lookbehind = lines.slice(Math.max(0, i - FAN_LOOKBEHIND), i).join('\n');
        RING_SUCCESSOR.lastIndex = 0;
        if (!RING_SUCCESSOR.test(lookbehind)) continue;
        bodies.push({ file: rel, line: i + 1, sig: FAN_CENTROID_ID, what: FAN_CENTROID_WHAT, text: lines[i]!.trim().slice(0, 120), isTest });
        // Skip past this window so one wrapped call is one body.
        i += FAN_WINDOW - 1;
      }

      // planar-topology-engine — file-level conjunction.
      let sortLine = 0;
      let keyLine = 0;
      for (let i = 0; i < lines.length; i++) {
        if (sortLine === 0) { PTE_ANGULAR_SORT.lastIndex = 0; if (PTE_ANGULAR_SORT.test(lines[i]!)) sortLine = i + 1; }
        if (keyLine === 0) { PTE_HALFEDGE_KEY.lastIndex = 0; if (PTE_HALFEDGE_KEY.test(lines[i]!)) keyLine = i + 1; }
        if (sortLine && keyLine) break;
      }
      if (sortLine && keyLine) {
        bodies.push({
          file: rel,
          line: Math.min(sortLine, keyLine),
          sig: PTE_ID,
          what: `left-face half-edge trace (angular sort :${sortLine} + directed-edge key :${keyLine})`,
          text: lines[sortLine - 1]!.trim().slice(0, 120),
          isTest,
        });
      }
    }
  }
  return { bodies, filesScanned };
}

// ─── Baseline ────────────────────────────────────────────────────────────────

interface Baseline {
  readonly recipe: string;
  readonly measuredAt: string;
  /** `file:line::signature` (triangulation) / `file::planar-topology-engine` → what. */
  readonly bodies: Record<string, string>;
  /** C2: counted families with NO named canonical file. */
  readonly c2: number;
}

function keyOf(b: Body): string {
  return b.sig === PTE_ID ? `${b.file}::${PTE_ID}` : `${b.file}:${b.line}::${b.sig}`;
}

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
  const out: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; out.push(`    ✗ BLIND COMPARATOR — ${m}`); };
  try {
    // ── detect: one planted body per signature ───────────────────────────────
    writeTree(join(base, 'detect'), {
      'packages/a/src/earclip.ts': [
        'export function tri(pts: ReadonlyArray<[number, number]>): number[] {',
        '  const remaining = pts.map((_, i) => i);',
        '  const out: number[] = [];',
        '  while (remaining.length > 3) {',
        '    for (let k = 0; k < remaining.length; k++) {',
        '      const iPrev = remaining[(k - 1 + remaining.length) % remaining.length]!;',
        '      out.push(iPrev);',
        '      remaining.splice(k, 1);',
        '      break;',
        '    }',
        '  }',
        '  return out;',
        '}',
      ].join('\n'),
      'packages/a/src/zorder.ts': [
        'export function zOrder(x: number): number {',
        '  let xi = x | 0;',
        '  xi = (xi | (xi << 8)) & 0x00FF00FF;',
        '  return xi;',
        '}',
      ].join('\n'),
      'packages/a/src/fanidx.ts': [
        'export function fan(poly: number[][]): number[] {',
        '  const tris: number[] = [];',
        '  for (let i = 1; i < poly.length - 1; i++) tris.push(0, i, i + 1);',
        '  return tris;',
        '}',
      ].join('\n'),
      // The MULTI-LINE centroid fan — the exact wrapping room.ts uses.
      'packages/a/src/fancentroid.ts': [
        'export function fill(polygon: P[], centroid: P, fillY: number): number[] {',
        '  const positions: number[] = [];',
        '  for (let i = 0, n = polygon.length; i < n; i++) {',
        '    const a = polygon[i]!;',
        '    const b = polygon[(i + 1) % n]!;',
        '    positions.push(',
        '      centroid.x, fillY, centroid.z,',
        '      a.x,        fillY, a.z,',
        '      b.x,        fillY, b.z,',
        '    );',
        '  }',
        '  return positions;',
        '}',
      ].join('\n'),
      'packages/a/src/pte.ts': [
        'export function faces(g: G): F[] {',
        '  const halfEdgeWall = new Map<string, string>();',
        '  for (const [s, e] of g.edges) halfEdgeWall.set(`${s}→${e}`, s);',
        '  const around = (vPos: P, ap: P) => Math.atan2(ap.z - vPos.z, ap.x - vPos.x);',
        '  return [halfEdgeWall, around] as unknown as F[];',
        '}',
      ].join('\n'),
    });
    const det = detect(join(base, 'detect'), ['packages']);
    const bySig = new Map(det.bodies.map((b) => [b.sig, b]));
    out.push(`detect (one plant per signature): ${det.bodies.length} bod(ies) → [${[...bySig.keys()].sort().join(', ')}]`);
    for (const want of ['earclip-worklist', 'earcut-zorder', 'fan-index', FAN_CENTROID_ID, PTE_ID]) {
      if (!bySig.has(want)) fail(`the planted ${want} body was NOT detected — the structural signature misses a live shape.`);
    }
    if (bySig.get(FAN_CENTROID_ID) && bySig.get(FAN_CENTROID_ID)!.line !== 6) {
      fail(`the multi-line fan-centroid plant was attributed to line ${bySig.get(FAN_CENTROID_ID)!.line}, expected 6 (the .push( line) — line attribution is broken.`);
    }

    // ── reject: call sites, a quad emission, and each PTE anchor ALONE ───────
    writeTree(join(base, 'reject'), {
      'packages/b/src/callsites.ts': [
        "import { triangulate } from './tri.js';",
        "import { earcut } from './earcut.js';",
        'export function caps(outer: P[], holes: P[][], flat: number[], holeIdx: number[]) {',
        '  const a = triangulate(outer);',
        '  const b = earcut(flat, holeIdx);',
        '  const c = THREE.ShapeUtils.triangulateShape(outer, holes);',
        '  return [a, b, c];',
        '}',
      ].join('\n'),
      'packages/b/src/quad.ts': [
        'export function quad(buf: { indices: number[] }, baseV: number) {',
        '  buf.indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);',
        '}',
      ].join('\n'),
      // atan2 bearing alone (RoomDetectionEngine's shape) — NOT a planar engine.
      'packages/b/src/bearing.ts': [
        'export function sortAbout(centroid: P, a: P, b: P): number {',
        '  const angleA = Math.atan2(a.z - centroid.z, a.x - centroid.x);',
        '  const angleB = Math.atan2(b.z - centroid.z, b.x - centroid.x);',
        '  return angleA - angleB;',
        '}',
      ].join('\n'),
      // arrow key alone (a logger / labeller) — NOT a planar engine.
      'packages/b/src/arrowlog.ts': [
        'export function describeEdge(u: string, v: string): string {',
        '  return `${u}→${v}`;',
        '}',
      ].join('\n'),
      // A modular-predecessor ring walk over an IMMUTABLE ring — the
      // Sutherland–Hodgman clipper shape the first measurement run miscounted
      // nine times (polygonClip, polySubdivide, dropCollinear, sweep frames…).
      'packages/b/src/clipper.ts': [
        'export function clip(poly: readonly P[], inside: (p: P) => boolean, lerp: (a: P, b: P) => P): P[] {',
        '  const out: P[] = [];',
        '  for (let i = 0; i < poly.length; i++) {',
        '    const cur = poly[i]!, prev = poly[(i - 1 + poly.length) % poly.length]!;',
        '    if (inside(cur)) { if (!inside(prev)) out.push(lerp(prev, cur)); out.push(cur); }',
        '    else if (inside(prev)) out.push(lerp(prev, cur));',
        '  }',
        '  return out;',
        '}',
      ].join('\n'),
      // An EMITTER of someone else's triangulation — nine-ordinate shared-Y
      // pushes read from OUTPUT index triples, stride 3, no ring successor
      // (slab.ts's top/bottom caps). Counting this counts a call-site-shaped
      // use of the embedded earcut, not a rival body.
      'packages/b/src/soup.ts': [
        'export function emit(tri: { triangles: number[]; vertices: P[] }, yTop: number): number[] {',
        '  const topPositions: number[] = [];',
        '  for (let i = 0; i < tri.triangles.length; i += 3) {',
        '    const a = tri.vertices[tri.triangles[i]!]!;',
        '    const b = tri.vertices[tri.triangles[i + 1]!]!;',
        '    const c = tri.vertices[tri.triangles[i + 2]!]!;',
        '    topPositions.push(a.x, yTop, a.z, b.x, yTop, b.z, c.x, yTop, c.z);',
        '  }',
        '  return topPositions;',
        '}',
      ].join('\n'),
    });
    const rej = detect(join(base, 'reject'), ['packages']);
    out.push(`    reject (call sites · quad · PTE anchors alone · immutable ring walk · soup emitter): ${rej.bodies.length} bod(ies) — expected 0`);
    if (rej.bodies.some((b) => b.file.endsWith('callsites.ts'))) fail('a CALL SITE of triangulate/earcut/ShapeUtils was counted — the detector is name-based, which C73 §3.2 forbids.');
    if (rej.bodies.some((b) => b.file.endsWith('quad.ts'))) fail('a fixed two-triangle QUAD emission was counted as a triangulation body.');
    if (rej.bodies.some((b) => b.file.endsWith('bearing.ts'))) fail('an atan2 bearing WITHOUT a half-edge key was counted as a planar engine — RoomDetectionEngine would be a false positive.');
    if (rej.bodies.some((b) => b.file.endsWith('arrowlog.ts'))) fail('a template arrow key WITHOUT the angular sort was counted as a planar engine.');
    if (rej.bodies.some((b) => b.file.endsWith('clipper.ts'))) fail('a modular-predecessor walk over an IMMUTABLE ring was counted as an ear clip — the nine false positives of the first measurement run would be back.');
    if (rej.bodies.some((b) => b.file.endsWith('soup.ts'))) fail('an emitter of earcut OUTPUT triples was counted as a centroid fan — slab.ts would be a false positive.');

    // ── zero: a clean tree must read 0 — or the ledger above it is decoration ─
    writeTree(join(base, 'clean'), { 'packages/c/src/plain.ts': 'export const area = (w: number, h: number) => w * h;\n' });
    const clean = detect(join(base, 'clean'), ['packages']);
    out.push(`    zero (clean tree): ${clean.bodies.length} bod(ies) — expected 0`);
    if (clean.bodies.length !== 0) fail('a clean tree did not read 0 — the zero reading is unreachable, so the ratchet above it is decoration.');
  } catch (e) {
    ok = false; out.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines: out };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (gates doc §2.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const excluded = new Set(FAMILIES.flatMap((f) => f.exclusions.map(([file]) => file)));
const detected = detect(ROOT, DIRS);
const all = detected.bodies.filter((b) => !excluded.has(b.file));
const production = all.filter((b) => !b.isTest);
const testBodies = all.filter((b) => b.isTest);

const triBodies = production.filter((b) => b.sig !== PTE_ID);
const pteBodies = production.filter((b) => b.sig === PTE_ID);

const RECIPE =
  'a TRIANGULATION body = one of four arithmetic anchors, comment-stripped: (1) modular-predecessor walk ' +
  'over a list the SAME FILE splices/filters an interior element from (a walk over an immutable ring is a ' +
  'clipper/checker, NOT an ear clip); (2) z-order bit interleave, counted once per file (one line per axis); ' +
  '(3) push(0,i,i+1) index fan; (4) nine-ordinate shared-height coplanar triangle push over a 6-line window ' +
  'WITH a ring-successor index in the 4 lines above it (an emitter of earcut output triples has no ring ' +
  'successor and is not counted). A PLANAR-TOPOLOGY-ENGINE body = one FILE containing BOTH the atan2-XZ ' +
  'angular sort about a shared vertex AND a `${u}→${v}` directed half-edge key. Counting unit = ' +
  '(file × signature-occurrence) for triangulation, (file) for the engine; dirs packages,apps,plugins,src; ' +
  'tests counted separately and NOT ratcheted.';

const measured = new Set(production.map(keyOf));

if (WRITE) {
  const next: Baseline = {
    recipe: RECIPE,
    measuredAt: new Date().toISOString().slice(0, 10),
    bodies: Object.fromEntries(production.map((b) => [keyOf(b), b.what])),
    c2: FAMILIES.filter((f) => f.canonical === null).length,
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`\n[${GATE}] wrote ${relPath(ROOT, BASELINE)} — ${Object.keys(next.bodies).length} production bod(ies), c2=${next.c2}. SHRINK-ONLY: a reviewer must see this diff go DOWN.`);
}

const prior: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline)
  : { recipe: RECIPE, measuredAt: 'never', bodies: {}, c2: 0 };

const priorKeys = new Set(Object.keys(prior.bodies));
const stale = [...priorKeys].filter((k) => !measured.has(k));
const added = [...measured].filter((k) => !priorKeys.has(k));

const c2Missing = FAMILIES.filter((f) => f.canonical === null);

const byFile = new Map<string, Body[]>();
for (const b of production) {
  const l = byFile.get(b.file) ?? [];
  l.push(b);
  byFile.set(b.file, l);
}

const lines: string[] = [];
lines.push(`RECIPE: ${RECIPE}`);
lines.push(`RE-RUN: npx tsx tools/ga-gate/${GATE}.ts   ·   REBASELINE (downward only): --write-baseline`);
lines.push(`baseline: ${relPath(ROOT, BASELINE)} (measured ${prior.measuredAt})`);
lines.push('');
lines.push(`files scanned: ${detected.filesScanned} across ${DIRS.join(', ')}`);
lines.push(`  ⚠ the gap register's row GE-12 says "~5" triangulation rivals and "~3" PlanarTopologyEngine copies. This gate measures 7 BODIES across 6 FILES (ceiling.ts holds two) and 4 ENGINE copies (auto-dimension's traceFaces is a fourth the class name never matched) — the register's numbers were name/file censuses, the offset gate's prose-"3"-measured-4 error one family over. The register keeps the ORDERING; this gate keeps the NUMBER.`);
lines.push('');
lines.push('── FAMILIES (C73 §3.1) — both counted THIS gate; canonical decisions pending ──');
for (const f of FAMILIES) {
  lines.push(`  ✓ COUNTED  ${f.id} — ${f.what}`);
  lines.push(`       canonical file: ${f.canonical ?? 'NONE YET — C2 finding, see below; named by the COLLAPSE PR (C73 §3.6/§3.7), not by this gate'}`);
  for (const [file, reason] of f.exclusions) lines.push(`       excluded: ${file}\n           ↳ ${reason}`);
}
lines.push('');
lines.push(`C1  ${triBodies.length} triangulation bod(ies) in PRODUCTION across ${new Set(triBodies.map((b) => b.file)).size} file(s) + ${pteBodies.length} planar-topology-engine cop(ies) (baseline total ${priorKeys.size}) · new: ${added.length} · struck: ${stale.length}`);
lines.push(`      (+ ${testBodies.length} in tests — measured and printed, deliberately NOT ratcheted: a test fixture triangulating its own expectation is not a rival shipped to a user.)`);
for (const [file, list] of [...byFile.entries()].sort()) {
  lines.push(`      ${file}  (${list.length} bod${list.length === 1 ? 'y' : 'ies'})`);
  for (const b of list) lines.push(`          :${b.line}  ${b.sig} — ${b.what}`);
}
for (const k of added) lines.push(`      + NEW SINCE BASELINE: ${k}`);
lines.push('');
lines.push(`C2  ${c2Missing.length} counted famil(ies) with NO named canonical file.`);
for (const f of c2Missing) {
  lines.push(
    `      ✗ ${f.id} — there is no canonical implementation to collapse onto yet. The collapse PR must ` +
    'identify the shipping consumers by name (C73 §3.6) and state which behaviour is canonical and why ' +
    '(§3.7) — for triangulation that decision includes hole support (only the vendored earcut has it) and ' +
    'concavity (both fans are silently wrong on concave input); for the planar engine it includes which of ' +
    'the four drifted bodies carries the correct thresholds. Minting a new implementation here instead ' +
    'would be §7.h — fixing a copy the shipping path cannot reach.',
  );
}
lines.push('');
lines.push(
  'EXIT CONDITION (C73 §6) — each family exits when its C1 count reads 1 (triangulation) / its copies read 1 ' +
  '(planar engine), C2 names the canonical file, and the family has an ORACLE FIXTURE at a known answer. ' +
  'NOT PROVEN by this gate: correctness of any surviving body (C73 §5.4a) — counting gates are blind to it ' +
  'by design; and the THREE.ShapeUtils.triangulateShape call-site axis, which no body count can see.',
);

const floors: Floor[] = [
  // C70 §5.2 — an empty scan is MISCONFIGURED, never a pass.
  { what: 'source files scanned', measured: detected.filesScanned, min: 500 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const findings = measured.size + c2Missing.length;
const declared = priorKeys.size + prior.c2;

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings,
  declared,
  findingNames: [
    ...[...measured].map((k) => `C1::${k}`),
    ...c2Missing.map((f) => `C2::${f.id} has no canonical file`),
  ],
  stale: stale.map((k) => `C1::${k}`),
};

process.exit(reportGate(result));
