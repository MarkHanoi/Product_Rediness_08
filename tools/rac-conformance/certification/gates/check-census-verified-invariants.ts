// ─── GATE · check-census-verified-invariants ─────────────────────────────────
//
// C73 §0.2/§3 (GE-04) · C70 §3 (GE-10) · C74 §3.8 (CO-05) · C74 §2.2 (CO-07) ·
// C70 G-INV-3 (CO-10) · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Five more rows of the BIM 3.0 register carry a deciding instrument that reads,
// in full: *"source census"*, *"source re-measure"*, *"`SplitWall.ts` + the verb
// register"*. `bim30-status` prints every one of them as
//
//   CARRIED — declared CLOSED — instrument is not a runnable gate: source census
//
// which is the honest reading: the status was earned once, by a human, at a SHA
// nobody can replay, and NOTHING has defended it since. Four of the five carry
// **NOT DETERMINED** in their own reading cell — the register is already saying
// out loud that it does not know.
//
// This is the sibling of `check-source-verified-invariants` (SV1–SV5, GR-15 ·
// PR-05/06/07/13) and deliberately copies its shape rather than inventing a new
// one: a census is not weak because it counts source, it is weak because it
// happened ONCE. Counting is the point — C73 §0.3 records the polygon-offset
// lesson verbatim: *"A correctness gate on the surviving implementation cannot
// catch this class of defect; only a gate on the NUMBER OF THEM can."*
//
// ─── THE FIVE ARMS ───────────────────────────────────────────────────────────
//  CV1 · GE-04 — the three duplicate families C73 §0.2 names by path must each
//        resolve to ONE production authority: `WallIntersectionResolver` ×3,
//        `FloorPlanDiagnostics` ×2, `RoomStore` ×2.
//        ⚠ The AXIS differs per family and getting it wrong makes the arm lie in
//        both directions. `WallIntersectionResolver` and `FloorPlanDiagnostics`
//        are modules of free functions — no class is declared in either, so a
//        class census would read 0/0 and pass over three live copies. Their axis
//        is the FILE. `RoomStore` is a CLASS name, and the repo's actual fix
//        (packages/stores/src/RoomStore.ts) RENAMED the class to
//        `AggregateRoomStore` and kept the filename, with the rename's rationale
//        written into the file's header and the collapse-or-keep question sent to
//        an ADR (C73 §3.7). A filename census would therefore read 2 and fire on
//        a paid defect forever. Its axis is the DECLARED CLASS.
//        The kept-name file is a NAMED, ON-THE-RECORD exclusion — C73 §0.3's
//        recipe step 3 — and the exclusion is CONDITIONAL: it holds only while
//        that file declares no `class RoomStore`. Re-introduce the canonical name
//        there and the arm fires. Control C1c drives exactly that.
//  CV2 · GE-10 — `wall.split` must be a REAL verb id, which is three facts, not
//        one: a handler declares `readonly type = 'wall.split'`, the plugin's
//        declared type list contains the id, and the registry CONSTRUCTS the
//        handler. A verb id present in the list with no handler is the very
//        defect GE-06 names about `clash-run`, one row up the same table.
//  CV3 · CO-05 — `createWorkerHandler` reached its DELETE terminal state. The arm
//        is a hard 0 over production source: a scaffold with no callers must not
//        come back, and "10 hits, all definition/barrel/doc/test" is how it read
//        the day it was named. Tests are counted and PRINTED, never failed on.
//  CV4 · CO-07 — `StairValidationAuthority` must resolve to EXACTLY ONE
//        production declaration AND have at least one production importer that
//        is neither the defining file nor a bare `export *` barrel. One authority
//        with zero importers is the same defect as two authorities: the row's own
//        words are *"the copy with zero production importers can drift from
//        shipped behaviour with a green suite"*.
//  CV5 · CO-10 — `provideLiveGraphSources` must have ≥1 PRODUCTION call site
//        outside its defining file. The row's claim is that `violates` +
//        `constraintAdapter` are DEV-ONLY reachable; this is the census that says
//        whether the live-source provider is wired from a production path or only
//        from a dev tool. ⚠ The call is NOT dot-prefixed (it is a bare imported
//        function), so `check-source-verified-invariants`'s SV5 detector — which
//        requires a leading `.` — is structurally blind to it. Blind by design is
//        still blind.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH (stated, never inferred) ──────────
// Every arm is STATIC. None executes a command, drives a gesture or reads a live
// store. Concretely:
//   • CV1 counts AUTHORITIES, not behaviour. Two rival implementations inside one
//     file pass it, exactly as SV4 declares about itself.
//   • CV2 proves the id is minted and the handler constructed. It does NOT prove
//     the bus route is reached at runtime, nor that split and cut agree — the
//     cited suite `plugins/wall/__tests__/wallSplitId.test.ts` owns that, and
//     this gate does not run it.
//   • CV3 proves the SYMBOL is absent. A differently-named worker scaffold with
//     no callers is invisible to it.
//   • CV4 counts IMPORTERS. An importer behind a dead guard counts as present —
//     the same blindness `check-graph-write-coverage` declares about writers.
//   • CV5 counts CALL SITES. It does NOT prove the provider is called before the
//     reader needs it, nor that the sources it hands over are non-empty.
//
// ─── EXECUTED CONTROLS, BOTH DIRECTIONS, EVERY RUN (C70 §5.6) ────────────────
// A control that cannot fail is not a control, and an arm never watched failing
// is UNPROVEN. `selfTest()` drives every detector over synthetic sources: the
// planted DEFECT — spelled as this corpus actually spelled it — must be detected,
// and the planted FIX must not be. A failing control exits 2 (MISCONFIGURED),
// never 0: a blind comparator does not publish a verdict.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';
import { collectSources, type SourceFile } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');

const GATE = 'check-census-verified-invariants';

const SCAN_ROOTS = ['apps', 'packages', 'plugins', 'src', 'server'];

/**
 * §R5 subject floor. The whole gate is a set of counts over a walked tree, and
 * three of the five arms assert a count of ZERO or ONE — the exact readings an
 * unwalked tree also produces. Below this the run has measured nothing and exits
 * 2, never 0.
 */
const MIN_SCANNED_FILES = 1500;

const SPLIT_HANDLER = 'plugins/wall/src/handlers/SplitWall.ts';
const WALL_REGISTRY = 'plugins/wall/src/handlers/index.ts';
const STAIR_AUTHORITY = 'packages/geometry-stair/src/StairValidationAuthority.ts';
const LIVE_SOURCES_DEF = 'apps/editor/src/engine/buildBuildingGraph.ts';

/* ─────────────────────────── shared primitives ─────────────────────────── */

/**
 * Remove `//` and block comments. Deliberately simple and deliberately NOT
 * string-aware — same rationale as `check-source-verified-invariants`
 * (§FIX-GATE-NEEDS-RIPGREP: a gate that needs a parser CI never installed is a
 * gate that does not run). Block comments are BLANKED rather than deleted so
 * line numbers survive; a finding pointing at the wrong line is a finding a
 * reader cannot check.
 *
 * This is not a nicety for CV1 and CV3: `packages/stores/src/RoomStore.ts`
 * documents its own rename in a header that says the words `RoomStore` and
 * `class` within four lines of each other, and the C74 §3.8 write-up quotes
 * `createWorkerHandler` verbatim. A raw-text arm would be red forever.
 */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* ─────────────────────────── CV1 · GE-04 ─────────────────────────── */

/**
 * The census axis, per family. See the header: choosing this wrong makes the arm
 * silently vacuous (class axis over a class-free module) or permanently red
 * (file axis over a deliberately kept filename).
 */
interface Family {
  /** the name C73 §0.2 uses */
  name: string;
  axis: 'file' | 'class';
  /**
   * Paths excluded from the count, each with the reason on the record. An
   * exclusion is CONDITIONAL: `stillExcluded` re-decides it every run, so a
   * regression inside an excluded file is caught rather than granted amnesty.
   */
  exclusions: { rel: string; why: string; stillExcluded: (src: string) => boolean }[];
}

const FAMILIES: Family[] = [
  {
    // Was ×3: packages/ai-host/src/, packages/core-app-model/src/ai/,
    // packages/room-topology/src/ — two of the three byte-identical (C73 §0.2).
    name: 'WallIntersectionResolver',
    axis: 'file',
    exclusions: [],
  },
  {
    // Was ×2: packages/ai-host/src/, packages/core-app-model/src/ai/ (C73 §0.2).
    name: 'FloorPlanDiagnostics',
    axis: 'file',
    exclusions: [],
  },
  {
    // Was ×2 by FILE and ×3 by CLASS. The surviving second file keeps the
    // filename on purpose and declares `AggregateRoomStore`; whether the C20
    // aggregate concept collapses onto RoomData is an ADR-sized decision the
    // file's header refuses to take silently (C73 §3.7).
    name: 'RoomStore',
    axis: 'class',
    exclusions: [],
  },
];

export interface Cv1Reading {
  /** family → the production paths that count as an authority */
  authorities: Record<string, string[]>;
  /** family → paths that matched the filename but declared no canonical class */
  namedExclusions: Record<string, string[]>;
}

export function cv1(files: readonly { rel: string; text: string }[]): Cv1Reading {
  const authorities: Record<string, string[]> = {};
  const namedExclusions: Record<string, string[]> = {};

  for (const fam of FAMILIES) {
    const byName = files.filter((f) => basename(f.rel) === `${fam.name}.ts`);
    if (fam.axis === 'file') {
      authorities[fam.name] = byName.map((f) => f.rel);
      namedExclusions[fam.name] = [];
      continue;
    }
    // CLASS axis — a file counts only while it declares the canonical class.
    // Searched repo-wide, not only among same-named files: a third
    // `class RoomStore` inside SomeOtherFile.ts is precisely the shape C73 §0.2
    // measured, and a filename-scoped search would miss it.
    const decl = new RegExp(`\\bclass\\s+${fam.name}\\b`);
    authorities[fam.name] = files.filter((f) => decl.test(stripComments(f.text))).map((f) => f.rel);
    namedExclusions[fam.name] = byName
      .filter((f) => !decl.test(stripComments(f.text)))
      .map((f) => f.rel);
  }
  return { authorities, namedExclusions };
}

/* ─────────────────────────── CV2 · GE-10 ─────────────────────────── */

export interface Cv2Reading {
  declaredByHandler: boolean;
  inTypeList: boolean;
  constructed: boolean;
  handlerClass: string | null;
}

/**
 * Three facts, because any one alone is satisfiable by a stub: the id is
 * DECLARED by a handler class, LISTED by the plugin's type register, and the
 * handler is CONSTRUCTED into the registry's handler set.
 */
export function cv2(handlerSrc: string, registrySrc: string, verb: string): Cv2Reading {
  const h = stripComments(handlerSrc);
  const r = stripComments(registrySrc);
  const cls = h.match(/export\s+class\s+([A-Za-z_$][\w$]*)/)?.[1] ?? null;
  const idLiteral = new RegExp(`['"]${verb.replace('.', '\\.')}['"]`);
  return {
    declaredByHandler: new RegExp(`\\btype\\s*=\\s*['"]${verb.replace('.', '\\.')}['"]`).test(h),
    inTypeList: idLiteral.test(r),
    constructed: cls ? new RegExp(`\\bnew\\s+${cls}\\s*\\(`).test(r) : false,
    handlerClass: cls,
  };
}

/* ─────────────────────────── CV3 · CO-05 ─────────────────────────── */

export interface Cv3Reading { production: string[]; tests: string[] }

/** Any surviving mention of the deleted scaffold, in code (not in prose). */
export function cv3(files: readonly { rel: string; text: string; isTest?: boolean }[], symbol: string): Cv3Reading {
  const production: string[] = [];
  const tests: string[] = [];
  const re = new RegExp(`\\b${symbol}\\b`);
  for (const f of files) {
    const src = stripComments(f.text);
    for (const [i, line] of src.split('\n').entries()) {
      if (!re.test(line)) continue;
      (f.isTest ? tests : production).push(`${f.rel}:${i + 1}`);
    }
  }
  return { production, tests };
}

/* ─────────────────────────── CV4 · CO-07 ─────────────────────────── */

export interface Cv4Reading { declarations: string[]; importers: string[]; barrels: string[] }

/**
 * Declarations of the authority class, and the production files that IMPORT it.
 * A bare `export * from './X'` barrel is recorded separately: re-exporting a
 * symbol is not consuming it, and counting a barrel as an importer is how
 * "exported with zero consumers" passes a census.
 */
export function cv4(files: readonly { rel: string; text: string; isTest?: boolean }[], symbol: string): Cv4Reading {
  const declarations: string[] = [];
  const importers: string[] = [];
  const barrels: string[] = [];
  const declRe = new RegExp(`\\bclass\\s+${symbol}\\b`);
  const useRe = new RegExp(`\\b${symbol}\\b`);
  for (const f of files) {
    if (f.isTest) continue;
    const src = stripComments(f.text);
    if (declRe.test(src)) { declarations.push(f.rel); continue; }
    if (!useRe.test(src)) continue;
    // Both re-export spellings are BARRELS, and both name the symbol here:
    // `export { X } from './X'` names it directly, and `export * from './X'`
    // names it in the module SPECIFIER because the file is named after the class.
    // Missing the second spelling is not academic — it is the live shape at
    // packages/geometry-stair/src/index.ts, and crediting it would let CV4 read
    // "1 importer" over a subject with none. Control C4d drives it.
    const nonBarrel = src
      .split('\n')
      .filter((l) => useRe.test(l))
      .some((l) => !/^\s*export\s*(\*|\{[^}]*\})\s*(as\s+\w+\s*)?from/.test(l));
    (nonBarrel ? importers : barrels).push(f.rel);
  }
  return { declarations, importers, barrels };
}

/* ─────────────────────────── CV5 · CO-10 ─────────────────────────── */

export interface Cv5Reading { definitions: string[]; callSites: string[]; testCallSites: string[] }

/**
 * CALL sites of a BARE (non-dot-prefixed) exported function. A definition is
 * excluded by its `function` keyword; an import specifier carries no `(`.
 */
export function cv5(files: readonly { rel: string; text: string; isTest?: boolean }[], symbol: string): Cv5Reading {
  const definitions: string[] = [];
  const callSites: string[] = [];
  const testCallSites: string[] = [];
  const callRe = new RegExp(`(^|[^\\w$.])${symbol}\\s*\\(`);
  const defRe = new RegExp(`\\bfunction\\s+${symbol}\\s*\\(`);
  for (const f of files) {
    const src = stripComments(f.text);
    for (const [i, line] of src.split('\n').entries()) {
      if (defRe.test(line)) { definitions.push(`${f.rel}:${i + 1}`); continue; }
      if (!callRe.test(line)) continue;
      (f.isTest ? testCallSites : callSites).push(`${f.rel}:${i + 1}`);
    }
  }
  return { definitions, callSites, testCallSites };
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

const f = (rel: string, text: string) => ({ rel, text });

function selfTest(): Control[] {
  const c: Control[] = [];

  /* CV1 — the file axis, the class axis, and the conditional exclusion. */
  c.push({
    id: 'C1a', what: 'CV1 counts THREE WallIntersectionResolver files on the FILE axis (the defect as C73 §0.2 measured it)',
    pass: cv1([
      f('packages/ai-host/src/WallIntersectionResolver.ts', 'export function resolveWallJunctions() {}'),
      f('packages/core-app-model/src/ai/WallIntersectionResolver.ts', 'export function resolveWallJunctions() {}'),
      f('packages/room-topology/src/WallIntersectionResolver.ts', 'export function resolveWallJunctions() {}'),
    ]).authorities.WallIntersectionResolver.length === 3,
  });
  c.push({
    id: 'C1b', what: 'CV1 does NOT count a same-named file as a RoomStore authority when it declares only the renamed class',
    pass: (() => {
      const r = cv1([
        f('packages/room-topology/src/RoomStore.ts', 'export class RoomStore {}'),
        f('packages/stores/src/RoomStore.ts', 'export class AggregateRoomStore {}\nexport { AggregateRoomStore as RoomStore };'),
      ]);
      return r.authorities.RoomStore.length === 1 && r.namedExclusions.RoomStore.length === 1;
    })(),
  });
  c.push({
    id: 'C1c', what: 'CV1 REVOKES the named exclusion the moment the excluded file re-declares `class RoomStore` (an exclusion that cannot be revoked is amnesty, not an exclusion)',
    pass: cv1([
      f('packages/room-topology/src/RoomStore.ts', 'export class RoomStore {}'),
      f('packages/stores/src/RoomStore.ts', 'export class RoomStore {}'),
    ]).authorities.RoomStore.length === 2,
  });
  c.push({
    id: 'C1d', what: 'CV1 finds a class-axis authority hiding under an unrelated FILENAME (a filename-scoped search would miss it)',
    pass: cv1([
      f('packages/room-topology/src/RoomStore.ts', 'export class RoomStore {}'),
      f('packages/legacy/src/SomeOtherFile.ts', 'class RoomStore {}'),
    ]).authorities.RoomStore.length === 2,
  });
  c.push({
    id: 'C1e', what: 'CV1 ignores a class name that survives only inside a comment — the live subject documents its own rename verbatim',
    pass: cv1([
      f('packages/stores/src/RoomStore.ts', '// was: class RoomStore, renamed 2026-08\nexport class AggregateRoomStore {}'),
    ]).authorities.RoomStore.length === 0,
  });

  /* CV2 — each of the three facts must be independently losable. */
  c.push({
    id: 'C2a', what: 'CV2 reads a fully minted verb (declared · listed · constructed)',
    pass: (() => {
      const r = cv2(
        `export class SplitWallHandler { readonly type = 'wall.split'; }`,
        `const TYPES = ['wall.cut', 'wall.split'];\nconst set = [new SplitWallHandler()];`,
        'wall.split',
      );
      return r.declaredByHandler && r.inTypeList && r.constructed;
    })(),
  });
  c.push({
    id: 'C2b', what: 'CV2 detects the GE-06 shape — an id in the type list with NO handler constructed',
    pass: (() => {
      const r = cv2(`export class SplitWallHandler { readonly type = 'wall.cut'; }`,
        `const TYPES = ['wall.split'];\nconst set = [new CutWallHandler()];`, 'wall.split');
      return r.inTypeList && !r.declaredByHandler && !r.constructed;
    })(),
  });
  c.push({
    id: 'C2c', what: 'CV2 detects a handler that declares the id but is never listed',
    pass: !cv2(`export class SplitWallHandler { readonly type = 'wall.split'; }`,
      `const TYPES = ['wall.cut'];\nconst set = [new SplitWallHandler()];`, 'wall.split').inTypeList,
  });

  /* CV3 — the deleted scaffold, and the prose that quotes it. */
  c.push({
    id: 'C3a', what: 'CV3 detects a re-introduced createWorkerHandler in production code',
    pass: cv3([f('packages/constraint-solver/src/worker.ts', 'export function createWorkerHandler() {}')], 'createWorkerHandler').production.length === 1,
  });
  c.push({
    id: 'C3b', what: 'CV3 ignores the symbol quoted in a comment — C74 §3.8 names it verbatim',
    pass: cv3([f('x.ts', '// CO-05: createWorkerHandler had zero production callers\nexport const y = 1;')], 'createWorkerHandler').production.length === 0,
  });
  c.push({
    id: 'C3c', what: 'CV3 files a TEST mention separately and never as a production finding',
    pass: (() => {
      const r = cv3([{ rel: 'a.test.ts', text: 'createWorkerHandler();', isTest: true }], 'createWorkerHandler');
      return r.production.length === 0 && r.tests.length === 1;
    })(),
  });

  /* CV4 — two authorities, and a barrel masquerading as a consumer. */
  c.push({
    id: 'C4a', what: 'CV4 detects TWO StairValidationAuthority declarations (the defect as CO-07 names it)',
    pass: cv4([
      f('packages/geometry-stair/src/StairValidationAuthority.ts', 'export class StairValidationAuthority {}'),
      f('src/elements/stairs/StairValidationAuthority.ts', 'export class StairValidationAuthority {}'),
    ], 'StairValidationAuthority').declarations.length === 2,
  });
  c.push({
    id: 'C4b', what: 'CV4 does not credit a bare re-export barrel as an importer — re-exporting is not consuming',
    pass: (() => {
      const r = cv4([
        f('packages/geometry-stair/src/StairValidationAuthority.ts', 'export class StairValidationAuthority {}'),
        f('packages/geometry-stair/src/index.ts', `export { StairValidationAuthority } from './StairValidationAuthority';`),
      ], 'StairValidationAuthority');
      return r.importers.length === 0 && r.barrels.length === 1;
    })(),
  });
  c.push({
    id: 'C4d', what: 'CV4 does not credit an `export * from` barrel either — the live geometry-stair index.ts is exactly that shape',
    pass: (() => {
      const r = cv4([
        f('packages/geometry-stair/src/StairValidationAuthority.ts', 'export class StairValidationAuthority {}'),
        f('packages/geometry-stair/src/index.ts', `export * from './StairValidationAuthority';`),
      ], 'StairValidationAuthority');
      return r.importers.length === 0 && r.barrels.length === 1;
    })(),
  });
  c.push({
    id: 'C4c', what: 'CV4 credits a real production importer that CALLS the authority',
    pass: cv4([
      f('packages/geometry-stair/src/StairValidationAuthority.ts', 'export class StairValidationAuthority {}'),
      f('packages/command-registry/src/stair/ValidateStairCommand.ts', `import { StairValidationAuthority } from '@pryzm/geometry-stair';\nStairValidationAuthority.validate(s);`),
    ], 'StairValidationAuthority').importers.length === 1,
  });

  /* CV5 — the bare-call detector SV5 is structurally blind to. */
  c.push({
    id: 'C5a', what: 'CV5 counts a BARE production call site (no leading dot — SV5’s dot-prefixed detector reads this as zero)',
    pass: cv5([
      f('apps/editor/src/engine/buildBuildingGraph.ts', 'export function provideLiveGraphSources(s) {}'),
      f('apps/editor/src/ui/layout/installLiveGraphWiring.ts', 'provideLiveGraphSources({ semantic: sgm, constraint: ai });'),
    ], 'provideLiveGraphSources').callSites.length === 1,
  });
  c.push({
    id: 'C5b', what: 'CV5 does not mistake the DEFINITION for a call site',
    pass: cv5([f('a.ts', 'export function provideLiveGraphSources(s) {}')], 'provideLiveGraphSources').callSites.length === 0,
  });
  c.push({
    id: 'C5c', what: 'CV5 does not mistake an import specifier for a call site',
    pass: cv5([f('a.ts', `import {\n  provideLiveGraphSources,\n} from './g';`)], 'provideLiveGraphSources').callSites.length === 0,
  });
  c.push({
    id: 'C5d', what: 'CV5 files a TEST call separately — a dev-only caller is the defect CO-10 names, not its refutation',
    pass: (() => {
      const r = cv5([{ rel: 'a.test.ts', text: 'provideLiveGraphSources({});', isTest: true }], 'provideLiveGraphSources');
      return r.callSites.length === 0 && r.testCallSites.length === 1;
    })(),
  });

  return c;
}

/* ─────────────────────────── main ─────────────────────────── */

function readSubject(rel: string): string | null {
  const p = resolve(REPO, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const prod: SourceFile[] = collectSources(REPO, SCAN_ROOTS);
  const all = collectSources(REPO, SCAN_ROOTS, { includeTests: true });
  const prodRels = new Set(prod.map((x) => x.rel));
  const tagged = all.map((x) => ({ rel: x.rel, text: x.text, isTest: !prodRels.has(x.rel) }));

  const r1 = cv1(prod);
  const splitSrc = readSubject(SPLIT_HANDLER);
  const registrySrc = readSubject(WALL_REGISTRY);
  const r2 = splitSrc && registrySrc
    ? cv2(splitSrc, registrySrc, 'wall.split')
    : { declaredByHandler: false, inTypeList: false, constructed: false, handlerClass: null };
  const r3 = cv3(tagged, 'createWorkerHandler');
  const r4 = cv4(tagged, 'StairValidationAuthority');
  const r5 = cv5(tagged, 'provideLiveGraphSources');

  const findings: string[] = [];

  for (const fam of FAMILIES) {
    const hits = r1.authorities[fam.name];
    if (hits.length > 1) {
      findings.push(
        `CV1(GE-04) ${fam.name} has ${hits.length} production authorities on the ${fam.axis.toUpperCase()} axis: ${hits.join(' · ')} — C73 §0.3: only a gate on the NUMBER of them catches this class`,
      );
    }
  }
  if (!r2.declaredByHandler) findings.push(`CV2(GE-10) no handler in ${SPLIT_HANDLER} declares \`type = 'wall.split'\``);
  if (!r2.inTypeList) findings.push(`CV2(GE-10) 'wall.split' is absent from the declared type list in ${WALL_REGISTRY}`);
  if (!r2.constructed) findings.push(`CV2(GE-10) ${r2.handlerClass ?? 'the split handler'} is never CONSTRUCTED in ${WALL_REGISTRY} — a listed id with no handler is GE-06's defect, not a minted verb`);
  if (r3.production.length > 0) findings.push(`CV3(CO-05) createWorkerHandler is back in production source at ${r3.production.slice(0, 4).join(' · ')} — its terminal state was DELETE`);
  if (r4.declarations.length > 1) findings.push(`CV4(CO-07) StairValidationAuthority has ${r4.declarations.length} production declarations: ${r4.declarations.join(' · ')}`);
  if (r4.declarations.length >= 1 && r4.importers.length === 0) findings.push(`CV4(CO-07) StairValidationAuthority has ZERO production importers (${r4.barrels.length} barrel re-export(s) do not count) — an authority nothing imports drifts from shipped behaviour with a green suite`);
  if (r5.callSites.length === 0) findings.push(`CV5(CO-10) provideLiveGraphSources has ZERO production call sites${r5.testCallSites.length ? ` (${r5.testCallSites.length} test-only)` : ''} — the live graph sources are dev-only reachable, which is exactly C70 G-INV-3's complaint`);

  const lines: string[] = [
    `CV1 · GE-04  ${FAMILIES.map((x) => `${x.name}[${x.axis}]=${r1.authorities[x.name].length}`).join(' · ')}`,
    ...FAMILIES.flatMap((x) => [
      `             ${x.name}: ${r1.authorities[x.name].join(' · ') || 'NONE'}`,
      ...(r1.namedExclusions[x.name].length
        ? [`             ${x.name} named exclusion(s), re-decided this run: ${r1.namedExclusions[x.name].join(' · ')} — same filename, canonical class NOT declared`]
        : []),
    ]),
    `CV2 · GE-10  wall.split — handler declares ${r2.declaredByHandler ? 'YES' : 'NO'} · listed ${r2.inTypeList ? 'YES' : 'NO'} · constructed ${r2.constructed ? 'YES' : 'NO'} (class ${r2.handlerClass ?? 'NOT FOUND'})`,
    `CV3 · CO-05  createWorkerHandler production ${r3.production.length} · test ${r3.tests.length} (tests printed, never failed on)`,
    `CV4 · CO-07  StairValidationAuthority declarations ${r4.declarations.length} · production importers ${r4.importers.length} [${r4.importers.join(', ') || 'none'}] · barrels ${r4.barrels.length}`,
    `CV5 · CO-10  provideLiveGraphSources definitions ${r5.definitions.length} · production call sites ${r5.callSites.length} [${r5.callSites.join(', ') || 'none'}] · test-only ${r5.testCallSites.length}`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED BY THIS GATE, and never to be cited for it: runtime reachability of any',
    'call site counted here · whether wall.split and wall.cut AGREE (plugins/wall/__tests__/',
    'wallSplitId.test.ts owns that and this gate does not run it) · two rival implementations',
    'inside ONE file · an importer or caller sitting behind a dead guard · whether the live',
    'graph sources handed over by provideLiveGraphSources are non-empty.',
  ];

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'production sources scanned (MIN_SCANNED_FILES)', measured: prod.length, min: MIN_SCANNED_FILES },
    { what: 'sources scanned including tests', measured: all.length, min: MIN_SCANNED_FILES },
    // Each CV1 family must be LOCATED. A family that has vanished entirely reads
    // "0 authorities" — indistinguishable from "one authority", and a pass over a
    // renamed-away subject is the empty-seed lie.
    { what: 'GE-04 families located (of 3)', measured: FAMILIES.filter((x) => r1.authorities[x.name].length >= 1).length, min: 3 },
    { what: 'wall.split subject files located (of 2)', measured: [splitSrc, registrySrc].filter(Boolean).length, min: 2 },
    { what: 'StairValidationAuthority declarations located', measured: r4.declarations.length, min: 1 },
    { what: 'provideLiveGraphSources definitions located', measured: r5.definitions.length, min: 1 },
    // CO-05 asserts a ZERO. Without an independent witness that the walk reached
    // the tree the scaffold lived in, "0 hits" and "0 files" are the same value.
    { what: 'constraint-solver sources reached (witness for the CO-05 zero)', measured: prod.filter((x) => x.rel.startsWith('packages/constraint-solver/')).length, min: 1 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
