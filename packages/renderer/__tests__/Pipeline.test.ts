// Pipeline + ClearPass + MeshPass unit tests.
//
// S15 update: the Pass interface is now `RenderPass` with
// setup/render/resize/dispose lifecycle and an `idleBudgetFrames`
// budget field.  Tests below exercise the new shape.

import { describe, it, expect, vi } from 'vitest';
import { Pipeline } from '../src/passes/Pipeline.js';
import { ClearPass } from '../src/passes/ClearPass.js';
import { MeshPass } from '../src/passes/MeshPass.js';
import type { RenderContext, RenderPass } from '../src/passes/types.js';
import type { TickPriority } from '@pryzm/frame-scheduler';

function fakeRenderer(): any {
  return {
    autoClear: false,
    setClearColor: vi.fn(),
    render: vi.fn(),
    info: { reset: vi.fn(), render: { calls: 0, triangles: 0 } },
    getSize: (v: any) => {
      v.x = 256;
      v.y = 256;
      return v;
    },
  };
}

function fakeCtx(): RenderContext {
  return {
    renderer: fakeRenderer(),
    scene: {} as any,
    camera: {} as any,
    width: 256,
    height: 256,
  };
}

function makePass(id: string, opts: Partial<RenderPass> = {}): RenderPass & { calls: number } {
  const p: any = {
    id,
    priority: opts.priority ?? ('render' as TickPriority),
    idleBudgetFrames: opts.idleBudgetFrames ?? 0,
    calls: 0,
    setup: vi.fn(),
    render: vi.fn(function () {
      p.calls++;
      return true;
    }),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return p;
}

describe('Pipeline (S15 RenderPass shape)', () => {
  it('throws on empty pipeline', () => {
    expect(() => new Pipeline([])).toThrow(/empty pipeline/);
  });

  it('runs passes in registration order and resets renderer.info each frame', () => {
    const order: string[] = [];
    const a = makePass('a');
    const b = makePass('b');
    a.render = vi.fn(() => {
      order.push('a');
      return true;
    });
    b.render = vi.fn(() => {
      order.push('b');
      return true;
    });
    const ctx = fakeCtx();
    const pipe = new Pipeline([a, b]);
    pipe.render(ctx);
    expect(order).toEqual(['a', 'b']);
    expect(ctx.renderer.info.reset).toHaveBeenCalled();
  });

  it('calls setup() exactly once per pass before its first render', () => {
    const a = makePass('a');
    const ctx = fakeCtx();
    const pipe = new Pipeline([a]);
    pipe.render(ctx);
    pipe.render(ctx);
    pipe.render(ctx);
    expect(a.setup).toHaveBeenCalledTimes(1);
    expect(a.render).toHaveBeenCalledTimes(3);
  });

  it('add(pass) appends a new pass; rejects duplicate ids', () => {
    const a = makePass('a');
    const b = makePass('b');
    const pipe = new Pipeline([a]);
    pipe.add(b);
    expect(pipe.passes.map((p) => p.id)).toEqual(['a', 'b']);
    expect(() => pipe.add(makePass('a'))).toThrow(/duplicate pass id/);
  });

  it('resize() cascades to every pass', () => {
    const a = makePass('a');
    const b = makePass('b');
    const pipe = new Pipeline([a, b]);
    pipe.resize(800, 600);
    expect(a.resize).toHaveBeenCalledWith(800, 600);
    expect(b.resize).toHaveBeenCalledWith(800, 600);
  });

  it('dispose() cascades to every pass', () => {
    const a = makePass('a');
    const b = makePass('b');
    const pipe = new Pipeline([a, b]);
    pipe.dispose();
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(b.dispose).toHaveBeenCalledOnce();
  });

  it('ClearPass enables autoClear + sets the configured color', () => {
    const ctx = fakeCtx();
    const converged = new ClearPass(0xff8844).render(ctx, 0, 0);
    expect(ctx.renderer.autoClear).toBe(true);
    expect(ctx.renderer.setClearColor).toHaveBeenCalledWith(0xff8844, 1);
    expect(converged).toBe(true); // one-shot
  });

  it('MeshPass calls renderer.render(scene, camera) once and returns converged', () => {
    const ctx = fakeCtx();
    const converged = new MeshPass().render(ctx, 0, 0);
    expect(ctx.renderer.render).toHaveBeenCalledWith(ctx.scene, ctx.camera);
    expect(converged).toBe(true);
  });

  it('Composed clear→mesh pipeline routes through both passes', () => {
    const ctx = fakeCtx();
    const p = new Pipeline([new ClearPass(0x000000), new MeshPass()]);
    p.render(ctx);
    expect(ctx.renderer.setClearColor).toHaveBeenCalled();
    expect(ctx.renderer.render).toHaveBeenCalled();
  });
});
