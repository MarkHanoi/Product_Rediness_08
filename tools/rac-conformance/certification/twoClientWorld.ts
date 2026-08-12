// ─── twoClientWorld.ts — TWO independent client worlds over the CRDT path ────
//
// THE ROW THIS EXISTS FOR. Every row of the BIM 2.0 certification says
// `Collaboration UNPROVEN by construction`, and that phrase is literal: both
// existing suites call `buildWorld()` ONCE. A harness that composes one client
// cannot say anything about two, so the honest verdict was "not measured".
// This module composes TWO, so that the row becomes MEASURABLE — red or green.
//
// ─── WHAT IS GENUINELY COMPOSED vs WHAT IS SIMULATED ────────────────────────
//
// This distinction is the whole value of the file, so it is stated first and
// enforced by `PROVENANCE` below, which the gate PRINTS on every run. A "two
// client" harness that quietly shares one store proves nothing, and the only
// defence against that is to enumerate what is really separate.
//
// GENUINELY COMPOSED — one per client, constructed independently:
//   • the full `buildWorld()` topology: REAL geometry stores (WallStore,
//     SlabStore, RoomStore, doorStore/windowStore…), a REAL CommandBus, a REAL
//     CommandManager with its own undo history, a REAL BimManager + ProjectContext.
//   • a REAL `YjsDocAdapter` per client — the production class, one Y.Doc each.
//   • the REAL production WRITE leg: `CommandBus.setCrdtApplier(...)` (step 7 of
//     executeCommand), wrapped in the production `shouldReplicate` echo-break,
//     exactly as `engineLauncher.ts:160-168` wires it.
//   • the REAL production READ leg: `ElementSyncReader` observing
//     ELEMENTS_NAMESPACE, feeding a sink whose dispatch shape is byte-identical
//     to `initRemoteElementSync.ts:132-160`, re-dispatching
//     `element.updateParameters` onto THAT client's own bus.
//   Nothing on the measured path is a fake. The commands are real, the
//   dispositions are the production `SYNC_DISPOSITIONS`, the stores are the ones
//   `ProjectSerializer` reads.
//
// SIMULATED — and named, because an unnamed simulation is a lie:
//   • THE WIRE. Updates cross by `Y.applyUpdate(peer, Y.encodeStateAsUpdate(me))`,
//     not by a WebSocket. `y-websocket`/`ws` are dependencies of
//     `apps/sync-server`, not of the repo root, which is why the EXISTING C8
//     gate (`tools/ga-gate/check-collab-graph-integrity.ts`) lives over there and
//     uses real sockets. THAT gate owns the transport question and this one does
//     not re-answer it. What this harness adds is the leg that gate does not
//     touch: the CRDT document → STORE path, and the undo stacks.
//     Consequence: zero latency, zero reordering, zero packet loss, no server
//     linearisation. Those are NOT MEASURED here and are printed as such.
//   • ONE PROCESS, ONE `window`. `buildWorld()` writes `window.commandManager`,
//     `window.<x>Store`, `window.runtime`. Two worlds in one realm means the
//     SECOND composition wins those globals. Every legacy command that reaches
//     for a store through `window` therefore reads client B's store no matter
//     who dispatched. This is not a defect of the harness — it is the reason
//     `asClient()` exists below: the harness REBINDS the globals around each
//     client's dispatch, and the gate asserts per-client mutation counts so a
//     leak shows up as a floor failure rather than as a silent pass.
//   • `elementRegistry` is a MODULE SINGLETON (`ElementRegistry.getInstance()`),
//     shared by both clients by construction. Real peers have one registry each,
//     so the read-leg sink below keeps a PER-CLIENT id→type map instead of
//     consulting it. Stated in PROVENANCE and re-stated by the gate.
//
// ─── LAYERING ───────────────────────────────────────────────────────────────
// This file lives in tools/ and only READS production modules. It writes no
// package or app source. It is measurement, not repair.

import * as Y from 'yjs';
import { YjsDocAdapter, ElementSyncReader } from '@pryzm/sync-client';
import { buildWorld, type World } from './world.js';

/**
 * Every claim this harness makes about its own fidelity, in one exported
 * structure so the gate can print it verbatim rather than paraphrasing it.
 * An arm that is not measured must SAY it is not measured, every run.
 */
export const PROVENANCE = {
  composed: [
    'two independent buildWorld() topologies — separate geometry stores, CommandBus, CommandManager undo history',
    'two REAL YjsDocAdapter instances (production class), one Y.Doc each',
    'the REAL write leg: CommandBus.setCrdtApplier → shouldReplicate echo-break → adapter.applyCommand (engineLauncher.ts:160-168)',
    'the REAL read leg: ElementSyncReader over ELEMENTS_NAMESPACE → sink → peer bus.executeCommand(element.updateParameters)',
    'the production SYNC_DISPOSITIONS table — no harness-local disposition list',
  ],
  simulated: [
    'THE WIRE — updates cross by Y.applyUpdate(encodeStateAsUpdate), not a WebSocket. Real sockets are covered by tools/ga-gate/check-collab-graph-integrity.ts, which owns the transport question.',
    'the read-leg SINK routes id→type from a PER-CLIENT map, because the real sink consults the elementRegistry MODULE SINGLETON that both clients share in one realm. The dispatch shape is byte-identical to initRemoteElementSync.ts:132-160.',
  ],
  notMeasured: [
    'THE SHARED-ID CEILING (measured, not predicted). `elementRegistry` is a MODULE ' +
      'SINGLETON (ElementRegistry.getInstance(), packages/core-app-model/src/ElementRegistry.ts:307) ' +
      'and CreateWallCommand refuses `ID "x" already exists in ElementRegistry`. So two clients ' +
      'in ONE Node realm CANNOT both hold the same element id — which is the definition of two ' +
      'peers editing the same wall. This harness therefore seeds client B by REPLICATING A\'s ' +
      'creation through the CRDT (the real late-joiner path) instead of re-authoring it, and ' +
      'the id-collision arm is NOT MEASURABLE in-process at all. It needs two processes.',
    'network latency, reordering, duplication and packet loss — the exchange here is synchronous and lossless',
    'server-side linearisation / the sync-server protocol (apps/sync-server is not deployed; ADR-0019 orders at the log layer, and no log layer runs here)',
    'multi-PROCESS isolation — one Node realm, one `window`, one `elementRegistry` module singleton shared by both clients',
    'real concurrent wall-clock timing — the partition here is explicit and deterministic, not a race',
    'awareness/presence, soft locks (S45) and the conflict-resolution DIALOG (only the emitConflict signal is reachable)',
    'remote CREATES — the sink applies property updates only and counts unappliedRemoteCreates; a peer never mints an element it has not seen',
  ],
} as const;

/**
 * The `window` keys `buildWorld()` claims. Rebinding exactly these around a
 * dispatch is what keeps two worlds from silently becoming one.
 */
const WINDOW_KEYS = [
  'commandManager', 'projectContext', 'bimManager', 'runtime',
  'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
  'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
  'openingStore', 'ceilingStore', 'floorStore', 'roomStore',
] as const;

function captureGlobals(): Record<string, unknown> {
  const w = window as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of WINDOW_KEYS) out[k] = w[k];
  return out;
}

function restoreGlobals(g: Record<string, unknown>): void {
  const w = window as unknown as Record<string, unknown>;
  for (const k of WINDOW_KEYS) w[k] = g[k];
}

/** One composed client: its world, its CRDT document, its read-back wiring. */
export class ClientPeer {
  /** Commands this client's bus REPLICATED into its own Y.Doc (write leg). */
  replicated = 0;
  /**
   * WHICH verbs reached the applier. The count alone cannot distinguish "the
   * verb replicated" from "some other verb replicated and this one silently did
   * not" — and that is exactly the defect this harness found on its first
   * honest reading, so the identity is recorded, not just the tally.
   */
  readonly replicatedVerbs: string[] = [];
  /** The payloads step 7 handed the applier, verbatim. See the applier comment. */
  readonly replicatedPayloads: Array<{ type: string; keys: string[]; payload: unknown }> = [];
  /** Remote updates this client's reader DELIVERED to its sink (read leg). */
  applied = 0;
  /** Remote updates refused because this client has no such element. */
  unappliedRemoteCreates = 0;
  /** Remote-sink dispatches that threw or rejected. */
  sinkErrors = 0;
  /** In-flight sink dispatches, awaited by `exchange()` so counts are stable. */
  readonly inFlight: Array<Promise<unknown>> = [];

  reader!: ElementSyncReader;

  /** Per-client element id → store type — NOT the shared registry singleton. */
  private readonly types = new Map<string, string>();

  constructor(
    readonly label: 'A' | 'B',
    readonly world: World,
    readonly adapter: YjsDocAdapter,
    readonly globals: Record<string, unknown>,
  ) {}

  /** Teach this client an element it "already has", as a loaded project would. */
  learn(id: string, type: string): void { this.types.set(id, type); }
  typeOf(id: string): string | undefined { return this.types.get(id); }
}

/**
 * Run `fn` with `peer`'s globals installed, then put back whatever was there.
 *
 * WHY THIS IS NOT OPTIONAL. Legacy commands resolve stores through `window`.
 * Without rebinding, client A's dispatch mutates client B's WallStore and the
 * harness would report perfect convergence for the stupidest possible reason:
 * there was only ever one store. The per-client mutation floors in the gate are
 * the assertion that this actually worked.
 */
export async function asClient<T>(peer: ClientPeer, fn: () => Promise<T> | T): Promise<T> {
  const saved = captureGlobals();
  restoreGlobals(peer.globals);
  try {
    return await fn();
  } finally {
    restoreGlobals(saved);
  }
}

/**
 * Compose ONE client: a full world, a Y.Doc adapter, and both replication legs
 * wired the way `engineLauncher.wireCollaborationCRDT()` wires them.
 */
export async function composeClient(label: 'A' | 'B', room: string): Promise<ClientPeer> {
  const world = await buildWorld();
  const globals = captureGlobals();
  const adapter = new YjsDocAdapter(room);
  const peer = new ClientPeer(label, world, adapter, globals);

  // ── WRITE LEG — production engineLauncher.ts:160-168, including the
  //    `shouldReplicate` echo-break that stops a remote-applied change from
  //    being written straight back into the document.
  const busWithCrdt = world.bus as unknown as {
    setCrdtApplier?: (fn: (type: string, payload: Record<string, unknown>) => void) => void;
  };
  if (typeof busWithCrdt.setCrdtApplier !== 'function') {
    throw new Error(
      'CommandBus.setCrdtApplier is absent — the production write leg does not exist on this bus, ' +
      'so a two-client harness would measure nothing. This is MISCONFIGURED, not a finding.',
    );
  }
  busWithCrdt.setCrdtApplier((type: string, payload: Record<string, unknown>) => {
    if (payload && payload['_remoteSync'] === true) return; // production shouldReplicate
    peer.replicated++;
    peer.replicatedVerbs.push(type);
    // The PAYLOAD the bus actually hands the applier — not the payload the
    // caller dispatched. `executeCommand` may normalise, rename or drop keys on
    // the way to step 7, and the disposition table resolves its `subject` and
    // its properties against THIS object. Recording it is what turns "the verb
    // replicated but the property did not" from a mystery into a diff.
    peer.replicatedPayloads.push({ type, keys: Object.keys(payload ?? {}), payload });
    adapter.applyCommand(type, payload);
  });

  // ── READ LEG — ElementSyncReader → the sink. Dispatch shape is byte-identical
  //    to apps/editor/src/engine/initRemoteElementSync.ts:132-160.
  peer.reader = new ElementSyncReader(adapter, (update) => {
    const elementType = peer.typeOf(update.elementId);
    if (elementType === undefined) { peer.unappliedRemoteCreates++; return; }
    const parameters: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(update.properties)) {
      if (k.startsWith('_')) continue;                 // local dispatch flags
      if (k === 'id' || k === 'levelId') continue;     // routing, not properties
      parameters[k] = v;
    }
    if (Object.keys(parameters).length === 0) return;
    peer.applied++;
    const p = asClient(peer, () =>
      world.dispatch('element.updateParameters', {
        elementId: update.elementId, elementType, parameters, _remoteSync: true,
      }),
    ).then(
      (r) => { if (!r.ok) peer.sinkErrors++; },
      () => { peer.sinkErrors++; },
    );
    peer.inFlight.push(p);
  });

  return peer;
}

/**
 * Exchange state BOTH ways until quiescent — the simulated wire.
 *
 * Uses a state-vector delta so a crossing is only counted when bytes genuinely
 * had to move: a run that transported NOTHING must be distinguishable from a
 * run that transported everything and found no divergence. The gate floors on
 * this count for exactly that reason.
 */
export async function exchange(a: ClientPeer, b: ClientPeer, rounds = 4): Promise<number> {
  let crossings = 0;
  for (let i = 0; i < rounds; i++) {
    const fromA = Y.encodeStateAsUpdate(a.adapter.doc, Y.encodeStateVector(b.adapter.doc));
    if (fromA.byteLength > 0) { b.adapter.applyUpdate(fromA); crossings++; }
    const fromB = Y.encodeStateAsUpdate(b.adapter.doc, Y.encodeStateVector(a.adapter.doc));
    if (fromB.byteLength > 0) { a.adapter.applyUpdate(fromB); crossings++; }
    // Sink dispatches are async; drain them before the next round so the
    // counters and the stores are stable when the comparator reads them.
    await settle(a, b);
  }
  await settle(a, b);
  return crossings;
}

/** Drain every in-flight sink dispatch on both peers. */
export async function settle(...peers: ClientPeer[]): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const pending = peers.flatMap((p) => p.inFlight.splice(0));
    if (pending.length > 0) await Promise.all(pending);
    await new Promise((r) => setTimeout(r, 0));
  }
}

export { Y };
