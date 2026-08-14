#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-deterministic-regeneration.ts
 *
 * C73 §1 / §5.3 — **geometry is a pure function of authoritative model state.**
 * Arms D0–D3.
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * C73 §1.1 says the same model must produce the same geometry on any machine, in
 * any order, on any run. §1.2 enumerates what it therefore MUST NOT depend on:
 * wall-clock time, unseeded `Math.random`, unstable sort, container iteration
 * order, or renderer/viewport state. "A value the renderer knows and the model
 * does not is not an input to geometry."
 *
 * That prose has had no gate. This one gives it a mechanical reading over the
 * geometry layer — `packages/geometry-<kind>/src`, tests excluded.
 *
 * ─── THE STRUCTURAL RULE THAT MAKES THIS GATE WORTH READING ──────────────────
 *
 *     A wall-clock read whose value is DISCARDED is not a geometry input.
 *     A wall-clock read whose value FLOWS INTO model or geometry state IS.
 *
 * This distinction is the whole design, and it is not a convenience — it is the
 * difference between a gate people act on and a gate people silence.
 *
 * `performance.now()` appears ~60 times in `packages/geometry-<kind>/src`. Very nearly
 * all of them are a timing span:
 *
 *     const t0 = performance.now();
 *     …build…
 *     const frameMs = performance.now() - t0;      // → console.log / a counter
 *
 * `frameMs` reaches a log line and dies there. It never touches a vertex, an id,
 * a version or a userData field. Flagging those sixty sites would produce a gate
 * whose output is ~95% noise — and a gate that is 95% noise gets an entry on a
 * debt file and is never read again, which is strictly worse than no gate, because
 * it converts an unmeasured risk into a measured-and-ignored one. **Say it plainly
 * so nobody "improves" this gate by widening it: flagging every `performance.now()`
 * would be a defect in THIS FILE, not rigour.**
 *
 * Meanwhile `packages/geometry-door/src/DoorBuilder.ts:237` does this:
 *
 *     group.userData = Object.freeze({ ...group.userData, version: Date.now() });
 *
 * That value is written into the scene graph and survives the call. Two rebuilds
 * of an unchanged door produce two different `version` values — a §1.1 violation
 * in one line, sitting in the same package as forty innocent timing spans. A gate
 * that cannot tell those two apart cannot report either one usefully.
 *
 * So the unit of measurement here is not "a clock call". It is **a clock call
 * whose value reaches a sink**, and the sink set is named and on the record
 * (see SINKS below). Same rule, unchanged, for `Math.random()`.
 *
 * ─── HOW TO RE-DERIVE EVERY NUMBER BELOW ─────────────────────────────────────
 *
 *     npx tsx tools/ga-gate/check-deterministic-regeneration.ts
 *
 * It prints its recipe, every classified site with `file:line`, the sink each
 * flowing site reaches, AND the discarded sites it deliberately did not count —
 * because a suppression nobody can see is indistinguishable from a detector that
 * never fired (§CONTEXT-DATA-HONESTY). To regenerate the ledger after a GENUINE
 * reduction:
 *
 *     npx tsx tools/ga-gate/check-deterministic-regeneration.ts --write-baseline
 *
 * That writes `tools/ga-gate/deterministic-regeneration-baseline.json`. SHRINK-
 * ONLY: every entry is `arm::file:line::kind`, never a bare count, so a reviewer
 * sees WHICH site left rather than a number that could hide one removal and one
 * addition (C69 §7.c).
 *
 * ─── THE RECIPE — flow-classified, per site ──────────────────────────────────
 * For each forbidden-input READ (`Date.now()`, `new Date()`, `performance.now()`,
 * `Math.random()`) in a non-test file under `packages/geometry-<kind>/src`:
 *
 *   1. If the read is on the SAME EXPRESSION as a sink — `version:`, `userData`,
 *      `metadata`, an id template, a `return`, an assignment into `.position` /
 *      `.rotation` / a geometry attribute — it is FLOWING. Counted.
 *   2. Else the read is bound to a local (`const t0 = performance.now()`). The
 *      gate then follows THAT LOCAL forward through the rest of its enclosing
 *      brace-block. If the local reaches a sink, FLOWING. If it reaches only
 *      log/telemetry, DISCARDED — printed, never counted.
 *   3. A read that is bound to nothing and reaches nothing is DISCARDED.
 *
 * The forward walk is deliberately SHALLOW and it is bounded — it does not
 * follow a value across a function boundary. That is a KNOWN under-count, stated
 * here rather than discovered later: a clock read passed as an argument into a
 * helper that stamps it onto geometry is invisible to this gate. Under-counting
 * in the direction of silence is the failure mode this whole suite exists to
 * catch, which is why D0's subject floor is a DETECTOR-BROKE floor and why the
 * discarded sites are printed on every run — the reader can see the denominator.
 *
 * ─── SCOPE, and the two exclusions that are decisions ────────────────────────
 * Scope is `packages/geometry-<kind>/src`, `.ts`/`.tsx`, tests excluded. Two classes
 * inside that scope are excluded BY NAME with a reason (never by a quiet pattern):
 *
 *   • `*Tool.ts` interaction capture — a tool reading pointer/camera state to
 *     turn a click into a model coordinate is CAPTURING AN INPUT, not
 *     regenerating geometry from the model. `raycaster.setFromCamera` in
 *     `DoorTool.ts` is how a user's click becomes a wall offset; the offset then
 *     enters the model and the rebuild is a pure function of it. Excluding the
 *     capture is not leniency — including it would count the user as a
 *     nondeterminism source. **But only the RENDERER-STATE arm is excluded for
 *     tools; a tool that stamps `Date.now()` into an id is still counted**, and
 *     `OpeningTool.ts:461` is exactly that and is in the ledger.
 *   • `crypto.randomUUID()` — not on §1.2's list. It is an identity mint, and
 *     C73 §1.3's classification (which is D3's subject) is the contract that owns
 *     whether a minted identity survives a round trip. Counting it here would
 *     double-count against `check-identity-roundtrip`, which grades it at hard-0.
 *
 * ─── The arms (C73 §5.3) ─────────────────────────────────────────────────────
 *  D0 *(exit 2)*  SUBJECT-DISCOVERY FLOOR. Three parts: files scanned, geometry
 *      packages located, and — the important one — forbidden-input READS
 *      detected before classification. This estate measures well over a hundred.
 *      A collapse to single digits is a BROKEN DETECTOR, not a clean repo, and
 *      reporting it as progress is the exact lie exit 2 exists to prevent. When
 *      the cleanup genuinely lands this floor must be REMOVED with its reason,
 *      in the same commit, never quietly lowered (§2.5's spirit).
 *  D1 *(ratchet, named)*  wall-clock and unseeded-random values that FLOW into
 *      model/geometry state. This is C73 §5.3's "regenerating the same model
 *      twice yields byte-identical geometry", decided STATICALLY: a rebuild that
 *      stamps `Date.now()` cannot be byte-identical to its predecessor, and it
 *      does not need a running harness to prove it.
 *  D2 *(ratchet, named)*  order-dependence: unstable sort and container
 *      iteration order — §5.3's "shuffling model iteration order". Also static.
 *  D3 *(ratchet, named)*  the PERSIST-OR-LOSE ledger (§1.3), read from the LIVE
 *      classification artefact rather than restated here. See below.
 *
 * ─── D3 — what it owns, and what it explicitly does NOT ──────────────────────
 * Two sibling gates already hold pieces of persist-or-lose and this gate
 * duplicates NEITHER:
 *   • `check-graph-persistence` (C71 §6) owns the RELATIONSHIP level — the
 *     SemanticGraph edge families. Not touched here.
 *   • `check-derived-regenerable` owns the ELEMENT-FIELD level and maintains
 *     `certification/gates/derived-ledger.json` by actually running A1→A2→A3.
 * D3's job is therefore NOT to re-measure. It is to (a) assert that artefact is
 * PRESENT and FRESH — a ledger nobody regenerated is a ledger about a repo that
 * no longer exists — and (b) hold the count as a shrink-only ratchet from THIS
 * gate's side too, so a field added to that list lands as a finding here.
 *
 * And the honest residual, printed every run, never green by silence:
 * **the A1→A2→A3 cycle is run over MODEL FIELDS, not over GEOMETRY.** Its
 * artefact classifies `wall.<*>.metadata.createdAt`; nothing in it classifies a
 * vertex buffer, a triangle winding, or a mesh transform. So the geometry-level
 * half of §1.3 has NO classification input in this repo today. D3 reports that as
 * UNPROVEN-WITH-REASON rather than passing on the model-field half and letting a
 * reader infer geometry coverage that does not exist.
 *
 * ─── Negative controls — EXECUTED ON EVERY RUN (gates doc §2.2) ──────────────
 * `selfTest()` drives the same analyser over synthetic trees. The load-bearing
 * pair, which is the proof the whole design works:
 *   • DISCARDED clock: `const t0 = performance.now(); … console.log(performance.now() - t0)`
 *     must NOT be counted. If it fires, the gate is noise and will be silenced.
 *   • FLOWING clock: `userData = { version: Date.now() }` MUST be counted, and the
 *     finding must NAME the sink.
 * Plus: a flowing `Math.random()`; a discarded random used only in a log; an
 * unstable `.sort((a,b) => a.x - b.x)` over a tie-prone key; and a clean tree
 * that must read 0 — because a zero reading that is unreachable makes the floor
 * above it decoration. If any control fails the gate exits 2 as a BLIND
 * COMPARATOR.
 *
 * ─── What this gate CANNOT see (C73 §5.4) ────────────────────────────────────
 *   • CROSS-MACHINE determinism (§5.4b). This is a static reading in one
 *     process; platform floating-point divergence is UNPROVEN and no arm here
 *     addresses it.
 *   • GPU-side geometry (§5.4c). Anything computed in a shader is outside every
 *     arm. UNPROVEN.
 *   • A clock or random value passed ACROSS a function boundary into a stamper —
 *     the forward walk is intra-block by design (see THE RECIPE).
 *   • Whether a FLOWING value actually changes rendered geometry as opposed to a
 *     stale-detection stamp. `version: Date.now()` is a §1.1 violation either
 *     way — a rebuild is not byte-identical — but the USER-VISIBLE severity of
 *     the two differs and this gate does not grade severity.
 *   • Floating-point ACCUMULATION order (§1.2's last clause) where the container
 *     is deterministic but the summation order still varies. D2 sees the
 *     iteration source, not the arithmetic.
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
const GATE = 'check-deterministic-regeneration';
const BASELINE = resolve(HERE, 'deterministic-regeneration-baseline.json');
const WRITE = process.argv.includes('--write-baseline');

/**
 * D3's classification input — maintained by `check-derived-regenerable`, which
 * is the gate that actually runs serialize → restore → serialize-and-restore.
 * This gate READS it; it does not re-measure it (see the D3 note in the header).
 */
const DERIVED_LEDGER = resolve(ROOT, 'tools/rac-conformance/certification/gates/derived-ledger.json');
const REGENERABLE_RESULT = resolve(ROOT, 'tools/rac-conformance/certification/results/regenerable.json');

/** A ledger measured this long ago is describing a repo that has moved on. */
const LEDGER_STALE_DAYS = 60;

// ─── The forbidden inputs (C73 §1.2) ─────────────────────────────────────────

interface ForbiddenRead {
  readonly id: string;
  /** What §1.2 clause it violates, in the contract's own words. */
  readonly clause: string;
  readonly pattern: RegExp;
}

const FORBIDDEN_READS: readonly ForbiddenRead[] = [
  { id: 'wall-clock', clause: 'wall-clock time', pattern: /\bDate\.now\s*\(\s*\)/ },
  { id: 'wall-clock', clause: 'wall-clock time', pattern: /\bnew\s+Date\s*\(\s*\)/ },
  { id: 'wall-clock', clause: 'wall-clock time', pattern: /\bperformance\.now\s*\(\s*\)/ },
  { id: 'unseeded-random', clause: '`Math.random` without a model-derived seed', pattern: /\bMath\.random\s*\(\s*\)/ },
];

/**
 * SINKS — the named set of places a value REACHES that make it a geometry input.
 * On the record, individually, so that widening this set is a visible decision
 * rather than a regex someone quietly relaxed (C73 §3.3's principle applied to a
 * different gate).
 *
 * Each entry is [id, what it means, pattern]. The pattern is applied to the
 * expression the value flows into, never to the whole file.
 */
const SINKS: ReadonlyArray<readonly [string, string, RegExp]> = [
  ['version', 'written to a `version` field — a rebuild stamp that differs every run', /\bversion\s*:/],
  ['userData', 'written into THREE `userData` — survives on the scene graph', /\buserData\b/],
  ['metadata', 'written into element `metadata` — persisted with the model', /\bmetadata\b|\b(createdAt|modifiedAt)\s*[:=]/],
  // ⚠ NARROW ON PURPOSE. The first cut of this sink was `` `[^`]*\$\{ `` — "any
  // template literal" — on the theory that an id is built by interpolation. The
  // executed control caught it immediately: EVERY log line in
  // `CurtainWallBuilder.ts` is a template literal, so seven timing spans were
  // classified FLOWING with `sink=id`. That is the exact ~95%-noise failure the
  // header forbids, produced by the gate's own author, and it is why the control
  // asserts the discarded half rather than only the flowing half.
  //
  // An id sink is therefore an ASSIGNMENT into an id-shaped name, and the
  // interpolation form must ALSO assign into one — a bare template literal is
  // not evidence of anything.
  ['id', 'assigned into an element id/key — identity minted from the clock', /\b(id|Id|key|uuid|Uuid|guid)\s*[:=][^=]/],
  ['timestamp', 'written to a `timestamp` field carried on an emitted record', /\btimestamp\s*:/],
  ['return', 'RETURNED from the function — leaves as a value, not a span', /(^|[^\w.])return\b/],
  ['transform', 'assigned into a mesh transform — position/rotation/scale', /\.(position|rotation|scale|quaternion)\b/],
  ['geometry-attr', 'written into a geometry attribute or vertex array', /\b(setAttribute|BufferAttribute|vertices|positions)\b/],
];

/**
 * TELEMETRY SINKS — where a DISCARDED value goes to die. Matched only to LABEL
 * the discard in the printout; a value reaching none of these and none of SINKS
 * is still DISCARDED (it reached nothing at all).
 */
const TELEMETRY = /\bconsole\.(log|warn|info|debug|error)\b|\btoFixed\s*\(|\bspan\b|\bmetric|\bperf\b|\bMs\b|\bms\b|\belapsed\b|\bduration\b/i;

/** Order-dependence (D2) — §1.2's unstable-sort and iteration-order clauses. */
const ORDER_PATTERNS: ReadonlyArray<readonly [string, string, RegExp]> = [
  [
    'unstable-sort',
    'a numeric comparator returns 0 on a tie, so tied elements keep INSERTION order — ' +
    'C73 §1.2 requires ties broken on a stable MODEL KEY, not on insertion order',
    /\.sort\s*\(\s*\((\w+)\s*,\s*(\w+)\)\s*=>\s*[^)]*[-<>]/,
  ],
  [
    'hash-iteration-order',
    'geometry accumulated by iterating a hash-keyed container — §1.2 forbids ' +
    'float accumulation order that varies with container iteration',
    /\bfor\s*\(\s*const\s+\[[^\]]+\]\s+of\s+\w+\.entries\s*\(\s*\)|\bObject\.(keys|values|entries)\s*\([^)]*\)\s*\.(forEach|map|reduce)/,
  ],
];

// ─── Detection ───────────────────────────────────────────────────────────────

type Verdict = 'FLOWING' | 'DISCARDED';

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly kind: string;
  readonly clause: string;
  readonly verdict: Verdict;
  /** For FLOWING: which named sink it reached. For DISCARDED: where it died. */
  readonly sink: string;
}

interface OrderSite {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly kind: string;
  readonly why: string;
}

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench|cert)\.tsx?$/.test(rel) || /(^|\/)tests?\//.test(rel);
}

/**
 * A `*Tool.ts` captures user interaction. See SCOPE in the header: renderer-state
 * reads there are input capture, not regeneration. Clock/random are NOT exempt.
 */
function isInteractionCapture(rel: string): boolean {
  return /\/[A-Z]\w*Tool\.tsx?$/.test(rel);
}

/**
 * How far forward the shallow flow walk follows a local binding. Bounded, never
 * to end-of-file: an unbounded walk would attribute an unrelated later `return`
 * to this read and manufacture a FLOWING verdict out of adjacency.
 */
const FLOW_WINDOW = 12;

/** `const t0 = performance.now()` → `t0`. Null when the read is not bound. */
function boundName(line: string, matchIndex: number): string | null {
  const before = line.slice(0, matchIndex);
  const m = /(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*$/.exec(before)
    ?? /(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*\(?\s*$/.exec(before);
  return m?.[1] ?? null;
}

/** Does this expression reach one of the NAMED sinks? Returns the sink id. */
function sinkOf(expr: string): string | null {
  for (const [id, , re] of SINKS) if (re.test(expr)) return id;
  return null;
}

/**
 * Classify ONE forbidden read. The structural rule of this gate lives here.
 *
 * A read is FLOWING when its value reaches a named sink — either on its own
 * expression, or through the local it is bound to, within a bounded forward
 * window. Otherwise it is DISCARDED: a timing span, a log, a value nothing keeps.
 */
function classify(lines: readonly string[], i: number, matchIndex: number): { verdict: Verdict; sink: string } {
  const line = lines[i]!;

  // 0 — TELEMETRY WINS ON ITS OWN LINE, and the ordering is load-bearing.
  //     `console.log(\`sliceMs=${performance.now() - t}ms\`)` contains a template
  //     literal, an `=` and an `ms`; several sink patterns can be made to match
  //     inside a log string. A value being FORMATTED INTO A LOG CALL is the
  //     canonical discarded case — it is consumed by the log and cannot reach
  //     model state from there — so a console call on the read's own line
  //     settles the question before any sink is consulted.
  //
  //     This ordering was added because the executed control failed without it:
  //     seven CurtainWallBuilder timing spans were classified FLOWING. A gate
  //     whose own controls never fail is a gate nobody has watched fail.
  if (/\bconsole\.(log|warn|info|debug|error)\s*\(/.test(line)) {
    return { verdict: 'DISCARDED', sink: 'formatted into a console call on its own line' };
  }

  // 1 — same-expression sink. `version: Date.now()` needs no flow analysis.
  const own = sinkOf(line);
  if (own !== null) return { verdict: 'FLOWING', sink: own };

  // 2 — bound to a local? Follow THAT NAME forward, bounded.
  const name = boundName(line, matchIndex);
  if (name === null) {
    // Not bound and not on a sink expression: it reached nothing.
    return { verdict: 'DISCARDED', sink: TELEMETRY.test(line) ? 'telemetry (same line)' : 'nothing (value unbound and unused)' };
  }

  const use = new RegExp(`\\b${name}\\b`);
  let depth = 0;
  for (let j = i + 1; j < Math.min(lines.length, i + 1 + FLOW_WINDOW); j++) {
    const l = lines[j]!;
    // Leaving the enclosing block ends the local's life; stop rather than read on.
    for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth < 0) break;
    if (!use.test(l)) continue;
    const s = sinkOf(l);
    if (s !== null) return { verdict: 'FLOWING', sink: `${s} (via local \`${name}\`)` };
    if (TELEMETRY.test(l)) return { verdict: 'DISCARDED', sink: `telemetry via local \`${name}\` (${l.trim().slice(0, 60)})` };
  }
  return { verdict: 'DISCARDED', sink: `local \`${name}\` reaches no named sink within ${FLOW_WINDOW} lines` };
}

interface Detection {
  readonly sites: Site[];
  readonly orderSites: OrderSite[];
  readonly filesScanned: number;
  readonly packagesFound: number;
  /** Reads found BEFORE flow classification — D0's detector-broke subject. */
  readonly rawReads: number;
}

function detect(root: string, globDir: string): Detection {
  const sites: Site[] = [];
  const orderSites: OrderSite[] = [];
  let filesScanned = 0;
  let rawReads = 0;

  const base = join(root, globDir);
  let pkgs: string[];
  try {
    pkgs = walk(base, { exts: ['.json'] })
      .filter((p) => /geometry-[^/\\]+[/\\]package\.json$/.test(p))
      .map((p) => dirname(p));
  } catch { pkgs = []; }

  for (const pkg of pkgs) {
    for (const abs of walk(join(pkg, 'src'))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel)) continue;
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        for (const f of FORBIDDEN_READS) {
          const re = new RegExp(f.pattern.source, 'g');
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            rawReads++;
            const { verdict, sink } = classify(lines, i, m.index);
            sites.push({
              file: rel, line: i + 1, text: line.trim().slice(0, 120),
              kind: f.id, clause: f.clause, verdict, sink,
            });
          }
        }
        // D2 — order dependence. Interaction capture is NOT exempt here: a tool
        // that sorts unstably feeds the model an order-dependent result.
        for (const [id, why, re] of ORDER_PATTERNS) {
          if (re.test(line)) orderSites.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120), kind: id, why });
        }
      }
    }
  }
  return { sites, orderSites, filesScanned, packagesFound: pkgs.length, rawReads };
}

// ─── D3 — read the live classification artefact, never restate it ────────────

interface D3Reading {
  readonly present: boolean;
  readonly fresh: boolean;
  readonly ageDays: number | null;
  readonly persistOrLose: string[];
  readonly reason: string;
}

function readD3(): D3Reading {
  if (!existsSync(DERIVED_LEDGER)) {
    return {
      present: false, fresh: false, ageDays: null, persistOrLose: [],
      reason:
        `UNPROVEN — the classification input ${relPath(ROOT, DERIVED_LEDGER)} DOES NOT EXIST. ` +
        'C73 §1.3 requires the three-state A1→A2→A3 measurement; without its artefact this arm has no ' +
        'subject. Reported as UNPROVEN rather than green: an arm that passes because its input is ' +
        'missing is the precise shape of "failure and emptiness are the same value" (C73 §4.3).',
    };
  }
  let parsed: { measuredAt?: string; persistOrLose?: string[] };
  try { parsed = JSON.parse(readFileSync(DERIVED_LEDGER, 'utf8')) as typeof parsed; }
  catch (e) {
    return { present: true, fresh: false, ageDays: null, persistOrLose: [], reason: `UNPROVEN — ledger is present but UNPARSEABLE: ${(e as Error).message}` };
  }
  const list = parsed.persistOrLose ?? [];
  const at = parsed.measuredAt ? Date.parse(parsed.measuredAt) : NaN;
  const ageDays = Number.isFinite(at) ? Math.floor((Date.now() - at) / 86_400_000) : null;
  const fresh = ageDays !== null && ageDays <= LEDGER_STALE_DAYS;
  return {
    present: true, fresh, ageDays, persistOrLose: list,
    reason: fresh
      ? `ledger measured ${ageDays} day(s) ago by check-derived-regenerable (A1→A2→A3 over MODEL FIELDS).`
      : `STALE — the ledger's measuredAt is ${ageDays === null ? 'unreadable' : `${ageDays} day(s)`} old (limit ${LEDGER_STALE_DAYS}). ` +
        'A ledger nobody regenerated describes a repo that has moved on; C73 §1.3 makes a stale entry exit 3.',
  };
}

/**
 * The geometry-level residual, printed every run. This is D3's honest half: the
 * classification that DOES exist is over model fields, and nothing in this repo
 * classifies geometry itself.
 */
function d3GeometryResidual(): string[] {
  const out: string[] = [];
  let geomClassified = 0;
  if (existsSync(REGENERABLE_RESULT)) {
    try {
      const r = JSON.parse(readFileSync(REGENERABLE_RESULT, 'utf8')) as { regenerable?: string[]; persistOrLose?: string[] };
      const all = [...(r.regenerable ?? []), ...(r.persistOrLose ?? [])];
      geomClassified = all.filter((k) => /\b(vertices|positions|geometry|mesh|triangles|winding|indices)\b/i.test(k)).length;
    } catch { /* reported below as unreadable */ }
  }
  out.push(
    `      ⚠ UNPROVEN (geometry level) — ${geomClassified} of the classified field paths name GEOMETRY. ` +
    'The A1→A2→A3 cycle that produces this ledger serialises MODEL FIELDS (`wall.<*>.metadata.createdAt` ' +
    'and kin); no entry in it classifies a vertex buffer, a triangle winding, or a mesh transform. So the ' +
    'GEOMETRY half of C73 §1.3 has no classification input in this repo today.',
  );
  out.push(
    '      This is stated rather than inferred because passing on the model-field half would let a reader ' +
    'conclude geometry regeneration is classified. It is not. Closing it needs an A1→A2→A3 harness that ' +
    'compares BUILT GEOMETRY across a save/reload, which does not exist — that is the work, not this line.',
  );
  out.push(
    '      NOT DUPLICATED HERE: the RELATIONSHIP-level persist-or-lose ledger is owned by ' +
    'check-graph-persistence (C71 §6, commit 5fb70137) and the ELEMENT-FIELD level by ' +
    'check-derived-regenerable. This arm reads the latter and re-ratchets it; it re-measures neither.',
  );
  return out;
}

// ─── Baseline ────────────────────────────────────────────────────────────────

interface Baseline {
  readonly recipe: string;
  readonly measuredAt: string;
  /** D1: `file:line::kind` → the sink it reaches. */
  readonly flowing: Record<string, string>;
  /** D2: `file:line::kind`. */
  readonly order: Record<string, string>;
  /** D3: the persist-or-lose field paths, mirrored so a NEW one lands here too. */
  readonly persistOrLose: string[];
}

const keyOfSite = (s: Site): string => `${s.file}:${s.line}::${s.kind}`;
const keyOfOrder = (s: OrderSite): string => `${s.file}:${s.line}::${s.kind}`;

// ─── Executed controls ───────────────────────────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

/** Minimal package.json so the geometry-package discovery finds the fixture. */
const PKG = '{"name":"@pryzm/geometry-fixture","version":"0.0.0"}\n';

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${m}`); };

  try {
    // ── THE LOAD-BEARING PAIR — discarded must NOT fire, flowing MUST ────────
    // This pair is the proof the structural rule works. If the first fires, the
    // gate is ~95% noise and gets silenced; if the second does not, the gate
    // misses the actual §1.1 violation it exists for.
    writeTree(join(base, 'pair'), {
      'packages/geometry-fixture/package.json': PKG,
      'packages/geometry-fixture/src/discarded.ts': [
        'export function build(n: number) {',
        '  const t0 = performance.now();',
        '  let acc = 0;',
        '  for (let i = 0; i < n; i++) acc += i;',
        '  const frameMs = performance.now() - t0;',
        '  console.log(`[fixture] built in ${frameMs.toFixed(2)}ms`);',
        '  return acc;',
        '}',
      ].join('\n'),
      'packages/geometry-fixture/src/flowing.ts': [
        'export function stamp(group: { userData: object }) {',
        '  group.userData = Object.freeze({ ...group.userData, version: Date.now() });',
        '}',
      ].join('\n'),
    });
    const pair = detect(join(base, 'pair'), 'packages');
    const disc = pair.sites.filter((s) => s.file.endsWith('discarded.ts'));
    const flow = pair.sites.filter((s) => s.file.endsWith('flowing.ts'));
    lines.push(
      `D1 PAIR — discarded.ts: ${disc.length} read(s), verdicts [${disc.map((s) => s.verdict).join(', ')}] · ` +
      `flowing.ts: ${flow.length} read(s), verdicts [${flow.map((s) => s.verdict).join(', ')}]`,
    );
    if (disc.length === 0) fail('the DISCARDED fixture produced no reads at all — the detector did not run, so the negative half of the pair proves nothing.');
    if (disc.some((s) => s.verdict === 'FLOWING')) {
      fail(
        'a DISCARDED `performance.now()` timing span was classified FLOWING. A gate that flags every ' +
        'performance.now() is ~95% noise in this estate and will be silenced — which converts an unmeasured ' +
        'risk into a measured-and-ignored one. The structural rule is broken.',
      );
    }
    if (flow.length === 0 || !flow.some((s) => s.verdict === 'FLOWING')) {
      fail('a `Date.now()` written into `userData.version` was NOT classified FLOWING — the gate misses the exact §1.1 violation it exists for (DoorBuilder.ts:237 is this shape).');
    }
    if (flow.some((s) => s.verdict === 'FLOWING' && !/version|userData/.test(s.sink))) {
      fail(`the FLOWING finding did not NAME its sink (got "${flow.find((s) => s.verdict === 'FLOWING')?.sink}") — "nondeterministic" without the sink is a shrug, not a refusal (C73 §4.4).`);
    }

    // ── Math.random(), both directions ───────────────────────────────────────
    writeTree(join(base, 'random'), {
      'packages/geometry-fixture/package.json': PKG,
      'packages/geometry-fixture/src/flowrand.ts': [
        'export function leaf(mesh: { rotation: { x: number } }) {',
        '  mesh.rotation.x = (Math.random() - 0.5) * 0.5;',
        '}',
      ].join('\n'),
      'packages/geometry-fixture/src/logrand.ts': [
        'export function sample() {',
        '  const roll = Math.random();',
        '  console.debug(`[fixture] sampled ${roll}`);',
        '}',
      ].join('\n'),
    });
    const rnd = detect(join(base, 'random'), 'packages');
    const fr = rnd.sites.filter((s) => s.file.endsWith('flowrand.ts'));
    const lr = rnd.sites.filter((s) => s.file.endsWith('logrand.ts'));
    lines.push(`    D1 random — flowrand.ts: [${fr.map((s) => s.verdict).join(', ')}] · logrand.ts: [${lr.map((s) => s.verdict).join(', ')}]`);
    if (!fr.some((s) => s.verdict === 'FLOWING')) fail('an unseeded `Math.random()` assigned into `mesh.rotation.x` was not FLOWING — that is geometry, and Plant0*Builder.ts is full of this shape.');
    if (lr.some((s) => s.verdict === 'FLOWING')) fail('a `Math.random()` used only in a debug log was classified FLOWING — the same noise failure as the clock half, in the other detector.');

    // ── D2 — unstable sort ───────────────────────────────────────────────────
    writeTree(join(base, 'order'), {
      'packages/geometry-fixture/package.json': PKG,
      'packages/geometry-fixture/src/sorted.ts': [
        'export function order(pts: Array<{ x: number }>) {',
        '  return pts.sort((a, b) => a.x - b.x);',
        '}',
      ].join('\n'),
    });
    const ord = detect(join(base, 'order'), 'packages');
    lines.push(`    D2 detect (numeric comparator, ties keep insertion order): ${ord.orderSites.length} site(s)`);
    if (ord.orderSites.length === 0) fail('D2 did not detect a numeric `.sort()` comparator — §1.2 requires ties broken on a stable model key, and the arm cannot see the clause it enforces.');

    // ── Zero must be REACHABLE, or the floor above it is decoration ──────────
    writeTree(join(base, 'clean'), {
      'packages/geometry-fixture/package.json': PKG,
      'packages/geometry-fixture/src/pure.ts': 'export const area = (w: number, h: number) => w * h;\n',
    });
    const clean = detect(join(base, 'clean'), 'packages');
    lines.push(`    D1/D2 zero (a tree with no forbidden input): ${clean.sites.length} read(s), ${clean.orderSites.length} order site(s) — expected 0/0`);
    if (clean.sites.length !== 0 || clean.orderSites.length !== 0) fail('a tree containing no forbidden input read non-zero — the zero reading is unreachable, so every floor above it is decoration.');

    // ── The test exclusion must actually exclude ─────────────────────────────
    writeTree(join(base, 'tests'), {
      'packages/geometry-fixture/package.json': PKG,
      'packages/geometry-fixture/src/__tests__/x.test.ts': 'it("x", () => { const v = { version: Date.now() }; expect(v).toBeTruthy(); });\n',
    });
    const t = detect(join(base, 'tests'), 'packages');
    lines.push(`    scope (a __tests__ file with a flowing clock): ${t.sites.length} site(s) — expected 0`);
    if (t.sites.length !== 0) fail('a test file was counted — a fixture stamping a clock is not shipped geometry, and counting it would inflate the ratchet with sites no fix can remove.');
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

const det = detect(ROOT, 'packages');
const flowing = det.sites.filter((s) => s.verdict === 'FLOWING');
const discarded = det.sites.filter((s) => s.verdict === 'DISCARDED');
const d3 = readD3();

const RECIPE =
  'scope packages/geometry-*/src, .ts/.tsx, tests EXCLUDED, comments stripped. A forbidden-input READ is ' +
  'Date.now() / new Date() / performance.now() / Math.random(). Each read is FLOW-CLASSIFIED: FLOWING if its ' +
  'value reaches a NAMED sink (version · userData · metadata · id · timestamp · return · transform · ' +
  'geometry-attr) either on its own expression or through the local it binds, within a bounded ' +
  `${FLOW_WINDOW}-line intra-block window; DISCARDED otherwise (a timing span reaching only a log). ` +
  'ONLY FLOWING sites are counted — a clock read whose value is thrown away is not a geometry input, and ' +
  'flagging all ~60 timing spans would be noise that gets the gate silenced. D2 counts numeric sort ' +
  'comparators and hash-container iteration. crypto.randomUUID is EXCLUDED (check-identity-roundtrip owns it); ' +
  'renderer-state reads inside *Tool.ts are EXCLUDED as interaction capture, but clock/random there are NOT.';

if (WRITE) {
  const next: Baseline = {
    recipe: RECIPE,
    measuredAt: new Date().toISOString().slice(0, 10),
    flowing: Object.fromEntries(flowing.map((s) => [keyOfSite(s), s.sink])),
    order: Object.fromEntries(det.orderSites.map((s) => [keyOfOrder(s), s.why.slice(0, 60)])),
    persistOrLose: [...d3.persistOrLose].sort(),
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(
    `\n[${GATE}] wrote ${relPath(ROOT, BASELINE)} — ${Object.keys(next.flowing).length} D1 · ` +
    `${Object.keys(next.order).length} D2 · ${next.persistOrLose.length} D3. SHRINK-ONLY: a reviewer must see this diff go DOWN.`,
  );
}

const prior: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline)
  : { recipe: RECIPE, measuredAt: 'never', flowing: {}, order: {}, persistOrLose: [] };

const mFlow = new Set(flowing.map(keyOfSite));
const pFlow = new Set(Object.keys(prior.flowing));
const mOrder = new Set(det.orderSites.map(keyOfOrder));
const pOrder = new Set(Object.keys(prior.order));
const mPol = new Set(d3.persistOrLose);
const pPol = new Set(prior.persistOrLose);

const staleFlow = [...pFlow].filter((k) => !mFlow.has(k));
const staleOrder = [...pOrder].filter((k) => !mOrder.has(k));
const stalePol = [...pPol].filter((k) => !mPol.has(k));
const newFlow = [...mFlow].filter((k) => !pFlow.has(k));
// §NAME-THE-EXCESS (2026-08-14). D1 has printed `+ NEW SINCE BASELINE` since it was
// written; D2 and D3 printed only a TOTAL and a `struck:` count. So a run in which
// one D2 row was re-anchored and a different site was newly violated printed
// "42 (baseline 41) · struck: 2" — three separate facts collapsed into two numbers,
// and the reader had to diff 42 lines against a JSON file by hand to learn WHICH
// site was the excess. That is the same defect as a bare count in a shrink-only
// ledger (C69 §7.c): one removal and one addition read as "no change".
//
// Nothing here changes a threshold, a verdict or an arm. It only makes the arm that
// already exits 3 say what it exited 3 ABOUT.
const newOrder = [...mOrder].filter((k) => !pOrder.has(k));
const newPol = [...mPol].filter((k) => !pPol.has(k));

const lines: string[] = [];
lines.push(`RECIPE: ${RECIPE}`);
lines.push(`RE-RUN: npx tsx tools/ga-gate/${GATE}.ts   ·   REBASELINE (downward only): --write-baseline`);
lines.push(`baseline: ${relPath(ROOT, BASELINE)} (measured ${prior.measuredAt})`);
lines.push('');
lines.push(`subject: ${det.packagesFound} geometry package(s), ${det.filesScanned} non-test source file(s), ${det.rawReads} forbidden-input read(s) BEFORE classification`);
lines.push('');

// ── D1 ───────────────────────────────────────────────────────────────────────
lines.push(
  `D1  ${mFlow.size} FLOWING forbidden-input site(s) — a wall-clock or unseeded-random value that reaches ` +
  `model/geometry state (baseline ${pFlow.size}) · new: ${newFlow.length} · struck: ${staleFlow.length}`,
);
const byFile = new Map<string, Site[]>();
for (const s of flowing) { const l = byFile.get(s.file) ?? []; l.push(s); byFile.set(s.file, l); }
for (const [file, list] of [...byFile.entries()].sort()) {
  lines.push(`      ${file}  (${list.length})`);
  for (const s of list) lines.push(`          :${s.line}  ${s.kind} → sink=${s.sink}   ${s.text}`);
}
for (const k of newFlow) lines.push(`      + NEW SINCE BASELINE: ${k}`);
lines.push('');
lines.push(
  `      NOT COUNTED — ${discarded.length} DISCARDED read(s). Printed so the DENOMINATOR is visible: a ` +
  'suppression nobody can see is indistinguishable from a detector that never fired. These are timing ' +
  'spans whose value reaches a log and dies there; flagging them would be noise, and a noisy gate gets ' +
  'silenced (see the header — widening this is a DEFECT in the gate, not rigour).',
);
const discByFile = new Map<string, number>();
for (const s of discarded) discByFile.set(s.file, (discByFile.get(s.file) ?? 0) + 1);
for (const [f, n] of [...discByFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)) {
  lines.push(`          · ${f} — ${n} discarded`);
}
lines.push('');

// ── D2 ───────────────────────────────────────────────────────────────────────
lines.push(
  `D2  ${mOrder.size} order-dependence site(s) (baseline ${pOrder.size}) · new: ${newOrder.length} · struck: ${staleOrder.length}`,
);
for (const s of det.orderSites) lines.push(`      ${s.file}:${s.line}  ${s.kind} — ${s.why}\n          ${s.text}`);
for (const k of newOrder) lines.push(`      + NEW SINCE BASELINE: ${k}`);
lines.push('');

// ── D3 ───────────────────────────────────────────────────────────────────────
lines.push(
  `D3  ${mPol.size} PERSIST-OR-LOSE field path(s) (baseline ${pPol.size}) · new: ${newPol.length} · struck: ${stalePol.length}`,
);
lines.push(`      input: ${relPath(ROOT, DERIVED_LEDGER)} — ${d3.reason}`);
for (const k of [...mPol].sort()) lines.push(`      · ${k}`);
for (const k of newPol) lines.push(`      + NEW SINCE BASELINE: ${k}`);
for (const l of d3GeometryResidual()) lines.push(l);
lines.push('');

lines.push(
  'EXIT CONDITION (C73 §6) — this gate exits when D1 and D2 read 0 across every geometry package AND the ' +
  'persist-or-lose ledger is empty; the ledger file is then deleted with the finding path. ' +
  'NOT PROVEN by this gate (C73 §5.4b/c): cross-machine floating-point determinism, GPU-side geometry, and ' +
  'any forbidden value passed ACROSS a function boundary into a stamper.',
);

// ── Floors ───────────────────────────────────────────────────────────────────
const floors: Floor[] = [
  { what: 'geometry packages located', measured: det.packagesFound, min: 10 },
  { what: 'non-test geometry source files scanned', measured: det.filesScanned, min: 200 },
  // THE DETECTOR-BROKE FLOOR (D0). This estate measures well over a hundred raw
  // forbidden-input reads. A collapse to single digits is a regex regression,
  // not a clean repo, and reporting it as progress is the exact lie exit 2
  // exists to prevent. It is a MISCONFIGURATION detector, never a target: when
  // the cleanup genuinely lands and D1 approaches 0, this floor is what must be
  // REMOVED — in the same commit, with the reason — not quietly lowered.
  {
    what: 'forbidden-input reads detected before classification (a collapse to single digits is a BROKEN DETECTOR, not a clean repo)',
    measured: det.rawReads, min: 40,
  },
  { what: 'D3 classification input present (0 = the arm has no subject)', measured: d3.present ? 1 : 0, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

// D3's freshness is a FINDING, not a floor: a stale ledger is a real defect the
// ratchet must surface, whereas a MISSING ledger means the arm has no subject at
// all — different facts, different exit codes (C70 §5).
const d3StaleFinding = d3.present && !d3.fresh;
if (d3StaleFinding) lines.push(`      ✗ D3 FINDING — ${d3.reason}`);

const findings = mFlow.size + mOrder.size + mPol.size + (d3StaleFinding ? 1 : 0);
const declared = pFlow.size + pOrder.size + pPol.size;

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings,
  declared,
  findingNames: [
    ...[...mFlow].map((k) => `D1::${k}`),
    ...[...mOrder].map((k) => `D2::${k}`),
    ...[...mPol].map((k) => `D3::${k}`),
    ...(d3StaleFinding ? ['D3::classification ledger is STALE'] : []),
  ],
  stale: [
    ...staleFlow.map((k) => `D1::${k}`),
    ...staleOrder.map((k) => `D2::${k}`),
    ...stalePol.map((k) => `D3::${k}`),
  ],
};

process.exit(reportGate(result));
