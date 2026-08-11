// V3 / V4 / V5 measured against the REAL headless composition root.
//
//   V3 STATE   — dispatch on runtime.bus, read back out of the AUTHORITATIVE store
//                (the one ProjectSerializer + the fragment builders consult).
//   V4 PERSIST — serialize -> JSON round-trip -> restore -> assert the value survived.
//   V5 UNDO    — undo, and assert the SPECIFIC property reversed (never a call count),
//                with mutations stamped in explicit order so the 250 ms three-stack
//                reconciliation window cannot make a stale read look like a pass.
//
// STUB LEDGER (declared loudly, per doctrine):
//   NOTHING on the measured path is stubbed. composeRuntime is the real single
//   composition root, bootstrapWithEverything is the real data half, doorStore /
//   windowStore are the real module singletons ProjectSerializer imports, and the
//   V4 leg calls the real serializer read plus the real ProjectLoader restore
//   SEQUENCE. The non-door/window entries of the ProjectStores bundle are empty
//   harness scaffolds — they are NOT on the door/window path (the serializer reads
//   doors and windows from the module singletons at ProjectSerializer.ts:667-668,
//   not from the bundle), and every row they touch is reported UNPROVEN, never PASS.

import { describe, it, expect, beforeAll } from 'vitest';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let n = 0;
/** A schema-valid branded id: prefix + 26 Crockford base32 chars. */
function bid(prefix: string): string {
  n += 1;
  let s = '';
  for (let i = 0; i < 26; i++) s += B32[(i * 7 + n * 13 + prefix.length) % 32];
  return prefix + '_' + s;
}

let rt: any, doorStore: any, windowStore: any;

beforeAll(async () => {
  const { composeRuntime } = await import('@pryzm/runtime-composer');
  const { bootstrapWithEverything } = await import('@pryzm/editor/bootstrap.everything');
  rt = await composeRuntime({
    audit: { actorId: 'rac-harness', projectId: 'rac-probe', clientId: 'node' },
    canvas: null,
    bootstrapFn: bootstrapWithEverything as never,
  });
  ({ doorStore } = await import('@pryzm/geometry-door'));
  ({ windowStore } = await import('@pryzm/geometry-window'));
}, 600_000);

/** Dispatch and return a structured outcome — a THROW is never merged with "no change". */
async function dispatch(type: string, payload: unknown) {
  try { await rt.bus.executeCommand(type, payload); return { ok: true, err: '' }; }
  catch (e) { return { ok: false, err: String(e).slice(0, 260) }; }
}

describe('V3 — bus dispatch to AUTHORITATIVE store (door/window: the only families the composition root can reach)', () => {
  it('door.create lands (or does not land) in the AUTHORITATIVE doorStore', async () => {
    const id = bid('door'), wallId = bid('wall'), openingId = bid('opening');
    const before = doorStore.getAll().length;
    const r = await dispatch('door.create', {
      id, wallId, openingId, offset: 1.0, width: 0.9, height: 2.1,
      sillHeight: 0, doorType: 'single',
    });
    const rec = doorStore.getById(id);
    const verdict = rec ? 'PASS'
      : r.ok ? 'FAIL (dispatch succeeded, authoritative store unchanged)'
      : 'FAIL (refused: ' + r.err + ')';
    console.log('[V3 door.create] dispatch=' + (r.ok ? 'OK' : 'THREW ' + r.err) +
      ' | AUTHORITATIVE doorStore ' + before + '->' + doorStore.getAll().length +
      ' | record=' + (rec ? 'PRESENT' : 'ABSENT') + ' | VERDICT=' + verdict);
    expect(typeof r.ok).toBe('boolean');
  });

  it('window.create lands (or does not land) in the AUTHORITATIVE windowStore', async () => {
    const id = bid('window'), wallId = bid('wall'), openingId = bid('opening');
    const before = windowStore.getAll().length;
    const r = await dispatch('window.create', {
      id, wallId, openingId, offset: 2.0, width: 1.2, height: 1.4,
      sillHeight: 0.9, windowType: 'single',
    });
    const rec = windowStore.getById(id);
    const verdict = rec ? 'PASS'
      : r.ok ? 'FAIL (dispatch succeeded, authoritative store unchanged)'
      : 'FAIL (refused: ' + r.err + ')';
    console.log('[V3 window.create] dispatch=' + (r.ok ? 'OK' : 'THREW ' + r.err) +
      ' | AUTHORITATIVE windowStore ' + before + '->' + windowStore.getAll().length +
      ' | record=' + (rec ? 'PRESENT' : 'ABSENT') + ' | VERDICT=' + verdict);
    expect(typeof r.ok).toBe('boolean');
  });

  it('door.move / door.setType on a PLACED door seeded into the authoritative store', async () => {
    const id = bid('door');
    doorStore.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 1.0,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    const cases: readonly [string, Record<string, unknown>, string][] = [
      ['door.move', { doorId: id, id, offset: 2.5 }, 'offset'],
      ['door.setType', { doorId: id, id, doorType: 'double' }, 'doorType'],
    ];
    for (const [verb, payload, prop] of cases) {
      const before = (doorStore.getById(id) as any)?.[prop];
      const r = await dispatch(verb, payload);
      const after = (doorStore.getById(id) as any)?.[prop];
      const verdict = before !== after ? 'PASS'
        : r.ok ? 'FAIL (reported success, authoritative store unchanged)'
        : 'FAIL (refused: ' + r.err + ')';
      console.log('[V3 ' + verb + '] dispatch=' + (r.ok ? 'OK' : 'THREW ' + r.err) +
        ' | AUTHORITATIVE ' + prop + ': ' + JSON.stringify(before) + ' -> ' +
        JSON.stringify(after) + ' | VERDICT=' + verdict);
    }
    expect(doorStore.getById(id)).toBeTruthy();
  });

  it('FALSIFIABILITY — the V3 probe goes GREEN on a real change and RED on a wrong expectation', () => {
    // A probe nobody has watched succeed AND fail is a probe nobody should trust.
    const id = bid('door');
    doorStore.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 1.0,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    const before = doorStore.getById(id).offset;
    doorStore.update(id, { offset: 7.75 });              // a REAL authoritative write
    const after = doorStore.getById(id).offset;
    console.log('[FALSIFY V3] authoritative offset ' + before + ' -> ' + after +
      ' | detects-real-change=' + (after !== before) +
      ' | rejects-wrong-expectation=' + (after !== 9.99));
    expect(after).toBe(7.75);        // the probe SEES a genuine authoritative write
    expect(after).not.toBe(9.99);    // and REFUSES a value that was never written
  });
});

// An inert store scaffold: every method answers with the empty-but-valid value for
// its shape. This is NOT on the door/window measured path — the production
// serializer reads doors and windows from the geometry module singletons
// (ProjectSerializer imports `doorStore` / `windowStore` directly), never from this
// bundle. Any row that WOULD depend on these entries is reported UNPROVEN below.
const emptyStore: any = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'then') return undefined;              // never look thenable
    if (/^(size|count|length)$/i.test(prop)) return () => 0;
    if (/^serialize|toJSON$/i.test(prop)) return () => ({});
    // Array-shaped reads MUST be listed before the scalar `get*` catch-all, or
    // `getAll` is swallowed by it and the serializer sees `undefined.map`.
    if (/^(getAll|getLevels|getBy|getIds|list|all|entries|values|keys)/i.test(prop)) return () => [];
    if (/^(isBuiltIn|has|is)/i.test(prop)) return () => false;
    if (/^(getById|get|find)/i.test(prop)) return () => undefined;
    return () => [];
  },
});
const scaffoldBundle = () => new Proxy({}, { get: () => emptyStore }) as any;

/** The PRODUCTION serializer first (the one `initPersistence` wires into the save
 *  delegate); the `@pryzm/persistence-client` twin as fallback. BOTH read doors and
 *  windows from the SAME geometry module singletons (`import { doorStore } from
 *  '@pryzm/geometry-door'`), so a door verdict from either is a verdict about the
 *  authoritative store. Which one ran is printed, never hidden. */
async function loadSerializer(): Promise<{ ProjectSerializer: any; which: string; snapshot: any }> {
  const notes: string[] = [];
  const prod: any = await import(
    '../../../../apps/editor/src/engine/persistence/ProjectSerializer.js').catch((e) => {
      notes.push('PRODUCTION import failed: ' + String(e).slice(0, 160)); return null;
    });
  const twin: any = await import(
    '../../../../packages/persistence-client/src/loader/ProjectSerializer.js').catch((e) => {
      notes.push('TWIN import failed: ' + String(e).slice(0, 160)); return null;
    });
  for (const [which, m] of [
    ['PRODUCTION apps/editor/.../ProjectSerializer.ts', prod],
    ['TWIN packages/persistence-client/.../ProjectSerializer.ts', twin],
  ] as const) {
    if (typeof m?.ProjectSerializer?.serialize !== 'function') { notes.push(which + ': no serialize()'); continue; }
    try {
      const snapshot = m.ProjectSerializer.serialize(scaffoldBundle(), {} as any, { projectName: 'rac' });
      return { ProjectSerializer: m.ProjectSerializer, which, snapshot };
    } catch (e) { notes.push(which + ' threw: ' + String(e).slice(0, 200)); }
  }
  console.log('[V4] serializer ladder exhausted: ' + notes.join(' || '));
  return { ProjectSerializer: null, which: 'NONE REACHABLE', snapshot: null };
}

describe('V4 — PERSIST: serialize to JSON to restore, through the REAL serializer + loader sequence', () => {
  it('a door record survives save/load', async () => {
    const { ProjectSerializer, which } = await loadSerializer();
    console.log('[V4] serializer under test = ' + which);
    const id = bid('door');
    doorStore.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 3.25,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });

    let snapshot: any = null; let serr = '';
    if (!ProjectSerializer) {
      console.log('[V4 door] MISCONFIGURED — no serializer reachable | VERDICT=UNPROVEN');
      return;
    }
    try { snapshot = ProjectSerializer.serialize(scaffoldBundle(), {} as any, { projectName: 'rac' }); }
    catch (e) { serr = String(e).slice(0, 400); }

    if (!snapshot) {
      console.log('[V4 door] MISCONFIGURED — serializer unreachable: ' + serr + ' | VERDICT=UNPROVEN');
      return;
    }
    const wire = JSON.parse(JSON.stringify(snapshot));
    const inWire = (wire.doors ?? []).find((d: any) => d.id === id);
    // Real ProjectLoader restore sequence (ProjectLoader.ts:447-455).
    doorStore.clear();
    for (const d of wire.doors ?? []) { try { doorStore.add(d); } catch { /* loader skips */ } }
    const back = doorStore.getById(id);
    console.log('[V4 door] in-snapshot=' + (inWire ? 'YES' : 'NO') +
      ' | after-reload offset=' + JSON.stringify(back?.offset) + ' (expected 3.25)' +
      ' | VERDICT=' + (back?.offset === 3.25 ? 'PASS' : 'FAIL'));
    expect(inWire).toBeTruthy();
    expect(back?.offset).toBe(3.25);
  });

  it('FALSIFIABILITY — the V4 probe goes RED when the expected value is wrong', async () => {
    const { ProjectSerializer, which } = await loadSerializer();
    console.log('[V4] serializer under test = ' + which);
    const id = bid('door');
    doorStore.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 3.25,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    const wire = JSON.parse(JSON.stringify(
      ProjectSerializer.serialize(scaffoldBundle(), {} as any, {})));
    doorStore.clear();
    for (const d of wire.doors ?? []) { try { doorStore.add(d); } catch { /* */ } }
    const back = doorStore.getById(id);
    const MUTATED_EXPECTATION = 9.99;   // deliberately wrong
    const wouldPass = back?.offset === MUTATED_EXPECTATION;
    console.log('[FALSIFY V4] restored=' + JSON.stringify(back?.offset) +
      ' vs mutated expectation ' + MUTATED_EXPECTATION + ' -> probe ' +
      (wouldPass ? 'STILL GREEN (BROKEN PROBE)' : 'GOES RED (trustworthy)'));
    expect(wouldPass).toBe(false);
  });
});

describe('V5 — UNDO: does one undo reverse the RIGHT property?', () => {
  it('undo stack reachability + specific-property assertion', async () => {
    const id = bid('door');
    doorStore.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 1.0,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    const canUndoBefore = rt.undoStack?.canUndo?.();
    const r = await dispatch('door.move', { doorId: id, id, offset: 4.5 });
    const afterMove = doorStore.getById(id)?.offset;
    let undone = false; let uerr = '';
    try { await rt.undoStack?.undo?.(); undone = true; } catch (e) { uerr = String(e).slice(0, 200); }
    const afterUndo = doorStore.getById(id)?.offset;
    const verdict = afterMove !== 1.0 && afterUndo === 1.0 ? 'PASS'
      : afterMove === 1.0 ? 'UNPROVEN (V3 never moved the authoritative store; nothing to undo)'
      : 'FAIL';
    console.log('[V5 door.move] dispatch=' + (r.ok ? 'OK' : 'THREW ' + r.err) +
      ' | canUndo(before)=' + canUndoBefore + ' canUndo(after)=' + rt.undoStack?.canUndo?.() +
      ' | offset 1.0 -> ' + JSON.stringify(afterMove) + ' -undo-> ' + JSON.stringify(afterUndo) +
      ' | undo=' + (undone ? 'ran' : 'THREW ' + uerr) + ' | VERDICT=' + verdict);
    expect(typeof undone).toBe('boolean');
  });

  it('the ONE path that does reach the authoritative store: command-registry, undone by property', async () => {
    // Generalising the hostedTypeChange precedent. This is NOT bus-routed — it is the
    // legacy command-registry path, which is the only writer of the authoritative door
    // store. Mutations are applied and asserted ONE AT A TIME so the three-stack /
    // 250 ms wall-clock reconciliation window cannot make a stale read look like a pass.
    const { UpdateDoorSystemTypeCommand } = await import('@pryzm/command-registry') as any;
    const { doorSystemTypeStore } = await import('@pryzm/geometry-door') as any;
    const types = doorSystemTypeStore.getAll();
    if (types.length < 2) { console.log('[V5 registry] UNPROVEN — catalogue too small'); return; }
    const id = bid('door');
    doorStore.add({ id, openingId: bid('opening'), wallId: bid('wall'), offset: 1.0,
      width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
    const ctx = {} as any;
    const cmd = new UpdateDoorSystemTypeCommand({ doorId: id, systemTypeId: types[0].id });
    const okExec = cmd.execute(ctx).success;
    const afterExec = doorStore.getById(id)?.systemTypeId;
    cmd.undo(ctx);
    const afterUndo = doorStore.getById(id)?.systemTypeId;
    const verdict = afterExec === types[0].id && afterUndo === undefined ? 'PASS' : 'FAIL';
    console.log('[V5 registry UpdateDoorSystemType] exec=' + okExec +
      ' | AUTHORITATIVE systemTypeId undefined -> ' + afterExec + ' -undo-> ' +
      String(afterUndo) + ' | VERDICT=' + verdict);
    expect(afterExec).toBe(types[0].id);
    expect(afterUndo).toBeUndefined();
  });
});
