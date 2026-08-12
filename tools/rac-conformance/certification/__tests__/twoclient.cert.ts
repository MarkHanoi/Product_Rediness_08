// ─── HARNESS 3 — TWO-CLIENT CONCURRENCY (the collaboration row, MEASURED) ────
//
// THE ROW THIS EXISTS FOR. Every row of the persistence and undo/redo suites
// reads `Collaboration UNPROVEN by construction`, and that phrase is literal:
// both call `buildWorld()` ONCE. A harness that composes one client cannot say
// anything about two. This suite composes TWO, so the row becomes MEASURABLE.
//
// It does not try to make the row green. It tries to make it a NUMBER.
//
// ─── WHY A SUITE AND A GATE, RATHER THAN ONE SCRIPT ─────────────────────────
//
// `buildWorld()` transitively imports `@pryzm/file-format`, whose barrel reaches
// `PdfExportService` → `svg2pdf.js`, which does not resolve under bare `tsx`
// (`does not provide an export named 'svg2pdf'`). Vitest's resolver handles it,
// which is why the two existing cert harnesses are vitest suites. So the
// MEASUREMENT runs here, writes `results/two-client-convergence.json`, and
// `gates/check-two-client-convergence.ts` GRADES that artefact against floors
// and a ratchet — exactly the split `certify.ts` already uses, and the split
// that makes a crashed suite fail (stale artefact) instead of printing a pass.
//
// ─── WHAT IS GENUINELY COMPOSED vs SIMULATED ────────────────────────────────
// Enumerated in `PROVENANCE` (../twoClientWorld.ts) and printed by the gate on
// every run. Read it before reading any verdict here: a "two client" harness
// that shares one store proves nothing, and the store-isolation POSITIVE
// CONTROL below is the assertion that this one does not.

import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROVENANCE, composeClient, asClient, exchange, settle, type ClientPeer,
} from '../twoClientWorld';

// ─── Floors — §C10, emptiness is never a pass ───────────────────────────────
// PER CLIENT and separate: a summed floor would let client A's mutations cover
// client B having silently never composed, which is the exact failure this gate
// is most exposed to.
const FLOOR_CLIENTS = 2;
const FLOOR_MUTATIONS_PER_CLIENT = 1;
const FLOOR_CROSSINGS = 2;
const FLOOR_COMPARED = 3;

const WALL_ID = 'tc-wall-1';

interface Finding { arm: string; kind: string; detail: string; }
interface FloorReading { what: string; measured: number; min: number; }

const findings: Finding[] = [];
const floors: FloorReading[] = [];
const lines: string[] = [];
const line = (s = ''): void => { lines.push(s); };

let misconfigured = '';
const bail = (reason: string, detail: string): void => {
  if (!misconfigured) misconfigured = `${reason}: ${detail}`;
  line(`✗ MISCONFIGURED [${reason}] — ${detail}`);
};

// ─── Store readers — the AUTHORITATIVE store, not the CRDT document ─────────
// This is the whole point of the suite: `check-collab-graph-integrity` already
// proves things about the Y.Doc. Nothing proves the value reaches the store the
// serializer reads.

function wallRecord(peer: ClientPeer, id: string): Record<string, unknown> | undefined {
  const store = peer.world.stores['wallStore'] as {
    getWall?: (i: string) => unknown; getAll?: () => unknown[];
  };
  const direct = store.getWall?.(id);
  if (direct) return direct as Record<string, unknown>;
  return (store.getAll?.() ?? []).find(
    (x) => (x as { id?: string }).id === id,
  ) as Record<string, unknown> | undefined;
}

function readWall(peer: ClientPeer, id: string, prop: string): unknown {
  return wallRecord(peer, id)?.[prop];
}

function wallIds(peer: ClientPeer): string[] {
  const store = peer.world.stores['wallStore'] as { getAll?: () => unknown[] };
  return (store.getAll?.() ?? [])
    .map((w) => String((w as { id?: string }).id ?? ''))
    .filter(Boolean)
    .sort();
}

/**
 * THE COMPARATOR — property by property, carrying BOTH values.
 *
 * Never a hash. A hash tells you THAT two documents differ; the entire value of
 * this arm is WHAT differs and what each side holds. The NEGATIVE CONTROL runs
 * this identical function over a deliberately diverged pair, so a shortcut that
 * made the broken pair look clean would turn the run MISCONFIGURED, not green.
 */
interface Divergence { elementId: string; property: string; a: unknown; b: unknown; }

function compareValues(
  elementId: string, property: string, va: unknown, vb: unknown,
): Divergence | null {
  if (JSON.stringify(va ?? null) === JSON.stringify(vb ?? null)) return null;
  return { elementId, property, a: va, b: vb };
}

function compareProperty(
  a: ClientPeer, b: ClientPeer, elementId: string, property: string,
): Divergence | null {
  return compareValues(elementId, property, readWall(a, elementId, property), readWall(b, elementId, property));
}

/**
 * Seed a client through its OWN CommandManager, as a peer loading the project.
 *
 * The command SHAPE is lifted verbatim from `../seed.ts` — the fixture both
 * existing cert harnesses use — rather than reinvented. `seed.ts` exists
 * precisely because "two harnesses seeding two similar-but-not-identical models
 * is how a divergence gets blamed on the code when it belongs to the fixture",
 * and the first run of THIS suite proved the point: an invented
 * `{ startPoint, endPoint }` shape silently created no wall, every arm compared
 * `undefined` to `undefined` and read "agree". The floors and the negative
 * control caught it (exit 2, not a green run), but the lesson is to reuse.
 *
 * Only the wall is seeded: this suite's subject is concurrent editing of ONE
 * shared element, and a full `seedWorld()` would add 17 kinds of noise to every
 * per-property comparison.
 */
async function seedPeer(peer: ClientPeer): Promise<string> {
  const reg = (await import('@pryzm/command-registry')) as unknown as
    Record<string, new (...a: unknown[]) => unknown>;

  // ── THE SHARED-ID CEILING, released deliberately and declared loudly ───────
  //
  // MEASURED on run 3 of this suite: client B's CreateWallCommand refused with
  // `ID "tc-wall-1" already exists in ElementRegistry`. `elementRegistry` is a
  // MODULE SINGLETON (ElementRegistry.getInstance(),
  // packages/core-app-model/src/ElementRegistry.ts:307), so two clients in ONE
  // Node realm cannot both hold the same element id — which is the definition
  // of two peers editing the same wall.
  //
  // Releasing the id before each client seeds is a HARNESS-LOCAL workaround for
  // a HARNESS-LOCAL limit (one realm), not a product change: real peers are
  // separate processes with separate registries, and each one legitimately holds
  // this id. It is listed in PROVENANCE.notMeasured so no reader mistakes it for
  // a property of the product, and it is the reason the id-COLLISION question
  // (does a peer re-mint an id it already has?) is stated as UNMEASURABLE
  // in-process rather than answered here.
  try {
    const { elementRegistry } = await import('@pryzm/core-app-model/element-registry');
    (elementRegistry as unknown as { unregisterIfPresent(id: string): void })
      .unregisterIfPresent(WALL_ID);
  } catch { /* if the registry cannot be reached the seed refusal below reports it */ }

  return asClient(peer, () => {
    const cm = peer.world.cm as unknown as {
      execute: (c: unknown) => unknown; clearHistory?: () => void;
    };
    // `CreateWallCommand.canExecute` (packages/command-registry/src/walls/
    // CreateWallCommand.ts:146) refuses with 'Level not found' unless
    // `ctx.bimManager.getLevelById(levelId)` resolves. The wall below targets
    // 'L0', so 'L0' is what must exist — seeding 'L1' and creating on 'L0' is
    // how the second run of this suite produced a wall on client A (whose
    // BimManager already carried a default L0) and none on client B.
    const bim = peer.world.bimManager as unknown as {
      getLevelById?: (id: string) => unknown;
    };
    if (!bim.getLevelById?.('L0')) {
      try {
        const AddLevel = reg['AddLevelCommand'];
        if (AddLevel) {
          cm.execute(new AddLevel({
            levelId: 'L0', name: 'Level 0', elevation: 0, height: 3,
          }));
        }
      } catch (e) {
        return `AddLevelCommand('L0') threw: ${String(e).slice(0, 200)}`;
      }
    }
    if (!bim.getLevelById?.('L0')) {
      return "level 'L0' does not resolve on this client's BimManager, so CreateWallCommand " +
        "will refuse with 'Level not found' — the subject cannot be established";
    }

    const CreateWall = reg['CreateWallCommand'];
    if (!CreateWall) return 'CreateWallCommand is not exported by @pryzm/command-registry';
    let result: unknown;
    try {
      // Shape per ../seed.ts:44 — `{ start, end }` on level 'L0', NOT
      // `{ startPoint, endPoint }`. See the note above.
      result = cm.execute(new CreateWall(WALL_ID, {
        start: { x: 0, z: 0 }, end: { x: 6, z: 0 },
        height: 3, thickness: 0.2, levelId: 'L0', materialColor: '#aabbcc',
      }));
    } catch (e) {
      return `CreateWallCommand threw: ${String(e).slice(0, 220)}`;
    }
    // A REFUSAL is not a throw. `CommandManager.execute` returns
    // `{ success:false, reason }` when `canExecute` declines, and swallowing
    // that is how the previous run reported "the wall did not land" without
    // saying WHY — the §CONTEXT-DATA-HONESTY failure of making a refusal and an
    // empty result the same observation.
    const r = result as { success?: boolean; reason?: string; error?: string } | undefined;
    if (r && r.success === false) {
      return `CreateWallCommand REFUSED: ${r.reason ?? r.error ?? 'no reason given'}`;
    }
    cm.clearHistory?.();
    peer.learn(WALL_ID, 'wall');
    return wallRecord(peer, WALL_ID) === undefined
      ? "the wall did not land in this client's WallStore after CreateWallCommand"
      : '';
  });
}

describe('HARNESS 3 — two-client concurrency', () => {
  it('measures convergence, identity and undo across two composed clients', async () => {
    const room = `two-client-cert-${Date.now()}`;

    let A: ClientPeer | undefined;
    let B: ClientPeer | undefined;
    let crossings = 0;
    let comparedCount = 0;
    let controlDetected = false;
    let controlRan = false;

    try {
      // ── COMPOSE ────────────────────────────────────────────────────────────
      try {
        A = await composeClient('A', room);
        B = await composeClient('B', room);
      } catch (e) {
        bail('client-compose-failed', `a client world did not compose: ${String(e).slice(0, 400)}`);
      }
      const composed = [A, B].filter(Boolean).length;
      floors.push({ what: 'client worlds composed', measured: composed, min: FLOOR_CLIENTS });

      if (A && B) {
        // ── POSITIVE CONTROL · STORE ISOLATION ──────────────────────────────
        // The single most valuable assertion here. If the two "clients" share a
        // store, every arm converges trivially and the suite is theatre.
        const distinctStores = A.world.stores['wallStore'] !== B.world.stores['wallStore'];
        const distinctCM = (A.world.cm as unknown) !== (B.world.cm as unknown);
        const distinctDocs = A.adapter.doc !== B.adapter.doc;
        const distinctBus = (A.world.bus as unknown) !== (B.world.bus as unknown);
        line('CONTROL · store isolation (positive — proves this is really two clients)');
        line(`   WallStore instances distinct      ${distinctStores ? '✓' : '✗ SHARED'}`);
        line(`   CommandManager instances distinct ${distinctCM ? '✓' : '✗ SHARED'}`);
        line(`   CommandBus instances distinct     ${distinctBus ? '✓' : '✗ SHARED'}`);
        line(`   Y.Doc instances distinct          ${distinctDocs ? '✓' : '✗ SHARED'}`);
        if (!distinctStores || !distinctCM || !distinctDocs || !distinctBus) {
          bail('shared-subject',
            'the two "clients" share a store, bus, CommandManager or Y.Doc — every ' +
            'convergence result would be an artefact of there being one subject, not a measurement');
        }

        // ── SEED ────────────────────────────────────────────────────────────
        const seedErrA = await seedPeer(A);
        const seedErrB = await seedPeer(B);
        if (seedErrA || seedErrB) {
          bail('seed-failed', `client A: ${seedErrA || 'ok'} · client B: ${seedErrB || 'ok'}`);
        }
        line(`seed  both clients hold ${WALL_ID} · height A=${JSON.stringify(readWall(A, WALL_ID, 'height'))} B=${JSON.stringify(readWall(B, WALL_ID, 'height'))}`);

        const mutA0 = A.replicated;
        const mutB0 = B.replicated;

        // ═══ ARM 1 · CONVERGENCE ═══════════════════════════════════════════
        // PARTITIONED concurrent edit: neither client sees the other while it
        // writes. A raises the wall; B recolours the SAME wall — different
        // properties, same element, the case a CRDT should merge losslessly.
        line();
        line('ARM 1 · CONVERGENCE — both clients edit, then sync; compared property by property');
        const rA = await asClient(A, () =>
          A!.world.dispatch('wall.updateDimensions', { wallId: WALL_ID, height: 5 }));
        const rB = await asClient(B, () =>
          B!.world.dispatch('wall.updateColor', { wallId: WALL_ID, materialColor: '#c0ffee' }));
        await settle(A, B);
        line(`   A wall.updateDimensions height=5   ok=${rA.ok}${rA.err ? ' err=' + rA.err.slice(0, 140) : ''}`);
        line(`   B wall.updateColor #c0ffee         ok=${rB.ok}${rB.err ? ' err=' + rB.err.slice(0, 140) : ''}`);
        line(`   pre-sync  A.height=${JSON.stringify(readWall(A, WALL_ID, 'height'))}  B.materialColor=${JSON.stringify(readWall(B, WALL_ID, 'materialColor'))}`);

        crossings = await exchange(A, B);
        line(`   sync      ${crossings} update crossing(s) transported (state-vector deltas; 0 = nothing moved)`);

        // ── The CRDT document vs the STORE, read separately ──────────────────
        // This is the distinction the whole suite exists for, and it is printed
        // BEFORE the store comparison so a divergence can be attributed rather
        // than merely observed. If a property is correct in the peer's Y.Doc but
        // wrong in the peer's store, the defect is in the READ LEG (document →
        // store), not in the CRDT — and those are different bugs owned by
        // different code. Reporting only the store value would blame the merge.
        for (const [label, peer] of [['A', A], ['B', B]] as const) {
          const doc = peer.adapter.readElement(WALL_ID) ?? {};
          line(`   doc[${label}]   height=${JSON.stringify(doc['height'])} ` +
               `materialColor=${JSON.stringify(doc['materialColor'])} ` +
               `thickness=${JSON.stringify(doc['thickness'])}`);
        }
        line(`   read-leg  A.applied=${A.applied} B.applied=${B.applied} ` +
             `(remote updates each client's reader delivered INTO its own store)`);
        // WHICH verbs reached the CRDT applier. A count alone cannot separate
        // "this verb replicated" from "a different verb did and this one did
        // not" — which is precisely the defect the first honest reading found.
        for (const [label, peer] of [['A', A], ['B', B]] as const) {
          line(`   write-leg ${label} replicated [${peer.replicatedVerbs.join(', ')}]`);
          for (const rp of peer.replicatedPayloads) {
            line(`             ${label} ${rp.type} payload keys [${rp.keys.join(', ')}] = ${JSON.stringify(rp.payload).slice(0, 220)}`);
          }
        }

        for (const p of ['height', 'materialColor', 'thickness']) {
          comparedCount++;
          const d = compareProperty(A, B, WALL_ID, p);
          line(`   compare   ${WALL_ID}.${p}  A=${JSON.stringify(readWall(A, WALL_ID, p))}  B=${JSON.stringify(readWall(B, WALL_ID, p))}  → ${d ? 'DIVERGED' : 'agree'}`);
          if (d) {
            // ATTRIBUTE the divergence. A store disagreement whose DOCUMENTS
            // agree is a READ-LEG defect (the CRDT merged correctly and the
            // value never reached the store); a disagreement the documents share
            // is a MERGE/transport defect. Reporting them as one kind would send
            // whoever fixes it to the wrong file.
            const docA = (A.adapter.readElement(WALL_ID) ?? {})[p];
            const docB = (B.adapter.readElement(WALL_ID) ?? {})[p];
            const docsAgree = JSON.stringify(docA ?? null) === JSON.stringify(docB ?? null);
            findings.push({
              arm: 'convergence',
              kind: docsAgree ? 'read-leg-did-not-reach-store' : 'store-divergence',
              detail: docsAgree
                ? `${d.elementId}.${d.property}: both Y.Docs agree on ${JSON.stringify(docA)}, but ` +
                  `client A's STORE holds ${JSON.stringify(d.a)} and client B's holds ${JSON.stringify(d.b)}. ` +
                  `The CRDT merged correctly and the merged value did NOT reach at least one ` +
                  `authoritative store — the defect is in the read leg (ElementSyncReader → sink → bus), ` +
                  `not in the merge.`
                : `${d.elementId}.${d.property}: client A holds ${JSON.stringify(d.a)} (doc ${JSON.stringify(docA)}), ` +
                  `client B holds ${JSON.stringify(d.b)} (doc ${JSON.stringify(docB)}) after sync — ` +
                  `the documents themselves disagree.`,
            });
          }
        }
        // Each client's OWN edit must survive on its own side. A merge that
        // reverted the author's edit is a LOST UPDATE — distinct from divergence.
        if (rA.ok && readWall(A, WALL_ID, 'height') !== 5) {
          findings.push({
            arm: 'convergence', kind: 'lost-update',
            detail: `client A's own height=5 edit did not survive on A (reads ${JSON.stringify(readWall(A, WALL_ID, 'height'))})`,
          });
        }
        if (rB.ok && readWall(B, WALL_ID, 'materialColor') !== '#c0ffee') {
          findings.push({
            arm: 'convergence', kind: 'lost-update',
            detail: `client B's own materialColor edit did not survive on B (reads ${JSON.stringify(readWall(B, WALL_ID, 'materialColor'))})`,
          });
        }

        // ═══ ARM 2 · IDENTITY UNDER CONCURRENCY ════════════════════════════
        line();
        line('ARM 2 · IDENTITY — after concurrent edits to the SAME wall: re-minted, duplicated or lost?');
        const idsA = wallIds(A);
        const idsB = wallIds(B);
        line(`   wall ids on A  [${idsA.join(', ')}]`);
        line(`   wall ids on B  [${idsB.join(', ')}]`);
        for (const [label, ids] of [['A', idsA], ['B', idsB]] as const) {
          if (!ids.includes(WALL_ID)) {
            findings.push({
              arm: 'identity', kind: 'element-lost',
              detail: `client ${label} no longer holds ${WALL_ID} after concurrent editing — ids are [${ids.join(', ')}]`,
            });
          }
          const dupes = ids.filter((i) => i === WALL_ID).length;
          if (dupes > 1) {
            findings.push({
              arm: 'identity', kind: 'element-duplicated',
              detail: `client ${label} holds ${dupes} records for ${WALL_ID}`,
            });
          }
          const strangers = ids.filter((i) => i !== WALL_ID);
          if (strangers.length > 0) {
            findings.push({
              arm: 'identity', kind: 'element-re-minted',
              detail: `client ${label} gained wall id(s) nobody authored: [${strangers.join(', ')}] — a re-mint or a duplicate under a new id`,
            });
          }
        }
        if (JSON.stringify(idsA) !== JSON.stringify(idsB)) {
          findings.push({
            arm: 'identity', kind: 'id-set-diverged',
            detail: `the clients disagree about which walls exist: A=[${idsA.join(', ')}] B=[${idsB.join(', ')}]`,
          });
        }

        // ═══ ARM 3 · UNDO UNDER CONCURRENCY ════════════════════════════════
        // C03 §4.5-4.8: undo is PER-GESTURE. A's Ctrl+Z reverts A's own gesture
        // and must not touch the property B authored.
        line();
        line("ARM 3 · UNDO under concurrency — A undoes its own gesture; B's edit must survive");
        const beforeHeight = readWall(A, WALL_ID, 'height');
        const beforeColorOnA = readWall(A, WALL_ID, 'materialColor');
        line(`   before undo on A  height=${JSON.stringify(beforeHeight)}  materialColor=${JSON.stringify(beforeColorOnA)}`);

        let undoRan = false;
        let undoErr = '';
        let historyLen = 0;
        await asClient(A, () => {
          const cm = A!.world.cm as unknown as {
            undo?: () => unknown; getHistory?: () => unknown[];
          };
          historyLen = (cm.getHistory?.() ?? []).length;
          if (typeof cm.undo !== 'function') { undoErr = 'CommandManager.undo is not a function'; return; }
          if (historyLen === 0) {
            undoErr = 'client A armed NO undo entry for its own edit — there is no gesture to undo';
            return;
          }
          try { cm.undo(); undoRan = true; } catch (e) { undoErr = `undo threw: ${String(e).slice(0, 220)}`; }
        });
        await settle(A, B);
        const afterHeight = readWall(A, WALL_ID, 'height');
        const afterColorOnA = readWall(A, WALL_ID, 'materialColor');
        line(`   undo ran=${undoRan} historyEntries=${historyLen}${undoErr ? ' · ' + undoErr : ''}`);
        line(`   after  undo on A  height=${JSON.stringify(afterHeight)}  materialColor=${JSON.stringify(afterColorOnA)}`);

        if (!undoRan) {
          findings.push({
            arm: 'undo', kind: 'undo-unavailable',
            detail: `client A could not undo its own gesture: ${undoErr}`,
          });
        } else {
          if (rA.ok && afterHeight === 5) {
            findings.push({
              arm: 'undo', kind: 'undo-did-not-revert-own',
              detail: "after A's undo the wall height is still 5 on A — A's own gesture was not reverted",
            });
          }
          // The load-bearing half: B's work must be untouched on A.
          if (beforeColorOnA === '#c0ffee' && afterColorOnA !== '#c0ffee') {
            findings.push({
              arm: 'undo', kind: 'undo-reverted-peer-work',
              detail: `client A's undo reverted client B's materialColor (was '#c0ffee' before A's undo, ` +
                `${JSON.stringify(afterColorOnA)} after) — C03 §4.5-4.8 makes undo per-gesture; ` +
                `one user's Ctrl+Z must never revert another user's work`,
            });
          }
          // …and must not propagate as an authored edit that clobbers B's document.
          await exchange(A, B);
          const colorOnBAfter = readWall(B, WALL_ID, 'materialColor');
          line(`   after resync      B.materialColor=${JSON.stringify(colorOnBAfter)}`);
          if (beforeColorOnA === '#c0ffee' && colorOnBAfter !== '#c0ffee') {
            findings.push({
              arm: 'undo', kind: 'undo-propagated-to-peer',
              detail: `after A's undo synced, client B's own materialColor edit reads ` +
                `${JSON.stringify(colorOnBAfter)} — A's undo destroyed B's work on B's own document`,
            });
          }
        }

        // ═══ ARM 1b · RIVAL RECORD MINT ════════════════════════════════════
        //
        // ISOLATED from the run above, because it is the MECHANISM behind the
        // first honest reading and it deserves to be measured directly rather
        // than inferred from a store diff.
        //
        // `YjsDocAdapter._applyDeclaredProperties` (packages/sync-client/src/
        // YjsDocAdapter.ts:690-700) does:
        //     let record = elements.get(elementId);
        //     if (!record) { record = new Y.Map(); elements.set(elementId, record); }
        // When two PARTITIONED clients each touch an element neither has seen,
        // both take the `!record` branch and each `set`s its OWN Y.Map into the
        // same key. On merge Yjs must pick ONE of the two rival containers — and
        // the loser is discarded WITH EVERY PROPERTY INSIDE IT. That is not
        // last-writer-wins on a property; it is the silent loss of a property
        // NOBODY concurrently edited.
        //
        // The control below is what makes this a finding rather than a theory:
        // the SAME two edits, on a record that was created ONCE and replicated
        // BEFORE the partition, survive completely. So the loss is caused by the
        // rival mint, not by concurrency as such.
        line();
        line('ARM 1b · RIVAL RECORD MINT — two peers first-touch the same element while partitioned');
        {
          const { YjsDocAdapter } = await import('@pryzm/sync-client');
          const Yjs = await import('yjs');

          // (i) RIVAL MINT — neither peer has the record.
          const r1 = new YjsDocAdapter('arm1b-rival');
          const r2 = new YjsDocAdapter('arm1b-rival');
          r1.applyCommand('wall.updateDimensions', { wallId: 'rw', height: 5 });
          r2.applyCommand('wall.updateColor', { wallId: 'rw', materialColor: '#c0ffee' });
          for (let i = 0; i < 3; i++) {
            const u1 = Yjs.encodeStateAsUpdate(r1.doc, Yjs.encodeStateVector(r2.doc));
            if (u1.byteLength) r2.applyUpdate(u1);
            const u2 = Yjs.encodeStateAsUpdate(r2.doc, Yjs.encodeStateVector(r1.doc));
            if (u2.byteLength) r1.applyUpdate(u2);
          }
          const rivalA = r1.readElement('rw') ?? {};
          const rivalB = r2.readElement('rw') ?? {};
          line(`   rival mint    doc1=${JSON.stringify(rivalA)}  doc2=${JSON.stringify(rivalB)}`);

          // (ii) CONTROL — the record is created once and replicated FIRST.
          const s1 = new YjsDocAdapter('arm1b-seeded');
          const s2 = new YjsDocAdapter('arm1b-seeded');
          s1.applyCommand('wall.create', { id: 'sw', height: 3, thickness: 0.2 });
          s2.applyUpdate(s1.encodeStateAsUpdate());
          s1.applyCommand('wall.updateDimensions', { wallId: 'sw', height: 5 });
          s2.applyCommand('wall.updateColor', { wallId: 'sw', materialColor: '#c0ffee' });
          for (let i = 0; i < 3; i++) {
            const u1 = Yjs.encodeStateAsUpdate(s1.doc, Yjs.encodeStateVector(s2.doc));
            if (u1.byteLength) s2.applyUpdate(u1);
            const u2 = Yjs.encodeStateAsUpdate(s2.doc, Yjs.encodeStateVector(s1.doc));
            if (u2.byteLength) s1.applyUpdate(u2);
          }
          const seededA = s1.readElement('sw') ?? {};
          line(`   control       pre-replicated record → doc1=${JSON.stringify(seededA)}`);

          const rivalLost = ['height', 'materialColor'].filter(
            (k) => rivalA[k] === undefined || rivalB[k] === undefined);
          const controlHeld = seededA['height'] === 5 && seededA['materialColor'] === '#c0ffee';
          line(`   rival lost [${rivalLost.join(', ') || 'nothing'}] · control held both edits=${controlHeld}`);

          if (rivalLost.length > 0 && controlHeld) {
            findings.push({
              arm: 'convergence', kind: 'rival-record-mint-loses-properties',
              detail:
                `two partitioned clients that each FIRST-TOUCH the same element mint rival Y.Map ` +
                `records for it; on merge Yjs keeps one container and discards the other WITH ITS ` +
                `PROPERTIES. Lost here: [${rivalLost.join(', ')}] — doc1=${JSON.stringify(rivalA)}, ` +
                `doc2=${JSON.stringify(rivalB)}. The CONTROL proves it is the rival mint and not ` +
                `concurrency: the same two edits on a record replicated BEFORE the partition keep ` +
                `both values (${JSON.stringify(seededA)}). Site: packages/sync-client/src/` +
                `YjsDocAdapter.ts:690-700 (_applyDeclaredProperties) and :598-602 (applyCommand), ` +
                `which both do get-or-create without reconciling a concurrent create. P8 makes this ` +
                `worse than a merge choice: the loss is SILENT — no CRDTConflict is emitted, because ` +
                `disclosure compares properties, not rival containers.`,
            });
          } else if (rivalLost.length > 0 && !controlHeld) {
            findings.push({
              arm: 'convergence', kind: 'concurrent-property-loss',
              detail:
                `concurrent property edits are lost EVEN when the element record was replicated ` +
                `before the partition — doc1=${JSON.stringify(seededA)}. This is broader than the ` +
                `rival-mint case and is reported separately so the two are not conflated.`,
            });
          }
          r1.destroy(); r2.destroy(); s1.destroy(); s2.destroy();
        }

        // ═══ NEGATIVE CONTROL — force a divergence, prove the checker SEES it ═
        line();
        line('CONTROL · negative — a deliberately diverged pair fed to the SAME comparator');
        // The store hands out FROZEN records, so the divergence is forced on the
        // VALUE fed to the comparator rather than by mutating B's store. This is
        // the same code path (`compareValues`, which `compareProperty` is a thin
        // reader-wrapper over), so a shortcut that made a broken pair look clean
        // would still be caught — and nothing in either client's authoritative
        // state is touched by its own control, which matters because a control
        // that corrupts the subject invalidates every arm after it.
        const realThickness = readWall(A, WALL_ID, 'thickness');
        if (wallRecord(B, WALL_ID) !== undefined) {
          controlRan = true;
          controlDetected = compareValues(WALL_ID, 'thickness', realThickness, 'DELIBERATELY-DIVERGED') !== null;
          line(`   fed the comparator ${JSON.stringify(realThickness)} vs 'DELIBERATELY-DIVERGED' → reports ${controlDetected ? 'DIVERGED ✓ (it can fail)' : 'CLEAN ✗ (BLIND)'}`);
          // …and the converse: identical values MUST read clean, or the
          // comparator is not detecting divergence, it is just always shouting.
          const agreesOnEqual = compareValues(WALL_ID, 'thickness', realThickness, realThickness) === null;
          line(`   fed the comparator two IDENTICAL values → reports ${agreesOnEqual ? 'agree ✓ (it is not always-red)' : 'DIVERGED ✗ (always-red, so its findings mean nothing)'}`);
          controlDetected = controlDetected && agreesOnEqual;
        } else {
          line('   ✗ could not reach a wall record on B to run the control against');
        }
        if (!controlRan || !controlDetected) {
          bail('blind-comparator',
            'the comparator reported a DELIBERATELY diverged property as clean (or could not run the ' +
            'control). It cannot see the defect it exists to see, so every verdict above is worthless.');
        }

        // ── FLOORS ──────────────────────────────────────────────────────────
        floors.push(
          { what: "client A mutations replicated from its OWN bus", measured: A.replicated - mutA0, min: FLOOR_MUTATIONS_PER_CLIENT },
          { what: "client B mutations replicated from its OWN bus", measured: B.replicated - mutB0, min: FLOOR_MUTATIONS_PER_CLIENT },
          { what: 'update crossings actually transported', measured: crossings, min: FLOOR_CROSSINGS },
          { what: 'properties the comparator actually compared', measured: comparedCount, min: FLOOR_COMPARED },
          { what: 'negative control detected a forced divergence', measured: controlDetected ? 1 : 0, min: 1 },
        );
        line();
        line(`read-leg counters  A.applied=${A.applied} B.applied=${B.applied} · ` +
             `unappliedRemoteCreates A=${A.unappliedRemoteCreates} B=${B.unappliedRemoteCreates} · ` +
             `sinkErrors A=${A.sinkErrors} B=${B.sinkErrors}`);
      }
    } catch (e) {
      bail('harness-threw', String(e).slice(0, 500));
    }

    writeFileSync(
      resolve(__dirname, '..', 'results', 'two-client-convergence.json'),
      JSON.stringify({
        harness: 'twoclient.cert.ts',
        generatedAt: new Date().toISOString(),
        provenance: PROVENANCE,
        misconfigured,
        floors,
        findings,
        crossings,
        comparedCount,
        negativeControl: { ran: controlRan, detected: controlDetected },
        lines,
      }, null, 2),
    );
  }, 600_000);
});
