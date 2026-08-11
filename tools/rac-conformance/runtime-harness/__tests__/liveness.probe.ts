/**
 * tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts
 *
 * §CA-21-READBACK — G-CA-A4. The EXECUTED read-back that C16 §5.1 CA-21 demands,
 * generalised from the two verbs `v3v4v5.probe.ts` already proves to every verb
 * whose authoritative store this composition root can actually reach.
 *
 * ─── What CA-21 requires, and what this file therefore refuses to do ─────────
 *
 * CA-21: "LIVENESS IS PROVEN BY AN EXECUTED READ-BACK, NEVER DECLARED. The proof
 * is: dispatch the verb, then read the property back out of the authoritative
 * store." It then names five things that do NOT satisfy it — `result.success`,
 * a call count, a spy, a patch-pair shape, and a read-back from the same DTO
 * store the handler wrote — and adds: "A dead verb's tests MUST NOT pin the lie."
 *
 * So this probe NEVER asserts on the dispatch result. It dispatches, then reads
 * the property out of a store chosen by a rule it does not get to pick per verb:
 *
 *   AUTHORITATIVENESS RULE — a store counts as authoritative here only if the
 *   PRODUCTION `ProjectSerializer` imports that module singleton by name. That
 *   is the store PERSIST consults; a value that is not in it does not survive a
 *   save. The rule is *checked*, not asserted: `check-verb-liveness.ts` re-reads
 *   `apps/editor/src/engine/persistence/ProjectSerializer.ts` and exits 2 if any
 *   store named below is not imported there. A hand-picked store would let this
 *   probe grade its own homework.
 *
 * ─── The three verdicts, which are three different facts ────────────────────
 *
 *   PROVEN               dispatch executed, and the property READ BACK OUT of
 *                        the authoritative store changed to the expected value.
 *   UNPROVABLE-NO-STORE  the authoritative store for this family is ABSENT from
 *                        the composed runtime — measured, by an executed census,
 *                        not inferred. CA-21 cannot be satisfied for this verb
 *                        by ANY test in this process. It is not a failure and it
 *                        is emphatically not a pass.
 *   UNKNOWN              the store was reachable but the read-back did not
 *                        establish the write (`readback-negative`), or the
 *                        dispatch threw (`dispatch-threw`), or no spec exists
 *                        yet (`not-attempted`).
 *
 * "Failure and emptiness are never the same value" (§CONTEXT-DATA-HONESTY), and
 * "I cannot reach the store" is a third fact — hence three verdicts, never two.
 *
 * ─── The measured constraint that shapes everything below ───────────────────
 *
 * `composeRuntime` composes only the plugin-DTO half. `wallStore`, `slabStore`,
 * `roofStore`, `roomStore`, `ceilingStore`, `floorStore`, `furnitureStore`,
 * `plumbingStore`, `stairStore`, `columnStore`, `curtainWallStore`, `gridStore`,
 * `beamStore` and `handrailStore` are NOT in the composed runtime — the
 * serializer takes those store CLASSES and is handed instances by the caller,
 * so there is no module singleton to read. For those fourteen kinds CA-21 is
 * unprovable BY CONSTRUCTION, in this process, today. That is reported, never
 * papered over. The census below re-measures it on every run rather than
 * trusting this paragraph.
 *
 * ─── STUB LEDGER (declared loudly, per doctrine) ────────────────────────────
 *
 * NOTHING on the measured path is stubbed. `composeRuntime` is the real single
 * composition root (P1), `bootstrapWithEverything` is the real data half, and
 * every store read below is the real module singleton the production serializer
 * imports. The only injected behaviour in this file is the FAULT INJECTOR
 * (`PRYZM_LIVENESS_FAULT`), which exists so the gate can be watched to FAIL, is
 * off unless that env var names a verb, and stamps `faultInjected` into the
 * ledger when it is on so a faulted run can never be mistaken for a clean one.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '..', '.liveness-output');
const OUT_FILE = path.join(OUT_DIR, 'liveness.json');

/** A verb named here has its authoritative store's writes broken, so the gate
 *  can be observed FAILING and naming it. Empty in every normal run. */
const FAULT_VERB = process.env.PRYZM_LIVENESS_FAULT ?? '';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let n = 0;
/** A schema-valid branded id: prefix + 26 Crockford base32 chars. */
function bid(prefix: string): string {
  n += 1;
  let s = '';
  for (let i = 0; i < 26; i++) s += B32[(i * 7 + n * 13 + prefix.length) % 32];
  return prefix + '_' + s;
}

// ───────────────────────── the store census ─────────────────────────────────

/**
 * Every store family a register verb can name, with HOW to reach it. The ladder
 * is executed in order and the rung that answered is recorded, so a verdict can
 * always be traced to a reachability fact rather than to this table.
 *
 *   slot      — `runtime.stores[slot]` / `bus.storesProvider()[slot]` / global
 *   singleton — `(await import(module))[exportName]`, and ONLY when the
 *               production serializer imports that same name (checked by the gate)
 */
interface StoreSpec {
  readonly family: string;              // register verb prefix(es) this backs
  readonly slot?: string;               // runtime/global slot name
  readonly module?: string;             // module singleton source
  readonly exportName?: string;         // module singleton export
}

const STORES: readonly StoreSpec[] = [
  // ─ reachable by module singleton (the serializer imports each of these) ─
  { family: 'door',      slot: 'doorStore',      module: '@pryzm/geometry-door',   exportName: 'doorStore' },
  { family: 'window',    slot: 'windowStore',    module: '@pryzm/geometry-window', exportName: 'windowStore' },
  { family: 'annotation',slot: 'annotationStore',module: '@pryzm/plugin-annotations', exportName: 'annotationStore' },
  { family: 'sheet',     slot: 'sheetStore',     module: '@pryzm/core-app-model',  exportName: 'sheetStore' },
  { family: 'schedule',  slot: 'scheduleStore',  module: '@pryzm/core-app-model',  exportName: 'scheduleStore' },
  { family: 'view',      slot: 'viewDefinitionStore', module: '@pryzm/core-app-model', exportName: 'viewDefinitionStore' },
  { family: 'hierarchy', slot: 'hierarchyStore', module: '@pryzm/core-app-model',  exportName: 'hierarchyStore' },
  { family: 'template',  slot: 'templateStore',  module: '@pryzm/core-app-model',  exportName: 'templateStore' },

  // ─ the kinds the composition root does NOT compose. Listed so the census
  //   MEASURES their absence every run instead of this file asserting it. ─
  { family: 'wall',         slot: 'wallStore' },
  { family: 'slab',         slot: 'slabStore' },
  { family: 'roof',         slot: 'roofStore' },
  { family: 'room',         slot: 'roomStore' },
  { family: 'ceiling',      slot: 'ceilingStore' },
  { family: 'floor',        slot: 'floorStore' },
  { family: 'furniture',    slot: 'furnitureStore' },
  { family: 'plumbing',     slot: 'plumbingStore' },
  { family: 'stair',        slot: 'stairStore' },
  { family: 'column',       slot: 'columnStore' },
  { family: 'curtain-wall', slot: 'curtainWallStore' },
  { family: 'grid',         slot: 'gridStore' },
  { family: 'beam',         slot: 'beamStore' },
  { family: 'handrail',     slot: 'handrailStore' },
  { family: 'opening',      slot: 'openingStore' },
];

interface Reached { readonly store: any; readonly via: string; }

let rt: any;
const census = new Map<string, Reached | null>();

async function reach(spec: StoreSpec): Promise<Reached | null> {
  const slot = spec.slot;
  if (slot) {
    const fromStores = rt?.stores?.[slot];
    if (fromStores) return { store: fromStores, via: 'runtime.stores.' + slot };
    let provided: any = null;
    try { provided = rt?.bus?.storesProvider?.() ?? null; } catch { provided = null; }
    if (provided?.[slot]) return { store: provided[slot], via: 'bus.storesProvider().' + slot };
    const g = (globalThis as any)[slot];
    if (g) return { store: g, via: 'globalThis.' + slot };
  }
  if (spec.module && spec.exportName) {
    try {
      const m: any = await import(/* @vite-ignore */ spec.module);
      if (m?.[spec.exportName]) {
        return { store: m[spec.exportName], via: spec.module + '::' + spec.exportName };
      }
    } catch { /* fall through to UNREACHABLE — an import failure is not a store */ }
  }
  return null;
}

// ───────────────────────── the read-back specs ──────────────────────────────

interface ProbeSpec {
  readonly verb: string;
  readonly family: string;
  /**
   * Put the system into the state the verb needs, using ONLY real verbs on the
   * real bus. Seeding by dispatch (rather than by poking a store) is deliberate:
   * a hand-seeded store answers a different question than the one CA-21 asks,
   * and a seed that reached into the DTO store would make a refusal look like a
   * harness artefact. A seed failure is reported as `seed-failed`, never as a
   * verdict about the verb under test.
   */
  readonly seedVerbs?: readonly { type: string; payload: (ids: Record<string, string>) => Record<string, unknown> }[];
  readonly ids?: readonly string[];
  readonly payload: (ids: Record<string, string>) => Record<string, unknown>;
  /** Read the property back OUT OF THE AUTHORITATIVE STORE. */
  readonly read: (store: any, ids: Record<string, string>) => unknown;
  /** The value the read-back must show for the write to be PROVEN. */
  readonly expected: unknown;
}

/** Branded-id prefix per payload key. `wallId` must be `wall_<ULID>` or the
 *  schema rejects it — and a rejection caused by the harness's own id would be
 *  indistinguishable from a real refusal. */
const ID_PREFIX: Record<string, string> = {
  wallId: 'wall', openingId: 'opening', hostElementId: 'wall', viewId: 'view',
  levelId: 'level', siteId: 'site', buildingId: 'building', bimLevelId: 'level',
};

/** A door/window create payload seeded from correctly-branded ids. */
const doorSeed = (i: Record<string, string>) => ({
  id: i.id, wallId: i.wallId, openingId: i.openingId, offset: 1.0,
  width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single',
});
const windowSeed = (i: Record<string, string>) => ({
  id: i.id, wallId: i.wallId, openingId: i.openingId, offset: 2.0,
  width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single',
});
const annSeed = (i: Record<string, string>) => ({
  id: i.id, kind: 'text-note', text: 'seed',
  anchor: { x: 0, y: 0, z: 0 }, textHeightMm: 2.5,
});

const SPECS: readonly ProbeSpec[] = [
  // ── door ────────────────────────────────────────────────────────────────
  {
    verb: 'door.create', family: 'door', ids: ['id', 'wallId', 'openingId'],
    payload: doorSeed,
    read: (s, i) => (s.getById(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
  {
    verb: 'door.move', family: 'door', ids: ['id', 'wallId', 'openingId'],
    seedVerbs: [{ type: 'door.create', payload: doorSeed }],
    payload: (i) => ({ doorId: i.id, id: i.id, offset: 2.5 }),
    read: (s, i) => s.getById(i.id)?.offset, expected: 2.5,
  },
  {
    verb: 'door.setWidth', family: 'door', ids: ['id', 'wallId', 'openingId'],
    seedVerbs: [{ type: 'door.create', payload: doorSeed }],
    payload: (i) => ({ doorId: i.id, id: i.id, width: 1.4 }),
    read: (s, i) => s.getById(i.id)?.width, expected: 1.4,
  },
  {
    verb: 'door.delete', family: 'door', ids: ['id', 'wallId', 'openingId'],
    seedVerbs: [{ type: 'door.create', payload: doorSeed }],
    payload: (i) => ({ doorId: i.id, id: i.id }),
    read: (s, i) => (s.getById(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'ABSENT',
  },

  // ── window ──────────────────────────────────────────────────────────────
  {
    verb: 'window.create', family: 'window', ids: ['id', 'wallId', 'openingId'],
    payload: windowSeed,
    read: (s, i) => (s.getById(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
  {
    verb: 'window.move', family: 'window', ids: ['id', 'wallId', 'openingId'],
    seedVerbs: [{ type: 'window.create', payload: windowSeed }],
    payload: (i) => ({ windowId: i.id, id: i.id, offset: 3.5 }),
    read: (s, i) => s.getById(i.id)?.offset, expected: 3.5,
  },
  {
    verb: 'window.delete', family: 'window', ids: ['id', 'wallId', 'openingId'],
    seedVerbs: [{ type: 'window.create', payload: windowSeed }],
    payload: (i) => ({ windowId: i.id, id: i.id }),
    read: (s, i) => (s.getById(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'ABSENT',
  },

  // ── annotation — the family whose handlers write the CANONICAL store
  //    (§ANN-ONE-STORE: every handler calls the canonicalAnnotationSink) ────
  {
    verb: 'annotation.create', family: 'annotation', ids: ['id'],
    payload: annSeed,
    read: (s, i) => (s.has(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
  {
    verb: 'annotation.setText', family: 'annotation', ids: ['id'],
    seedVerbs: [{ type: 'annotation.create', payload: annSeed }],
    payload: (i) => ({ annotationId: i.id, text: 'CA21-READ-BACK' }),
    read: (s, i) => (s.getById(i.id) as any)?.parameters?.text,
    expected: 'CA21-READ-BACK',
  },
  {
    verb: 'annotation.setRotation', family: 'annotation', ids: ['id'],
    seedVerbs: [{ type: 'annotation.create', payload: annSeed }],
    payload: (i) => ({ annotationId: i.id, rotation: 1.25 }),
    read: (s, i) => (s.getById(i.id) as any)?.parameters?.rotation,
    expected: 1.25,
  },
  {
    verb: 'annotation.setTextHeight', family: 'annotation', ids: ['id'],
    seedVerbs: [{ type: 'annotation.create', payload: annSeed }],
    payload: (i) => ({ annotationId: i.id, textHeightMm: 4.5 }),
    read: (s, i) => (s.getById(i.id) as any)?.style?.textSizeMm,
    expected: 4.5,
  },
  {
    verb: 'annotation.setColor', family: 'annotation', ids: ['id'],
    seedVerbs: [{ type: 'annotation.create', payload: annSeed }],
    payload: (i) => ({ annotationId: i.id, color: '#6600FF' }),
    read: (s, i) => (s.getById(i.id) as any)?.style?.textColor,
    expected: '#6600FF',
  },
  {
    verb: 'annotation.setKind', family: 'annotation', ids: ['id'],
    seedVerbs: [{ type: 'annotation.create', payload: annSeed }],
    payload: (i) => ({ annotationId: i.id, kind: 'keynote' }),
    read: (s, i) => (s.getById(i.id) as any)?.type,
    expected: 'keynote',
  },
  {
    verb: 'annotation.delete', family: 'annotation', ids: ['id'],
    seedVerbs: [{ type: 'annotation.create', payload: annSeed }],
    payload: (i) => ({ annotationId: i.id }),
    read: (s, i) => (s.has(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'ABSENT',
  },

  // ── sheet / schedule / view / hierarchy / template ───────────────────────
  {
    verb: 'sheet.create', family: 'sheet', ids: ['id'],
    payload: (i) => ({ id: i.id, name: 'CA21 Sheet', number: 'A-921' }),
    read: (s, i) => (s.getById?.(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
  {
    verb: 'schedule.create', family: 'schedule', ids: ['id'],
    payload: (i) => ({ id: i.id, name: 'CA21 Schedule', elementType: 'door' }),
    read: (s, i) => (s.getById?.(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
  {
    verb: 'view.create', family: 'view', ids: ['id'],
    payload: (i) => ({ definition: { id: i.id, name: 'CA21 View', kind: 'plan',
      viewType: 'plan', levelId: 'level_1' } }),
    read: (s, i) => (s.getById?.(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
  {
    verb: 'hierarchy.createSite', family: 'hierarchy', ids: ['id'],
    payload: (i) => ({ id: i.id, name: 'CA21 Site' }),
    read: (s, i) => ((s.getById?.(i.id) ?? s.getNode?.(i.id)) ? 'PRESENT' : 'ABSENT'),
    expected: 'PRESENT',
  },
  {
    verb: 'template.create', family: 'template', ids: ['id'],
    payload: (i) => ({ id: i.id, name: 'CA21 Template', category: 'room' }),
    read: (s, i) => (s.getById?.(i.id) ? 'PRESENT' : 'ABSENT'), expected: 'PRESENT',
  },
];

// ───────────────────────── the fault injector ───────────────────────────────

/**
 * Breaks the authoritative store's writes for ONE verb, so the gate can be
 * observed FAILING and naming it, then observed recovering. A gate nobody has
 * watched fail is a gate nobody should trust. Off unless PRYZM_LIVENESS_FAULT
 * names a verb; when on, `faultInjected` is stamped into the ledger, so a
 * faulted run can never be read as a clean baseline.
 */
function injectFault(store: any): () => void {
  const names = ['add', 'update', 'set', 'create', 'upsert', 'remove', 'delete'];
  const saved: [string, any][] = [];
  for (const nm of names) {
    if (typeof store?.[nm] === 'function') {
      saved.push([nm, store[nm]]);
      store[nm] = () => undefined;          // the write silently goes nowhere
    }
  }
  return () => { for (const [nm, fn] of saved) store[nm] = fn; };
}

// ───────────────────────── the run ──────────────────────────────────────────

interface Row {
  readonly verb: string; readonly family: string;
  readonly verdict: 'PROVEN' | 'UNPROVABLE-NO-STORE' | 'UNKNOWN';
  readonly reason: string; readonly via: string;
  readonly before: string; readonly after: string; readonly expected: string;
}

const rows: Row[] = [];
const censusRows: { family: string; reachable: boolean; via: string }[] = [];

beforeAll(async () => {
  const { composeRuntime } = await import('@pryzm/runtime-composer');
  const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
  rt = await composeRuntime({
    audit: { actorId: 'rac-harness', projectId: 'ca21-liveness', clientId: 'node' },
    canvas: null,
    bootstrapFn: bootstrapWithEverything as never,
  });
  for (const spec of STORES) {
    const r = await reach(spec);
    census.set(spec.family, r);
    censusRows.push({ family: spec.family, reachable: !!r, via: r?.via ?? 'UNREACHABLE' });
  }
}, 600_000);

async function dispatch(type: string, payload: unknown) {
  try { await rt.bus.executeCommand(type, payload); return { ok: true, err: '' }; }
  catch (e) { return { ok: false, err: String(e).slice(0, 240) }; }
}

describe('CA-21 — EXECUTED read-back per verb (G-CA-A4)', () => {
  it('measures the store census, then dispatches and reads every spec back', async () => {
    for (const c of censusRows) {
      console.log('[CENSUS] ' + c.family.padEnd(14) + (c.reachable ? 'REACHABLE via ' + c.via : 'ABSENT from the composed runtime'));
    }

    for (const spec of SPECS) {
      const reached = census.get(spec.family) ?? null;
      if (!reached) {
        rows.push({ verb: spec.verb, family: spec.family, verdict: 'UNPROVABLE-NO-STORE',
          reason: 'authoritative store for family "' + spec.family + '" is absent from the composed runtime',
          via: 'UNREACHABLE', before: 'n/a', after: 'n/a', expected: String(spec.expected) });
        continue;
      }
      const store = reached.store;
      const ids: Record<string, string> = {};
      for (const k of spec.ids ?? []) {
        ids[k] = bid(ID_PREFIX[k] ?? spec.family.replace('-', ''));
      }

      // Seed THROUGH the real bus, never by poking a store.
      let seedErr = '';
      for (const sv of spec.seedVerbs ?? []) {
        const r = await dispatch(sv.type, sv.payload(ids));
        if (!r.ok) { seedErr = sv.type + ' -> ' + r.err; break; }
      }
      if (seedErr) {
        rows.push({ verb: spec.verb, family: spec.family, verdict: 'UNKNOWN',
          reason: 'seed-failed: ' + seedErr, via: reached.via,
          before: 'n/a', after: 'n/a', expected: String(spec.expected) });
        continue;
      }

      const faulted = FAULT_VERB === spec.verb;
      const restore = faulted ? injectFault(store) : () => {};

      let before: unknown; let readErr = '';
      try { before = spec.read(store, ids); } catch (e) { readErr = String(e).slice(0, 160); }
      const d = await dispatch(spec.verb, spec.payload(ids));
      let after: unknown;
      try { after = spec.read(store, ids); } catch (e) { readErr += ' | after: ' + String(e).slice(0, 160); }
      restore();

      let verdict: Row['verdict'] = 'UNKNOWN';
      let reason = '';
      if (after === spec.expected && before !== spec.expected) { verdict = 'PROVEN'; reason = 'executed read-back'; }
      else if (!d.ok && /no handler registered for/.test(d.err)) {
        reason = 'no-handler-registered (the verb has a row in the register and NOTHING answers it on the composed bus)';
      }
      else if (!d.ok) { reason = 'dispatch-threw: ' + d.err; }
      else if (readErr) { reason = 'readback-threw: ' + readErr; }
      else if (before === spec.expected) {
        reason = (spec.seedVerbs?.length ?? 0) > 0
          // The seed verb reported success and the record is still not in the
          // authoritative store, so the "after" state cannot distinguish
          // "this verb worked" from "neither verb ever wrote here".
          ? 'seed-did-not-land (the seed verb reported success but never reached the AUTHORITATIVE store, so this verb cannot be judged)'
          : 'readback-inconclusive (store already held the expected value before dispatch)';
      }
      else { reason = 'readback-negative (dispatch reported success; the AUTHORITATIVE store did not change)'; }

      rows.push({ verb: spec.verb, family: spec.family, verdict, reason, via: reached.via,
        before: JSON.stringify(before) ?? 'undefined', after: JSON.stringify(after) ?? 'undefined',
        expected: JSON.stringify(spec.expected) ?? 'undefined' });

      console.log('[' + verdict + '] ' + spec.verb.padEnd(24) + ' store=' + reached.via +
        ' | ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after) +
        ' (expected ' + JSON.stringify(spec.expected) + ')' +
        (faulted ? ' | ⚠ FAULT INJECTED' : '') + ' | ' + reason);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify({
      generatedAt: new Date().toISOString(),
      faultInjected: FAULT_VERB || null,
      census: censusRows,
      rows,
      counts: {
        PROVEN: rows.filter((r) => r.verdict === 'PROVEN').length,
        'UNPROVABLE-NO-STORE': rows.filter((r) => r.verdict === 'UNPROVABLE-NO-STORE').length,
        UNKNOWN: rows.filter((r) => r.verdict === 'UNKNOWN').length,
      },
    }, null, 2) + '\n');
    console.log('[LEDGER] wrote ' + rows.length + ' rows to ' + OUT_FILE);

    // The probe asserts only that it RAN and produced a ledger. It must never
    // assert a verdict: a dead verb's tests MUST NOT pin the lie (CA-21), and a
    // green PROVEN expectation here would do exactly that. The ratchet lives in
    // tools/ga-gate/check-verb-liveness.ts, where it can be diffed and failed.
    expect(rows.length).toBe(SPECS.length);
  }, 600_000);

  it('FALSIFIABILITY — the read-back mechanism itself detects a real write and refuses a fictional one', async () => {
    const reached = census.get('door');
    if (!reached) { console.log('[FALSIFY] door store UNREACHABLE — mechanism UNPROVEN'); return; }
    const id = bid('door');
    reached.store.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 1.0,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    reached.store.update(id, { offset: 7.75 });
    const seen = reached.store.getById(id)?.offset;
    console.log('[FALSIFY] read-back sees a genuine write=' + (seen === 7.75) +
      ' | refuses a value never written=' + (seen !== 9.99));
    expect(seen).toBe(7.75);
    expect(seen).not.toBe(9.99);
  });
});
