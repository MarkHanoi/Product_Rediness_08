// apps/sync-server/src/collab-gate/collabGraphIntegrity.ts
//
// THE HARNESS BEHIND CRITERION C8 of docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md:
//
//     "Collaboration preserves relationships — two clients edit a wall and its
//      hosted door; both converge with the hosting edge intact."
//
// ─── WHY THIS IS NOT "DO THE DOCUMENTS CONVERGE" ────────────────────────────
//
// Yjs converges.  That is a property of the CRDT, it is not in doubt, and a
// gate that asserts it is asserting a library's test suite.  What is genuinely
// in doubt in a BIM model is whether the SEMANTIC content survives the merge:
// a door is not a bag of properties, it is an element HOSTED BY a wall
// (`Door.wallId`, brand-typed `idRef('wall')` in packages/schemas).  Two users
// can converge byte-for-byte onto a document in which that door is hosted by
// a wall that no longer exists — a converged, self-consistent, WRONG model.
//
// So this harness measures three things, in this order, and reports all three:
//
//   T   TRANSPORT       — did anything cross the wire at all?  This is checked
//                         FIRST and separately, because "no transport" and
//                         "converged fine" must never be the same result.  A
//                         failed probe is MISCONFIGURED, never a pass and never
//                         a relationship failure.
//   R   RELATIONSHIP    — after a genuinely CONCURRENT edit (the peers are
//                         partitioned while they write), does each document
//                         still carry the hosting edge, and does that edge
//                         RESOLVE to a wall that exists in that same document?
//                         A surviving string pointing at nothing is a dangling
//                         reference, not an intact relationship.
//   N   NEGATIVE CONTROL — the same checker is run against a deliberately
//                         broken pair.  If it reports that pair clean, the
//                         checker is blind and the whole run is MISCONFIGURED.
//                         (Acceptance plan §0 rule 1: a score is only worth
//                         having if it can fail.)
//
// Counts are reported alongside every verdict (§0 rule 2: "a comparator
// reporting 0 divergences must also report how many objects it compared").
//
// ─── WHY THE HARNESS LIVES HERE AND NOT IN tools/ga-gate ────────────────────
//
// It needs `ws`, `y-websocket` and `@pryzm/sync-client`, which are dependencies
// of THIS workspace and are not linked into the repo root.  Node resolves from
// the importing file's directory, so the gate script imports this module by
// relative path and every transitive dependency resolves out of
// `apps/sync-server/node_modules`.  The alternative — adding three deps to the
// root manifest so a gate can spin up a server — would put the transport stack
// in the root of a monorepo to satisfy a checker.

import WebSocket from 'ws';
import { WebsocketProvider } from 'y-websocket';
import {
  YjsDocAdapter,
  SYNC_DISPOSITIONS,
  type YjsProvider,
} from '@pryzm/sync-client';
import { createSyncServer, type SyncServerInstance } from '../index.js';
import { signSessionToken } from '../auth/index.js';

// ─── Report shape ───────────────────────────────────────────────────────────

export type CollabGateStatus = 'clean' | 'violations' | 'misconfigured';

/** Every way this harness can fail to establish its own subject. */
export type MisconfiguredReason =
  /** A verb the scenario depends on carries no sync disposition — the harness
   *  would be measuring a command that is not replicated at all. */
  | 'undeclared-verb'
  /** The local server would not start / the remote URL would not accept. */
  | 'server-unavailable'
  /** Nothing crossed the wire.  THE "no transport" RESULT. */
  | 'transport-absent'
  /** The checker reported a deliberately-broken pair as clean. */
  | 'blind-comparator'
  /** Fewer elements/relationships compared than the declared floor — an
   *  empty comparison is not a pass. */
  | 'subject-floor-unmet';

export interface RelationshipObservation {
  readonly scenario: string;
  /** Which document — 'A' or 'B'.  BOTH are checked; a relationship that
   *  survives on the author's side and not the peer's is the exact defect. */
  readonly doc: 'A' | 'B';
  readonly doorId: string;
  readonly expectedHostIn: readonly string[];
  readonly observedHost: unknown;
  /** Does `observedHost` name a wall record that EXISTS in this document? */
  readonly hostResolves: boolean;
}

export interface Violation {
  readonly scenario: string;
  readonly kind:
    | 'hosting-edge-lost'      // the wallId is gone or not a string
    | 'hosting-edge-dangling'  // the wallId survives but names no wall
    | 'hosting-edge-diverged'  // A and B disagree about the host
    | 'concurrent-edit-lost';  // one peer's property write vanished
  readonly detail: string;
}

export interface ScenarioResult {
  readonly name: string;
  readonly comparedElements: number;
  readonly comparedRelationships: number;
  readonly observations: readonly RelationshipObservation[];
  readonly violations: readonly Violation[];
}

export interface CollabGateReport {
  readonly status: CollabGateStatus;
  readonly misconfiguredReason?: MisconfiguredReason;
  readonly misconfiguredDetail?: string;
  readonly target: 'local-harness' | 'remote';
  readonly url: string;
  readonly transport: {
    readonly probed: boolean;
    readonly converged: boolean;
    readonly probeMs: number;
  };
  readonly comparedElements: number;
  readonly comparedRelationships: number;
  readonly scenarios: readonly ScenarioResult[];
  readonly violations: readonly Violation[];
  readonly negativeControl: { readonly ran: boolean; readonly detected: boolean };
  readonly notes: readonly string[];
}

// ─── Floors (acceptance plan §0 rule 2) ─────────────────────────────────────

/** Minimum elements the run must have compared.  Two scenarios × (2 walls +
 *  1 door) × 2 documents; set below the real figure so a legitimate scenario
 *  tweak does not trip it, but far above zero so an empty run cannot pass. */
export const MIN_COMPARED_ELEMENTS = 8;
/** Minimum hosting edges the run must have examined (2 scenarios × 2 docs). */
export const MIN_COMPARED_RELATIONSHIPS = 4;

/** The verbs the scenarios drive.  Each MUST carry a sync disposition, or the
 *  harness is measuring a command that never reaches the CRDT document. */
const REQUIRED_VERBS = [
  'wall.create',
  'wall.updateDimensions',
  'door.create',
  'door.setWidth',
  'door.setOffset',
] as const;

// ─── Options ────────────────────────────────────────────────────────────────

export interface CollabGateOptions {
  /** Target a DEPLOYED sync server (`ws://` / `wss://`).  When absent the
   *  harness starts a local one in-process. */
  readonly url?: string | undefined;
  /** Session token for a remote target.  Ignored locally (the harness mints
   *  its own against the secret it gave the local server). */
  readonly token?: string | undefined;
  /** Per-await budget. */
  readonly timeoutMs?: number;
  readonly log?: (line: string) => void;
}

const LOCAL_SECRET = 'collab-graph-integrity-gate-secret';

// ─── Small utilities ────────────────────────────────────────────────────────

async function until(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return pred();
}

interface Peer {
  readonly label: 'A' | 'B';
  readonly adapter: YjsDocAdapter;
  readonly provider: WebsocketProvider;
}

function connect(
  label: 'A' | 'B',
  adapter: YjsDocAdapter,
  url: string,
  room: string,
  token: string,
): Peer {
  const provider = new WebsocketProvider(url, room, adapter.doc, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
    // Without this the two peers in this one process converge via the
    // in-process BroadcastChannel and the run proves nothing about the wire.
    disableBc: true,
    maxBackoffTime: 400,
    params: { token },
  });
  adapter.connectWithProvider(provider as unknown as YjsProvider);
  return { label, adapter, provider };
}

/** Does `id` name an element record present in this adapter's document? */
function elementExists(adapter: YjsDocAdapter, id: string): boolean {
  return adapter.readElement(id) !== undefined;
}

function elementCount(adapter: YjsDocAdapter): number {
  return adapter.getElementsNamespace().size;
}

// ─── THE CHECKER ────────────────────────────────────────────────────────────

/**
 * Evaluate the hosting relationship on BOTH documents.
 *
 * Exported and pure w.r.t. the adapters so the negative control can run the
 * IDENTICAL code path over a deliberately-broken pair.  If this function ever
 * grows a shortcut that makes the broken pair look clean, the negative control
 * turns the whole run MISCONFIGURED rather than green.
 */
export function checkHosting(
  scenario: string,
  peers: readonly { label: 'A' | 'B'; adapter: YjsDocAdapter }[],
  doorId: string,
  acceptableHosts: readonly string[],
): { observations: RelationshipObservation[]; violations: Violation[] } {
  const observations: RelationshipObservation[] = [];
  const violations: Violation[] = [];
  const seenHosts = new Map<string, unknown>();

  for (const { label, adapter } of peers) {
    const observedHost = adapter.readElementProperty(doorId, 'wallId');
    const hostResolves =
      typeof observedHost === 'string' && observedHost !== '' && elementExists(adapter, observedHost);
    observations.push({
      scenario,
      doc: label,
      doorId,
      expectedHostIn: acceptableHosts,
      observedHost,
      hostResolves,
    });
    seenHosts.set(label, observedHost);

    if (typeof observedHost !== 'string' || observedHost === '') {
      violations.push({
        scenario,
        kind: 'hosting-edge-lost',
        detail: `doc ${label}: door ${doorId} carries no wallId after the merge (read ${JSON.stringify(observedHost)})`,
      });
      continue;
    }
    if (!acceptableHosts.includes(observedHost)) {
      violations.push({
        scenario,
        kind: 'hosting-edge-lost',
        detail: `doc ${label}: door ${doorId} is hosted by '${observedHost}', which is none of the walls either peer wrote (${acceptableHosts.join(', ')})`,
      });
    }
    if (!hostResolves) {
      violations.push({
        scenario,
        kind: 'hosting-edge-dangling',
        detail: `doc ${label}: door ${doorId} points at wall '${observedHost}', which has no element record in that document — a converged model with a dangling host`,
      });
    }
  }

  // Convergence of the RELATIONSHIP, not merely of the bytes: both peers must
  // agree on who hosts the door.
  const hosts = [...new Set(Array.from(seenHosts.values()).map((v) => JSON.stringify(v)))];
  if (hosts.length > 1) {
    violations.push({
      scenario,
      kind: 'hosting-edge-diverged',
      detail: `A and B disagree about door ${doorId}'s host after convergence: ${hosts.join(' vs ')}`,
    });
  }

  return { observations, violations };
}

// ─── The run ────────────────────────────────────────────────────────────────

export async function runCollabGraphIntegrity(
  opts: CollabGateOptions = {},
): Promise<CollabGateReport> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const log = opts.log ?? ((): void => {});
  const notes: string[] = [];
  const scenarios: ScenarioResult[] = [];
  const allViolations: Violation[] = [];
  let comparedElements = 0;
  let comparedRelationships = 0;

  const bail = (
    reason: MisconfiguredReason,
    detail: string,
    partial: Partial<CollabGateReport> = {},
  ): CollabGateReport => ({
    status: 'misconfigured',
    misconfiguredReason: reason,
    misconfiguredDetail: detail,
    target: opts.url ? 'remote' : 'local-harness',
    url: opts.url ?? '(local)',
    transport: { probed: false, converged: false, probeMs: 0 },
    comparedElements,
    comparedRelationships,
    scenarios,
    violations: allViolations,
    negativeControl: { ran: false, detected: false },
    notes,
    ...partial,
  });

  // ── S0 · SUBJECT FLOOR — the verbs must actually replicate. ──────────────
  const undeclared = REQUIRED_VERBS.filter((v) => !(v in SYNC_DISPOSITIONS));
  if (undeclared.length > 0) {
    return bail(
      'undeclared-verb',
      `these verbs carry no sync disposition, so the scenario would measure commands that never reach the CRDT document: ${undeclared.join(', ')}`,
    );
  }
  notes.push(`subject: ${REQUIRED_VERBS.length} verbs, all declared in SYNC_DISPOSITIONS`);

  // ── Target ───────────────────────────────────────────────────────────────
  let server: SyncServerInstance | undefined;
  let url: string;
  let token: string;
  if (opts.url) {
    url = opts.url;
    if (!opts.token) {
      return bail(
        'server-unavailable',
        'a remote target was given but no session token — the upgrade would be refused `missing-token` and the run would misreport that as an absent transport',
      );
    }
    token = opts.token;
    notes.push(`target: REMOTE ${url}`);
  } else {
    try {
      server = await createSyncServer({
        env: { SESSION_SECRET: LOCAL_SECRET },
        sessionSecret: LOCAL_SECRET,
        startSweeper: false,
      });
      const port = await server.listen(0);
      url = `ws://127.0.0.1:${port}`;
      token = signSessionToken({ sub: 'collab-gate', secret: LOCAL_SECRET });
      notes.push(
        `target: LOCAL harness ${url} (wsAuth=${server.wsAuthSelection}) — this run measures the CODE, not a deployed transport`,
      );
    } catch (err) {
      return bail('server-unavailable', `local sync server failed to start: ${String(err)}`);
    }
  }

  const peers: Peer[] = [];
  const cleanup = async (): Promise<void> => {
    for (const p of peers.splice(0)) {
      try { p.provider.destroy(); } catch { /* already gone */ }
      try { p.adapter.destroy(); } catch { /* already gone */ }
    }
    if (server) { try { await server.shutdown('collab-gate'); } catch { /* ignore */ } }
  };

  try {
    // ═══ SCENARIO 1 ═══════════════════════════════════════════════════════
    // The scenario the acceptance plan names, verbatim: two clients edit a
    // wall and a door HOSTED BY that wall, concurrently.
    const room1 = `collab-gate-${Date.now()}-1`;
    const wallId = 'wall-host-1';
    const doorId = 'door-hosted-1';

    const a1 = new YjsDocAdapter(room1);
    const b1 = new YjsDocAdapter(room1);

    // Authored state: a wall at height 3 and a door hosted by it, width 0.9.
    a1.applyCommand('wall.create', { id: wallId, height: 3, thickness: 0.2 });
    a1.applyCommand('door.create', { id: doorId, wallId, width: 0.9, height: 2.1, offset: 1.0 });

    // B is SEEDED with that snapshot — exactly as a late joiner loads the
    // persisted project.  Every later assertion is therefore `toBe(new)`
    // against a document that genuinely holds the OLD value: a dead transport
    // leaves the old value in place and fails loudly, rather than leaving an
    // `undefined` that a lenient assertion would wave through.
    b1.applyUpdate(a1.encodeStateAsUpdate());
    if (b1.readElementProperty(doorId, 'wallId') !== wallId) {
      await cleanup();
      return bail('subject-floor-unmet', 'the seeded peer did not receive the hosting edge from the local snapshot — the scenario never established its subject');
    }

    const pa = connect('A', a1, url, room1, token);
    const pb = connect('B', b1, url, room1, token);
    peers.push(pa, pb);

    // ── T · TRANSPORT PROBE.  Separate, and FIRST. ─────────────────────────
    // A writes something trivial; B must see it.  If it does not, the run is
    // MISCONFIGURED — `transport-absent` — and NOT a relationship failure.
    const probeStart = Date.now();
    const connected = await until(() => pa.provider.wsconnected && pb.provider.wsconnected, timeoutMs);
    a1.applyCommand('wall.updateDimensions', { wallId, thickness: 0.25 });
    const probed = await until(() => b1.readElementProperty(wallId, 'thickness') === 0.25, timeoutMs);
    const probeMs = Date.now() - probeStart;
    if (!connected || !probed) {
      await cleanup();
      return bail(
        'transport-absent',
        connected
          ? `both peers connected to ${url} but nothing crossed the wire within ${timeoutMs} ms (B still reads thickness ${JSON.stringify(b1.readElementProperty(wallId, 'thickness'))}) — this is NOT "converged fine"`
          : `could not establish a WebSocket session against ${url} within ${timeoutMs} ms — no transport`,
        { transport: { probed: true, converged: false, probeMs } },
      );
    }
    log(`  T · transport live — probe crossed in ${probeMs} ms`);

    // ── PARTITION.  Concurrency is not "two writes in a row"; the peers must
    //    be unable to see each other while they write, or one of them is
    //    simply applying the other's already-merged state.
    pa.provider.disconnect();
    pb.provider.disconnect();
    await until(() => !pa.provider.wsconnected && !pb.provider.wsconnected, timeoutMs);

    // A raises the HOST WALL.  B widens the HOSTED DOOR.  Neither can see the
    // other.  This is the concurrent edit C8 names.
    a1.applyCommand('wall.updateDimensions', { wallId, height: 5 });
    b1.applyCommand('door.setWidth', { doorId, width: 1.2 });

    pa.provider.connect();
    pb.provider.connect();
    await until(() => pa.provider.wsconnected && pb.provider.wsconnected, timeoutMs);

    const merged1 = await until(
      () =>
        a1.readElementProperty(wallId, 'height') === 5 &&
        a1.readElementProperty(doorId, 'width') === 1.2 &&
        b1.readElementProperty(wallId, 'height') === 5 &&
        b1.readElementProperty(doorId, 'width') === 1.2,
      timeoutMs,
    );

    const s1Violations: Violation[] = [];
    if (!merged1) {
      // Both edits must survive on both sides.  A merge that keeps only the
      // wall edit is a lost update, and it is reported as such — distinct
      // from a broken relationship.
      for (const [label, ad] of [['A', a1], ['B', b1]] as const) {
        if (ad.readElementProperty(wallId, 'height') !== 5) {
          s1Violations.push({
            scenario: 'wall+hosted-door concurrent edit',
            kind: 'concurrent-edit-lost',
            detail: `doc ${label}: wall height is ${JSON.stringify(ad.readElementProperty(wallId, 'height'))}, expected 5 (A's concurrent edit)`,
          });
        }
        if (ad.readElementProperty(doorId, 'width') !== 1.2) {
          s1Violations.push({
            scenario: 'wall+hosted-door concurrent edit',
            kind: 'concurrent-edit-lost',
            detail: `doc ${label}: door width is ${JSON.stringify(ad.readElementProperty(doorId, 'width'))}, expected 1.2 (B's concurrent edit)`,
          });
        }
      }
    }

    const check1 = checkHosting(
      'wall+hosted-door concurrent edit',
      [{ label: 'A', adapter: a1 }, { label: 'B', adapter: b1 }],
      doorId,
      [wallId],
    );
    s1Violations.push(...check1.violations);
    const s1Elements = elementCount(a1) + elementCount(b1);
    scenarios.push({
      name: 'wall+hosted-door concurrent edit',
      comparedElements: s1Elements,
      comparedRelationships: check1.observations.length,
      observations: check1.observations,
      violations: s1Violations,
    });
    comparedElements += s1Elements;
    comparedRelationships += check1.observations.length;
    allViolations.push(...s1Violations);

    // ═══ SCENARIO 2 ═══════════════════════════════════════════════════════
    // The harder case, and the one that separates "the string survived" from
    // "the relationship survived": both peers concurrently write the HOST
    // ITSELF.  A re-hosts the door onto a second wall; B keeps it on the
    // first and moves it.  Yjs will pick one `wallId` — that is correct and
    // expected.  What must hold is that WHICHEVER host wins, it names a wall
    // that EXISTS in both documents.  A converged model with a door hosted by
    // a wall nobody has is the failure this scenario exists to catch.
    const room2 = `collab-gate-${Date.now()}-2`;
    const wallA = 'wall-host-a';
    const wallB = 'wall-host-b';
    const doorId2 = 'door-hosted-2';

    const a2 = new YjsDocAdapter(room2);
    const b2 = new YjsDocAdapter(room2);
    a2.applyCommand('wall.create', { id: wallA, height: 3, thickness: 0.2 });
    a2.applyCommand('wall.create', { id: wallB, height: 3, thickness: 0.2 });
    a2.applyCommand('door.create', { id: doorId2, wallId: wallA, width: 0.9, height: 2.1, offset: 1.0 });
    b2.applyUpdate(a2.encodeStateAsUpdate());

    const pa2 = connect('A', a2, url, room2, token);
    const pb2 = connect('B', b2, url, room2, token);
    peers.push(pa2, pb2);
    await until(() => pa2.provider.wsconnected && pb2.provider.wsconnected, timeoutMs);
    await until(() => b2.readElementProperty(doorId2, 'wallId') === wallA, timeoutMs);

    pa2.provider.disconnect();
    pb2.provider.disconnect();
    await until(() => !pa2.provider.wsconnected && !pb2.provider.wsconnected, timeoutMs);

    // A re-hosts to wallB; B moves the door along wallA.
    a2.applyCommand('element.updateParameters', {
      elementId: doorId2,
      elementType: 'door',
      parameters: { wallId: wallB },
    });
    b2.applyCommand('door.setOffset', { doorId: doorId2, offset: 2.4, prevOffset: 1.0 });

    pa2.provider.connect();
    pb2.provider.connect();
    await until(() => pa2.provider.wsconnected && pb2.provider.wsconnected, timeoutMs);
    await until(
      () =>
        a2.readElementProperty(doorId2, 'wallId') === b2.readElementProperty(doorId2, 'wallId') &&
        a2.readElementProperty(doorId2, 'offset') === 2.4 &&
        b2.readElementProperty(doorId2, 'offset') === 2.4,
      timeoutMs,
    );

    const s2Violations: Violation[] = [];
    for (const [label, ad] of [['A', a2], ['B', b2]] as const) {
      if (ad.readElementProperty(doorId2, 'offset') !== 2.4) {
        s2Violations.push({
          scenario: 'concurrent re-host',
          kind: 'concurrent-edit-lost',
          detail: `doc ${label}: door offset is ${JSON.stringify(ad.readElementProperty(doorId2, 'offset'))}, expected 2.4 (B's concurrent move)`,
        });
      }
    }
    const check2 = checkHosting(
      'concurrent re-host',
      [{ label: 'A', adapter: a2 }, { label: 'B', adapter: b2 }],
      doorId2,
      [wallA, wallB],
    );
    s2Violations.push(...check2.violations);
    const s2Elements = elementCount(a2) + elementCount(b2);
    scenarios.push({
      name: 'concurrent re-host',
      comparedElements: s2Elements,
      comparedRelationships: check2.observations.length,
      observations: check2.observations,
      violations: s2Violations,
    });
    comparedElements += s2Elements;
    comparedRelationships += check2.observations.length;
    allViolations.push(...s2Violations);

    // ── N · NEGATIVE CONTROL ────────────────────────────────────────────────
    // Run the SAME checker over a pair whose hosting edge has been broken by
    // hand.  If it comes back clean the checker cannot see the thing this gate
    // exists to see, and no verdict it produced above is worth anything.
    const tamperA = new YjsDocAdapter('collab-gate-negative-control');
    const tamperB = new YjsDocAdapter('collab-gate-negative-control');
    tamperA.applyCommand('wall.create', { id: 'tamper-wall', height: 3 });
    tamperA.applyCommand('door.create', { id: 'tamper-door', wallId: 'tamper-wall', width: 0.9 });
    tamperB.applyUpdate(tamperA.encodeStateAsUpdate());
    // Point the door at a wall that does not exist — a DANGLING host, the
    // exact "converged but wrong" state.
    tamperB.applyCommand('element.updateParameters', {
      elementId: 'tamper-door',
      elementType: 'door',
      parameters: { wallId: 'wall-that-does-not-exist' },
    });
    const control = checkHosting(
      'negative control',
      [{ label: 'A', adapter: tamperA }, { label: 'B', adapter: tamperB }],
      'tamper-door',
      ['tamper-wall'],
    );
    const detected = control.violations.length > 0;
    tamperA.destroy();
    tamperB.destroy();
    if (!detected) {
      await cleanup();
      return bail(
        'blind-comparator',
        'the checker reported a door with a dangling host as CLEAN — it cannot detect the defect it exists to detect, so every verdict above is meaningless',
        {
          transport: { probed: true, converged: true, probeMs },
          negativeControl: { ran: true, detected: false },
        },
      );
    }
    notes.push(
      `negative control: the checker flagged ${control.violations.length} violation(s) on a deliberately broken pair — it can fail`,
    );

    // ── Floors ──────────────────────────────────────────────────────────────
    if (comparedElements < MIN_COMPARED_ELEMENTS || comparedRelationships < MIN_COMPARED_RELATIONSHIPS) {
      await cleanup();
      return bail(
        'subject-floor-unmet',
        `compared ${comparedElements} elements / ${comparedRelationships} relationships; floors are ${MIN_COMPARED_ELEMENTS} / ${MIN_COMPARED_RELATIONSHIPS}. An empty comparison is not a pass.`,
        {
          transport: { probed: true, converged: true, probeMs },
          negativeControl: { ran: true, detected: true },
        },
      );
    }

    await cleanup();
    return {
      status: allViolations.length === 0 ? 'clean' : 'violations',
      target: opts.url ? 'remote' : 'local-harness',
      url,
      transport: { probed: true, converged: true, probeMs },
      comparedElements,
      comparedRelationships,
      scenarios,
      violations: allViolations,
      negativeControl: { ran: true, detected: true },
      notes,
    };
  } catch (err) {
    await cleanup();
    return bail('server-unavailable', `harness threw: ${String(err)}`);
  }
}
