// ─── MEASUREMENT SUITE · authoritative-state ─────────────────────────────────
//
// This file is the EXECUTED half of `gates/check-authoritative-state.ts`
// (BIM30-READINESS-GATES §3.2). It exists as a `*.cert.ts` rather than living
// inside the gate for ONE mechanical reason, stated here so it is never mistaken
// for the artefact-scavenging pattern `check-identity-roundtrip` uses:
//
//   `../world.ts` imports `apps/editor/src/engine/initBusHandlers`, which reaches
//   `@pryzm/file-format`'s barrel → `PdfExportService` → `import { svg2pdf } from
//   'svg2pdf.js'`. That package ships no `exports` map and no named ESM export,
//   so bare Node (which is what `certify.ts`'s `npx tsx <gate>` gives us) throws
//   `SyntaxError: The requested module 'svg2pdf.js' does not provide an export
//   named 'svg2pdf'` before a single store is constructed. Vite's interop
//   resolves it; Node's does not.
//
//   §3.2 names `certification/world.ts` as the subject's substrate, and the LIVE
//   bridge verbs (`wall.updateDimensions`, `roof.update`, `element.update-
//   Parameters`, the door/window offset bridges) ONLY exist once `initBusHandlers`
//   has run. Reaching them is not optional, so the gate spawns vitest on THIS
//   file — inside the same gate invocation — and grades what it wrote. The gate is
//   therefore EXECUTED (§2.1a: it needs something that does not exist until
//   something runs), not a scan, and its residency follows.
//
// WHAT IT MEASURES — one dispatch at a time, each bracketed by an INDEPENDENT
// read-back through `capture.ts`'s `kindReaders` (the same store instances
// `ProjectSerializer` reads). Nothing here consults a CommandResult, a handler
// patch, or any store's own opinion about whether it changed — C70 L-INV-4: the
// only evidence of a mutation is an independent read-back of authoritative state.
//
// This file writes `results/authoritative-state.json` and ASSERTS NOTHING.
// Every verdict belongs to the gate. A measurement file that also judged would
// give the suite two oracles that can disagree, which is the worst outcome
// available (the `check-identity-roundtrip` header's rule, applied in the other
// direction).

import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildWorld, type World } from '../world';
import { seedWorld } from '../seed';
import { captureState, diffState, kindReaders, isAdr0319Class3 } from '../capture';

/** A verb under measurement, with the property set its dispatch is DECLARED to move. */
interface VerbCase {
  /** bus verb */
  verb: string;
  /** stable case label — the ledger keys on this, never on an index */
  label: string;
  /** builds the payload from live seeded ids */
  payload: (ids: SeededIds) => unknown;
  /**
   * The authoritative paths this dispatch is DECLARED to move, as `<kind>.*.<field>`
   * patterns with the record id elided. §3.2: "the gate checks that the diff matches
   * the DECLARATION, not that the declaration is correct" — this is the declaration.
   * An empty array means "this verb is declared to move NOTHING", which is only
   * legal for a refusal case.
   */
  declaredPaths: string[];
  /**
   * REFUSAL case: the verb is aimed at a target that does not exist. §3.2 S4 —
   * the store must be unchanged AND the refusal must name the rule.
   */
  refusal?: boolean;
}

interface SeededIds {
  roomId: string;
  doorId: string | undefined;
  windowId: string | undefined;
  /**
   * System-type names resolved LIVE from each catalogue at measurement time,
   * never hard-coded. Recorded because the first run of this gate hard-coded
   * plausible names ("Generic 200mm", "Single Flush", "Fixed") and every batch
   * verb came back "there is no type called …" — a fixture error wearing the
   * costume of a product defect. A gate whose finding is its own bad input is
   * worse than no gate, so the catalogue is asked rather than guessed. `null`
   * means the catalogue itself was unreachable, which IS a real finding and is
   * reported as one rather than silently becoming a bad type name.
   */
  wallType: string | null;
  doorType: string | null;
  windowType: string | null;
  slabType: string | null;
}

/** Class-2 counters and class-3 incidentals are NOT the subject of S1.
 *  ADR-0319: `metadata.version` / `_renderVersion` are DERIVED-BUT-CAUSAL and
 *  `metadata.createdAt` / `modifiedAt` are DERIVED-INCIDENTAL. A gate that
 *  counted them as "unexpected paths" would report a finding on every single
 *  verb and be switched off within a week. They are separated out and PRINTED,
 *  never silently dropped. */
const DERIVED_TAILS = ['metadata.version', '_renderVersion'];
function isDerivedCounter(path: string): boolean {
  const segs = path.split('.');
  return DERIVED_TAILS.some((f) => {
    const fs = f.split('.');
    if (segs.length <= fs.length) return false;
    return fs.every((s, i) => segs[segs.length - fs.length + i] === s);
  });
}
function isDerived(path: string): boolean {
  return isDerivedCounter(path) || isAdr0319Class3(path);
}

/** `wall.cert-wall-1.height` → `wall.*.height` — the id is elided so a declaration
 *  is written once and does not rot when a uuid changes between runs. */
function generalise(path: string): string {
  const segs = path.split('.');
  if (segs.length < 3) return path;
  return [segs[0], '*', ...segs.slice(2)].join('.');
}

const CASES: VerbCase[] = [
  // ── apps/editor LIVE bridge verbs (initBusHandlers) ──────────────────────
  {
    verb: 'wall.updateDimensions', label: 'wall.updateDimensions',
    payload: () => ({ wallId: 'cert-wall-1', height: 5.5 }),
    declaredPaths: ['wall.*.height'],
  },
  {
    verb: 'wall.updateColor', label: 'wall.updateColor',
    payload: () => ({ wallId: 'cert-wall-1', materialColor: '#123456' }),
    declaredPaths: ['wall.*.materialColor'],
  },
  {
    verb: 'roof.update', label: 'roof.update',
    payload: () => ({ id: 'cert-roof-1', updates: { thickness: 0.5 } }),
    declaredPaths: ['roof.*.thickness'],
  },
  {
    verb: 'slab.updateDimensions', label: 'slab.updateDimensions',
    payload: () => ({ slabId: 'cert-slab-1', thickness: 0.4 }),
    declaredPaths: ['slab.*.thickness'],
  },
  {
    verb: 'element.updateParameters', label: 'element.updateParameters(wall.materialColor)',
    payload: () => ({ elementId: 'cert-wall-2', elementType: 'wall', parameters: { materialColor: '#998877' } }),
    declaredPaths: ['wall.*.materialColor'],
  },
  {
    // The hosted-element pair: the opening record lives on the WALL and the door
    // record lives in the door store. BOTH must move — a door offset that moved
    // only one of them is a split-brain, which is this gate's whole subject.
    verb: 'door.setOffset', label: 'door.setOffset',
    payload: (ids) => ({ doorId: ids.doorId, newOffset: 3.0, prevOffset: 2.5 }),
    declaredPaths: ['wall.*.openings.0.offset', 'door.*.offset'],
  },
  {
    verb: 'door.setWidth', label: 'door.setWidth',
    payload: (ids) => ({ doorId: ids.doorId, width: 1.1, prevWidth: 0.9 }),
    declaredPaths: ['wall.*.openings.0.width', 'door.*.width'],
  },
  {
    verb: 'window.setOffset', label: 'window.setOffset',
    payload: (ids) => ({ windowId: ids.windowId, newOffset: 1.5, prevOffset: 1.0 }),
    declaredPaths: ['wall.*.openings.0.offset', 'window.*.offset'],
  },
  {
    verb: 'window.setSillHeight', label: 'window.setSillHeight',
    payload: (ids) => ({ windowId: ids.windowId, sillHeight: 1.1, prevSillHeight: 0.9 }),
    declaredPaths: ['wall.*.openings.0.sillHeight', 'window.*.sillHeight'],
  },
  // ── plugin bridge verbs registered by world.ts ───────────────────────────
  {
    verb: 'room.setName', label: 'room.setName',
    payload: (ids) => ({ roomId: ids.roomId, name: 'Gate Probe Room' }),
    declaredPaths: ['room.*.name'],
  },
  {
    verb: 'room.setNumber', label: 'room.setNumber',
    payload: (ids) => ({ roomId: ids.roomId, number: '9' }),
    declaredPaths: ['room.*.roomNumber'],
  },
  {
    verb: 'room.setMaterial', label: 'room.setMaterial',
    payload: (ids) => ({ roomId: ids.roomId, materialColor: '#00ff00' }),
    declaredPaths: ['room.*.colour'],
  },
  {
    verb: 'wall.updateBaseline', label: 'wall.updateBaseline',
    payload: () => ({
      wallId: 'cert-wall-1',
      newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 7, y: 0, z: 0 }],
      prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    }),
    declaredPaths: ['wall.*.baseLine.1.x', 'wall.*._sourceBaseLine'],
  },
  {
    verb: 'wall.updateColorBatch', label: 'wall.updateColorBatch',
    payload: () => ({ wallIds: ['cert-wall-2'], materialColor: '#abcdef' }),
    declaredPaths: ['wall.*.materialColor'],
  },
  {
    verb: 'wall.updateSystemTypeBatch', label: 'wall.updateSystemTypeBatch',
    payload: (ids) => ({ wallIds: ['cert-wall-1'], systemType: ids.wallType }),
    // Applying a wall TYPE legitimately cascades into the fields the type owns —
    // thickness and the layer stack come FROM the type. `_sourceBaseLine` clears
    // because the wall is rebuilt from its own baseline. All four are declared so
    // the arm asserts "exactly this set", not "at least one path".
    declaredPaths: ['wall.*.systemTypeId', 'wall.*.thickness', 'wall.*.layers', 'wall.*._sourceBaseLine'],
  },
  {
    verb: 'door.updateSystemTypeBatch', label: 'door.updateSystemTypeBatch',
    payload: (ids) => ({ doorIds: [ids.doorId], systemType: ids.doorType }),
    declaredPaths: [
      'door.*.systemTypeId', 'door.*.frameThickness', 'door.*.frameColor',
      'door.*.leafThickness', 'door.*.leafColor', 'door.*.frameFinish',
      'door.*.leafFinish', 'door.*.finishMaterial',
    ],
  },
  {
    verb: 'window.updateSystemTypeBatch', label: 'window.updateSystemTypeBatch',
    payload: (ids) => ({ windowIds: [ids.windowId], systemType: ids.windowType }),
    declaredPaths: [
      'window.*.systemTypeId', 'window.*.glazingThickness', 'window.*.rebateDepth',
      'window.*.frameFinish', 'window.*.sillFinish', 'window.*.finishMaterial',
    ],
  },
  {
    verb: 'slab.updateSystemTypeBatch', label: 'slab.updateSystemTypeBatch',
    payload: (ids) => ({ slabIds: ['cert-slab-1'], systemType: ids.slabType }),
    declaredPaths: ['slab.*.systemTypeId'],
  },
  // ── S4 · refusal cases: a verb aimed at a target that does not exist ──────
  {
    verb: 'wall.updateDimensions', label: 'REFUSAL wall.updateDimensions(absent wall)',
    payload: () => ({ wallId: 'no-such-wall-at-all', height: 9.9 }),
    declaredPaths: [], refusal: true,
  },
  {
    verb: 'room.setName', label: 'REFUSAL room.setName(absent room)',
    payload: () => ({ roomId: 'no-such-room-at-all', name: 'X' }),
    declaredPaths: [], refusal: true,
  },
  {
    verb: 'roof.update', label: 'REFUSAL roof.update(absent roof)',
    payload: () => ({ id: 'no-such-roof-at-all', updates: { thickness: 0.9 } }),
    declaredPaths: [], refusal: true,
  },
];

/** The dtoStores object `world.ts` hands the bus as `storesProvider`. Reached
 *  defensively across the shapes CommandBus may keep it under — a failure to
 *  reach it is REPORTED (and floored by the gate), never silently treated as
 *  "the DTO did not change". */
function reachDtoStores(world: World): { reached: boolean; how: string; value: unknown } {
  const b = world.bus as unknown as Record<string, unknown>;
  for (const path of ['opts', 'options', 'config', '_opts']) {
    const holder = b[path] as Record<string, unknown> | undefined;
    const p = holder?.storesProvider;
    if (typeof p === 'function') {
      try { return { reached: true, how: `bus.${path}.storesProvider()`, value: (p as () => unknown)() }; }
      catch { /* fall through */ }
    }
  }
  const direct = b.storesProvider;
  if (typeof direct === 'function') {
    try { return { reached: true, how: 'bus.storesProvider()', value: (direct as () => unknown)() }; }
    catch { /* fall through */ }
  }
  return { reached: false, how: 'NOT REACHED — no storesProvider found on the bus', value: undefined };
}

describe('authoritative-state measurement', () => {
  it('dispatches every certified verb and records the independent read-back diff', async () => {
    const roomId = crypto.randomUUID();
    const world = await buildWorld();
    const seed = await seedWorld(world, roomId);

    const doorId = (await import('@pryzm/geometry-door')).doorStore.getAll()[0]?.id;
    const windowId = (await import('@pryzm/geometry-window')).windowStore.getAll()[0]?.id;

    /** First name in a live catalogue, or null when the catalogue is unreachable. */
    const firstTypeName = (store: unknown): string | null => {
      try {
        const all = (store as { getAll?: () => Array<{ name?: string; id?: string }> }).getAll?.() ?? [];
        return all[0]?.name ?? all[0]?.id ?? null;
      } catch { return null; }
    };
    const camTypes = await import('@pryzm/core-app-model') as unknown as Record<string, unknown>;
    const ids: SeededIds = {
      roomId, doorId, windowId,
      wallType: firstTypeName((await import('@pryzm/geometry-wall') as unknown as Record<string, unknown>).wallSystemTypeStore),
      doorType: firstTypeName(camTypes.doorSystemTypeStore),
      windowType: firstTypeName(camTypes.windowSystemTypeStore),
      // The slab batch command reads a FLOOR system-type catalogue; the harness
      // reports what it actually found rather than assuming the two are the same.
      slabType: firstTypeName(camTypes.floorSystemTypeStore),
    };

    const dto = reachDtoStores(world);

    // ── the pre-mutation capture: the floor's "records in the pre-mutation
    //    capture ≥ 12" is measured over THIS, before any case runs.
    const baseline = captureState(world);
    const kindsReached = Object.values(baseline).filter((k) => k.reached).length;
    const baselineRecords = Object.values(baseline)
      .reduce((n, k) => n + Object.keys(k.records).length, 0);

    // ── S3 · duplicate authoritative owner detection ─────────────────────────
    // A rival is not a rival because a CLASS with the same name is exported —
    // that is a grep finding, and §1.1 rule 3 forbids passing (or failing) on
    // one. A rival is a SECOND LIVE INSTANCE that answers `getAll()` for the
    // same kind and is not the instance `kindReaders` calls authoritative.
    // Identity (`!==`) plus a record-count disagreement is the evidence.
    const cam = await import('@pryzm/core-app-model') as unknown as Record<string, unknown>;
    const authoritativeByKind = new Map(kindReaders(world).map(([k, read]) => [k, read]));
    const rivalOwners: Array<{
      kind: string; authoritative: string; rival: string;
      sameInstance: boolean; authoritativeCount: number; rivalCount: number; ids: { authoritative: string[]; rival: string[] };
    }> = [];

    const singletonRivals: Array<[string, string, unknown, unknown]> = [
      ['door', '@pryzm/core-app-model.doorStore',
        (await import('@pryzm/geometry-door')).doorStore, cam.doorStore],
      ['window', '@pryzm/core-app-model.windowStore',
        (await import('@pryzm/geometry-window')).windowStore, cam.windowStore],
    ];
    for (const [kind, rivalName, authoritativeStore, rivalStore] of singletonRivals) {
      if (!rivalStore) continue;
      const readIds = (s: unknown): string[] => {
        try {
          const all = (s as { getAll?: () => Array<{ id: string }> }).getAll?.() ?? [];
          return all.map((r) => r.id);
        } catch { return ['<getAll threw>']; }
      };
      const aIds = authoritativeByKind.has(kind)
        ? authoritativeByKind.get(kind)!().map((r) => r.id)
        : readIds(authoritativeStore);
      const rIds = readIds(rivalStore);
      rivalOwners.push({
        kind,
        authoritative: kind === 'door' ? '@pryzm/geometry-door.doorStore' : '@pryzm/geometry-window.windowStore',
        rival: rivalName,
        sameInstance: authoritativeStore === rivalStore,
        authoritativeCount: aIds.length,
        rivalCount: rIds.length,
        ids: { authoritative: aIds.slice(0, 8), rival: rIds.slice(0, 8) },
      });
    }

    // ── S4 evidence capture: the refusal the USER would see ──────────────────
    // Several bridges under measurement report their refusal on a CustomEvent
    // (`pryzm-*-batch-report`) rather than by rejecting the bus promise. That is
    // the S4 subject: whether a refusal REACHES the caller, or merely happens.
    // Every such event fired during a dispatch is attributed to that dispatch, so
    // a report of "refused, and here is the rule it named" can be distinguished
    // from "silently did nothing" — two facts that otherwise print the same value.
    const eventLog: Array<{ type: string; detail: unknown }> = [];
    const wnd = globalThis.window as unknown as {
      addEventListener?: (t: string, l: (e: unknown) => void) => void;
    };
    for (const evt of [
      'pryzm-wall-type-batch-report', 'pryzm-wall-color-batch-report',
      'pryzm-door-type-batch-report', 'pryzm-window-type-batch-report',
      'pryzm-slab-type-batch-report',
    ]) {
      try {
        wnd.addEventListener?.(evt, (e: unknown) => {
          eventLog.push({ type: evt, detail: (e as { detail?: unknown })?.detail });
        });
      } catch { /* an unhookable event is reported by its absence below */ }
    }

    // ── the per-verb loop ────────────────────────────────────────────────────
    const cases: Array<Record<string, unknown>> = [];
    for (const c of CASES) {
      const eventsBefore = eventLog.length;
      const registered = (world.bus.registry as unknown as Map<string, unknown>).has?.(c.verb) ?? false;
      const before = captureState(world);
      const dtoBefore = JSON.stringify(dto.value ?? {});
      const ringBefore = world.ringPushes.length;

      const outcome = await world.dispatch(c.verb, c.payload(ids));

      const after = captureState(world);
      const dtoAfter = JSON.stringify(dto.value ?? {});
      const d = diffState(before, after, () => false);

      const allPaths = d.divergences.map((x) => ({
        path: x.path, generalised: generalise(x.path),
        expected: x.expected, actual: x.actual,
        derived: isDerived(x.path),
      }));
      const corePaths = allPaths.filter((p) => !p.derived);

      cases.push({
        label: c.label,
        verb: c.verb,
        refusal: c.refusal === true,
        registered,
        declaredPaths: c.declaredPaths,
        // `ok` is the BUS's opinion. It is recorded and never used as evidence of
        // a mutation — that is the whole point of the read-back beside it.
        dispatchOk: outcome.ok,
        dispatchError: outcome.err,
        authoritativePaths: corePaths,
        derivedPaths: allPaths.filter((p) => p.derived).map((p) => p.generalised),
        misconfiguredKinds: d.misconfigured,
        dtoChanged: dtoBefore !== dtoAfter,
        ringDelta: world.ringPushes.length - ringBefore,
        // Refusal evidence: what (if anything) the caller could have observed.
        reportEvents: eventLog.slice(eventsBefore).map((e) => ({
          type: e.type,
          success: (e.detail as { success?: boolean } | undefined)?.success,
          info: (e.detail as { info?: string[] } | undefined)?.info ?? [],
        })),
      });
    }

    // ── NEGATIVE CONTROL (§2.2, run EVERY time) ──────────────────────────────
    // A verb whose ONLY observable effect is on the detached plugin-DTO record.
    // §3.2's negative control asks for exactly this: "point one verb's handler at
    // a detached DTO clone. S2 must name the verb and report 'authoritative store
    // unchanged; DTO-only write'." It is registered under a throwaway verb name so
    // no production handler is touched, and it writes ONLY to dtoStores.
    let negativeControl: Record<string, unknown> = { ran: false };
    try {
      const dtoObj = dto.value as Record<string, Record<string, unknown>> | undefined;
      world.bus.register({
        type: '__gate.dtoOnlyWrite',
        affectedStores: ['wall'] as const,
        canExecute: () => ({ valid: true }),
        execute: () => {
          if (dtoObj) dtoObj.wall = { ...(dtoObj.wall ?? {}), '__gate-planted': { height: 99 } };
          return { forward: [], inverse: [] };
        },
      } as never);
      const before = captureState(world);
      const dtoBefore = JSON.stringify(dto.value ?? {});
      const outcome = await world.dispatch('__gate.dtoOnlyWrite', {});
      const after = captureState(world);
      const d = diffState(before, after, () => false);
      const core = d.divergences.filter((x) => !isDerived(x.path));
      negativeControl = {
        ran: true,
        dispatchOk: outcome.ok,
        dispatchError: outcome.err,
        authoritativePathCount: core.length,
        authoritativePaths: core.map((x) => x.path),
        dtoChanged: JSON.stringify(dto.value ?? {}) !== dtoBefore,
      };
    } catch (e) {
      negativeControl = { ran: false, error: String(e).slice(0, 400) };
    }

    // ── POSITIVE CONTROL (§2.2, run EVERY time) ──────────────────────────────
    // §3.2 names it verbatim: "`wall.updateDimensions` with `height: 4.2` on the
    // seeded wall: the diff must be exactly `wall.<id>.height 3 → 4.2` and nothing
    // else." It proves the comparator is not stuck red — and, paired with the
    // widening control below, that it does not absorb extras.
    //
    // It runs against `cert-wall-2`, NOT the `cert-wall-1` the case loop drove.
    // Reason, recorded because the first run of this gate found it: `cert-wall-1`
    // had been through `wall.updateBaseline`, which sets `_sourceBaseLine`; the
    // next `updateDimensions` rebuilds the wall from its own baseline and clears
    // that field again, so the control saw TWO paths and would have failed its
    // own exactly-one floor for a reason that has nothing to do with the arm it
    // proves. Isolating the control's subject is the fix; the clearing itself is
    // reported by the case loop as an undeclared path on `wall.updateDimensions`,
    // where it belongs. A control must fail for its OWN reason or it is noise.
    let positiveControl: Record<string, unknown> = { ran: false };
    try {
      const before = captureState(world);
      const outcome = await world.dispatch('wall.updateDimensions', { wallId: 'cert-wall-2', height: 4.2 });
      const after = captureState(world);
      const d = diffState(before, after, () => false);
      const core = d.divergences.filter((x) => !isDerived(x.path));
      positiveControl = {
        ran: true,
        dispatchOk: outcome.ok,
        paths: core.map((x) => `${generalise(x.path)} ${JSON.stringify(x.expected)}→${JSON.stringify(x.actual)}`),
        pathCount: core.length,
      };
    } catch (e) {
      positiveControl = { ran: false, error: String(e).slice(0, 400) };
    }

    // ── WIDENING CONTROL (§3.2's second negative control) ────────────────────
    // "widen the expected-path set by one field and confirm the comparator
    // reports the extra path rather than absorbing it." Measured here as data:
    // a dispatch is run whose declaration deliberately OMITS a path the verb
    // really moves. The gate asserts the comparator reported the omitted path as
    // UNDECLARED. If the comparator absorbed it, the gate exits 2 — a comparator
    // that cannot see an extra path cannot see a DTO-only write either.
    let wideningControl: Record<string, unknown> = { ran: false };
    try {
      const before = captureState(world);
      const outcome = await world.dispatch('wall.updateDimensions', { wallId: 'cert-wall-2', height: 3.3, thickness: 0.44 });
      const after = captureState(world);
      const d = diffState(before, after, () => false);
      const core = d.divergences.filter((x) => !isDerived(x.path)).map((x) => generalise(x.path));
      wideningControl = {
        ran: true,
        dispatchOk: outcome.ok,
        // declaration deliberately names ONLY height; thickness must surface as undeclared
        declaredPaths: ['wall.*.height'],
        observedPaths: core,
        undeclared: core.filter((p) => p !== 'wall.*.height'),
      };
    } catch (e) {
      wideningControl = { ran: false, error: String(e).slice(0, 400) };
    }

    writeFileSync(
      resolve(__dirname, '../results/authoritative-state.json'),
      JSON.stringify({
        measuredAt: new Date().toISOString(),
        seedOutcomes: seed.seedOutcomes,
        registrationFailures: world.registrationFailures,
        dtoReached: dto.reached,
        dtoHow: dto.how,
        kindsReached,
        baselineRecords,
        baselineByKind: Object.fromEntries(
          Object.entries(baseline).map(([k, v]) => [k, { reached: v.reached, n: Object.keys(v.records).length }]),
        ),
        rivalOwners,
        cases,
        positiveControl,
        negativeControl,
        wideningControl,
      }, null, 1),
    );
  }, 600_000);
});
