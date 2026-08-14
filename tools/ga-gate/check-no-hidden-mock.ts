#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-no-hidden-mock.ts
 *
 * C74 §3.2/§3.4/§3.5 · §6 · BIM30-READINESS-GATES §3.14 — **generalised beyond
 * solvers: every stand-in is detectable from OUTSIDE its module.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * The "FreeCAD-grade constraint solver" was a `MockSolver` behind a
 * `kind = 'planegcs'` label for months, with 31 of 33 tests passing — against
 * the mock, injected through a field whose own docstring says production must
 * never pass it (C74 §0). Nothing about that defect is solver-specific: a
 * stand-in wearing a production identity, a scaffold whose retirement nobody
 * tracks, and a test suite bound to the injected double are one mechanism in
 * three costumes, and each is invisible unless it is detectable from outside
 * the module that defines it.
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  M-A *(the PlanegcsAdapter shape — positive control, red until CO-01)*
 *      a class whose `kind` names an engine (non-neutral identity) while a
 *      member is assigned `new *Mock*|*Stub*|*Fake*(…)` — the class's declared
 *      identity and its performed work disagree, and no caller inspecting
 *      `kind` can tell (C74 §3.1/§3.2). A class declaring an HONESTLY neutral
 *      kind ('mock', 'stub', …) is the CORRECT behaviour this gate protects
 *      and is reported present-and-declared, never as a finding.
 *  M-B *(the dated-scaffold rule, C74 §3.4)*  a scaffold marker in a file's
 *      HEADER comment block (`SCAFFOLD` / `TODO(TASK-` / `lands at S<n>`) with
 *      no owner, no date, and no retiring assertion. Tolerance, restated
 *      (§CO-06-GRACE-FIX 2026-08-14): a fresh date buys NOTHING by itself.
 *      The pre-fix rule tolerated a bare YYYY-MM-DD younger than GRACE_DAYS
 *      with none of the rest — so a bulk re-stamp of every header would have
 *      walked the whole M-B ledger to zero having declared nothing, and one
 *      header in the estate had already reached compliance on a FUTURE stamp
 *      alone (plugins/ai-generative/src/descriptor.ts, reviewBy 2026-09-12,
 *      matched by DATE_RE and inside "grace" for as long as the deadline lay
 *      ahead). Now: inside grace a header must still name its OWNER and put
 *      in writing WHAT IS FAKE (FAKE_DECL_RE) — only the executable retiring
 *      assertion may lag, and only until the stamp is GRACE_DAYS old. A
 *      future-dated stamp opens no grace: it is a deadline, not a decision
 *      record. Outside grace, always: date + owner + retirement reference.
 *      An UNDATED marker, or a dated one past grace with no retirement
 *      reference, is a finding — *a scaffold whose retirement date is
 *      untracked is permanent architecture that nobody chose*. Scope, stated: the HEADER
 *      block only. The estate carries 800+ inline `TODO(TASK-…)` lines; an
 *      inline task note on line 412 is a work marker, not a module standing in
 *      for production, and sweeping them in would bury the 59 real scaffold
 *      headers under noise (§FIX-ZONING-GATE-MISSLICE: an over-eager matcher
 *      gets a suffix list bolted on later to silence it).
 *  M-C *(the `opts.underlying` shape, C74 §3.5)*  a test that injects a field
 *      whose own docstring forbids production use ("Production callers MUST
 *      NOT pass/set/supply…"). Such a test covers the one configuration
 *      production never uses, and the configuration production DOES use (the
 *      `??` fallback) is the untested one. Counted AND named, per injection
 *      site. Exclusions are named in the output, never silent — the
 *      false-positive surface here is fields whose docstring forbids CALLING
 *      rather than PASSING (e.g. FrameCoordinator's "Production code MUST NOT
 *      call this"), which are excluded by requiring an injection verb.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ────────────────────
 * `selfTest()` materialises two synthetic workspaces:
 *   • PLANTED — a `FakeXStore` wired behind a production class whose kind
 *     names an engine, with no external signal (M-A must name it); an undated
 *     scaffold header (M-B); a field docstring-forbidden to production,
 *     injected by a test (M-C must name the test site).
 *   • CLEAN — a stand-in that ANNOUNCES itself (kind = 'mock' — must be
 *     reported present-and-declared, NOT a finding); a dated scaffold header
 *     inside grace with owner and retiring assertion; a test that does not
 *     inject the forbidden field. Must read 0.
 * Any silent planted arm, or any clean-tree finding, exits 2 as a BLIND
 * COMPARATOR.
 *
 * ─── Ledger, not count ───────────────────────────────────────────────────────
 * A named, shrink-only list checked in BOTH directions — a bare count would
 * let one hidden mock be fixed while another was introduced and read as "no
 * change" (C69 §7.c). Exit condition: the ledger reaches 0 and the gate flips
 * hard-0 (C74 §6, exit condition 4).
 *
 * ─── What this gate CANNOT see (C74 §6.3, restated for these arms) ───────────
 *   • runtime DI substitution — a double injected at runtime is invisible to a
 *     source scan;
 *   • a stand-in named nothing like a stand-in — M-A keys on the *Mock*|*Stub*|
 *     *Fake* naming convention because that is what a scan CAN find; the
 *     outward signal C74 §3.2 requires is what makes the scan unnecessary, and
 *     no static scan can verify a first-call runtime signal;
 *   • scaffolds marked with vocabulary outside the three header patterns;
 *   • semantic correctness — an honest stand-in computing wrong answers passes
 *     every arm here.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED / blind
 * comparator · 3 ledger exceeded or stale. 2 and 3 are never absorbable.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-no-hidden-mock';
const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

const MIN_FILES = 500;
/** M-B grace: a DATED scaffold younger than this needs no retirement reference yet. */
const GRACE_DAYS = 90;

/** Kinds that describe a stand-in honestly — outside M-A by construction. */
const NEUTRAL_KINDS = new Set([
  'mock', 'stub', 'fake', 'dummy', 'noop', 'none', 'null', 'test',
  'builtin', 'internal', 'native', 'local', 'memory', 'in-memory',
  'default', 'sim', 'simulated', 'scaffold',
]);

const STAND_IN_CTOR = /\bnew\s+([A-Za-z_$]*(?:Mock|Stub|Fake)[\w$]*)\s*\(/;
const SCAFFOLD_MARK = /\bSCAFFOLD\b|TODO\(TASK-|lands at S\d+/;
const DATE_RE = /\b(20\d{2}-\d{2}-\d{2})\b/g;
const RETIREMENT_RE = /retir\w+|remove(?:d)? when|delete(?:d)? when|fails? when|assert/i;
const OWNER_RE = /@owner|owner\s*:/i;
/** M-C: a docstring that forbids PRODUCTION from INJECTING the field. */
const FORBIDDEN_DOC = /production(?:\s+\w+){0,3}\s+MUST\s+NOT(?:\s+\w+)?\s+(pass|set|supply|provide|inject)|MUST\s+NOT\s+(?:pass|set|supply|provide|inject)(?:\s+\w+){0,4}\s+production/i;

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * Measured 2026-08-12 at HEAD (56a838bc). Entries are `arm::file[:detail]`.
 * Fix a finding → strike its line in the SAME commit. A new finding is exit 3.
 *
 * M-A: PlanegcsAdapter — THE positive-control defect (C74 §0). Red here until
 *      CO-01 resolves: either the adapter performs a real solve, or its `kind`
 *      stops naming an engine it does not run — and per C74 §4.3 the
 *      truthfulness change lands in ITS OWN COMMIT, before any binding work.
 * M-B: every scaffold HEADER in the estate lacking owner+date+retirement.
 * M-C: was PlanegcsAdapter.test.ts injecting `underlying:` at :67 and :94 —
 *      the field whose docstring said "Production callers MUST NOT pass
 *      this". PAID 2026-08-14 (CO-03), see the struck block below. The arm
 *      stays armed with an empty ledger: any new injection of any
 *      docstring-forbidden field fires as NOT ON THE LEDGER → exit 3.
 */
const LEDGER: readonly string[] = [
  // M-A::PlanegcsAdapter STRUCK 2026-08-12 — the adapter's `kind` now reports
  // the actual underlying ('mock'), intent moved to a separate `intendedEngine`
  // field, and a one-time first-call warning is the §3.2 boundary signal
  // (CO-01, the C74 §4.3 truthfulness commit).
  // M-C line numbers re-pinned 2026-08-12: the test file gained PRODUCTION-path
  // coverage (the un-injected `?? new MockSolver()` construction, C74 §3.5's
  // demand) and a §3.5 coverage statement in its header; the two remaining
  // seam-test injection sites moved accordingly. Same two sites, new lines.
  // M-C::PlanegcsAdapter.test.ts:121/:150 STRUCK 2026-08-14 (CO-03) — paid by
  // DELETING THE SEAM, not by disclosure alone. The `underlying?:` option
  // (docstring-forbidden to production) is gone from PlanegcsAdapterOptions;
  // the constructor builds its MockSolver unconditionally (the `??` fallback
  // no longer exists as a branch to leave untested); and the suite proves
  // delegation by spying on the REAL MockSolver behind the production
  // construction (`vi.spyOn(MockSolver.prototype, …)`), so every test
  // exercises exactly the configuration production runs (C74 §3.5). The 2026-
  // 08-12 pass had already added production-path tests and the §3.5 header
  // statement — the arm kept firing because the injection SITES remained;
  // removing the sites' reason to exist is the honest payment, and weakening
  // the arm to read the disclosure would not have been (a boilerplate
  // disclosure line must never buy a pass).
  // M-B — 60 scaffold headers (of 62 found) carrying no owner+date+retiring-
  // assertion. Note the PAIR src/familyCreatorPlaceholder.ts and
  // apps/editor/src/familyCreatorPlaceholder.ts — the same scaffold twice, in
  // the transitional client root and the L7 app, which is itself the two-copies
  // anti-pattern (C74 §5.e) wearing a scaffold header.
  'M-B::src/familyCreatorPlaceholder.ts',
  'M-B::apps/ai-worker/src/pdf-to-bim/stage2-openings.ts',
  'M-B::apps/bench/src/benches/constraint-solver.bench.ts',
  'M-B::apps/component-editor/src/sketch/SketchCanvas.ts',
  'M-B::apps/component-editor/src/sketch/tools/FilletTool.ts',
  'M-B::apps/component-editor/src/sketch/tools/TrimTool.ts',
  'M-B::apps/editor/src/familyCreatorPlaceholder.ts',
  'M-B::apps/editor/src/ui/ViewBrowser/panels/unified-browser/BrowserDataHelpers.ts',
  'M-B::apps/editor/src/ui/dataworkbench/DataVisualizerService.ts',
  'M-B::apps/editor/src/ui/dataworkbench/ProgrammePanel.ts',
  'M-B::apps/editor/src/ui/property-inspector/RoomAutoOrganiser.ts',
  'M-B::apps/editor/src/ui/property-inspector/RoomPathfinderPanel.ts',
  'M-B::apps/editor/src/ui/rooms/EvacuationSimulatorPanel.ts',
  'M-B::apps/editor/src/ui/rooms/RoomGraphPanel.ts',
  'M-B::packages/ai-host/src/AmbientIntelligence.ts',
  // M-B::packages/ai-host/src/WallRegionExtractor.ts STRUCK 2026-08-14 (CO-06) —
  // the header now carries owner + date + an EXECUTABLE retiring assertion:
  // `__tests__/WallRegionExtractor.hullRefusal.test.ts` asserts an L-shaped plan is
  // REFUSED, which a real planar topology layer would not do, so the assertion fails
  // the moment the Phase E replacement lands and forces the header retired with it.
  // The declaration states what is FAKE (a Jarvis-march convex hull standing in for a
  // planar graph) — it does not claim the scaffold is real.
  'M-B::packages/command-registry/src/catalog/AddAssetCatalogEntryCommand.ts',
  'M-B::packages/command-registry/src/catalog/DeleteAssetCatalogEntryCommand.ts',
  'M-B::packages/command-registry/src/catalog/UpdateAssetCatalogEntryCommand.ts',
  'M-B::packages/command-registry/src/columns/UpdateColumnCommand.ts',
  'M-B::packages/command-registry/src/curtainwall/AddCurtainGridLineCommand.ts',
  'M-B::packages/command-registry/src/curtainwall/UpdateCurtainWallCommand.ts',
  'M-B::packages/command-registry/src/generic/UpdateElementParameterCommand.ts',
  'M-B::packages/command-registry/src/grids/RemoveGridCommand.ts',
  'M-B::packages/command-registry/src/grids/UpdateGridCommand.ts',
  'M-B::packages/command-registry/src/requirements/SetRoomRequirementCommand.ts',
  'M-B::packages/command-registry/src/views/SetViewDesignOptionCommand.ts',
  // M-B::packages/constraint-solver/src/PlanegcsAdapter.ts STRUCK 2026-08-12 —
  // header now carries owner, date, a retiring assertion (the "scaffold
  // retirement guard" test), and the S52-D2/S53-D1 disagreement resolved to
  // ONE milestone: C74 §4.2(c) authorisation.
  'M-B::packages/core-app-model/src/ElementCodeStore.ts',
  'M-B::packages/core-app-model/src/IFCPsetAdapter.ts',
  'M-B::packages/core-app-model/src/SemanticIndex.ts',
  'M-B::packages/core-app-model/src/StoreEventBus.ts',
  'M-B::packages/core-app-model/src/TemporalGraph.ts',
  'M-B::packages/core-app-model/src/batch/BatchCoordinator.ts',
  'M-B::packages/core-app-model/src/catalog/AssetCatalogStore.ts',
  'M-B::packages/core-app-model/src/comparison/ComparisonEngine.ts',
  'M-B::packages/core-app-model/src/hierarchy/HierarchyStore.ts',
  'M-B::packages/core-app-model/src/index.ts',
  'M-B::packages/core-app-model/src/requirements/RequirementStore.ts',
  'M-B::packages/core-app-model/src/stores/GridStore.ts',
  'M-B::packages/core-app-model/src/stores/RoomBoundingLineStore.ts',
  'M-B::packages/core-app-model/src/sync/SyncStateEngine.ts',
  'M-B::packages/core-app-model/src/views/ViewDependencyTracker.ts',
  'M-B::packages/core-app-model/src/views/ViewTemplateStore.ts',
  'M-B::packages/event-bus/src/catalog.ts',
  'M-B::packages/file-format/src/import/dxf/DxfLayerStore.ts',
  'M-B::packages/file-format/src/import/dxf/DxfOverlayStore.ts',
  'M-B::packages/geometry-column/src/ColumnPlanSymbolBuilder.ts',
  'M-B::packages/geometry-curtain-wall/src/CurtainWallBuilder.ts',
  'M-B::packages/geometry-door/src/DoorSystemTypeStore.ts',
  'M-B::packages/geometry-window/src/WindowSystemTypeStore.ts',
  'M-B::packages/persistence-client/src/loader/ProjectLoader.ts',
  'M-B::packages/physics-host/src/PhysicsEngine.ts',
  'M-B::packages/room-topology/src/RoomStore.ts',
  'M-B::packages/room-topology/src/TopologyLayer.ts',
  'M-B::packages/site-parcel-data/src/providers/resolveChFarFromCantonCatalogue.ts',
  'M-B::packages/spatial-index/src/RoomTypeInferenceEngine.ts',
  'M-B::packages/spatial-index/src/index.ts',
];

// ─── Subject discovery ───────────────────────────────────────────────────────

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.tsx?$/.test(rel);
}

interface Finding { readonly arm: 'M-A' | 'M-B' | 'M-C'; readonly key: string; readonly detail: string }

interface DeclaredStandIn { readonly file: string; readonly line: number; readonly className: string; readonly kind: string }

interface Analysis {
  readonly findings: Finding[];
  readonly filesScanned: number;
  readonly declaredStandIns: DeclaredStandIn[];   // honest ones, reported present-and-declared
  readonly scaffoldHeaders: number;               // headers carrying a marker (compliant + not)
  readonly forbiddenFields: Array<{ file: string; field: string }>;
  readonly exclusionsPrinted: string[];           // M-C names every exclusion
}

/** Leading comment/blank block of a file, as raw lines. */
function headerBlock(raw: readonly string[]): string {
  let end = 0, inBlock = false;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!.trim();
    if (inBlock) { end = i + 1; if (t.includes('*/')) inBlock = false; continue; }
    if (t === '' || t.startsWith('//')) { end = i + 1; continue; }
    if (t.startsWith('/*')) { inBlock = !t.includes('*/'); end = i + 1; continue; }
    break;
  }
  return raw.slice(0, end).join('\n');
}

function analyse(root: string, dirs: readonly string[], today: Date): Analysis {
  const findings: Finding[] = [];
  const declaredStandIns: DeclaredStandIn[] = [];
  const forbiddenFields: Array<{ file: string; field: string }> = [];
  const exclusionsPrinted: string[] = [];
  let filesScanned = 0;
  let scaffoldHeaders = 0;

  const CLASS = /\bclass\s+([A-Za-z_$][\w$]*)/;
  const KIND = /^\s*(?:public\s+|private\s+|protected\s+|declare\s+)?(?:readonly\s+)?kind\s*(?::\s*[\w'"|. <>\[\]]+\s*)?=\s*['"]([\w.-]+)['"]/;
  const FIELD_AFTER_DOC = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/;

  // pass 1 — production sources: M-A, M-B, and the M-C field inventory.
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel) || rel.endsWith('.d.ts')) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const raw = src.split('\n');
      const lines = stripCommentsToLines(src);

      // ── M-B — scaffold header discipline (reads the RAW header: the marker IS a comment)
      const hdr = headerBlock(raw);
      if (SCAFFOLD_MARK.test(hdr)) {
        scaffoldHeaders++;
        const dates = [...hdr.matchAll(DATE_RE)].map((m) => m[1]!);
        const newest = dates.map((d) => new Date(d)).sort((a, b) => b.getTime() - a.getTime())[0];
        const withinGrace = newest !== undefined &&
          (today.getTime() - newest.getTime()) / 86_400_000 <= GRACE_DAYS;
        const compliant =
          (newest !== undefined && OWNER_RE.test(hdr) && RETIREMENT_RE.test(hdr)) || withinGrace;
        if (!compliant) {
          findings.push({
            arm: 'M-B',
            key: `M-B::${rel}`,
            detail: `${rel} — scaffold header (${SCAFFOLD_MARK.exec(hdr)![0]}) with ` +
              `${newest ? `date ${newest.toISOString().slice(0, 10)} past the ${GRACE_DAYS}-day grace` : 'NO date'}` +
              `${OWNER_RE.test(hdr) ? '' : ', no owner'}${RETIREMENT_RE.test(hdr) ? '' : ', no retiring assertion'}. ` +
              'A scaffold whose retirement date is untracked is permanent architecture that nobody chose (C74 §3.4).',
          });
        }
      }

      // ── M-A — kind-declaring classes delegating to a *Mock*|*Stub*|*Fake* member
      let currentClass = '';
      let classStart = -1;
      const classes: Array<{ name: string; start: number; end: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const c = CLASS.exec(lines[i]!);
        if (c) {
          if (currentClass) classes.push({ name: currentClass, start: classStart, end: i });
          currentClass = c[1]!; classStart = i;
        }
      }
      if (currentClass) classes.push({ name: currentClass, start: classStart, end: lines.length });
      for (const cls of classes) {
        let kind: { value: string; line: number } | undefined;
        let standIn: { ctor: string; line: number } | undefined;
        for (let i = cls.start; i < cls.end; i++) {
          const k = KIND.exec(lines[i]!);
          if (k && !kind) kind = { value: k[1]!, line: i + 1 };
          const s = STAND_IN_CTOR.exec(lines[i]!);
          if (s && !standIn) standIn = { ctor: s[1]!, line: i + 1 };
        }
        if (!kind) continue;
        if (NEUTRAL_KINDS.has(kind.value.toLowerCase())) {
          declaredStandIns.push({ file: rel, line: kind.line, className: cls.name, kind: kind.value });
          continue; // honest — the correct behaviour this gate protects
        }
        if (standIn) {
          findings.push({
            arm: 'M-A',
            key: `M-A::${rel}:${cls.name} kind='${kind.value}' delegates to ${standIn.ctor}`,
            detail: `${rel}:${kind.line} — class ${cls.name} declares kind='${kind.value}' (an engine identity) ` +
              `while constructing \`new ${standIn.ctor}(…)\` at :${standIn.line}. The declared identity and the ` +
              `performed work disagree, and no caller inspecting \`kind\` can tell (C74 §3.1/§3.2). Either the ` +
              `identity becomes honest or the delegation becomes real — truthfulness FIRST, in its own commit (C74 §4.3).`,
          });
        }
      }

      // ── M-C inventory — fields whose docstring forbids production injection
      for (let i = 0; i < raw.length; i++) {
        if (!/MUST\s+NOT/i.test(raw[i]!)) continue;
        const docWindow = raw.slice(Math.max(0, i - 3), i + 3).join('\n');
        if (!FORBIDDEN_DOC.test(docWindow)) {
          if (/MUST\s+NOT/i.test(raw[i]!) && /production/i.test(docWindow) && !exclusionsPrinted.some((e) => e.startsWith(rel))) {
            exclusionsPrinted.push(`${rel}:${i + 1} — "MUST NOT" near "production" but no injection verb (pass/set/supply/provide/inject); ` +
              'forbids CALLING, not INJECTING — outside M-C, named rather than silently dropped.');
          }
          continue;
        }
        // the field the doc block documents: first field-shaped line after the doc
        for (let j = i + 1; j < Math.min(raw.length, i + 8); j++) {
          const t = raw[j]!.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t === '' || t === '*/') continue;
          const f = FIELD_AFTER_DOC.exec(raw[j]!);
          if (f) forbiddenFields.push({ file: rel, field: f[1]! });
          break;
        }
      }
    }
  }

  // pass 2 — tests: M-C injection sites.
  for (const { file, field } of forbiddenFields) {
    const pkg = (() => {
      // nearest workspace dir above the defining file, by path segments
      const parts = file.split('/');
      return parts.length >= 2 ? parts.slice(0, 2).join('/') : file;
    })();
    const owner = basename(file).replace(/\.tsx?$/, '');
    const INJECT = new RegExp(`\\b${field.replace(/\$/g, '\\$')}\\s*:`);
    for (const abs of walk(join(root, pkg))) {
      const rel = relPath(root, abs);
      if (!isTestPath(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      if (!src.includes(owner)) continue;    // test must bind the owning module
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        if (INJECT.test(lines[i]!)) {
          findings.push({
            arm: 'M-C',
            key: `M-C::${rel}:${i + 1}:${field}`,
            detail: `${rel}:${i + 1} injects \`${field}:\` — the field ${file} documents as forbidden to ` +
              `production. The suite exercises the one configuration production never uses; the configuration ` +
              `production DOES use (the fallback) is the untested one (C74 §3.5). State what is NOT covered, ` +
              `or test the production construction.`,
          });
        }
      }
    }
  }

  return { findings, filesScanned, declaredStandIns, scaffoldHeaders, forbiddenFields, exclusionsPrinted };
}

// ─── Negative + positive control, EXECUTED ───────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED = {
  // M-A — a FakeXStore wired into a production class with no external signal.
  'packages/x/src/EngineStore.ts': [
    "import { FakeXStore } from './FakeXStore.js';",
    'export class EngineXAdapter {',
    "  readonly kind = 'enginex' as const;",
    '  private store = new FakeXStore();',
    '  read() { return this.store.read(); }',
    '}',
  ].join('\n'),
  'packages/x/src/FakeXStore.ts': [
    'export class FakeXStore { read() { return null; } }',
  ].join('\n'),
  // M-B — an undated scaffold header.
  'packages/x/src/scaffolded.ts': [
    '// SCAFFOLD — real implementation later.',
    'export const x = 1;',
  ].join('\n'),
  // M-C — a docstring-forbidden field, injected by a test.
  'packages/x/src/Widget.ts': [
    'export interface WidgetOpts {',
    '  /**',
    '   * Test-only override. Production callers MUST NOT pass this.',
    '   */',
    '  inner?: unknown;',
    '}',
    'export class Widget { constructor(readonly opts: WidgetOpts = {}) {} }',
  ].join('\n'),
  'packages/x/__tests__/Widget.test.ts': [
    "import { Widget } from '../src/Widget';",
    'const w = new Widget({ inner: {} });',
  ].join('\n'),
};

const CLEAN_DATE = () => new Date().toISOString().slice(0, 10);
const CLEAN = {
  // an honest stand-in — must be reported present-and-declared, NOT a finding.
  'packages/y/src/HonestMock.ts': [
    'export class HonestMockSolver {',
    "  readonly kind = 'mock' as const;",
    '  solve() { return null; }',
    '}',
  ].join('\n'),
  // a dated scaffold inside grace, with owner and retiring assertion.
  'packages/y/src/freshScaffold.ts': [
    `// SCAFFOLD ${CLEAN_DATE()} — owner: platform team. Retired when S99 lands;`,
    '// __tests__/retirement.test.ts asserts this file is deleted at S99.',
    'export const y = 1;',
  ].join('\n'),
  'packages/y/src/Widget.ts': [
    'export interface WidgetOpts {',
    '  /**',
    '   * Test-only override. Production callers MUST NOT pass this.',
    '   */',
    '  inner?: unknown;',
    '}',
    'export class Widget { constructor(readonly opts: WidgetOpts = {}) {} }',
  ].join('\n'),
  'packages/y/__tests__/Widget.test.ts': [
    "import { Widget } from '../src/Widget';",
    'const w = new Widget({});',       // does NOT inject the forbidden field
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const today = new Date();
    const bad = analyse(join(base, 'planted'), ['packages'], today);
    const good = analyse(join(base, 'clean'), ['packages'], today);
    const armsFired = new Set(bad.findings.map((f) => f.arm));
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${[...armsFired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    lines.push(`positive control (clean tree):   ${good.findings.length} finding(s) — must be 0; honest stand-ins declared: ${good.declaredStandIns.length} (must be ≥1)`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    for (const arm of ['M-A', 'M-B', 'M-C'] as const) {
      if (!armsFired.has(arm)) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    if (good.findings.length > 0) ok = false;
    if (good.declaredStandIns.length < 1) {
      ok = false;
      lines.push("    ✗ BLIND COMPARATOR — the clean tree's self-announcing stand-in was not reported present-and-declared.");
    }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, DIRS, new Date());

const lines: string[] = [];
lines.push(
  `source files scanned: ${a.filesScanned} · scaffold headers found: ${a.scaffoldHeaders} · ` +
  `honest self-declaring stand-ins: ${a.declaredStandIns.length} · docstring-forbidden fields: ${a.forbiddenFields.length}`,
);
for (const s of a.declaredStandIns) {
  lines.push(`  present-and-declared (NOT a finding): ${s.className} kind='${s.kind}' — ${s.file}:${s.line}`);
}
for (const f of a.forbiddenFields) lines.push(`  forbidden-to-production field: \`${f.field}\` — ${f.file}`);
for (const e of a.exclusionsPrinted) lines.push(`  M-C exclusion (named, not silent): ${e}`);
lines.push('');
for (const f of a.findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

const measured = new Set(a.findings.map((f) => f.key));
const declared = new Set(LEDGER);
const stale = [...declared].filter((k) => !measured.has(k));
const unexpected = [...measured].filter((k) => !declared.has(k));
if (unexpected.length > 0) {
  lines.push('');
  for (const u of unexpected) lines.push(`⚠ NOT ON THE LEDGER — ${u}`);
}

const floors: Floor[] = [
  { what: 'source files scanned', measured: a.filesScanned, min: MIN_FILES },
  { what: 'scaffold headers discovered (0 would mean the header walk is broken, not the estate clean)', measured: a.scaffoldHeaders, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings: a.findings.length + (unexpected.length > 0 ? LEDGER.length + 1 : 0),
  declared: LEDGER.length,
  findingNames: [...measured],
  stale,
};

process.exit(reportGate(result));
