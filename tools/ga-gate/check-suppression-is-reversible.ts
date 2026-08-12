#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-suppression-is-reversible.ts
 *
 * C72 §4.1–§4.4 / §6.3 · BIM30-READINESS-GATES §3.11 — **a release nothing
 * calls is not a release.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * Propagation is switched off in several places in this repository, and the
 * two known switch-offs OUTLIVE THEIR REASON:
 *   • `RoomTopologyObserver._graphAuthoritativeLevels` is marked from four-plus
 *     production sites (the layout executors); its public release
 *     `clearGraphAuthoritative` has 1 definition, 0 production callers, 1 test
 *     caller. The only release that actually runs is a narrow inline branch
 *     (a manual add/remove of a wall on that level, outside a batch) — so an
 *     update, a batched mutation, or a level the user never structurally edits
 *     stays frozen for the SESSION, and every generated level keeps its rooms
 *     suppressed by default (C72 §4.1). **S1 is red on this the day this gate
 *     lands, by design.**
 *   • `apps/editor/src/engine/initPersistence.ts:362` pauses
 *     `roomTopologyObserver` (and `:366` pauses `syncStateEngine`) around
 *     `ProjectLoader.load` with NO `finally` — a throw inside the load leaves
 *     topology observation and sync-state recompute off for the rest of the
 *     session, silently, with the project loaded and looking fine (C72 §4.2).
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  S0  *(floors, exit 2)*  ≥ MIN_PAUSE_SITES production `.pause()` call sites
 *      across ≥ MIN_PAUSE_FILES files, ≥1 suppression marker field discovered,
 *      ≥ MIN_FILES source files read, controls fired. The floor values are the
 *      Phase-1 PART-A measurement (≥15 sites / ≥6 files): **if this walk finds
 *      ~2 pause sites the walk is broken, and the gate exits 2 rather than
 *      reporting a smaller, cleaner world** — a scan finding almost nothing is
 *      misconfigured, not clean, and that is the single most likely failure of
 *      this gate because suppression sites share no naming convention.
 *  S1  *(hard)*  every suppression marker FIELD whose marking method has ≥1
 *      production caller has a release METHOD with ≥1 production caller.
 *      An inline `field.delete(...)` in some handler is not the release method
 *      having a caller — a release that only a test reaches is a no-op by
 *      construction (C72 §4.3), indistinguishable from a working release to
 *      anyone reading the class.
 *  S2  *(hard)*  every `pause()` … `resume()` pair spanning a fallible call is
 *      inside `try { … } finally { resume() }`. Fallible = the region between
 *      pause and resume contains an `await` or a call other than the pair
 *      itself. Pairs whose resume is hoisted elsewhere (BatchCoordinator's
 *      `_scheduleResumeFlush`, builder-control handles) cannot be paired
 *      statically and are PRINTED as unpaired, never silently dropped.
 *  S3  *(ratchet, NAMED)*  every suppression flag declares its scope. The
 *      declaration convention this gate reads: a comment within 5 lines above
 *      the field containing `@suppression-scope <level|batch|load-window|
 *      drag|frame|session>`. A flag with no declared scope is a finding —
 *      a lifetime bounded by process lifetime instead of by scope is the
 *      defect (C72 §4.4). No flag in the estate declares one today, so S3
 *      lands as the full named inventory; the inventory shrinking to zero IS
 *      the exit condition.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ────────────────────
 * `selfTest()` materialises two synthetic workspaces:
 *   • PLANTED — a marker class whose `markSuppressed` has a production caller
 *     and whose `clearSuppressed` has none (S1 must name it); a
 *     `pause()`/`resume()` pair spanning an `await` with no `finally` (S2 must
 *     name the pause SITE); an unscoped flag (S3 must name it).
 *   • CLEAN — the same shapes done right: release with a production caller,
 *     pause wrapped in try/finally (**this is the "then wrap it correctly and
 *     confirm S2 goes green" required by the spec — proving the arm is not
 *     stuck red**), flag annotated with `@suppression-scope load-window`.
 *     Must read 0.
 * Any silent planted arm, or any clean-tree finding, exits 2 as a BLIND
 * COMPARATOR.
 *
 * ─── What this gate CANNOT see (stated per C72 §6.3) ─────────────────────────
 *   • a suppression implemented as a boolean nobody named suppress/pause/
 *     freeze/mute/authoritative — a static scan cannot enumerate an unnamed
 *     concept;
 *   • whether a release RUNS at runtime — S1 proves a caller exists, not that
 *     it is reached (the §AUTHORED-BUT-UNWIRED distinction);
 *   • suppression by early-return inside a listener;
 *   • pause/resume pairs split across files or stored in callbacks — printed
 *     as unpaired, above;
 *   • caller counting is BY METHOD NAME: a generic name like `resume` gets
 *     credit from any object's resume call (errs green, never red); uniquely
 *     named releases (`clearGraphAuthoritative`) are counted exactly.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED / blind
 * comparator · 3 ledger exceeded or stale. 2 and 3 are never absorbable.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines, scanFilesStripped } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-suppression-is-reversible';
const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

/** PART-A floors, measured 2026-08-12: 18 production pause sites in 9 files. */
const MIN_PAUSE_SITES = 15;
const MIN_PAUSE_FILES = 6;
const MIN_FILES = 500;

/**
 * Receivers whose `.pause()` is MEDIA playback, not propagation suppression.
 * Named with the reason, never silently dropped: HTMLMediaElement has the same
 * method name and a landing-page video is not a suppressed channel.
 */
const MEDIA_RECEIVER = /video|audio|media|player|^v$|^vid(eo)?El/i;

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * Measured 2026-08-12 at HEAD (56a838bc). S1 ×1 · S2 ×3 · S3 ×41 = 45 named.
 * SHRUNK 2026-08-12 (§FIX-TOPOLOGY-RESUME-LOSES-SUPPRESSED) to S1 ×1 · S2 ×3 · S3 ×39 = 43.
 * SHRUNK 2026-08-12 (commit 4dbed18f, initPersistence try/finally) to S1 ×1 · S2 ×1 · S3 ×39 = 41.
 * Two S3 entries struck WITH the argument, never silently:
 *   • `RoomTopologyObserver.ts:paused` — was the S3 finding AND the substantive C72 §4
 *     defect. `resume()` was a bare flag write and `_onWallMutationCommitted` DROPPED
 *     commits while paused: measured 0 redetects after resume for an event delivered
 *     during the paused window, against 1 for the identical event unpaused. It now
 *     queues to `_suppressedCommitLevels` and `resume()` discharges them synchronously,
 *     so the flag's lifetime is genuinely the gesture it annotates (@suppression-scope
 *     batch). Pinned by `check-undo-resume-flushes-topology`, which carries the pre-fix
 *     observer as an executed positive control.
 *   • `RoomTopologyObserver.ts:_graphAuthoritativeLevels` — scope annotated `level`, and
 *     the code honours it: every read, mark and clear is keyed by levelId, so suppressing
 *     one level cannot suppress another. This discharges S3 (scope declared) ONLY. Its
 *     RELEASE-reach defect is untouched and remains the S1 entry below — annotating a
 *     scope is not fixing a release nothing calls, and these must not be conflated.
 * `_suppressedCommitLevels` is NEW and lands SCOPED, so it adds no entry.
 * Fix a finding → strike its line in the SAME commit. A new finding is exit 3.
 *
 * S1: `clearGraphAuthoritative` — the spec's positive-control defect, red the
 *     day this gate landed, exactly as §3.11 requires. 1 definition, 0
 *     production callers, 1 test caller — every generated level keeps its
 *     rooms suppressed for the session.
 * S2: PlanViewToolOverlay.ts:368, MEASURED NOT SPECIFIED: the spec named the
 *     initPersistence pair alone; this is the identical shape one directory
 *     over, recorded rather than excluded, because a gate that only ever finds
 *     the sites its spec listed is a spec transcription, not a measurement.
 *     (The initPersistence pair — topology :362, syncStateEngine :366 — was
 *     PAID by the try/finally fix in commit 4dbed18f and struck here in the
 *     adjacent commit, per the fix-strikes-its-line rule above.)
 * S3: the estate's suppression flags — not one declares a scope. An entry
 *     leaves when the flag gains a `@suppression-scope` annotation whose scope
 *     the code honours, or when it is shown NOT to be propagation suppression
 *     (e.g. the two `frozen` registration latches, if so argued — strike with
 *     the argument in the commit message, never silently).
 */
const LEDGER: readonly string[] = [
  'S1::packages/room-topology/src/RoomTopologyObserver.ts:clearGraphAuthoritative',
  'S2::apps/editor/src/engine/views/PlanViewToolOverlay.ts:368',
  'S3::apps/editor/src/engine/WallRebuildCoordinator.ts:_wallRebuildPaused',
  'S3::apps/editor/src/engine/initCollaboration.ts:suppressOutboundVisibilityIntentEvents',
  'S3::apps/editor/src/engine/initScene.ts:_heavyShadowSuppressed',
  'S3::apps/editor/src/engine/initScene.ts:_loadShadowFreezeActive',
  'S3::apps/editor/src/engine/initScene.ts:_navShadowSuppressed',
  'S3::apps/editor/src/engine/initScene.ts:_wallCommitShadowFreezeActive',
  'S3::apps/editor/src/engine/persistence/ProjectLoader.ts:__suppressCloseDeferred',
  'S3::apps/editor/src/engine/persistence/ProjectLoader.ts:__suppressClosed',
  'S3::apps/editor/src/engine/views/EdgeProjectorService.ts:suppress',
  'S3::apps/editor/src/engine/views/PlanViewToolOverlay.ts:_paused',
  'S3::apps/editor/src/engine/views/SplitViewManager.ts:_autoOpenSuppressed',
  'S3::apps/editor/src/engine/views/SvpPlanToolOverlay.ts:_paused',
  'S3::apps/editor/src/ui/geospatial/CesiumViewport.ts:facadeSuppressingMassing',
  'S3::apps/editor/src/ui/geospatial/CesiumViewport.ts:suppressNextLocationFly',
  'S3::apps/editor/src/ui/house-layout/HouseLayoutModal.ts:_suppressNodeClick',
  'S3::apps/editor/src/ui/layout/GISAreaLayout.ts:gisReactivationSelfPlaceSuppressed',
  'S3::apps/editor/src/ui/living-graph/LivingGraphOverlay.ts:frozen',
  'S3::apps/editor/src/ui/platform/SaveOrchestrator.ts:_loadSuppressActive',
  'S3::apps/editor/src/ui/primitives/ViewportCrashGuard.ts:_nonFatalSuppressed',
  'S3::packages/ai-host/src/workflows/apartmentLayout/windowEmission/shellWallMatch.ts:blindSuppressed',
  'S3::packages/ai-host/src/workflows/residentialBuilding/runApartmentCellLayout.ts:suppressed',
  'S3::packages/command-bus/src/CommandBus.ts:suppressUndo',
  'S3::packages/core-app-model/src/StoreEventBus.ts:_suppressDepth',
  'S3::packages/core-app-model/src/rendering/PascalSceneLighting.ts:_shadowsSuppressed',
  'S3::packages/core-app-model/src/rendering/UnifiedFrameLoop.ts:_batchRenderSuppressed',
  'S3::packages/core-app-model/src/rendering/UnifiedFrameLoop.ts:_firstRenderPostSuppress',
  'S3::packages/core-app-model/src/sync/SyncStateEngine.ts:_paused',
  'S3::packages/core-app-model/src/views/ViewDependencyTracker.ts:_batchSuppressed',
  'S3::packages/formula-library/src/catalog.ts:frozen',
  'S3::packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:_pausedBuildsMap',
  'S3::packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:_rebuildPaused',
  'S3::packages/geometry-slab/src/SlabFragmentBuilder.ts:_rebuildPaused',
  'S3::packages/geometry-wall/src/JunctionResolverV2.ts:suppressInnerFacePivot',
  'S3::packages/renderer-three/src/pipeline/RenderPipelineManager.ts:_shadowFrozenState',
  'S3::packages/renderer-three/src/pipeline/RenderPipelineManager.ts:_shadowPassSuppressed',
  'S3::packages/renderer-three/src/pipeline/RenderPipelineManager.ts:_shadowReallocFreezeDepth',
  'S3::packages/renderer-three/src/pipeline/RenderPipelineManager.ts:_shadowRebuildPaused',
  'S3::packages/renderer-three/src/pipeline/RenderPipelineManager.ts:_shadowSuppressions',
  'S3::packages/runtime-composer/src/PluginHost.ts:frozen',
];

// ─── Subject discovery ───────────────────────────────────────────────────────

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel);
}

/**
 * A suppression marker FIELD, found in three steps rather than one regex —
 * the one-regex first cut required a mandatory leading character that ATE the
 * first letter of `suppress`, so `_suppressedLevels` (the planted control!)
 * never matched. The control caught it, which is the control's whole job.
 *   1. capture a field/var declaration's identifier;
 *   2. the NAME must carry a suppression word;
 *   3. the DECLARATION must be flag-shaped (boolean / Set / Map / 0 latch) —
 *      a `paused: '⏸ Paused'` status label or a `readonly muted: number`
 *      count is vocabulary overlap, not a switch.
 */
const DECL_RE = /^\s*(?:(?:private|protected|public|readonly|static|declare|const|let|var)\s+)*([A-Za-z_$][\w$]*)\??\s*(:|=(?!=))/;
const SUPPRESSION_WORD = /pause|paus|suppress|frozen|freez|mute|silenc|authoritative/i;
/** Names that carry the vocabulary but are records ABOUT suppression, not switches. */
const NON_FLAG_NAME = /(?:Time|Timestamp|Handler|Fields|Field|Color|Colors|Label|Message|Msg|Count|Ms)$|^_?last/i;
/** The declaration's visible type/value must be switch-shaped. */
const FLAG_SHAPE = /:\s*(?:boolean\b|Set\s*<|Map\s*<)|=\s*(?:true\b|false\b|new\s+Set\b|new\s+Map\b|0\s*[;,)]?\s*$)/;
/** A class-member method declaration (indented, name + parens, body opens). */
const METHOD_RE = /^\s{2,8}(?:public\s+|private\s+|protected\s+|readonly\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::\s*[\w<>,\s|\[\].]+)?\s*\{/;
/** Control-flow keywords METHOD_RE would otherwise mistake for method names. */
const NOT_A_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'new', 'await', 'typeof', 'delete', 'void', 'yield']);
/** Releases that ANNOUNCE themselves as test hooks are outside S1's subject — printed, not judged. */
const TEST_HOOK_RELEASE = /fortests?$/i;

interface Marker {
  readonly file: string;
  readonly line: number;
  readonly field: string;
  readonly setters: string[];   // methods that mark (field = true / .add()
  readonly releases: string[];  // methods that release (field = false / .delete( / .clear()
  readonly scoped: boolean;     // @suppression-scope annotation present
}

interface PausePair {
  readonly file: string;
  readonly line: number;        // the pause site
  readonly receiver: string;
  readonly resumeLine?: number;
  readonly hasFinallyBetween: boolean;
  readonly fallibleBetween: boolean;
}

interface Finding { readonly arm: 'S1' | 'S2' | 'S3'; readonly key: string; readonly detail: string }

const SCOPE_ANNOTATION = /@suppression-scope\s+(level|batch|load-window|drag|frame|session)/;

function collectMarkers(root: string, dirs: readonly string[]): { markers: Marker[]; filesScanned: number } {
  const markers: Marker[] = [];
  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel) || rel.endsWith('.d.ts')) continue;  // a type declaration is not a flag
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const raw = src.split('\n');
      const lines = stripCommentsToLines(src);
      // pass 1 — fields. Members of `interface` / `type` blocks are TYPES, not
      // flag instances: `suppressX: boolean` in an options interface declares a
      // shape, and the instance that carries it is what S3 would want — which a
      // static scan cannot attribute, so the type member is excluded rather than
      // miscounted (tracked by brace depth from the interface/type opener).
      const fields: Array<{ name: string; line: number; scoped: boolean }> = [];
      let typeDepth = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        if (typeDepth > 0) {
          typeDepth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
          if (typeDepth < 0) typeDepth = 0;
          continue;
        }
        if (/^\s*(?:export\s+)?(?:declare\s+)?interface\s+[A-Za-z_$]|^\s*(?:export\s+)?type\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*=\s*\{/.test(l)) {
          typeDepth = (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
          if (typeDepth <= 0) typeDepth = 0; // one-line interface — closed already
          else continue;
        }
        const m = DECL_RE.exec(l);
        if (!m) continue;
        const name = m[1]!;
        if (!SUPPRESSION_WORD.test(name) || NON_FLAG_NAME.test(name)) continue;
        if (!FLAG_SHAPE.test(l)) continue;
        if (fields.some((f) => f.name === name)) continue;  // one entry per field name per file
        // annotation lives in COMMENTS, so it is read from the RAW source.
        const above = raw.slice(Math.max(0, i - 5), i + 1).join('\n');
        fields.push({ name, line: i + 1, scoped: SCOPE_ANNOTATION.test(above) });
      }
      if (fields.length === 0) continue;
      // pass 2 — attribute writes to each field to the enclosing method
      let current = '';
      const writes = new Map<string, { setters: Set<string>; releases: Set<string> }>();
      for (const f of fields) writes.set(f.name, { setters: new Set(), releases: new Set() });
      for (let i = 0; i < lines.length; i++) {
        const mm = METHOD_RE.exec(lines[i]!);
        if (mm && !NOT_A_METHOD.has(mm[1]!)) current = mm[1]!;
        for (const f of fields) {
          const w = writes.get(f.name)!;
          const esc = f.name.replace(/\$/g, '\\$');
          if (new RegExp(`this\\.${esc}\\s*=\\s*true\\b`).test(lines[i]!) || new RegExp(`this\\.${esc}\\.add\\(`).test(lines[i]!)) {
            if (current) w.setters.add(current);
          }
          if (new RegExp(`this\\.${esc}\\s*=\\s*false\\b`).test(lines[i]!) || new RegExp(`this\\.${esc}\\.(delete|clear)\\(`).test(lines[i]!)) {
            if (current) w.releases.add(current);
          }
        }
      }
      for (const f of fields) {
        const w = writes.get(f.name)!;
        markers.push({
          file: rel, line: f.line, field: f.name,
          setters: [...w.setters], releases: [...w.releases], scoped: f.scoped,
        });
      }
    }
  }
  return { markers, filesScanned };
}

/** `X.pause()` sites paired with the nearest following `X…resume…(` in the file. */
function collectPausePairs(root: string, dirs: readonly string[]): { pairs: PausePair[]; sites: number; files: Set<string> } {
  const pairs: PausePair[] = [];
  const files = new Set<string>();
  let sites = 0;
  const PAUSE = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\??\.pause\??\.?\(\s*\)/;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      if (!src.includes('.pause')) continue;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        const m = PAUSE.exec(lines[i]!);
        if (!m) continue;
        const receiver = m[1]!;
        if (MEDIA_RECEIVER.test(receiver)) continue;             // media playback, excluded by name
        if (/pause\s*:\s*\(\)\s*=>/.test(lines[i]!)) continue;   // a handle DEFINITION, not a call site
        sites++;
        files.add(rel);
        // the receiver's tail token is what resume is called on ("window.x?.pause" → "x")
        const tail = receiver.split('.').pop()!;
        let resumeLine: number | undefined;
        let hasFinally = false;
        let fallible = false;
        const RESUME = new RegExp(`\\b${tail.replace(/\$/g, '\\$')}\\??\\.(resume\\w*)\\??\\.?\\(`);
        for (let j = i + 1; j < Math.min(lines.length, i + 400); j++) {
          if (RESUME.test(lines[j]!)) { resumeLine = j + 1; break; }
          if (/\bfinally\b/.test(lines[j]!)) hasFinally = true;
          if (/\bawait\b/.test(lines[j]!)) fallible = true;
          else if (/[A-Za-z_$][\w$]*\s*\(/.test(lines[j]!) && !/\.pause\b/.test(lines[j]!)) fallible = true;
        }
        pairs.push({ file: rel, line: i + 1, receiver, resumeLine, hasFinallyBetween: hasFinally, fallibleBetween: fallible });
      }
    }
  }
  return { pairs, sites, files };
}

/**
 * Production call sites for a SET of method names, in ONE estate walk — a walk
 * per method was ~10 full scans of 4500 files to answer one question, and the
 * first cut of this gate timed out on exactly that.
 */
function collectCallers(
  root: string, dirs: readonly string[], methods: ReadonlySet<string>, minFiles: number,
): Map<string, Match[]> {
  const out = new Map<string, Match[]>();
  for (const m of methods) out.set(m, []);
  if (methods.size === 0) return out;
  const alternation = [...methods].map((s) => s.replace(/\$/g, '\\$')).join('|');
  const r = scanFilesStripped({
    root, dirs, minFiles, label: `${GATE}:callers`,
    pattern: new RegExp(`\\.(${alternation})\\s*\\(`),
    exclude: (rel) => isTestPath(rel),
  });
  for (const match of r.matches) {
    const name = match.groups[0];
    if (name && out.has(name)) out.get(name)!.push(match);
  }
  return out;
}
type Match = { file: string; line: number; text: string; groups: readonly (string | undefined)[] };

interface Analysis {
  readonly findings: Finding[];
  readonly markers: Marker[];
  readonly pairs: PausePair[];
  readonly pauseSites: number;
  readonly pauseFiles: number;
  readonly filesScanned: number;
}

function analyse(root: string, dirs: readonly string[], minFiles: number): Analysis {
  const { markers, filesScanned } = collectMarkers(root, dirs);
  const pp = collectPausePairs(root, dirs);
  const findings: Finding[] = [];

  // S1 — a marker whose setter has production reach but whose release method does not.
  // Caller counting happens in ONE estate walk for every method name at once.
  const namesToCount = new Set<string>();
  for (const mk of markers) {
    if (mk.setters.length === 0 || mk.releases.length === 0) continue;
    for (const s of mk.setters) if (!NOT_A_METHOD.has(s)) namesToCount.add(s);
    for (const r of mk.releases) if (!NOT_A_METHOD.has(r) && !TEST_HOOK_RELEASE.test(r)) namesToCount.add(r);
  }
  const callerMap = collectCallers(root, dirs, namesToCount, minFiles);
  const callersOutside = (method: string, definingFile: string): number =>
    (callerMap.get(method) ?? []).filter((m) => m.file !== definingFile).length;

  for (const mk of markers) {
    // Only markers with EXPLICIT named setter+release methods are S1 subjects;
    // parameterised toggles (setSuppressed(flag)) are printed, not judged.
    const setters = mk.setters.filter((s) => !NOT_A_METHOD.has(s));
    const releases = mk.releases.filter((r) => !NOT_A_METHOD.has(r));
    if (setters.length === 0 || releases.length === 0) continue;
    const setterReached = setters.some((s) => s === 'pause' || callersOutside(s, mk.file) > 0);
    if (!setterReached) continue;
    const releaseNames = releases.filter((r) => !setters.includes(r) && !TEST_HOOK_RELEASE.test(r));
    for (const rel of releaseNames) {
      const callers = callersOutside(rel, mk.file);
      if (callers === 0) {
        findings.push({
          arm: 'S1',
          key: `S1::${mk.file}:${rel}`,
          detail: `${mk.file} — marker \`${mk.field}\` is SET from production (${mk.setters.join(', ')}) but its ` +
            `release \`${rel}()\` has 0 production callers (tests excluded). A release nothing calls is not a ` +
            `release: the flag's lifetime is the process, and every consumer of the suppressed channel is ` +
            `frozen for the session (C72 §4.1/§4.3).`,
        });
      }
    }
  }

  // S2 — pause…resume spanning a fallible call without try/finally.
  for (const p of pp.pairs) {
    if (p.resumeLine === undefined) continue;   // unpaired — printed by the caller, not judged
    if (!p.fallibleBetween) continue;
    if (!p.hasFinallyBetween) {
      findings.push({
        arm: 'S2',
        key: `S2::${p.file}:${p.line}`,
        detail: `${p.file}:${p.line} — \`${p.receiver}.pause()\` resumes at :${p.resumeLine} across a fallible ` +
          `call with NO \`finally\`. A throw between them leaves the channel off for the rest of the session, ` +
          `silently, with everything looking fine (C72 §4.2). Wrap: pause(); try { … } finally { resume(); }.`,
      });
    }
  }

  // S3 — flags with no declared scope.
  for (const mk of markers) {
    if (!mk.scoped) {
      findings.push({
        arm: 'S3',
        key: `S3::${mk.file}:${mk.field}`,
        detail: `${mk.file}:${mk.line} — flag \`${mk.field}\` declares NO scope. Suppression is scoped and ` +
          `announced (level / batch / load-window); a lifetime bounded by process lifetime instead of by scope ` +
          `is the defect (C72 §4.4). Annotate: \`// @suppression-scope <level|batch|load-window|drag|frame|session>\` ` +
          `within 5 lines above the field — and make the code honour it.`,
      });
    }
  }

  return { findings, markers, pairs: pp.pairs, pauseSites: pp.sites, pauseFiles: pp.files.size, filesScanned };
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
  'packages/x/src/GhostObserver.ts': [
    'export class GhostObserver {',
    '  private _suppressedLevels = new Set<string>();',              // S3 — no scope annotation
    '  markSuppressed(id: string): void { this._suppressedLevels.add(id); }',
    '  clearSuppressed(id: string): void { this._suppressedLevels.delete(id); }', // S1 — no prod caller
    '}',
  ].join('\n'),
  'packages/x/src/prodCaller.ts': [
    "import { GhostObserver } from './GhostObserver.js';",
    'export function generate(obs: GhostObserver): void {',
    "  obs.markSuppressed('L0');",                                   // setter HAS a prod caller
    '}',
  ].join('\n'),
  'packages/x/src/loader.ts': [
    'declare const observer: { pause(): void; resume(): void };',
    'declare function loadProject(): Promise<void>;',
    'export async function hydrate(): Promise<void> {',
    '  observer.pause();',                                           // S2 — fallible span, no finally
    '  await loadProject();',
    '  observer.resume();',
    '}',
  ].join('\n'),
};

const CLEAN = {
  'packages/y/src/HonestObserver.ts': [
    'export class HonestObserver {',
    '  // Suppresses room redetection for the hydration window only.',
    '  // @suppression-scope load-window',
    '  private _suppressedLevels = new Set<string>();',
    '  markSuppressed(id: string): void { this._suppressedLevels.add(id); }',
    '  clearSuppressed(id: string): void { this._suppressedLevels.delete(id); }',
    '}',
  ].join('\n'),
  'packages/y/src/prodCallers.ts': [
    "import { HonestObserver } from './HonestObserver.js';",
    'export function generate(obs: HonestObserver): void {',
    "  obs.markSuppressed('L0');",
    "  obs.clearSuppressed('L0');",                                  // release HAS a prod caller
    '}',
  ].join('\n'),
  // The spec's "then wrap it correctly and confirm S2 goes green": the planted
  // tree's exact pause, wrapped in try/finally, must produce NO finding.
  'packages/y/src/loader.ts': [
    'declare const observer: { pause(): void; resume(): void };',
    'declare function loadProject(): Promise<void>;',
    'export async function hydrate(): Promise<void> {',
    '  observer.pause();',
    '  try {',
    '    await loadProject();',
    '  } finally {',
    '    observer.resume();',
    '  }',
    '}',
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'), ['packages'], 1);
    const good = analyse(join(base, 'clean'), ['packages'], 1);
    const armsFired = new Set(bad.findings.map((f) => f.arm));
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${[...armsFired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    lines.push(`positive control (clean tree):   ${good.findings.length} finding(s) — must be 0 (S2 wrapped-correctly goes GREEN here)`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    for (const arm of ['S1', 'S2', 'S3'] as const) {
      if (!armsFired.has(arm)) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    if (good.findings.length > 0) ok = false;
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

const a = analyse(ROOT, DIRS, MIN_FILES);

const lines: string[] = [];
lines.push(
  `source files scanned: ${a.filesScanned} · suppression marker fields: ${a.markers.length} · ` +
  `production pause() sites: ${a.pauseSites} across ${a.pauseFiles} files`,
);
for (const mk of a.markers) {
  lines.push(
    `  marker: ${mk.file}:${mk.line} \`${mk.field}\` — setters [${mk.setters.join(', ') || 'none named'}] · ` +
    `releases [${mk.releases.join(', ') || 'none named'}] · scope ${mk.scoped ? 'DECLARED' : 'UNDECLARED'}`,
  );
}
for (const p of a.pairs) {
  if (p.resumeLine === undefined) {
    lines.push(`  unpaired (printed, not judged): ${p.file}:${p.line} \`${p.receiver}.pause()\` — no same-file resume; ` +
      `resume is hoisted elsewhere (batch machinery / handle). Static pairing cannot follow it.`);
  }
}
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
  { what: 'production pause() call sites (PART-A ≥15 — fewer means the walk is broken, not the estate clean)', measured: a.pauseSites, min: MIN_PAUSE_SITES },
  { what: 'files containing production pause() sites', measured: a.pauseFiles, min: MIN_PAUSE_FILES },
  { what: 'suppression marker fields discovered', measured: a.markers.length, min: 1 },
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
