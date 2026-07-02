// @vitest-environment happy-dom
//
// (happy-dom: the command import chain transitively pulls in @thatopen/ui, which
// touches HTMLElement at module-eval time. A DOM env satisfies that without
// changing the package-wide 'node' default for the other suites.)
//
// §FIX-SECTION-MARK-CREATE / §FIX-MARK-NAVIGATE (G8, V1-audit §3.5)
//
// Regression coverage for the section/elevation MARK creation contract that the
// plan-view tools depend on. The plan-view Section tool was silently broken
// because it fired the 'section.create' bus key (owned by plugin-section-view's
// geometry handler, payload { line:{a,b,lookDepth} }) with a
// { sectionViewId, cutPointA, cutPointB, … } payload — rejected at canExecute.
// The fix routes the tool through CreateSectionMarkCommand (via the new
// 'section.mark.create' bus bridge). These tests pin the command contract:
//   1. it accepts the plan-tool payload shape,
//   2. it creates a section/elevation ViewDefinition, and
//   3. the created annotation carries parameters.linkedViewId — the field
//      PlanViewInteraction click-to-navigate reads to open the linked view.

import { afterEach, describe, expect, it } from 'vitest';
import { CreateSectionMarkCommand } from '../src/commands/CreateSectionMarkCommand.js';
import { CreateElevationMarkCommand } from '../src/commands/CreateElevationMarkCommand.js';
import type { CommandContext } from '../src/legacy-command-protocol.js';

// ── Minimal in-memory fakes implementing exactly the API the commands touch ──

function makeViewStore() {
  const map = new Map<string, any>();
  return {
    map,
    has: (id: string) => map.has(id),
    get: (id: string) => map.get(id),
    create: (params: any) => {
      if (map.has(params.id)) return null;
      const view = { ...params };
      map.set(params.id, view);
      return view;
    },
    delete: (id: string) => map.delete(id),
  };
}

function makeIntentStore() {
  const assigned = new Set<string>();
  return {
    assigned,
    assign: (id: string) => { assigned.add(id); },
    delete: (id: string) => { assigned.delete(id); },
  };
}

function makeAnnStore() {
  const map = new Map<string, any>();
  return {
    map,
    has: (id: string) => map.has(id),
    add: (ann: any) => { map.set(ann.id, ann); },
    remove: (id: string) => { map.delete(id); },
  };
}

function makeVgStore() {
  const ensured: Array<[string, string, string]> = [];
  return {
    ensured,
    ensureView: (id: string, name: string, model: string) => { ensured.push([id, name, model]); },
  };
}

function buildCtx() {
  const viewDefinitionStore = makeViewStore();
  const viewIntentInstanceStore = makeIntentStore();
  const annotationStore = makeAnnStore();
  const vgGovernanceStore = makeVgStore();
  const ctx: CommandContext = {
    stores: { viewDefinitionStore, viewIntentInstanceStore, annotationStore, vgGovernanceStore },
  };
  return { ctx, viewDefinitionStore, viewIntentInstanceStore, annotationStore, vgGovernanceStore };
}

// ── Section mark ─────────────────────────────────────────────────────────────

describe('CreateSectionMarkCommand — plan-tool payload contract', () => {
  let env: ReturnType<typeof buildCtx>;
  afterEach(() => { env = undefined as never; });

  const planToolPayload = {
    sectionViewId: 'sec-1',
    sectionViewName: 'Section 1',
    annotationId: 'ann-sec-1',
    hostViewId: 'vd-plan-l0',
    cutPointA: { x: 0, y: 0, z: 0 },
    cutPointB: { x: 5, y: 0, z: 0 },
    tailDirection: { x: 0, z: -1 },
  };

  it('accepts the plan-view Section tool payload at canExecute', () => {
    env = buildCtx();
    const cmd = new CreateSectionMarkCommand({ ...planToolPayload });
    expect(cmd.canExecute(env.ctx).ok).toBe(true);
  });

  it('creates a section ViewDefinition and a section-mark annotation linking back to it', () => {
    env = buildCtx();
    const cmd = new CreateSectionMarkCommand({ ...planToolPayload });
    const res = cmd.execute(env.ctx);

    expect(res.success).toBe(true);
    // Section ViewDefinition minted with viewType 'section'.
    const view = env.viewDefinitionStore.get('sec-1');
    expect(view).toBeDefined();
    expect(view.viewType).toBe('section');
    // Annotation minted with linkedViewId → the section view (click-to-navigate key).
    const ann = env.annotationStore.map.get('ann-sec-1');
    expect(ann).toBeDefined();
    expect(ann.type).toBe('section-mark');
    expect(ann.parameters.linkedViewId).toBe('sec-1');
    // Intent + VG bridge wired.
    expect(env.viewIntentInstanceStore.assigned.has('sec-1')).toBe(true);
    expect(env.vgGovernanceStore.ensured[0]?.[0]).toBe('sec-1');
  });

  it('undo removes both the view and the annotation', () => {
    env = buildCtx();
    const cmd = new CreateSectionMarkCommand({ ...planToolPayload });
    cmd.execute(env.ctx);
    cmd.undo(env.ctx);
    expect(env.viewDefinitionStore.has('sec-1')).toBe(false);
    expect(env.annotationStore.has('ann-sec-1')).toBe(false);
  });

  it('rejects a missing hostViewId (guards the bus bridge validate())', () => {
    env = buildCtx();
    const cmd = new CreateSectionMarkCommand({ ...planToolPayload, hostViewId: '' });
    expect(cmd.canExecute(env.ctx).ok).toBe(false);
  });
});

// ── Elevation mark ───────────────────────────────────────────────────────────

describe('CreateElevationMarkCommand — plan-tool payload contract', () => {
  const planToolPayload = {
    elevationViewId: 'elev-1',
    elevationViewName: 'Interior Elevation 1 N',
    annotationId: 'ann-elev-1',
    hostViewId: 'vd-plan-l0',
    position: { x: 2, y: 0, z: 2 },
    facingDirection: { x: 0, z: -1 },
    elevationSpatial: { projectionDirection: { x: 0, y: 0, z: -1 } },
  };

  it('creates an elevation ViewDefinition and a mark linking back to it', () => {
    const env = buildCtx();
    const cmd = new CreateElevationMarkCommand({ ...planToolPayload });
    const res = cmd.execute(env.ctx);

    expect(res.success).toBe(true);
    const view = env.viewDefinitionStore.get('elev-1');
    expect(view).toBeDefined();
    expect(view.viewType).toBe('elevation');
    // projectionDirection survives so ViewsRailPanel / PlanViewInteraction can
    // resolve the OBC camera mode (Front/Back/Left/Right) on navigate.
    expect(view.spatial.projectionDirection).toBeDefined();

    const ann = env.annotationStore.map.get('ann-elev-1');
    expect(ann).toBeDefined();
    expect(ann.type).toBe('elevation-mark');
    expect(ann.parameters.linkedViewId).toBe('elev-1');
  });

  it('undo removes both the view and the annotation', () => {
    const env = buildCtx();
    const cmd = new CreateElevationMarkCommand({ ...planToolPayload });
    cmd.execute(env.ctx);
    cmd.undo(env.ctx);
    expect(env.viewDefinitionStore.has('elev-1')).toBe(false);
    expect(env.annotationStore.has('ann-elev-1')).toBe(false);
  });
});
