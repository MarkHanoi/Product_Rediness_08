/**
 * @vitest-environment happy-dom
 */
// inner-runtime-perf — LANE BASE-INNER: axes A (single element create) + B (bulk
// create) measured at THE RUNTIME LAYER: the REAL composed runtime
// (`composeRuntime({ bootstrapFn: bootstrapWithEverything, canvas: null })`),
// dispatching the SAME bus verbs the UI dispatches, headless in vitest/node.
//
//   Reproduce:  npx vitest run -c tools/perf/vitest.inner.config.mts
//   Baseline:   audit/perf/2026-09-02/baseline-inner.json  (written on every run)
//
// ─── MEASUREMENT DOCTRINE ([[committed-is-not-reachable]]) ───────────────────
// • No store, bus or handler is CONSTRUCTED here — everything is read off the
//   runtime `composeRuntime()` returns, exactly as the C16 CA-21 pattern in
//   `apps/editor/__tests__/componentJoinThroughComposedRuntime.test.ts`.
// • Every number reports: N, median, p95, plus the stage split.
// • Stage attribution is via RUNTIME wrapping only (own-property shadows on the
//   live handler / storesProvider / Store.applyPatch). ZERO repo files are
//   touched; remove this file and nothing changes.
//
// ─── WHAT THE STAGES MEAN ────────────────────────────────────────────────────
//   ctxMs      — `bus.storesProvider()` = `storesAsRecordView` (bootstrap.ts):
//                Object.fromEntries over EVERY registered store's whole Map, on
//                EVERY dispatch. Its own comment says "O(N) per command; for
//                S06 we'll add a memoised view if it shows up in the bench."
//                This harness is that bench.
//   canExecMs  — handler.canExecute (pure validation).
//   execMs     — handler.execute = produceCommand (Immer produceWithPatches).
//   applyMs    — Store.applyPatch via attachStores (the authoritative-store
//                write), plus ring-buffer routed applies during undo.
//   residualMs — total − the above: record build, PatchEmitter fan-out to the
//                OTHER subscribers (EventLogPersistor, mirrors, CRDT applier),
//                undo-stack pushes. This is the (renderless) subscriber cost.
//
// ─── WHAT THIS FILE DOES NOT MEASURE — stated so a green is not over-read ────
//   1. SCENE-COMMIT / RENDER. `canvas: null` ⇒ composeRuntime's render half
//      never mounts (its own §5 comment: "Idle path (no canvas) — slot stays
//      renderer-null"). Scene-commit cost is a browser-lane number, NOT here.
//   2. The Vite dev server, network, persistence-to-disk. happy-dom
//      localStorage is in-memory.
//   3. `door.create` / `window.create` — they REFUSE by design
//      (§FIX-CREATE-LIVENESS-LIE): a hosted opening is created via the atomic
//      `wall.createOpening`. The refusal is asserted, not timed as a create.
//
// C03 (commands/state), C11 (element creation), C16 §8.6 B-6 (one gesture =
// one undo entry) bind the assertions; C04 binds nothing here (no renderer).

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { cpus, totalmem, platform, arch, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

import { composeRuntime } from '@pryzm/runtime-composer';
import { applyRingBufferSide, PatchEmitter } from '@pryzm/command-bus';
import { createId } from '@pryzm/schemas';
import { bootstrapWithEverything } from '../../apps/editor/src/bootstrap.everything.js';
import { generateDeterministicLayouts } from '../../packages/ai-host/src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { buildLayoutCommands } from '../../packages/ai-host/src/workflows/apartmentLayout/executePlan.js';
import type { ShellAnalysis } from '../../packages/ai-host/src/workflows/apartmentLayout/shellAnalysis.js';
import type {
  ApartmentProgram,
  ApartmentConstraints,
  ScoringWeights,
} from '../../packages/ai-host/src/workflows/apartmentLayout/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const BASELINE_PATH = resolve(REPO, 'audit', 'perf', '2026-09-02', 'baseline-inner.json');

const AUDIT = { actorId: 'perf-base-inner', projectId: 'perf-base-inner', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

let rt: any;
/** The REAL inner CommandBus — captured by the pass-through bootstrapFn wrapper
 *  below (composeRuntime deliberately hides `inner` from the runtime handle;
 *  the wrapper adds ZERO behaviour, it only lets the harness time
 *  `storesProvider`, which is a TS-private field on this instance). */
let innerBus: any;
/** The bootstrap store record — the SAME Store instances `attachStores` routes
 *  to (composeRuntime's public `stores` slot is the typed compound-family
 *  StoresSlot, which does NOT carry the element families; the element stores
 *  live on the inner runtime record keyed 'wall' / 'door' / 'window'). */
let innerStores: Record<string, any>;
/** The ADR-0318 authoritative WallStore module singleton (the one the composed
 *  runtime's `wireAuthoritativeElementMirror` writes for wall.create /
 *  wall.batch.create). Wiped alongside the DTO store between reps. */
let authoritativeWallStore: any;

// ── stage accumulators (reset per dispatch; dispatches are strictly serial) ──
const stage = { ctx: 0, canExec: 0, exec: 0, apply: 0, emit: 0, encode: 0, mirrorAdd: 0 };
function resetStage(): void {
  stage.ctx = 0; stage.canExec = 0; stage.exec = 0; stage.apply = 0;
  stage.emit = 0; stage.encode = 0; stage.mirrorAdd = 0;
}

/** Own-property shadows on the LIVE composed runtime. TS-`private` fields are
 *  plain properties at runtime; nothing on disk changes. */
function instrument(): void {
  if (!innerBus) throw new Error('[perf] the bootstrapFn wrapper did not capture the inner CommandBus');

  const origProvider = innerBus.storesProvider;
  innerBus.storesProvider = (ids: readonly string[]) => {
    const t0 = performance.now();
    const r = origProvider(ids);
    stage.ctx += performance.now() - t0;
    return r;
  };

  for (const type of ['wall.create', 'wall.batch.create', 'wall.createOpening', 'door.batch.create', 'window.batch.create']) {
    const h = handlers().get(type);
    if (!h) throw new Error(`[perf] handler '${type}' is NOT registered on the composed runtime — the subject is missing, refuse to fake it`);
    const oe = h.execute.bind(h);
    const oc = h.canExecute.bind(h);
    h.execute = (ctx: unknown, p: unknown) => {
      const t0 = performance.now();
      const r = oe(ctx, p);
      stage.exec += performance.now() - t0;
      return r;
    };
    h.canExecute = (ctx: unknown, p: unknown) => {
      const t0 = performance.now();
      const r = oc(ctx, p);
      stage.canExec += performance.now() - t0;
      return r;
    };
  }

  // PatchEmitter.emit msgpack-ENCODES the whole EventRecord before any listener
  // sees it (PatchEmitter.ts: `const bytes = PatchEmitter.encode(record)`), so
  // the encode is timed apart from the listener fan-out.
  const emitter = innerBus.emitter;
  const origEmit = emitter.emit.bind(emitter);
  emitter.emit = (record: unknown) => {
    const t0 = performance.now();
    const r = origEmit(record);
    stage.emit += performance.now() - t0;
    return r;
  };
  const origEncode = PatchEmitter.encode.bind(PatchEmitter);
  (PatchEmitter as any).encode = (record: unknown) => {
    const t0 = performance.now();
    const r = origEncode(record as never);
    stage.encode += performance.now() - t0;
    return r;
  };

  const origAdd = authoritativeWallStore.add.bind(authoritativeWallStore);
  authoritativeWallStore.add = (w: unknown) => {
    const t0 = performance.now();
    const r = origAdd(w);
    stage.mirrorAdd += performance.now() - t0;
    return r;
  };

  for (const key of ['wall', 'door', 'window']) {
    const s = innerStores[key];
    if (!s) throw new Error(`[perf] inner runtime store '${key}' is undefined on the REAL composed runtime`);
    const oa = s.applyPatch.bind(s);
    s.applyPatch = (patches: unknown) => {
      const t0 = performance.now();
      const r = oa(patches);
      stage.apply += performance.now() - t0;
      return r;
    };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
interface Sample {
  totalMs: number; ctxMs: number; canExecMs: number; execMs: number; applyMs: number;
  emitMs: number; encodeMs: number; mirrorAddMs: number; residualMs: number;
}

async function timedDispatch(type: string, payload: unknown, opts?: unknown): Promise<Sample> {
  resetStage();
  const t0 = performance.now();
  await rt.bus.executeCommand(type, payload, opts);
  const totalMs = performance.now() - t0;
  return {
    totalMs,
    ctxMs: stage.ctx,
    canExecMs: stage.canExec,
    execMs: stage.exec,
    applyMs: stage.apply,
    emitMs: stage.emit,
    encodeMs: stage.encode,
    mirrorAddMs: stage.mirrorAdd,
    // emit CONTAINS applyPatch (attachStores is a listener), encode and
    // mirrorAdd — so residual = total − ctx − canExec − exec − emit.
    residualMs: totalMs - stage.ctx - stage.canExec - stage.exec - stage.emit,
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}
function stats(xs: number[]): { n: number; medianMs: number; p95Ms: number; meanMs: number; minMs: number; maxMs: number } {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return {
    n: xs.length,
    medianMs: round3(quantile(s, 0.5)),
    p95Ms: round3(quantile(s, 0.95)),
    meanMs: round3(mean),
    minMs: round3(s[0] ?? NaN),
    maxMs: round3(s[s.length - 1] ?? NaN),
  };
}
function round3(x: number): number { return Math.round(x * 1000) / 1000; }

function summarise(samples: Sample[]): Record<string, unknown> {
  const by = (k: keyof Sample) => stats(samples.map(s => s[k]));
  return {
    total: by('totalMs'),
    stages: {
      ctx: by('ctxMs'),
      canExecute: by('canExecMs'),
      execute: by('execMs'),
      emitTotal: by('emitMs'),
      emit_msgpackEncode: by('encodeMs'),
      emit_applyPatch: by('applyMs'),
      emit_authoritativeMirrorAdd: by('mirrorAddMs'),
      residualPostEmit: by('residualMs'),
    },
  };
}

function store(key: string): any { return innerStores[key]; }
function storeSize(key: string): number { return store(key).getState().size; }
function wipeStore(key: string): void {
  const s = store(key);
  const ids = [...s.getState().keys()];
  if (ids.length > 0) s.applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
  // The mirror only handles ADD patches (authoritativeElementMirror MIRRORED map),
  // so the authoritative singleton must be cleared explicitly between reps or its
  // population would leak into later measurements.
  if (key === 'wall' && authoritativeWallStore?.clear) authoritativeWallStore.clear();
}
function ringBuffer(): any { return (rt.bus as any).ringBuffer; }
/** The LIVE handler registry — `rt.bus.registry` aliases `CommandBus.handlers`
 *  (composeRuntime's own comment: "the two answers cannot drift"). */
function handlers(): Map<string, any> { return (rt.bus as any).registry as Map<string, any>; }

// IDs are BRANDED `<kind>_<26-char Crockford ULID>` — the wall/door schemas
// REFUSE anything else (canExecute: "id must be a branded wall_<ulid>"), so the
// harness mints through the real factory, exactly as the tools do.
let wallSeq = 0;
function mkWall(_tag: string): Record<string, unknown> {
  const i = wallSeq++;
  const row = Math.floor(i / 50);
  const col = i % 50;
  const x0 = col * 3;
  const z0 = row * 3;
  return {
    id: createId('wall'),
    levelId: LEVEL_ID,
    baseLine: [{ x: x0, y: 0, z: z0 }, { x: x0 + 2, y: 0, z: z0 }],
    height: 2.7,
    thickness: 0.1,
  };
}
function mkOpening(kind: 'door' | 'window', openingId: string, elementId: string): Record<string, unknown> {
  return kind === 'door'
    ? { id: openingId, type: 'door', offset: 0.5, width: 0.9, height: 2.05, sillHeight: 0, elementId }
    : { id: openingId, type: 'window', offset: 0.5, width: 1.0, height: 1.2, sillHeight: 0.9, elementId };
}

// ── results bag → baseline JSON ──────────────────────────────────────────────
const RESULTS: Record<string, unknown> = {};

beforeAll(async () => {
  // Pass-through wrapper: composeRuntime hides `inner` from the handle on
  // purpose (L-375a); the harness needs the inner CommandBus ONLY to time its
  // private `storesProvider`. Behaviour is byte-identical to passing
  // `bootstrapWithEverything` directly.
  const capturingBootstrap = async (opts: unknown) => {
    const inner = await bootstrapWithEverything(opts as never);
    innerBus = inner.bus;
    innerStores = inner.stores as Record<string, any>;
    return inner;
  };
  rt = await composeRuntime({
    audit: AUDIT,
    canvas: null,
    bootstrapFn: capturingBootstrap as never,
  });

  // ── ATTACH THE ENGINE HALF — the MT-01 pattern (composedBusElementReadback
  // A-3), which is the same call apps/editor/src/engine/initBuilders.ts makes in
  // production (`wallStore.attachEngine(projectContext, bimManager)`), with the
  // SAME declared substitution that suite's stub ledger records: a minimal
  // level authority for the one level this harness uses. Without this,
  // `wall.create` REFUSES headless (ADR-0318 I-3 — measured on the first run of
  // this harness, and recorded in the findings: the refusal is BY DESIGN).
  const { projectContext } = await import('@pryzm/core-app-model/context');
  const { wallStore } = await import('@pryzm/geometry-wall/store');
  authoritativeWallStore = wallStore as any;
  const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, childrenIds: [] as string[] };
  const levelAuthority = {
    getLevelById: (id: string) => (id === LEVEL_ID ? level : undefined),
    getLevels: () => [level],
    registerElement: () => { /* spatial registration is an L7 concern */ },
  };
  (wallStore as any).attachEngine(projectContext, levelAuthority);
  if (!(wallStore as any).isEngineAttached()) throw new Error('[perf] engine attach failed');

  instrument();
}, BUDGET);

afterAll(() => {
  let headSha = 'unknown';
  try { headSha = execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(); } catch { /* fingerprint only */ }
  const cpu = cpus();
  const out = {
    lane: 'BASE-INNER (axes A+B, runtime layer)',
    capturedAt: new Date().toISOString(),
    environment: {
      kind: 'headless vitest (happy-dom) · REAL composeRuntime(bootstrapWithEverything) · renderless (canvas: null) · single fork',
      node: process.version,
      platform: `${platform()} ${release()} ${arch()}`,
      cpu: `${cpu[0]?.model ?? 'unknown'} × ${cpu.length}`,
      totalMemGB: round3(totalmem() / 1024 ** 3),
      headSha,
      treeState: 'dirty (multi-lane wave in flight) — see lane transcript for git status at lane start',
      caveat: 'scene-commit/render NOT included (no canvas); dev-server numbers are inadmissible per doctrine and are not what this measures',
    },
    reproduce: 'npx vitest run -c tools/perf/vitest.inner.config.mts',
    harness: 'tools/perf/inner-runtime-perf.perf.test.ts',
    stageKey: {
      ctx: 'bus.storesProvider = storesAsRecordView (Object.fromEntries over EVERY store, EVERY dispatch — bootstrap.ts)',
      canExecute: 'handler.canExecute',
      execute: 'handler.execute (produceCommand / Immer)',
      emitTotal: 'PatchEmitter.emit(record) — msgpack encode + ALL listener fan-out (attachStores/store.applyPatch, authoritative mirror, CommandEventBridge, persistence)',
      emit_msgpackEncode: 'PatchEmitter.encode — msgpack of the WHOLE EventRecord (payload + forward + inverse), computed unconditionally before any listener runs',
      emit_applyPatch: 'Store.applyPatch via attachStores (DTO store write; inside emit)',
      emit_authoritativeMirrorAdd: 'authoritative WallStore.add via wireAuthoritativeElementMirror (inside emit; wall verbs only)',
      residualPostEmit: 'record build + ring-buffer push (toJsonPointer × ops) + legacy undo push + gesture/audit bookkeeping',
    },
    results: RESULTS,
  };
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`[perf] baseline written → ${BASELINE_PATH}`);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AXIS A — single element creation via the bus verbs the UI dispatches', () => {

  it('A1 — wall.create × 60 (stage split per dispatch)', async () => {
    wipeStore('wall');
    const samples: Sample[] = [];
    for (let i = 0; i < 60; i++) {
      samples.push(await timedDispatch('wall.create', mkWall('a1')));
    }
    expect(storeSize('wall'), 'CA-21: every create must land in the authoritative store').toBe(60);
    RESULTS['A1_wall_create_single'] = { verb: 'wall.create', ...summarise(samples) };
  }, BUDGET);

  it('A2 — door-in-wall: wall.createOpening(type=door) × 60 + door.batch.create(1) × 60', async () => {
    wipeStore('wall'); wipeStore('door');
    // 60 host walls, one opening each (occupancy forbids stacking 60 openings on one wall).
    const hosts: string[] = [];
    for (let i = 0; i < 60; i++) {
      const w = mkWall('a2host');
      hosts.push(w.id as string);
      await rt.bus.executeCommand('wall.create', w);
    }
    const openingIds = Array.from({ length: 60 }, () => createId('opening') as string);
    const doorIds = Array.from({ length: 60 }, () => createId('door') as string);
    const openingSamples: Sample[] = [];
    for (let i = 0; i < 60; i++) {
      openingSamples.push(await timedDispatch('wall.createOpening', { wallId: hosts[i], opening: mkOpening('door', openingIds[i]!, doorIds[i]!) }));
    }
    // The door ELEMENT mint the generator path uses (door.batch.create with one entry).
    const doorSamples: Sample[] = [];
    for (let i = 0; i < 60; i++) {
      doorSamples.push(await timedDispatch('door.batch.create', {
        doors: [{ id: doorIds[i], wallId: hosts[i], openingId: openingIds[i], width: 0.9, height: 2.05 }],
      }));
    }
    expect(storeSize('door'), 'CA-21 read-back: doors in the authoritative store').toBe(60);
    RESULTS['A2a_wall_createOpening_door'] = { verb: 'wall.createOpening (type=door)', ...summarise(openingSamples) };
    RESULTS['A2b_door_batch_create_1'] = { verb: 'door.batch.create (1 entry)', ...summarise(doorSamples) };
  }, BUDGET);

  it('A3 — window-in-wall: wall.createOpening(type=window) × 60', async () => {
    wipeStore('wall');
    const hosts: string[] = [];
    for (let i = 0; i < 60; i++) {
      const w = mkWall('a3host');
      hosts.push(w.id as string);
      await rt.bus.executeCommand('wall.create', w);
    }
    const samples: Sample[] = [];
    for (let i = 0; i < 60; i++) {
      samples.push(await timedDispatch('wall.createOpening', { wallId: hosts[i], opening: mkOpening('window', createId('opening') as string, createId('window') as string) }));
    }
    RESULTS['A3_wall_createOpening_window'] = { verb: 'wall.createOpening (type=window)', ...summarise(samples) };
  }, BUDGET);

  it('A4 — door.create / window.create REFUSE by design (§FIX-CREATE-LIVENESS-LIE) — asserted, not timed', async () => {
    // These verbs exist and refuse; the UI's real path is the atomic wall.createOpening.
    await expect(rt.bus.executeCommand('door.create', { wallId: 'w', openingId: 'o' })).rejects.toThrow();
    await expect(rt.bus.executeCommand('window.create', { wallId: 'w', openingId: 'o' })).rejects.toThrow();
    RESULTS['A4_hosted_create_refusals'] = {
      note: "door.create and window.create REFUSE (hosted elements are created via the atomic 'wall.createOpening'); measured as an assertion, not a timing",
    };
  }, BUDGET);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AXIS B — bulk creation: batch verb vs N singles (the ratio is the finding)', () => {

  /** ⚠ `undoCount()` deltas are USELESS once the ring saturates (capacity 200:
   *  push drops the oldest, cursor stays at the end, count stays 200 — measured
   *  on run 5 of this harness). The one-entry proof reads the TOP entry instead:
   *  its commandType and its forward op count cover the whole batch. */
  function topEntry(): { commandType?: string; forwardOps?: number } {
    const cur = ringBuffer()?.current?.();
    return { commandType: cur?.commandType, forwardOps: cur?.forward?.ops?.length };
  }

  async function runBatch(count: number, reps: number): Promise<{ samples: Sample[]; topEntries: Array<{ commandType?: string; forwardOps?: number }> }> {
    const samples: Sample[] = [];
    const topEntries: Array<{ commandType?: string; forwardOps?: number }> = [];
    for (let r = 0; r < reps; r++) {
      wipeStore('wall');
      const walls = Array.from({ length: count }, () => mkWall(`b${count}r${r}`));
      samples.push(await timedDispatch('wall.batch.create', { walls, levelId: LEVEL_ID }));
      topEntries.push(topEntry());
      expect(storeSize('wall'), `batch(${count}) rep ${r}: all walls must land`).toBe(count);
    }
    return { samples, topEntries };
  }

  async function runSingles(count: number, reps: number): Promise<{ perRep: number[]; perDispatch: Sample[][]; undoDeltas: number[] }> {
    const perRep: number[] = [];
    const perDispatch: Sample[][] = [];
    const undoDeltas: number[] = [];
    for (let r = 0; r < reps; r++) {
      wipeStore('wall');
      const walls = Array.from({ length: count }, () => mkWall(`s${count}r${r}`));
      const rep: Sample[] = [];
      const t0 = performance.now();
      for (const w of walls) rep.push(await timedDispatch('wall.create', w));
      perRep.push(performance.now() - t0);
      undoDeltas.push(ringBuffer()?.undoCount?.() ?? -1);
      perDispatch.push(rep);
      expect(storeSize('wall'), `singles(${count}) rep ${r}: all walls must land`).toBe(count);
    }
    return { perRep, perDispatch, undoDeltas };
  }

  it('B1 — 100 walls: wall.batch.create × 12 reps vs 100 × wall.create × 6 reps', async () => {
    const batch = await runBatch(100, 12);
    const singles = await runSingles(100, 6);
    const batchTotal = stats(batch.samples.map(s => s.totalMs));
    const singlesTotal = stats(singles.perRep);
    RESULTS['B1_100_walls'] = {
      batch: { verb: 'wall.batch.create (100 walls, ONE dispatch)', ...summarise(batch.samples), topRingEntryPerRep: batch.topEntries },
      singles: {
        verb: 'wall.create × 100 (the anti-pattern)',
        totalPerRep: singlesTotal,
        perDispatch: summarise(singles.perDispatch.flat()),
        undoableEntriesAfterRep_ringCapped200: singles.undoDeltas,
      },
      ratio_singles_over_batch_median: round3(singlesTotal.medianMs / batchTotal.medianMs),
    };
    // C16 §8.6 B-6 — one gesture = ONE undo entry for the batch: the TOP ring
    // entry is the batch itself and its forward ops cover EVERY wall.
    for (const t of batch.topEntries) {
      expect(t.commandType).toBe('wall.batch.create');
      expect(t.forwardOps).toBe(100);
    }
  }, BUDGET);

  it('B2 — 1000 walls: wall.batch.create × 6 reps vs 1000 × wall.create × 2 reps (+ ctx growth curve)', async () => {
    const batch = await runBatch(1000, 6);
    const singles = await runSingles(1000, 2);
    const batchTotal = stats(batch.samples.map(s => s.totalMs));
    const singlesTotal = stats(singles.perRep);
    // The O(N)-per-dispatch context-view growth, measured on the last rep:
    // median ctxMs of dispatches 1-100 vs 451-550 vs 901-1000.
    const last = singles.perDispatch[singles.perDispatch.length - 1]!;
    const ctxWindow = (a: number, b: number) => stats(last.slice(a, b).map(s => s.ctxMs)).medianMs;
    RESULTS['B2_1000_walls'] = {
      batch: { verb: 'wall.batch.create (1000 walls, ONE dispatch)', ...summarise(batch.samples), topRingEntryPerRep: batch.topEntries },
      singles: {
        verb: 'wall.create × 1000 (the anti-pattern)',
        totalPerRep: singlesTotal,
        perDispatch: summarise(singles.perDispatch.flat()),
        undoableEntriesAfterRep_ringCapped200: singles.undoDeltas,
        ringBufferCapacityNote: 'RingBufferUndoStack DEFAULT_MAX_SIZE=200 — 1000 singles evict 800 entries; only the last 200 are undoable',
        ctxMedianMs_dispatch_1_100: ctxWindow(0, 100),
        ctxMedianMs_dispatch_451_550: ctxWindow(450, 550),
        ctxMedianMs_dispatch_901_1000: ctxWindow(900, 1000),
      },
      ratio_singles_over_batch_median: round3(singlesTotal.medianMs / batchTotal.medianMs),
    };
    for (const t of batch.topEntries) {
      expect(t.commandType).toBe('wall.batch.create');
      expect(t.forwardOps).toBe(1000);
    }
  }, BUDGET);

  it('B3 — undo of the 1000-batch: ONE ring-buffer entry; the composed undo slot is measured AS IS, then the working routing is timed', async () => {
    wipeStore('wall');
    const walls = Array.from({ length: 1000 }, () => mkWall('b3'));
    await rt.bus.executeCommand('wall.batch.create', { walls, levelId: LEVEL_ID });
    const cur = ringBuffer()?.current?.();
    expect(cur?.commandType, 'C16 §8.6 B-6: the TOP ring entry IS the batch').toBe('wall.batch.create');
    expect(cur?.forward?.ops?.length, 'ONE entry covers all 1000 walls').toBe(1000);
    expect(storeSize('wall')).toBe(1000);

    // ── LEG 1: the composition root's OWN undo slot, exactly as exposed. ──────
    // MEASURED FINDING (run 6 of this harness): `runtime.undoStack.undo()` calls
    // `bus.fetchStores(['wall'])` → `storesAsRecordView` → a PLAIN-OBJECT DTO
    // snapshot with no applyPatch — `applyRingBufferSide` refuses per C03 §4.7 B1
    // ("store \"wall\" missing or has no applyPatch()"), so the undo pops the
    // cursor and RESTORES NOTHING. Production Ctrl+Z routes through the L7
    // `performUndoRedo` (its own store map), which this lane does not drive.
    const t0 = performance.now();
    rt.undoStack.undo();
    const slotUndoMs = performance.now() - t0;
    const slotRestored = storeSize('wall') === 0;

    // ── LEG 2: the same inverse side applied through the WORKING routing ──────
    // (a real store map keyed like performUndoRedo's buildUndoStoreMap), so the
    // 1000-op inverse-apply cost itself is on record. The failed LEG-1 undo
    // already popped the cursor without applying, so redoPatch() re-aligns it
    // (its forward re-apply is an idempotent overwrite of records still present).
    const rb = ringBuffer();
    const redoSide = rb.redoPatch();
    if (redoSide) applyRingBufferSide(redoSide, ['wall'], { wall: store('wall') });
    expect(storeSize('wall'), 'cursor re-aligned; store population unchanged').toBe(1000);
    const pair = rb.current();
    const side = rb.undoPatch();
    const t1 = performance.now();
    const outcome = applyRingBufferSide(side!, pair!.affectedStores as readonly string[], { wall: store('wall') });
    const applyUndoMs = performance.now() - t1;
    expect(outcome.applied).toContain('wall');
    expect(storeSize('wall'), 'the inverse side of the ONE entry removes all 1000 walls').toBe(0);

    const authAfter = authoritativeWallStore.getAll().length;
    RESULTS['B3_undo_1000_batch'] = {
      undoEntriesForBatch: 1,
      proof: 'top ring entry commandType=wall.batch.create with 1000 forward ops; ONE inverse application emptied the DTO store',
      composedUndoSlot: {
        undoMs: round3(slotUndoMs),
        restoredDtoStore: slotRestored,
        finding: slotRestored ? 'slot restored the store' :
          'REACHABILITY FINDING — runtime.undoStack.undo() (Phase-D slot, composeRuntime buildPhaseDUndoStackSlot) pops the cursor but applies NOTHING to element stores: bus.fetchStores returns the storesAsRecordView DTO snapshot (plain objects, no applyPatch) and applyRingBufferSide refuses (C03 §4.7 B1, error printed on run 6). Any caller of the composition-root undo surface gets a silent no-op with a moved cursor. Production Ctrl+Z uses L7 performUndoRedo instead — verify there before logging user impact.',
      },
      inverseApplyViaRealStoreMap: {
        applyMs: round3(applyUndoMs),
        note: 'applyRingBufferSide(inverse, [wall], {wall: REAL store}) — the routing performUndoRedo performs; this is the actual 1000-op undo-apply cost',
      },
      authoritativeStoreSizeAfterUndo: authAfter,
      authoritativeNote: 'the authoritative mirror is add-only (MIRRORED map), so undo does not shrink the authoritative WallStore at this layer',
    };
  }, BUDGET);

  it('B4 — REAL generator path: D-TGL deterministic apartment layout → buildLayoutCommands → bus dispatch, end-to-end × 5', async () => {
    const program: ApartmentProgram = {
      bedrooms: 2, bathrooms: 1, masterEnSuite: false,
      openPlanKitchenDining: false, livingRoom: true, entranceHall: true,
    };
    const constraints: ApartmentConstraints = {
      minCorridorWidth: 1000, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
    };
    const weights: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
    const shell: ShellAnalysis = {
      perimeter: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 9 }, { x: 0, z: 9 }],
      netAreaM2: 90, widthM: 10, depthM: 9, faces: [],
    } as unknown as ShellAnalysis;

    const reps: Array<Record<string, number>> = [];
    let commandTally: Record<string, number> = {};
    const skippedVerbs = new Set<string>();
    for (let r = 0; r < 5; r++) {
      wipeStore('wall'); wipeStore('door'); wipeStore('window');
      const mint = (prefix: string): string => createId(prefix as never) as string;

      const tEngine0 = performance.now();
      const options = generateDeterministicLayouts(shell, program, constraints, weights, 3, undefined, undefined, { latDeg: 51.5 });
      const engineMs = performance.now() - tEngine0;
      expect(options.length, 'the deterministic engine must produce a layout').toBeGreaterThan(0);

      const tBuild0 = performance.now();
      // wallTypeId '' + doorSystemTypeId '' → handler defaults (an unknown catalogue id would refuse at dispatch).
      const set = buildLayoutCommands(options[0]!, { levelId: LEVEL_ID, wallTypeId: '', wallHeightM: 2.7, wallThicknessM: 0.1, doorSystemTypeId: '' }, mint);
      const buildMs = performance.now() - tBuild0;

      // ⚠ HARNESS ACCOMMODATION, recorded as a FINDING (see RESULTS note below):
      // buildLayoutCommands stamps DoorSystemTypeStore ids (`dt-solid-timber`, …)
      // onto door.batch.create entries, but CreateDoorBatch validates systemTypeId
      // against getDoorType() — the @pryzm/types-builtin registry
      // ('door.interior.single.standard', …). DIFFERENT VOCABULARY ⇒ the verb
      // REFUSES every generator door on the composed bus. systemTypeId is stripped
      // here so the end-to-end path can be timed; the mismatch itself is the finding.
      const stripSysType = (c: any) => c && ({
        ...c,
        payload: {
          ...c.payload,
          ...(Array.isArray((c.payload as any).doors)
            ? { doors: (c.payload as any).doors.map(({ systemTypeId: _s, ...d }: any) => d) } : {}),
          ...(Array.isArray((c.payload as any).windows)
            ? { windows: (c.payload as any).windows.map(({ systemTypeId: _s, ...w }: any) => w) } : {}),
        },
      });
      const commands = [
        set.wallBatch,
        ...set.openingCommands,
        ...(set.doorBatch ? [stripSysType(set.doorBatch)] : []),
        ...set.windowOpeningCommands,
        ...(set.windowBatch ? [stripSysType(set.windowBatch)] : []),
        ...set.shellWindowOpeningCommands,
        ...(set.shellWindowBatch ? [stripSysType(set.shellWindowBatch)] : []),
      ];
      commandTally = {};
      const tDispatch0 = performance.now();
      for (const c of commands) {
        if (!(rt.bus as any).has(c.command)) { skippedVerbs.add(c.command); continue; }
        await rt.bus.executeCommand(c.command, c.payload);
        commandTally[c.command] = (commandTally[c.command] ?? 0) + 1;
      }
      const dispatchMs = performance.now() - tDispatch0;
      expect(storeSize('wall'), 'generated walls must land').toBeGreaterThan(0);
      reps.push({
        engineMs: round3(engineMs), buildCommandsMs: round3(buildMs), dispatchMs: round3(dispatchMs),
        totalMs: round3(engineMs + buildMs + dispatchMs),
        wallsLanded: storeSize('wall'), doorsLanded: storeSize('door'), windowsLanded: storeSize('window'),
      });
    }
    RESULTS['B4_generator_apartment_end_to_end'] = {
      shape: '10×9 m shell · 2-bed/1-bath program · D-TGL deterministic engine (no LLM)',
      reps,
      engine: stats(reps.map(x => x.engineMs!)),
      buildCommands: stats(reps.map(x => x.buildCommandsMs!)),
      dispatch: stats(reps.map(x => x.dispatchMs!)),
      total: stats(reps.map(x => x.totalMs!)),
      dispatchedVerbTallyLastRep: commandTally,
      skippedVerbs: [...skippedVerbs],
      note: 'boundaryCommands/roomCommands are NOT dispatched (no bus verb / executor-owned) — matches the LayoutCommandSet contract',
      finding_doorSystemTypeVocabularyMismatch:
        "buildLayoutCommands stamps DoorSystemTypeStore ids (dt-solid-timber via defaultDoorSystemTypeId) onto door.batch.create/window.batch.create entries; CreateDoorBatch.canExecute validates systemTypeId against getDoorType() (@pryzm/types-builtin: 'door.interior.single.standard', ...). The vocabularies are disjoint, so the generator's door batch REFUSES on the composed bus ('door type not found: dt-solid-timber' — measured). The live editor dodges it because ApartmentLayoutExecutor drives the LEGACY CreateWallOpeningsBatchCommand instead. Harness strips systemTypeId to time the path; fixing it belongs to the door plugin / executePlan owners.",
    };
  }, BUDGET);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('FALSIFICATION — the harness must move when the subject degrades, and FAIL when it breaks', () => {

  it('F1 — a planted 25 ms busy-wait in wall.create execute moves the measured median by ≥ 20 ms', async () => {
    wipeStore('wall');
    const clean: Sample[] = [];
    for (let i = 0; i < 20; i++) clean.push(await timedDispatch('wall.create', mkWall('f1c')));

    const h = handlers().get('wall.create');
    const orig = h.execute;
    h.execute = (ctx: unknown, p: unknown) => {
      const t0 = performance.now();
      while (performance.now() - t0 < 25) { /* planted degradation — runtime wrap, NO repo file touched */ }
      return orig.call(h, ctx, p);
    };
    try {
      const degraded: Sample[] = [];
      for (let i = 0; i < 20; i++) degraded.push(await timedDispatch('wall.create', mkWall('f1d')));
      const cleanMed = stats(clean.map(s => s.totalMs)).medianMs;
      const degradedMed = stats(degraded.map(s => s.totalMs)).medianMs;
      expect(degradedMed - cleanMed, 'the harness must SEE a planted 25 ms degradation').toBeGreaterThanOrEqual(20);
      RESULTS['F1_falsification_planted_delay'] = {
        plantedMs: 25, cleanMedianMs: cleanMed, degradedMedianMs: degradedMed,
        verdict: 'harness tracks the subject — a planted delay moves the numbers by the planted amount',
      };
    } finally {
      h.execute = orig;
    }
  }, BUDGET);

  it('F2 — a BROKEN subject (handler throws) makes the measurement throw: numbers cannot be silently produced', async () => {
    const h = handlers().get('wall.create');
    const orig = h.execute;
    h.execute = () => { throw new Error('perf-falsification: subject deliberately broken'); };
    const sizeBefore = storeSize('wall');
    try {
      await expect(timedDispatch('wall.create', mkWall('f2'))).rejects.toThrow('deliberately broken');
      expect(storeSize('wall'), 'a broken subject must not mutate the store').toBe(sizeBefore);
      RESULTS['F2_falsification_broken_subject'] = {
        verdict: 'with the subject broken, timedDispatch rejects — the harness FAILS rather than reporting a number',
      };
    } finally {
      h.execute = orig;
    }
  }, BUDGET);
});
