// ─── GATE · check-room-aabb-canonical  (C73 §1 · C73 §3 · GE-11) ─────────────
//
// THE INVARIANT (C73 §1, §3 — one canonical implementation per predicate family):
//   **One AABB definition feeds `roomSpatialIndex`.**
//
// BIM30-GAP-REGISTER row **GE-11** recorded, and left UNPROVEN for want of an
// instrument:
//
//   "The room spatial index is fed two incompatible AABB definitions (true bbox
//    vs circle approximation) — a concave room can be missed. A live
//    correctness bug, not duplication."
//
// UNPROVEN is neither a pass nor a fail (C70 §2.2). This gate is the missing
// instrument. It does not argue from code shape alone: ARM B drives the REAL
// `SpatialIndex` from `@pryzm/core-app-model` and reproduces the miss
// NUMERICALLY, so the row is settled by execution rather than by reading.
//
// ─── WHY THE MISS IS REACHABLE, NOT LATENT ───────────────────────────────────
// `RoomStore.getRoomsContainingPoint` (packages/room-topology/src/RoomStore.ts)
// uses `roomSpatialIndex.query([x,z])` as a CANDIDATE FILTER and only then
// applies `pointInPolygon` to the survivors. A room absent from the candidate
// set can never be returned however correct the polygon test is — the index is
// upstream of the predicate, so an under-sized AABB is a silent false negative
// at the API, not a performance note. `getRoomsInBoundingBox` reads the same
// index through `queryRect`. Both are shipped public methods.
//
// ─── WHAT IT DECIDES — three arms ────────────────────────────────────────────
//   ARM A · ENUMERATION (static). Every `roomSpatialIndex.insert(` call site is
//           DISCOVERED from source across packages/ apps/ plugins/ — never
//           hardcoded from the register's prose, which is exactly the mode
//           C70 §0.1 forbids. Each site's bounds argument is classified into
//           one of three buckets by structural signature:
//             TRUE-BBOX     — the argument is, or is derived from, the room's
//                             own `computed.boundingBox`.
//             CIRCLE-APPROX — the argument is `centroid ± sqrt(area / PI)`,
//                             a circle of equal area re-boxed. This is an
//                             AREA-preserving approximation, and area does not
//                             determine extent: it is correct only for a
//                             square, and understates every other footprint in
//                             at least one axis.
//             UNCLASSIFIED  — a convention the gate cannot name. This is a
//                             FINDING, not a pass: a gate that silently drops
//                             what it does not understand reports a smaller
//                             defect than the one that exists.
//           A finding is raised for every site not on the canonical
//           (TRUE-BBOX) convention. Every file is COMMENT-STRIPPED before it is
//           searched — prose describing an insert earns nothing (control C3).
//
//   ARM B · EXECUTED MISS (numeric). Builds a concave L-shaped room, derives
//           BOTH conventions from the SAME polygon using the polygon's own
//           signed area and area-centroid — the fixture supplies the POLYGON,
//           never the answer (C74 §3.4) — inserts under the CIRCLE-APPROX
//           convention into a real `SpatialIndex`, and queries a point proven
//           interior by an even-odd test. If the query returns the room, the
//           gate's own premise has failed and it exits 2 MISCONFIGURED rather
//           than publishing a verdict it cannot support.
//
//   ARM C · CONTROLS, executed every run, both directions (C70 §5.6). A
//           comparator never watched going red publishes no verdict. Five
//           controls run in-process before any finding is reported; any control
//           failure exits 2 and is NEVER absorbable as debt. Control C5 is also
//           the L-716 SATISFIABILITY demonstration: it drives the SAME analyser
//           over a synthetic corpus in which every site is canonical and
//           requires 0 findings, so a state in which this gate exits 0
//           demonstrably exists. A gate that can never pass is a defect, not a
//           standard.
//
// ─── The ledger ──────────────────────────────────────────────────────────────
// NAMED and shrink-only (C70 §5.3), pinned at this gate's FIRST HONEST READING
// and checked in BOTH directions: a site converted to the canonical convention
// must LEAVE `room-aabb-canonical-ledger.json` in the commit that converts it,
// or this gate exits 3 STALE (C70 §5.4). Sites are keyed by
// `<relPath>#<ordinal>` — the ordinal of the insert call WITHIN its file — so
// an unrelated edit above the call site does not re-key the debt. Line numbers
// are printed for humans and are never the key.
//
// ─── NOT ENROLLED IN certify.ts ──────────────────────────────────────────────
// `certify.ts` runs an EXPLICIT allowlist (its `gates` array), not directory
// discovery, and this gate is deliberately absent from it: GE-11 is an OPEN
// defect and enrolling a red gate into the certification cover would convert a
// measurement into a broken build. Run it directly:
//     npx tsx tools/rac-conformance/certification/gates/check-room-aabb-canonical.ts
//
// ─── WHAT THIS GATE DOES NOT PROVE — named, never green ──────────────────────
// See the UNPROVEN block printed at the end of every run. In particular it does
// NOT prove that a user ever observes the miss (that is GE-09's subject), and
// it does NOT measure the OTHER direction of the same defect — an OVER-sized
// AABB admits false candidates, which `pointInPolygon` then correctly rejects,
// so it costs time and not correctness and is out of scope here.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor, EXIT_MISCONFIGURED } from '../contract.js';
import { SpatialIndex, type AABB } from '../../../../packages/core-app-model/src/SpatialIndex.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const ROOTS = ['packages', 'apps', 'plugins'];
const LEDGER_PATH = join(HERE, 'room-aabb-canonical-ledger.json');

/** The canonical convention. Everything else is a finding. */
const CANONICAL = 'TRUE-BBOX';

type Convention = 'TRUE-BBOX' | 'CIRCLE-APPROX' | 'UNCLASSIFIED';

interface Site {
  key: string;        // <relPath>#<ordinal-within-file>  — stable under edits above it
  relPath: string;
  line: number;       // for humans only, never the key
  convention: Convention;
  snippet: string;
}

interface Ledger {
  gate: string;
  note: string;
  nonCanonicalSites: { key: string; convention: string; why: string }[];
}

// ── Source scanning ──────────────────────────────────────────────────────────

/**
 * Replace every line comment, block comment and string literal body with spaces
 * of equal length, so line/column arithmetic is preserved and no match can come
 * from prose. Control C3 proves this actually happens.
 */
function stripCommentsAndStrings(src: string): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let j = i; while (j < src.length && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const end = j < 0 ? src.length : j + 2; blank(i, end); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      blank(i + 1, j); i = Math.min(j + 1, src.length); continue;
    }
    i++;
  }
  return out.join('');
}

/** Text between the balanced parentheses opened at `open`. */
function balanced(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return src.slice(open + 1);
}

/**
 * Classify one insert site.
 *
 * `arg` is the full argument text of `roomSpatialIndex.insert(...)`; `before`
 * is the six source lines preceding it, because the radius is conventionally
 * bound one statement above the object literal (`const r2 = Math.sqrt(...)`).
 * Both are already comment-stripped.
 */
export function classify(arg: string, before: string): Convention {
  const window = before + '\n' + arg;
  const hasEqualAreaRadius = /Math\s*\.\s*sqrt\s*\([\s\S]*?Math\s*\.\s*PI/.test(window);
  const mentionsCentroid = /centroid/.test(arg);
  if (hasEqualAreaRadius && mentionsCentroid) return 'CIRCLE-APPROX';
  if (/boundingBox|roomToAABB\s*\(|(^|[^A-Za-z0-9_])bb([^A-Za-z0-9_]|$)/.test(arg)) return CANONICAL;
  return 'UNCLASSIFIED';
}

function walk(dir: string, acc: string[]): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.git' || e === 'build') continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (e.endsWith('.ts') && !e.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

function scanFile(abs: string): Site[] {
  const raw = readFileSync(abs, 'utf8');
  if (!raw.includes('roomSpatialIndex')) return [];
  const src = stripCommentsAndStrings(raw);
  const lines = src.split('\n');
  const relPath = relative(REPO, abs).split(sep).join('/');
  const sites: Site[] = [];
  const re = /roomSpatialIndex\s*\.\s*insert\s*\(/g;
  let m: RegExpExecArray | null;
  let ordinal = 0;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const arg = balanced(src, open);
    const line = src.slice(0, m.index).split('\n').length;
    const before = lines.slice(Math.max(0, line - 7), line - 1).join('\n');
    sites.push({
      key: `${relPath}#${ordinal}`,
      relPath,
      line,
      convention: classify(arg, before),
      snippet: arg.replace(/\s+/g, ' ').trim().slice(0, 96),
    });
    ordinal++;
  }
  return sites;
}

// ── Geometry, derived from the polygon and nothing else ──────────────────────

interface Pt { x: number; z: number }

/** Signed area (shoelace). Positive for CCW in the XZ plane as read here. */
function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].z - poly[i].x * poly[j].z;
  }
  return a / 2;
}

/** Area-weighted centroid of a simple polygon. NOT the vertex mean. */
function areaCentroid(poly: Pt[]): Pt {
  const a = signedArea(poly);
  let cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j].x * poly[i].z - poly[i].x * poly[j].z;
    cx += (poly[j].x + poly[i].x) * cross;
    cz += (poly[j].z + poly[i].z) * cross;
  }
  return { x: cx / (6 * a), z: cz / (6 * a) };
}

/** The TRUE-BBOX convention: the polygon's own extent. */
function trueBbox(poly: Pt[]): AABB {
  return {
    minX: Math.min(...poly.map(p => p.x)),
    minZ: Math.min(...poly.map(p => p.z)),
    maxX: Math.max(...poly.map(p => p.x)),
    maxZ: Math.max(...poly.map(p => p.z)),
  };
}

/**
 * The CIRCLE-APPROX convention, transcribed from the shipped call sites
 * (ReDetectRoomsCommand.ts, DetectAllRoomsCommand.ts, DeleteRoomCommand.ts):
 *     const r2 = Math.sqrt((area ?? 10) / Math.PI);
 *     { minX: centroid.x - r2, minZ: centroid.z - r2,
 *       maxX: centroid.x + r2, maxZ: centroid.z + r2 }
 * ARM A independently verifies those sites still carry this shape, so the
 * transcription cannot go stale silently.
 */
function circleApproxBbox(poly: Pt[]): AABB {
  const area = Math.abs(signedArea(poly));
  const c = areaCentroid(poly);
  const r2 = Math.sqrt(area / Math.PI);
  return { minX: c.x - r2, minZ: c.z - r2, maxX: c.x + r2, maxZ: c.z + r2 };
}

/** Even-odd containment. Local on purpose: this gate must not depend on the
 *  predicate whose duplication GE-02/GE-03 are still collapsing. */
function pointInPolygon(x: number, z: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A concave, non-square room. Legs 6×2 and 2×4 ⇒ area 20 m², extent 6×6.
 * Chosen because equal-AREA and equal-EXTENT diverge here by construction,
 * which is the entire content of the defect.
 */
const L_ROOM: Pt[] = [
  { x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 2 },
  { x: 2, z: 2 }, { x: 2, z: 6 }, { x: 0, z: 6 },
];
/** Interior by the even-odd test (control C4), deep inside the long leg. */
const PROBE: Pt = { x: 5.5, z: 1.0 };

// ── ARM C · controls ─────────────────────────────────────────────────────────

const CIRCLE_FIXTURE = `
    const r2 = Math.sqrt((area ?? 10) / Math.PI);
    roomSpatialIndex.insert(room.id, {
      minX: centroid.x - r2, minZ: centroid.z - r2,
      maxX: centroid.x + r2, maxZ: centroid.z + r2,
    });
`;
const BBOX_FIXTURE = `
    const { boundingBox } = room.computed ?? {};
    roomSpatialIndex.insert(room.id, boundingBox);
`;
const PROSE_FIXTURE = `
    // roomSpatialIndex.insert(room.id, { minX: centroid.x - r2 }) — the old way.
    const s = "roomSpatialIndex.insert(id, circleBox)";
`;

function analyseSource(src: string, relPath: string): Site[] {
  const stripped = stripCommentsAndStrings(src);
  const lines = stripped.split('\n');
  const sites: Site[] = [];
  const re = /roomSpatialIndex\s*\.\s*insert\s*\(/g;
  let m: RegExpExecArray | null; let ordinal = 0;
  while ((m = re.exec(stripped)) !== null) {
    const open = m.index + m[0].length - 1;
    const arg = balanced(stripped, open);
    const line = stripped.slice(0, m.index).split('\n').length;
    const before = lines.slice(Math.max(0, line - 7), line - 1).join('\n');
    sites.push({ key: `${relPath}#${ordinal}`, relPath, line, convention: classify(arg, before), snippet: '' });
    ordinal++;
  }
  return sites;
}

function runControls(): { ok: boolean; lines: string[] } {
  const out: string[] = [];
  let ok = true;
  const check = (name: string, pass: boolean, detail: string) => {
    out.push(`  ${pass ? '✓' : '❌'} ${name} — ${detail}`);
    if (!pass) ok = false;
  };

  // C1 — the classifier NAMES the circle convention (watched GREEN).
  const c1 = analyseSource(CIRCLE_FIXTURE, 'ctl/circle.ts');
  check('C1 positive', c1.length === 1 && c1[0].convention === 'CIRCLE-APPROX',
    `synthetic centroid±sqrt(area/PI) classified ${c1[0]?.convention ?? 'NOT-FOUND'} (want CIRCLE-APPROX)`);

  // C2 — the classifier NAMES the canonical convention (watched GREEN).
  const c2 = analyseSource(BBOX_FIXTURE, 'ctl/bbox.ts');
  check('C2 positive', c2.length === 1 && c2[0].convention === CANONICAL,
    `synthetic computed.boundingBox classified ${c2[0]?.convention ?? 'NOT-FOUND'} (want ${CANONICAL})`);

  // C3 — comment/string stripping. An insert that exists only in prose is
  //      invisible (watched RED by identity: it must find ZERO sites).
  const c3 = analyseSource(PROSE_FIXTURE, 'ctl/prose.ts');
  check('C3 negative', c3.length === 0,
    `an insert written only in a comment and a string yielded ${c3.length} site(s) (want 0)`);

  // C4 — the probe point is interior, and a point in the missing quadrant is
  //      not. Both directions, so the geometry is not asserted from one side.
  const inside = pointInPolygon(PROBE.x, PROBE.z, L_ROOM);
  const outside = pointInPolygon(5.5, 5.0, L_ROOM);
  check('C4 both directions', inside && !outside,
    `pointInPolygon(5.5,1.0)=${inside} (want true) · pointInPolygon(5.5,5.0)=${outside} (want false)`);

  // C5 — SATISFIABILITY (L-716) + watched-go-red by exact identity (C70 §5.6).
  //      The SAME analyser over a corrected corpus must yield 0 non-canonical
  //      sites; planting ONE circle site must yield exactly 1, named. A gate
  //      with no demonstrated passing state is a defect, not a standard.
  const fixed = analyseSource(BBOX_FIXTURE + BBOX_FIXTURE, 'ctl/fixed.ts')
    .filter(s => s.convention !== CANONICAL);
  const planted = analyseSource(BBOX_FIXTURE + CIRCLE_FIXTURE, 'ctl/planted.ts')
    .filter(s => s.convention !== CANONICAL);
  check('C5 satisfiability + go-red',
    fixed.length === 0 && planted.length === 1 && planted[0].key === 'ctl/planted.ts#1',
    `all-canonical corpus → ${fixed.length} finding(s) (want 0, this is the state in which the gate exits 0); ` +
    `one planted circle site → ${planted.length} finding(s) keyed ${planted[0]?.key ?? '—'} (want 1, ctl/planted.ts#1)`);

  return { ok, lines: out };
}

// ── main ─────────────────────────────────────────────────────────────────────

function main(): number {
  const lines: string[] = [];

  // ARM C first: a gate whose comparator is unverified publishes no verdict.
  lines.push('ARM C — CONTROLS (executed this run, both directions · C70 §5.6, L-716):');
  const ctl = runControls();
  lines.push(...ctl.lines);
  if (!ctl.ok) {
    console.log('\n── check-room-aabb-canonical ─────────────────────────────');
    for (const l of lines) console.log('   ' + l);
    console.log('   → [2] MISCONFIGURED — a control failed. The comparator is not trustworthy, so no verdict is published. NEVER absorbable as debt.');
    return EXIT_MISCONFIGURED;
  }
  lines.push('');

  // ARM A — enumeration.
  const files: string[] = [];
  for (const r of ROOTS) { const d = join(REPO, r); if (existsSync(d)) walk(d, files); }
  const sites: Site[] = [];
  for (const f of files) sites.push(...scanFile(f));
  sites.sort((a, b) => a.key.localeCompare(b.key));

  const byConvention = new Map<Convention, Site[]>();
  for (const s of sites) {
    if (!byConvention.has(s.convention)) byConvention.set(s.convention, []);
    byConvention.get(s.convention)!.push(s);
  }
  const conventions = [...byConvention.keys()].sort();

  lines.push(`ARM A — ENUMERATION: ${sites.length} \`roomSpatialIndex.insert(\` call site(s) across ${ROOTS.join('/')}, discovered from source.`);
  lines.push(`  DISTINCT AABB CONVENTIONS FEEDING ONE INDEX: ${conventions.length} — ${conventions.join(' · ')}`);
  for (const s of sites) {
    const mark = s.convention === CANONICAL ? '·' : '⛔';
    lines.push(`  ${mark} ${s.relPath}:${s.line}  [${s.convention}]  ${s.snippet}`);
  }
  lines.push('');

  const findings = sites.filter(s => s.convention !== CANONICAL);

  // ARM B — the executed miss.
  lines.push('ARM B — EXECUTED MISS (real SpatialIndex from @pryzm/core-app-model, geometry derived from the polygon):');
  const truth = trueBbox(L_ROOM);
  const circle = circleApproxBbox(L_ROOM);
  const area = Math.abs(signedArea(L_ROOM));
  const c = areaCentroid(L_ROOM);
  const f = (n: number) => n.toFixed(3);
  lines.push(`  concave L-room, ${L_ROOM.length} vertices · area ${f(area)} m² · area-centroid (${f(c.x)}, ${f(c.z)})`);
  lines.push(`  TRUE-BBOX     x[${f(truth.minX)}, ${f(truth.maxX)}]  z[${f(truth.minZ)}, ${f(truth.maxZ)}]`);
  lines.push(`  CIRCLE-APPROX x[${f(circle.minX)}, ${f(circle.maxX)}]  z[${f(circle.minZ)}, ${f(circle.maxZ)}]  (r = sqrt(area/PI) = ${f(Math.sqrt(area / Math.PI))})`);
  lines.push(`  the two conventions disagree by ${f(truth.maxX - circle.maxX)} m on maxX alone — equal AREA does not imply equal EXTENT.`);

  const idxCircle = new SpatialIndex(5);
  idxCircle.insert('L-room', circle);
  const hitCircle = idxCircle.query([PROBE.x, PROBE.z]);

  const idxTrue = new SpatialIndex(5);
  idxTrue.insert('L-room', truth);
  const hitTrue = idxTrue.query([PROBE.x, PROBE.z]);

  const interior = pointInPolygon(PROBE.x, PROBE.z, L_ROOM);
  lines.push(`  probe (${PROBE.x}, ${PROBE.z}) is INTERIOR to the room by even-odd test: ${interior}`);
  lines.push(`  roomSpatialIndex.query(probe) under CIRCLE-APPROX → [${hitCircle.join(', ') || '(empty)'}]`);
  lines.push(`  roomSpatialIndex.query(probe) under TRUE-BBOX     → [${hitTrue.join(', ') || '(empty)'}]`);

  const missReproduced = interior && hitCircle.length === 0 && hitTrue.length === 1;
  if (!missReproduced) {
    lines.push('  ❌ the miss did NOT reproduce — this gate\'s own premise failed, so it publishes no verdict.');
    console.log('\n── check-room-aabb-canonical ─────────────────────────────');
    for (const l of lines) console.log('   ' + l);
    console.log('   → [2] MISCONFIGURED — ARM B could not establish the defect it exists to measure. NEVER absorbable as debt.');
    return EXIT_MISCONFIGURED;
  }
  lines.push('  ⛔ MISS REPRODUCED. `RoomStore.getRoomsContainingPoint` filters candidates through this');
  lines.push('     index BEFORE `pointInPolygon` runs, so a room dropped here is a silent false negative');
  lines.push('     at a shipped public method — GE-11 is a live correctness bug, measured, not inferred.');
  lines.push('');

  // Ledger, both directions.
  let ledger: Ledger | null = null;
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger; } catch { ledger = null; }
  const declaredKeys = new Set((ledger?.nonCanonicalSites ?? []).map(r => r.key));
  const measuredKeys = new Set(findings.map(f2 => f2.key));
  const stale: string[] = [];

  lines.push(`FINDINGS: ${findings.length} non-canonical site(s) against a NAMED ledger of ${ledger?.nonCanonicalSites.length ?? 0}.`);
  for (const fd of findings) {
    lines.push(`  ${declaredKeys.has(fd.key) ? '·' : '⛔ UNLEDGERED'} ${fd.key}  (${fd.relPath}:${fd.line})  ${fd.convention}`);
  }
  for (const r of ledger?.nonCanonicalSites ?? []) {
    if (!measuredKeys.has(r.key)) {
      stale.push(r.key);
      lines.push(`  ⚠ STALE LEDGER ROW: "${r.key}" is declared non-canonical but is no longer measured that way — strike it in the commit that converts it (C70 §5.4).`);
    }
  }
  lines.push('');
  lines.push('UNPROVEN — named, never green:');
  lines.push('  ◌ That a USER ever observes the miss is NOT measured here. A silent false negative and a surfaced refusal are different failures; the second is GE-09.');
  lines.push('  ◌ The OVER-sized direction is out of scope: an AABB larger than the footprint admits false candidates which `pointInPolygon` then rejects — a cost, not a correctness defect.');
  lines.push('  ◌ ARM A is name-shaped. An insert reaching this index through an alias or a wrapper that is not spelled `roomSpatialIndex.insert(` is invisible to it.');
  lines.push('  ◌ ARM B proves the miss for ONE concave footprint. It does not bound how many real project rooms are affected — that needs a corpus, which this repository does not have.');

  const floors: Floor[] = [
    { what: 'roomSpatialIndex.insert call sites discovered', measured: sites.length, min: 4 },
    { what: 'source files scanned', measured: files.length, min: 500 },
  ];

  return reportGate({
    gate: 'check-room-aabb-canonical (C73 §1/§3 · GE-11)',
    floors,
    lines,
    findings: findings.length,
    declared: ledger?.nonCanonicalSites.length ?? 0,
    findingNames: findings.map(fd => fd.key),
    stale,
  });
}

process.exit(main());
