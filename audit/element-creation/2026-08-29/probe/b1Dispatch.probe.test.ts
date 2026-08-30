/**
 * @vitest-environment happy-dom
 */
// B1 PROBE — slab / curtain-wall / ceiling on the REAL composed runtime.
// D6: constructs NOTHING. composeRuntime() is the only runtime source.
import { describe, expect, it, beforeAll } from 'vitest';
import { createId, Slab } from '@pryzm/schemas';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../../../../apps/editor/src/bootstrap.everything.js';

const AUDIT = { actorId: 'b1', projectId: 'b1', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
const LOG: string[] = [];
const say = (s: string): void => { LOG.push(s); console.error(s); };

beforeAll(async () => {
  rt = await composeRuntime({ audit: AUDIT, canvas: null, bootstrapFn: bootstrapWithEverything as never });
}, 600_000);

async function outcome(verb: string, payload: unknown): Promise<string> {
  try { await rt.bus.executeCommand(verb, payload); return 'OK'; }
  catch (err) { return (err as Error).message ?? String(err); }
}

describe('B1 — the composed runtime surface', () => {
  it('P-1: what keys the composed runtime exposes', () => {
    say('[P-1] rt.stores keys = ' + JSON.stringify(Object.keys(rt.stores).sort()));
    say('[P-1] rt.registeredStoreKeys = ' + JSON.stringify(rt.registeredStoreKeys));
    say('[P-1] rt.stores.elements kinds = ' + JSON.stringify(
      ['wall', 'slab', 'curtainwall', 'curtain-wall', 'ceiling'].map(
        (k) => k + '=' + String(rt.stores.elements?.get?.(k)?.constructor?.name),
      ),
    ));
    expect(true).toBe(true);
  });
});

describe('B1 — DISPATCHABLE on the REAL composed bus', () => {
  it('P-3: slab.create', async () => {
    const { projectContext } = await import('@pryzm/core-app-model/context');
    const { slabStore } = await import('@pryzm/geometry-slab/store');
    (slabStore as any).attachEngine(projectContext);
    const id = createId('slab');
    const r = await outcome('slab.create', {
      id, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
    });
    say('[P-3] slab.create outcome = ' + r);
    say('[P-3] AUTHORITATIVE slabStore.getById(' + id + ') = ' + String((slabStore as any).getById?.(id)));
    expect(r).not.toMatch(/is missing from HandlerContext/);
  });

  it('P-4: curtain-wall.create', async () => {
    const id = createId('curtainwall');
    const r = await outcome('curtain-wall.create', {
      id, levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3,
    });
    say('[P-4] curtain-wall.create outcome = ' + r);
    const { curtainWallStore } = await import('@pryzm/geometry-curtain-wall').catch(() => ({ curtainWallStore: undefined } as any));
    say('[P-4] geometry-curtain-wall singleton = ' + String((curtainWallStore as any)?.constructor?.name));
    say('[P-4] singleton.has(' + id + ') = ' + String((curtainWallStore as any)?.has?.(id)));
    expect(r).not.toMatch(/is missing from HandlerContext/);
  });

  it('P-4b: curtainwall.create (the declared ALIAS)', async () => {
    const id = createId('curtainwall');
    const r = await outcome('curtainwall.create', {
      id, levelId: LEVEL_ID,
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 3,
    });
    say('[P-4b] curtainwall.create (alias) outcome = ' + r);
  });

  it('P-5: ceiling.create', async () => {
    const id = createId('ceiling');
    const r = await outcome('ceiling.create', {
      id, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
      ceilingHeight: 2.7, thickness: 0.05,
    });
    say('[P-5] ceiling.create outcome = ' + r);
    expect(r).not.toMatch(/is missing from HandlerContext/);
  });

  it('P-6: curtain-wall.replacePanel — the curtainPanelStore key nobody provides', async () => {
    const r = await outcome('curtain-wall.replacePanel', { curtainWallId: 'cw-1', panelId: 'p-1', panelTypeId: 'pt-1' });
    say('[P-6] curtain-wall.replacePanel outcome = ' + r);
  });
});

describe('B1 — the PreviewManager slab payload SHAPE (PreviewManager.ts:330-340)', () => {
  it('P-7: Slab.parse REJECTS a boundary of {x,z} with no y', () => {
    const res = Slab.safeParse({
      id: createId('slab'), levelId: LEVEL_ID, thickness: 0.2, baseOffset: 0, holes: [],
      boundary: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
    } as any);
    say('[P-7] Slab.safeParse success = ' + res.success);
    if (!res.success) say('[P-7] first issues = ' + JSON.stringify((res as any).error.issues.slice(0, 4)));
    expect(res.success).toBe(false);
  });

  it('P-8: the same PreviewManager-shaped payload through the composed BUS', async () => {
    const id = createId('slab');
    const r = await outcome('slab.create', {
      id, levelId: LEVEL_ID, thickness: 0.2,
      boundary: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }],
    });
    say('[P-8] PreviewManager-shaped slab.create outcome = ' + r);
  });
});

describe('B1 — CEB payload-field reading for slab.create', () => {
  it('P-9: which *.created events reach runtime.events for a boundary-only slab.create', async () => {
    const seen: string[] = [];
    for (const ev of ['slab.created', 'ceiling.created', 'curtain-wall.created']) {
      rt.events.on(ev, (e: any) => seen.push(ev + ' id=' + String(e?.id) + ' polygon=' + JSON.stringify(e?.polygon) + ' boundary=' + JSON.stringify(e?.boundary)));
    }
    const sid = createId('slab');
    say('[P-9] slab(boundary-only) = ' + await outcome('slab.create', {
      id: sid, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
    }));
    const sid2 = createId('slab');
    say('[P-9] slab(polygon) = ' + await outcome('slab.create', {
      id: sid2, levelId: LEVEL_ID,
      polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
    }));
    const cid = createId('ceiling');
    say('[P-9] ceiling = ' + await outcome('ceiling.create', {
      id: cid, levelId: LEVEL_ID,
      boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
    }));
    const wid = createId('curtainwall');
    say('[P-9] cw = ' + await outcome('curtain-wall.create', {
      id: wid, levelId: LEVEL_ID, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], height: 3,
    }));
    await new Promise((r) => setTimeout(r, 50));
    say('[P-9] EVENTS SEEN = ' + JSON.stringify(seen, null, 1));
    expect(true).toBe(true);
  });
});

describe('B1 — alias, missing-id and batch paths', () => {
  it('P-10: the curtainwall.create ALIAS still produces a curtain-wall.created event', async () => {
    const seen: string[] = [];
    rt.events.on('curtain-wall.created', (e: any) => seen.push('cw id=' + String(e?.id) + ' baseLine=' + JSON.stringify(e?.baseLine)));
    const id = createId('curtainwall');
    say('[P-10] alias outcome = ' + await outcome('curtainwall.create', {
      id, levelId: LEVEL_ID, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], height: 3,
    }));
    await new Promise((r) => setTimeout(r, 30));
    say('[P-10] events = ' + JSON.stringify(seen));
    expect(true).toBe(true);
  });

  it('P-11: NO id in the payload — does the *.created event carry one? (bridge guards on !ev.id)', async () => {
    const seen: string[] = [];
    for (const ev of ['slab.created', 'ceiling.created', 'curtain-wall.created']) {
      rt.events.on(ev, (e: any) => seen.push(ev + ' id=' + String(e?.id)));
    }
    say('[P-11] slab(no id) = ' + await outcome('slab.create', {
      levelId: LEVEL_ID, polygon: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
    }));
    say('[P-11] ceiling(no id) = ' + await outcome('ceiling.create', {
      levelId: LEVEL_ID, boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
    }));
    say('[P-11] cw(no id) = ' + await outcome('curtain-wall.create', {
      levelId: LEVEL_ID, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], height: 3,
    }));
    await new Promise((r) => setTimeout(r, 30));
    say('[P-11] events = ' + JSON.stringify(seen, null, 1));
    expect(true).toBe(true);
  });

  it('P-12: batch verbs', async () => {
    const seen: string[] = [];
    for (const ev of ['slab.created', 'ceiling.created', 'curtain-wall.created']) {
      rt.events.on(ev, (e: any) => seen.push(ev + ' id=' + String(e?.id)));
    }
    say('[P-12] slab.batch.create = ' + await outcome('slab.batch.create', {
      levelId: LEVEL_ID,
      slabs: [{ id: createId('slab'), boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }] }],
    }));
    say('[P-12] ceiling.batch.create = ' + await outcome('ceiling.batch.create', {
      levelId: LEVEL_ID,
      ceilings: [{ id: createId('ceiling'), boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }] }],
    }));
    say('[P-12] curtain-wall.batch.create = ' + await outcome('curtain-wall.batch.create', {
      levelId: LEVEL_ID,
      curtainWalls: [{ id: createId('curtainwall'), baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], height: 3 }],
    }));
    await new Promise((r) => setTimeout(r, 30));
    say('[P-12] events = ' + JSON.stringify(seen, null, 1));
    expect(true).toBe(true);
  });

  it('P-13: which UPDATE verbs emit element.updated (ELEMENT_UPDATE_VERBS)', async () => {
    const upd: string[] = [];
    rt.events.on('element.updated', (e: any) => upd.push(JSON.stringify(e)));
    const sid = createId('slab');
    await outcome('slab.create', { id: sid, levelId: LEVEL_ID, polygon: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }] });
    say('[P-13] slab.setThickness = ' + await outcome('slab.setThickness', { slabId: sid, thickness: 0.4 }));
    const cid = createId('ceiling');
    await outcome('ceiling.create', { id: cid, levelId: LEVEL_ID, boundary: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }] });
    say('[P-13] ceiling.setHeight = ' + await outcome('ceiling.setHeight', { ceilingId: cid, ceilingHeight: 3.1 }));
    const wid = createId('curtainwall');
    await outcome('curtain-wall.create', { id: wid, levelId: LEVEL_ID, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], height: 3 });
    say('[P-13] curtain-wall.resize = ' + await outcome('curtain-wall.resize', { curtainWallId: wid, height: 4 }));
    await new Promise((r) => setTimeout(r, 30));
    say('[P-13] element.updated events = ' + JSON.stringify(upd, null, 1));
    expect(true).toBe(true);
  });
});
