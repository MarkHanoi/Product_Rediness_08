#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-mirror-reachability.ts
 *
 * §MIRROR-REACH (L-10320) — **ARM E of §MIRROR-COMPLETENESS: the EXECUTED arm.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ THE SENTENCE THIS GATE EXISTS TO DELETE
 * ═══════════════════════════════════════════════════════════════════════════
 * `check-mirror-completeness.ts` passes and then prints, verbatim:
 *
 *     ⚠ NOT ESTABLISHED: that any covered verb's event reaches a subscriber,
 *       a legacy record, or a mesh.
 *
 * That is honest and it is a hole. A `case` arm in `CommandEventBridge.ts` is a
 * **DECLARED** channel: the sibling gate proves the channel is spelled, never
 * that anything travels down it. This gate DISPATCHES the verb through the real
 * `CommandBus`, through the real `wireCommandEventBridge`, onto a real
 * `EventBus`, and RECORDS WHAT CAME OUT.
 *
 * ⛔ It closes the FIRST of those three clauses (`… reaches a subscriber`) for a
 *    NAMED, SMALL set of verbs, and only half of it executed — see
 *    §WHAT-THIS-DOES-NOT-COVER below, which is the most important section here.
 *    It does NOT close `a legacy record` and it does NOT close `a mesh`.
 *
 * ─── WHY EXECUTED, AND NOT A DEEPER STATIC TRACE ───────────────────────────
 * A static trace (verb → case → `events.emit('x.created')` → `.on('x.created')`)
 * would have been cheaper and would have been WRONG in the direction that costs
 * the most: it cannot see a `canExecute` that refuses, so it grades all thirteen
 * dead `*.setMaterial` verbs — which validate nothing, mutate nothing and reach
 * nothing — exactly as it grades a live verb. `[[committed-is-not-reachable]]`:
 * prove it at the layer the user experiences, and for a relay that layer is the
 * event that actually fired.
 *
 * ⭐ THE DISCRIMINATOR THIS GATE IS BUILT AROUND, stated so it can be checked:
 *   `slab.setMaterial` and `slab.setThickness` are the SAME family, the SAME
 *   store key (`slab`), the SAME handler shape, authored days apart. One is dead
 *   and one is live. If an instrument grades them the same it is not measuring
 *   reachability — it is measuring spelling. This gate reads them **REFUSED**
 *   and **REACHES-SUBSCRIBER** respectively, from an executed dispatch.
 *
 * ─── THE FOUR VERDICTS ─────────────────────────────────────────────────────
 *   `REACHES-SUBSCRIBER`   a TYPED family event fired AND at least one non-test
 *                          source file in the repo subscribes to that exact
 *                          event name. The channel is spelled at both ends.
 *   `TYPED-EVENT-NO-SUB`   a typed event fired and NOTHING anywhere listens for
 *                          it. A channel into the void — the bridge's own work
 *                          reaching nobody. NINE of the bridge's 28 emitted
 *                          names are in this state today (ARM E2 below).
 *   `NO-TYPED-EVENT`       the handler VALIDATED, EXECUTED and produced forward
 *                          patches — and the only event that fired was the
 *                          generic `command.executed`. ⛔ THIS IS THE FOUNDER'S
 *                          DEFECT: the command succeeds, the DTO store changes,
 *                          the screen does not.
 *   `REFUSED`              the bus threw at `canExecute`. Nothing mutates, so
 *                          nothing can reach anything. Deliberate for the
 *                          `*.setMaterial` family (§FIX-DEAD-VERB-REFUSE) — an
 *                          HONEST dead end, and still a capability the founder
 *                          does not have.
 *   `PATCH-DROPPED`        the handler produced patches for a store key that no
 *                          `Store` is registered under (§FIX-SILENT-PATCH-DROP,
 *                          L-811). Measured via `attachStores`' own callback.
 *   `UNPROVEN`             the harness could not construct the subject (import
 *                          failed / the fixture payload was rejected for a
 *                          SHAPE reason). ⛔ Never counted as a pass, never
 *                          counted as a fail — it trips a floor.
 *
 * ⚠ THE VERDICTS ARE PINNED EXACTLY, NOT ORDERED ON A LATTICE. A lattice would
 * let `REFUSED` → `NO-TYPED-EVENT` read as "improvement", and it is the
 * opposite: that is a dead verb quietly re-enabled with no mirror behind it,
 * i.e. `[[refusing-half-needs-its-escape-hatch]]` run backwards. Any change from
 * the ledgered verdict is a finding; only a change TO `REACHES-SUBSCRIBER` is
 * PAID DEBT, and paid debt must LEAVE the ledger in the same commit.
 *
 * ─── ARM E1 — EXECUTED RELAY REACHABILITY (the named set) ───────────────────
 * `FIXTURES` below drives real production handler classes over a real
 * `CommandBus` + real `PatchEmitter` + real `attachStores` + real plugin
 * `Store` subclasses + the real `CommandEventBridge`. The ONLY thing standing
 * in for production is the *editor*: no DOM, no THREE, no `initTools`.
 *
 * ⭐ THE FIXTURES SEED THEMSELVES THROUGH THE PRODUCTION CREATE VERB. Every
 * mutation fixture operates on an id minted by dispatching the family's real
 * `*.create` first. A hand-written store record is a fake built from the header
 * (`[[fake-more-capable-than-real]]`) and would make every "record not found"
 * refusal look like a dead verb.
 *
 * ─── ARM E2 — ORPHAN CHANNELS (STATIC, and labelled STATIC) ─────────────────
 * The same question at the other end of the wire, cheap enough to answer for
 * ALL of them: the bridge emits N distinct typed event names; which of them has
 * no `.on('<name>')` anywhere outside tests? This is a NAME MATCH over source
 * text. It is not executed and it is not claimed to be.
 *
 * ─── ⛔ §WHAT-THIS-DOES-NOT-COVER — read this before quoting a green ────────
 *  1. **The subscriber is NAMED, not RUN.** `apps/editor/src/engine/initTools.ts`
 *     imports the browser world (its transitive `svg2pdf.js` import alone
 *     refuses to load under node), so no gate in this directory can execute a
 *     mirror callback. A `REACHES-SUBSCRIBER` verdict means *"a typed event
 *     really fired, and a file really contains a listener for that name"* — the
 *     emit half is executed, the listen half is a grep.
 *  2. **The legacy RECORD is not inspected.** Whether the subscriber writes a
 *     WELL-FORMED legacy record — the boundaryLine defect — is invisible here.
 *  3. **No mesh.** `LiftCompoundReachesTheMesh.test.ts` and
 *     `BeamMasterMaterialReachesMesh.test.ts` are what the mesh layer looks
 *     like, and they are per-family vitest suites, not a gate.
 *  4. **The SERIALIZER is not checked.** boundaryLine's third break (zero
 *     occurrences in either `ProjectSerializer`) is still nobody's gate.
 *  5. **App-registered verbs are INVISIBLE.** `element.changeType` — the live
 *     contrast the brief for this lane named — lives in
 *     `apps/editor/src/engine/initBusHandlers.ts` as a `BridgeSpec`, and that
 *     module cannot be imported outside a browser bundle. So this arm can see
 *     PLUGIN handlers only. The live/dead contrast is therefore carried by
 *     `slab.setThickness` vs `slab.setMaterial`, which is a STRICTLY BETTER
 *     control anyway: same family, same store, same shape — the only variable
 *     left is reachability.
 *  6. **Fourteen verbs, not 351.** The subject is a named set. The 156-row
 *     backlog belongs to `mirror-debt.json`; this file does not restate it.
 *
 * ─── NEGATIVE + POSITIVE CONTROL, EXECUTED ON EVERY RUN (C70 §5.6) ─────────
 * `selfTest()` plants four SYNTHETIC handlers and pushes them through the SAME
 * `measureOne()` and the REAL bridge:
 *   · `zzcontrol.mutate` — a verb the bridge has no case for → must read
 *     `NO-TYPED-EVENT`. If it reads anything else the defect detector is blind.
 *   · `zzcontrol.refuse` — `canExecute` always false → must read `REFUSED`.
 *   · `room.create`      — a REAL bridge case whose event nobody subscribes to
 *                          → must read `TYPED-EVENT-NO-SUB`.
 *   · `lighting.create`  — a REAL bridge case with a REAL subscriber → must read
 *                          `REACHES-SUBSCRIBER`. ⭐ This is also the
 *                          SATISFIABILITY PROOF (L-716): a state exists in which
 *                          this gate's pass condition is TRUE, so green is
 *                          reachable rather than a condition that can never hold.
 * A planted class that does not come back with its exact verdict exits **2** as
 * a BLIND COMPARATOR. An arm never watched failing is not evidence.
 *
 * ─── Honesty floors — each exits 2, never 0 ────────────────────────────────
 *   · every fixture must produce a verdict (0 `UNPROVEN`);
 *   · at least MIN_MUTATED fixtures must actually MUTATE (produce ≥1 forward
 *     patch). An all-`REFUSED` run would report "nothing reaches anything" and
 *     read as a confident measurement of a subject it never touched;
 *   · the bridge must yield ≥ MIN_EMITTED typed event names and the repo ≥
 *     MIN_SUBSCRIBED subscribed names — a regex that stopped matching would
 *     otherwise grade every verb `TYPED-EVENT-NO-SUB` and look like a discovery;
 *   · the controls must all fire.
 *
 * ─── Governance ────────────────────────────────────────────────────────────
 * C16 §5.1 CA-21 (read back from the store the user's result depends on — this
 * is the relay leg of it) · C68 §5.a (verb liveness) · C11 §5.2 (typed domain
 * events flow through `runtime.events`) · C70 §2.2 (UNPROVEN is neither pass nor
 * fail) · C70 §5.3 (a ledger, never a count) · C84 EI-9 (one authority per
 * question — the fixtures name the handler MODULE, so the gate and the bus agree
 * about which code ran).
 *
 * Exit codes — deliberately the same four `check-mirror-completeness.ts` uses,
 * because they are two arms of one gate:
 *   0 = within the named ledger, both directions clean, controls fired
 *   1 = ledger violated (a verdict changed, or paid debt did not leave)
 *   2 = the run could not form an opinion (a floor tripped, or a blind comparator)
 */

import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { walk, relPath } from './lib/sourceScan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GA_GATE_REPO_ROOT ?? path.resolve(HERE, '..', '..');
const LABEL = 'mirror-reachability';
const LEDGER_PATH = path.join(HERE, 'mirror-reachability-ledger.json');

const BRIDGE_REL = 'packages/runtime-composer/src/CommandEventBridge.ts';
const SUBSCRIBER_ROOTS = ['apps', 'plugins', 'packages'];

const MIN_MUTATED = 6;
const MIN_EMITTED = 20;
const MIN_SUBSCRIBED = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Verdicts
// ─────────────────────────────────────────────────────────────────────────────
type Verdict =
  | 'REACHES-SUBSCRIBER'
  | 'TYPED-EVENT-NO-SUB'
  | 'NO-TYPED-EVENT'
  | 'REFUSED'
  | 'PATCH-DROPPED'
  | 'UNPROVEN';

interface Reading {
  readonly verb: string;
  readonly verdict: Verdict;
  /** Every event name the REAL EventBus saw, in order. */
  readonly events: readonly string[];
  /** …minus the generic relay. */
  readonly typed: readonly string[];
  /** Files that subscribe to one of `typed`, by name match. */
  readonly subscribers: readonly string[];
  /** Forward patches the handler actually produced. 0 ⇒ it mutated nothing. */
  readonly patches: number;
  /** The refusal / throw text, verbatim, so a BAD FIXTURE is distinguishable
   *  from a DEAD VERB by a human reading the output rather than by trust. */
  readonly detail?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The subscriber census — MEASURED, and only ever a NAME MATCH.
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠ `.on('<name>')` is the only spelling the runtime EventBus offers
// (`EventBus.on`), so this is the right shape — but it also matches DOM and
// Node emitters using the same spelling. That over-counts in the SAFE direction
// for an orphan census (a name found is a name NOT reported orphaned) and in the
// UNSAFE direction for a `REACHES-SUBSCRIBER` verdict. It is constrained by
// requiring a dot in the event name, which every runtime family event has and
// almost no DOM event does.
function subscriberCensus(): { byEvent: Map<string, string[]>; files: number } {
  const byEvent = new Map<string, string[]>();
  let files = 0;
  const RE = /\.on\(\s*'([a-zA-Z][a-zA-Z0-9._-]*\.[a-zA-Z0-9._-]+)'/g;
  for (const dir of SUBSCRIBER_ROOTS) {
    for (const abs of walk(path.join(ROOT, dir))) {
      const rel = relPath(ROOT, abs);
      if (!/\.(ts|tsx)$/.test(rel)) continue;
      if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
      if (rel.includes('/__tests__/') || rel.includes('/dist/')) continue;
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      files++;
      RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RE.exec(src)) !== null) {
        const name = m[1]!;
        const bucket = byEvent.get(name) ?? [];
        if (!bucket.includes(rel)) bucket.push(rel);
        byEvent.set(name, bucket);
      }
    }
  }
  return { byEvent, files };
}

/** Every typed event name the bridge can emit, read out of the bridge itself. */
function bridgeEmits(): Set<string> {
  const abs = path.join(ROOT, BRIDGE_REL);
  const out = new Set<string>();
  if (!existsSync(abs)) return out;
  const src = readFileSync(abs, 'utf8');
  for (const m of src.matchAll(/events\.emit\(\s*'([a-zA-Z][a-zA-Z0-9._-]*)'/g)) {
    if (m[1] !== 'command.executed') out.add(m[1]!);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The harness — production wiring minus the editor.
// ─────────────────────────────────────────────────────────────────────────────
const url = (rel: string): string => pathToFileURL(path.join(ROOT, rel)).href;

/* eslint-disable @typescript-eslint/no-explicit-any -- the harness loads
   production modules by path at runtime; there is no static type for
   "whatever class this fixture named". Every `any` is confined to this block. */
const { CommandBus } = (await import(url('packages/command-bus/src/CommandBus.ts'))) as any;
const { PatchEmitter } = (await import(url('packages/command-bus/src/PatchEmitter.ts'))) as any;
const { attachStores } = (await import(url('packages/stores/src/attachStores.ts'))) as any;
const { EventBus } = (await import(url('packages/runtime-composer/src/EventBus.ts'))) as any;
const { wireCommandEventBridge } =
  (await import(url('packages/runtime-composer/src/CommandEventBridge.ts'))) as any;

/** One family's rig: real bus, real emitter, real stores, real bridge. */
interface Rig {
  readonly bus: any;
  readonly events: any;
  readonly stores: Record<string, any>;
  /** Reset before each dispatch; filled by the EventBus emit tap. */
  seen: string[];
  dropped: string[];
}

async function makeRig(storeSpecs: readonly { key: string; module: string; cls: string }[]): Promise<Rig> {
  const stores: Record<string, any> = {};
  for (const s of storeSpecs) {
    const mod = (await import(url(s.module))) as any;
    stores[s.key] = new mod[s.cls]();
  }
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    emitter,
    storesProvider: (ids: readonly string[]) =>
      Object.fromEntries(
        ids.map((id) => [id, stores[id] ? Object.fromEntries(stores[id].getState()) : {}]),
      ),
  });
  const rig: Rig = { bus, events: new EventBus(), stores, seen: [], dropped: [] };
  // ⭐ THE REAL PRODUCTION PATCH ROUTE. `apps/editor/src/bootstrap.ts:103` wires
  // exactly this: the emitter re-applies forward patches to the canonical
  // `Store<T>`. Using it (rather than hand-applying `nextStates`, which NOTHING
  // in production consumes) is what makes a create fixture leave behind a record
  // the next fixture can address.
  attachStores(emitter, stores, {
    onUnknownStore: (key: string) => { rig.dropped.push(key); },
  });
  // Tap `emit` rather than `on`: `EventBus.on` is keyed to the `RuntimeEvents`
  // union, so subscribing "to everything" is not expressible. The tap records
  // and then delegates, so the real emit path still runs.
  const orig = rig.events.emit.bind(rig.events);
  rig.events.emit = (name: unknown, payload: unknown): void => {
    rig.seen.push(String(name));
    orig(name, payload);
  };
  wireCommandEventBridge(emitter, rig.events);
  return rig;
}

function classify(
  verb: string,
  seen: readonly string[],
  patches: number,
  dropped: readonly string[],
  census: Map<string, string[]>,
  detail?: string,
): Reading {
  const typed = seen.filter((e) => e !== 'command.executed');
  const subscribers = [...new Set(typed.flatMap((e) => census.get(e) ?? []))];
  let verdict: Verdict;
  if (detail !== undefined && seen.length === 0) verdict = 'REFUSED';
  else if (dropped.length > 0) verdict = 'PATCH-DROPPED';
  else if (typed.length === 0) verdict = 'NO-TYPED-EVENT';
  else if (subscribers.length === 0) verdict = 'TYPED-EVENT-NO-SUB';
  else verdict = 'REACHES-SUBSCRIBER';
  return { verb, verdict, events: [...seen], typed, subscribers, patches, detail };
}

async function measureOne(
  rig: Rig,
  verb: string,
  payload: unknown,
  census: Map<string, string[]>,
): Promise<Reading> {
  rig.seen = [];
  rig.dropped = [];
  let patches = 0;
  let detail: string | undefined;
  try {
    const rec = (await rig.bus.executeCommand(verb, payload)) as any;
    for (const entry of rec?.patches ?? []) patches += entry?.forwardPatches?.length ?? 0;
  } catch (err) {
    detail = (err as Error).message.split('\n')[0]!.slice(0, 220);
  }
  return classify(verb, rig.seen, patches, rig.dropped, census, detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// ARM E1 — THE NAMED SET.
// ─────────────────────────────────────────────────────────────────────────────
//
// ⭐ PICKED BY RISK, NOT BY CONVENIENCE.
//   · the `*.setMaterial` family — thirteen verbs, every one REFUSES with
//     `affectedStores` naming a store no renderer reads (§FIX-MATERIAL-DEAD-DISPATCH);
//   · the three UNMIRRORED lighting rows on `mirror-debt.json`
//     (`lighting.delete` / `setEmergency` / `setIntensity`);
//   · `roof.addSkylight`, a fourth UNMIRRORED row on a different family, so a
//     lighting-only reading cannot be mistaken for a family quirk;
//   · and — the point of the whole exercise — the LIVE siblings that share their
//     store: `slab.setThickness` / `slab.addHole` / `roof.setOverhang` go through
//     the `ELEMENT_UPDATE_VERBS` table, `*.create` through the create switch, and
//     `lighting.changeLevel` through the §L-946 level channel. Three different
//     live mechanisms against three different dead ones.
interface Fixture {
  readonly verb: string;
  readonly module: string;
  readonly cls: string;
  /** `ids` carries what earlier fixtures in the same family minted. */
  readonly payload: (ids: Record<string, string>) => unknown;
  /** After a successful dispatch, remember the minted id under this store key. */
  readonly seeds?: string;
}

interface Family {
  readonly name: string;
  readonly stores: readonly { key: string; module: string; cls: string }[];
  readonly fixtures: readonly Fixture[];
}

const RING = [
  { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
];
const HOLE = [
  { x: 1, y: 0, z: 1 }, { x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: 2 }, { x: 1, y: 0, z: 2 },
];

const FAMILIES: readonly Family[] = [
  {
    name: 'lighting',
    stores: [{ key: 'lighting', module: 'plugins/lighting/src/store.ts', cls: 'LightingStore' }],
    fixtures: [
      { verb: 'lighting.create', module: 'plugins/lighting/src/handlers/CreateLighting.ts', cls: 'CreateLightingHandler',
        seeds: 'lighting',
        payload: () => ({ levelId: 'lvl-1', kind: 'downlight', origin: { x: 1, y: 2.6, z: 1 } }) },
      { verb: 'lighting.setIntensity', module: 'plugins/lighting/src/handlers/SetLightingIntensity.ts', cls: 'SetLightingIntensityHandler',
        payload: (ids) => ({ lightingId: ids['lighting'], intensity: 3 }) },
      { verb: 'lighting.setEmergency', module: 'plugins/lighting/src/handlers/SetLightingEmergency.ts', cls: 'SetLightingEmergencyHandler',
        payload: (ids) => ({ lightingId: ids['lighting'], isEmergency: true }) },
      { verb: 'lighting.changeLevel', module: 'plugins/lighting/src/handlers/ChangeLightingLevel.ts', cls: 'ChangeLightingLevelHandler',
        payload: (ids) => ({ lightingId: ids['lighting'], levelId: 'lvl-2' }) },
      { verb: 'lighting.setMaterial', module: 'plugins/lighting/src/handlers/SetLightingMaterial.ts', cls: 'SetLightingMaterialHandler',
        payload: (ids) => ({ lightingId: ids['lighting'], materialId: 'metal-aluminium' }) },
      // ⚠ LAST in the family: it removes the record every fixture above addresses.
      { verb: 'lighting.delete', module: 'plugins/lighting/src/handlers/DeleteLighting.ts', cls: 'DeleteLightingHandler',
        payload: (ids) => ({ lightingId: ids['lighting'] }) },
    ],
  },
  {
    name: 'slab',
    stores: [{ key: 'slab', module: 'plugins/slab/src/store.ts', cls: 'SlabStore' }],
    fixtures: [
      { verb: 'slab.create', module: 'plugins/slab/src/handlers/CreateSlab.ts', cls: 'CreateSlabHandler',
        seeds: 'slab',
        payload: () => ({ levelId: 'lvl-1', boundary: RING, thickness: 0.2 }) },
      // ⭐ THE CONTRAST. Same store, same family, same handler shape.
      { verb: 'slab.setThickness', module: 'plugins/slab/src/handlers/SetSlabThickness.ts', cls: 'SetSlabThicknessHandler',
        payload: (ids) => ({ slabId: ids['slab'], thickness: 0.35 }) },
      { verb: 'slab.addHole', module: 'plugins/slab/src/handlers/AddSlabHole.ts', cls: 'AddSlabHoleHandler',
        payload: (ids) => ({ slabId: ids['slab'], hole: HOLE }) },
      { verb: 'slab.setMaterial', module: 'plugins/slab/src/handlers/SetSlabMaterial.ts', cls: 'SetSlabMaterialHandler',
        payload: (ids) => ({ slabId: ids['slab'], materialId: 'concrete-reinforced' }) },
    ],
  },
  {
    name: 'roof',
    stores: [{ key: 'roof', module: 'plugins/roof/src/store.ts', cls: 'RoofStore' }],
    fixtures: [
      { verb: 'roof.create', module: 'plugins/roof/src/handlers/CreateRoof.ts', cls: 'CreateRoofHandler',
        seeds: 'roof',
        payload: () => ({ levelId: 'lvl-1', boundary: RING, shape: 'flat', thickness: 0.25 }) },
      { verb: 'roof.setOverhang', module: 'plugins/roof/src/handlers/SetRoofOverhang.ts', cls: 'SetRoofOverhangHandler',
        payload: (ids) => ({ roofId: ids['roof'], overhang: 0.6 }) },
      { verb: 'roof.addSkylight', module: 'plugins/roof/src/handlers/AddSkylight.ts', cls: 'AddSkylightHandler',
        payload: (ids) => ({ roofId: ids['roof'], skylight: { id: 'sky-1', position: { x: 2, y: 0, z: 2 }, width: 1, depth: 1 } }) },
      { verb: 'roof.setMaterial', module: 'plugins/roof/src/handlers/SetRoofMaterial.ts', cls: 'SetRoofMaterialHandler',
        payload: (ids) => ({ roofId: ids['roof'], materialId: 'metal-zinc' }) },
    ],
  },
];

async function runFamilies(census: Map<string, string[]>): Promise<{ readings: Reading[]; hardFail: string[] }> {
  const readings: Reading[] = [];
  const hardFail: string[] = [];
  for (const fam of FAMILIES) {
    let rig: Rig;
    try {
      rig = await makeRig(fam.stores);
    } catch (err) {
      hardFail.push(`family '${fam.name}': the rig would not construct — ${(err as Error).message.split('\n')[0]}`);
      for (const f of fam.fixtures) {
        readings.push({ verb: f.verb, verdict: 'UNPROVEN', events: [], typed: [], subscribers: [], patches: 0, detail: 'rig construction failed' });
      }
      continue;
    }
    for (const f of fam.fixtures) {
      try {
        const mod = (await import(url(f.module))) as any;
        const Ctor = mod[f.cls];
        if (typeof Ctor !== 'function') throw new Error(`${f.module} exports no class '${f.cls}'`);
        rig.bus.register(new Ctor());
      } catch (err) {
        readings.push({ verb: f.verb, verdict: 'UNPROVEN', events: [], typed: [], subscribers: [], patches: 0, detail: `handler would not load: ${(err as Error).message.split('\n')[0]}` });
        continue;
      }
    }
    const ids: Record<string, string> = {};
    for (const f of fam.fixtures) {
      const r = await measureOne(rig, f.verb, f.payload(ids), census);
      readings.push(r);
      if (f.seeds !== undefined) {
        const keys = [...(rig.stores[f.seeds]?.getState()?.keys() ?? [])] as string[];
        if (keys.length > 0) ids[f.seeds] = keys[keys.length - 1]!;
      }
    }
  }
  return { readings, hardFail };
}

// ─────────────────────────────────────────────────────────────────────────────
// The controls — planted defects, run through the SAME measureOne().
// ─────────────────────────────────────────────────────────────────────────────
//
// ⛔ THE PLANTED HANDLERS ARE SYNTHETIC; THE BRIDGE IS NOT. Each control gets its
// own rig, registers a hand-written handler under a chosen verb, and the REAL
// `CommandEventBridge` decides what comes out. That is what makes the positive
// control a satisfiability proof rather than a tautology: nothing in this file
// can make the bridge emit `lighting.created` except the bridge's own case arm.
function plantedHandler(type: string, opts: { refuse?: boolean } = {}): unknown {
  return {
    type,
    affectedStores: ['zzcontrol'] as const,
    canExecute: (): { valid: boolean; reason?: string } =>
      opts.refuse === true
        ? { valid: false, reason: 'PLANTED CONTROL — this handler refuses by construction' }
        : { valid: true },
    execute: (_ctx: unknown, cmd: any) => {
      const id = String(cmd?.id ?? 'ctl-1');
      return {
        forward: [{ op: 'add', path: [id], value: { id, levelId: cmd?.levelId ?? 'lvl-1' } }],
        inverse: [{ op: 'remove', path: [id] }],
        nextStates: {},
      };
    },
  };
}

class ControlStore {
  private readonly m = new Map<string, unknown>();
  getState(): ReadonlyMap<string, unknown> { return this.m; }
  applyPatch(): void { /* the control's far side is the EVENT, not the store */ }
}

async function controlRig(): Promise<Rig> {
  const stores: Record<string, any> = { zzcontrol: new ControlStore() };
  const emitter = new PatchEmitter();
  const bus = new CommandBus({
    emitter,
    storesProvider: (ids: readonly string[]) => Object.fromEntries(ids.map((i) => [i, stores[i] ? {} : {}])),
  });
  const rig: Rig = { bus, events: new EventBus(), stores, seen: [], dropped: [] };
  attachStores(emitter, stores, { onUnknownStore: (k: string) => { rig.dropped.push(k); } });
  const orig = rig.events.emit.bind(rig.events);
  rig.events.emit = (name: unknown, payload: unknown): void => { rig.seen.push(String(name)); orig(name, payload); };
  wireCommandEventBridge(emitter, rig.events);
  return rig;
}

async function selfTest(census: Map<string, string[]>): Promise<{ ok: boolean; lines: string[] }> {
  const lines: string[] = [];
  let ok = true;
  const cases: { verb: string; refuse?: boolean; expect: Verdict; why: string }[] = [
    { verb: 'zzcontrol.mutate', expect: 'NO-TYPED-EVENT',
      why: 'a verb that MUTATES and has no bridge case — the founder-defect arm' },
    { verb: 'zzcontrol.refuse', refuse: true, expect: 'REFUSED',
      why: 'a verb whose canExecute cannot pass — the dead-verb arm' },
    { verb: 'room.create', expect: 'TYPED-EVENT-NO-SUB',
      why: 'a REAL bridge case whose event name nobody subscribes to — the orphan-channel arm' },
    { verb: 'lighting.create', expect: 'REACHES-SUBSCRIBER',
      why: 'a REAL bridge case with a REAL subscriber — SATISFIABILITY PROOF that green is reachable' },
  ];
  for (const c of cases) {
    try {
      const rig = await controlRig();
      rig.bus.register(plantedHandler(c.verb, { refuse: c.refuse }));
      const r = await measureOne(rig, c.verb, { id: 'ctl-1', levelId: 'lvl-1', kind: 'downlight', origin: { x: 0, y: 0, z: 0 } }, census);
      if (r.verdict === c.expect) {
        lines.push(`✓ fired — ${c.verb} → ${r.verdict}  (${c.why})`);
      } else {
        ok = false;
        lines.push(`✗ BLIND COMPARATOR — ${c.verb} planted for ${c.expect}, measured ${r.verdict} [events: ${r.events.join(', ') || 'none'}] (${c.why})`);
      }
    } catch (err) {
      ok = false;
      lines.push(`✗ control threw — ${c.verb}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  return { ok, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger
// ─────────────────────────────────────────────────────────────────────────────
interface LedgerRow { readonly verb: string; readonly verdict: string; readonly reason: string; readonly exitCondition: string }
interface Ledger {
  readonly $schema?: string;
  readonly note?: string;
  readonly exitCondition?: string;
  readonly notReaching: readonly LedgerRow[];
  readonly orphanChannels: readonly { readonly event: string; readonly reason: string; readonly exitCondition: string }[];
}

function fail2(msg: string): never {
  console.error(`[${LABEL}] ⛔ CANNOT FORM AN OPINION: ${msg}`);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
const { byEvent: CENSUS, files: censusFiles } = subscriberCensus();
const EMITS = bridgeEmits();

const control = await selfTest(CENSUS);
console.log(`[${LABEL}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log(`    ${l}`);

const { readings, hardFail } = await runFamilies(CENSUS);
for (const h of hardFail) console.error(`[${LABEL}] ⛔ ${h}`);

if (!existsSync(LEDGER_PATH)) fail2(`the ledger is missing: ${path.relative(ROOT, LEDGER_PATH)}`);
let ledger: Ledger;
try { ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger; }
catch (err) { fail2(`mirror-reachability-ledger.json did not parse: ${String(err)}`); }
if (!Array.isArray(ledger.notReaching) || !Array.isArray(ledger.orphanChannels)) {
  fail2('the ledger needs both a `notReaching` array and an `orphanChannels` array.');
}

// ── report the measurement first, verdict second ────────────────────────────
console.log(`\n[${LABEL}] subject: ${readings.length} verb(s) DISPATCHED across ${FAMILIES.length} famil(ies) · ` +
  `${EMITS.size} typed event name(s) the bridge can emit · ` +
  `${CENSUS.size} dotted event name(s) subscribed across ${censusFiles} non-test source file(s)`);

const byVerdict = new Map<Verdict, Reading[]>();
for (const r of readings) {
  const b = byVerdict.get(r.verdict) ?? [];
  b.push(r);
  byVerdict.set(r.verdict, b);
}
for (const v of ['REACHES-SUBSCRIBER', 'TYPED-EVENT-NO-SUB', 'NO-TYPED-EVENT', 'REFUSED', 'PATCH-DROPPED', 'UNPROVEN'] as Verdict[]) {
  const rows = byVerdict.get(v) ?? [];
  if (rows.length === 0) continue;
  console.log(`\n  ${v} — ${rows.length}`);
  for (const r of rows) {
    const ev = r.typed.length > 0 ? ` events=[${r.typed.join(', ')}]` : '';
    const sub = r.subscribers.length > 0 ? ` sub=${r.subscribers[0]}` : '';
    const why = r.detail !== undefined ? `  ⟵ ${r.detail}` : '';
    console.log(`      ${r.verb.padEnd(24)} patches=${String(r.patches).padStart(2)}${ev}${sub}${why}`);
  }
}

// ── ARM E2 — orphan channels, STATIC ────────────────────────────────────────
const orphans = [...EMITS].filter((e) => !CENSUS.has(e)).sort();
console.log(`\n[${LABEL}] ARM E2 (STATIC name match, NOT executed) — declared channels with NO listener anywhere outside tests:`);
console.log(`    ${orphans.length} of ${EMITS.size} typed event name(s) the bridge emits reach nobody:`);
for (const o of orphans) console.log(`      · ${o}`);

// ── floors ──────────────────────────────────────────────────────────────────
const unproven = readings.filter((r) => r.verdict === 'UNPROVEN');
const mutated = readings.filter((r) => r.patches > 0).length;
if (!control.ok) fail2('a PLANTED control did not come back with its expected verdict — this run is a BLIND COMPARATOR and its green would mean nothing.');
if (unproven.length > 0) fail2(`${unproven.length} fixture(s) produced no opinion: ${unproven.map((r) => r.verb).join(', ')}. A fixture the harness cannot construct is neither a pass nor a fail (C70 §2.2).`);
if (mutated < MIN_MUTATED) fail2(`only ${mutated} of ${readings.length} fixture(s) actually MUTATED (produced ≥1 forward patch); floor is ${MIN_MUTATED}. An all-refused run measures nothing and reads as a discovery.`);
if (EMITS.size < MIN_EMITTED) fail2(`only ${EMITS.size} typed event name(s) parsed out of ${BRIDGE_REL}; floor is ${MIN_EMITTED}. The emit regex stopped matching, and every verb would grade TYPED-EVENT-NO-SUB.`);
if (CENSUS.size < MIN_SUBSCRIBED) fail2(`only ${CENSUS.size} subscribed event name(s) found across ${censusFiles} file(s); floor is ${MIN_SUBSCRIBED}. The subscriber regex stopped matching.`);
if (hardFail.length > 0) fail2(hardFail.join(' · '));

// ── ARM E1 verdict, in BOTH directions ──────────────────────────────────────
const declared = new Map(ledger.notReaching.map((r) => [r.verb, r] as const));
const measured = new Map(readings.map((r) => [r.verb, r] as const));

const newFindings: Reading[] = [];
const changed: { verb: string; was: string; now: Verdict }[] = [];
const paid: string[] = [];

for (const r of readings) {
  const row = declared.get(r.verb);
  if (r.verdict === 'REACHES-SUBSCRIBER') {
    if (row !== undefined) paid.push(r.verb);
    continue;
  }
  if (row === undefined) { newFindings.push(r); continue; }
  if (row.verdict !== r.verdict) changed.push({ verb: r.verb, was: row.verdict, now: r.verdict });
}
const goneRows = ledger.notReaching.filter((r) => !measured.has(r.verb)).map((r) => r.verb);

// ARM C-equivalent: every row reasoned, and every row says what would STRIKE it.
const malformed: string[] = [];
for (const r of [...ledger.notReaching]) {
  if (typeof r.reason !== 'string' || r.reason.trim().length < 20) malformed.push(`${r.verb}: reason missing or too short to be a reason`);
  if (typeof r.exitCondition !== 'string' || r.exitCondition.trim().length < 20) malformed.push(`${r.verb}: no exitCondition — a row that does not say what would STRIKE it is a row that will be re-baselined`);
}
for (const o of ledger.orphanChannels) {
  if (typeof o.exitCondition !== 'string' || o.exitCondition.trim().length < 20) malformed.push(`${o.event}: no exitCondition`);
}

// ARM E2 verdict, both directions.
const declaredOrphans = new Set(ledger.orphanChannels.map((o) => o.event));
const newOrphans = orphans.filter((o) => !declaredOrphans.has(o));
const paidOrphans = [...declaredOrphans].filter((o) => !orphans.includes(o));

let rc = 0;

if (malformed.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ MALFORMED LEDGER — ${malformed.length} row(s). A row with no reason, or no exit condition, is a rubber stamp:`);
  for (const m of malformed) console.error(`    · ${m}`);
}

if (newFindings.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E1 — ${newFindings.length} verb(s) do NOT reach a subscriber and are NOT on the ledger.`);
  console.error('    Each was DISPATCHED here, for real. A NO-TYPED-EVENT verb commits, reports success, and changes nothing the user can see.');
  for (const r of newFindings) console.error(`    · ${r.verb} → ${r.verdict}${r.detail !== undefined ? `  ⟵ ${r.detail}` : ''}`);
}

if (changed.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E1 — ${changed.length} verb(s) changed verdict without the ledger changing.`);
  console.error('    The verdicts are PINNED, not ordered: REFUSED → NO-TYPED-EVENT is a dead verb re-enabled with no mirror behind it, which is WORSE, not better.');
  for (const c of changed) console.error(`    · ${c.verb}: ledger says ${c.was}, measured ${c.now}`);
}

if (paid.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E1 — ${paid.length} ledger row(s) are PAID DEBT that did not leave the file.`);
  console.error('    These verbs NOW reach a subscriber. Strike the row in the commit that fixed them, or the next regression hides inside it.');
  for (const v of paid) console.error(`    · ${v}`);
}

if (goneRows.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E1 — ${goneRows.length} ledger row(s) name a verb no fixture dispatches: ${goneRows.join(', ')}.`);
  console.error('    A row nothing measures is a row that cannot go red. Remove it, or add the fixture back.');
}

if (newOrphans.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E2 — ${newOrphans.length} NEW declared channel(s) with no listener: ${newOrphans.join(', ')}.`);
  console.error(`    The bridge emits these and nothing in ${SUBSCRIBER_ROOTS.join('/')} subscribes. Add a subscriber, or a ledger row saying why the channel exists.`);
}

if (paidOrphans.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E2 — ${paidOrphans.length} ledgered orphan(s) now HAVE a listener: ${paidOrphans.join(', ')}. Strike the row.`);
}

if (rc === 0) {
  const reach = (byVerdict.get('REACHES-SUBSCRIBER') ?? []).length;
  console.log(`\n[${LABEL}] ✓ within the named ledger — ${reach}/${readings.length} dispatched verb(s) reach a subscriber; ` +
    `${ledger.notReaching.length} ledgered as not reaching; ${orphans.length} ledgered orphan channel(s). Controls fired.`);
  console.log(`[${LABEL}] ⚠ WHAT THIS GREEN DOES NOT SAY — the EMIT half is executed, the LISTEN half is a NAME MATCH.`);
  console.log(`[${LABEL}]   Not covered: that the subscriber RUNS, that the legacy record is well-formed, that a mesh appears,`);
  console.log(`[${LABEL}]   that the serializer carries it, or anything at all about the ${351 - readings.length}+ verbs outside this named set.`);
  console.log(`[${LABEL}]   App-registered BridgeSpec verbs (element.changeType, …) are INVISIBLE here: initBusHandlers.ts cannot load outside a browser.`);
  console.log(`[${LABEL}]   The mesh layer is LiftCompoundReachesTheMesh.test.ts / BeamMasterMaterialReachesMesh.test.ts; the backlog is mirror-debt.json.`);
}
process.exit(rc);
