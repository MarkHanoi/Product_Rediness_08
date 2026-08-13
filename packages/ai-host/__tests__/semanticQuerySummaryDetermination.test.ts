/**
 * @vitest-environment happy-dom
 *
 * @file packages/ai-host/__tests__/semanticQuerySummaryDetermination.test.ts
 *
 * **The differentiating test for C78 U-INV-4 in `SemanticQueryEngine`.**
 *
 * ─── WHAT THIS FILE PROVES ──────────────────────────────────────────────────
 * `_getAll` was `try { … getStoreForType?.(t) … } catch { return []; }` — ARM A
 * over an ARM B lookup. A type whose store is UNREGISTERED and a type with
 * genuinely zero elements produced the same `[]`.
 *
 * The model-summary handler then made that indistinguishability USER-VISIBLE in
 * the worst possible way: it filtered rows to `count > 0`, so an unreadable type
 * did not appear as "unknown" — it VANISHED from the summary entirely — while
 * the total was computed over the surviving rows and printed as a definite
 * number. The user asked "what's in the model?" and was handed a confident
 * count that silently omitted every type the engine could not read.
 *
 * The centre is `describe('THE DIFFERENTIATOR')`: an empty type and an
 * unreadable type now produce different rows AND a differently-worded summary.
 *
 * ─── THE NEGATIVE CONTROL (C70 §5.6) ────────────────────────────────────────
 * A fix that called every type unreadable would destroy the summary. The
 * control pins that with every store registered the summary is a plain
 * definite sentence with no refusal row and no "unknown" anywhere.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { semanticQueryEngine } from '../src/SemanticQueryEngine.js';
import { storeRegistry } from '@pryzm/core-app-model';

const ALL_TYPES = [
  'wall', 'room', 'slab', 'beam', 'column', 'door', 'window', 'stair', 'furniture',
];

/** A store holding `n` trivial elements. */
const withN = (n: number) => ({ getAll: () => Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) });

let spy: ReturnType<typeof vi.spyOn>;

function registryAnswering(map: Record<string, unknown>) {
  spy = vi.spyOn(storeRegistry, 'getStoreForType' as never).mockImplementation(
    ((t: string) => map[t]) as never,
  );
}

afterEach(() => { spy?.mockRestore(); });

const summaryOf = () => semanticQueryEngine.query('model summary');

// ═════════════════════════════════════════════════════════════════════════════
// THE DIFFERENTIATOR
// ═════════════════════════════════════════════════════════════════════════════

describe('THE DIFFERENTIATOR — an empty type vs an unreadable type', () => {
  it('a genuinely EMPTY type is silently absent, and the total is definite', () => {
    // Every store registered; walls has 3, everything else genuinely 0.
    const map: Record<string, unknown> = {};
    for (const t of ALL_TYPES) map[t] = withN(0);
    map.wall = withN(3);
    registryAnswering(map);

    const res = summaryOf();
    expect(res.summary).toContain('3 elements');
    expect(res.summary).not.toContain('AT LEAST');
    expect(res.summary).not.toContain('unknown');
    expect(res.rows.some(r => r.type === 'undetermined')).toBe(false);
  });

  it('an UNREADABLE type gets a VISIBLE refusal row, and the total refuses to be definite', () => {
    const map: Record<string, unknown> = {};
    for (const t of ALL_TYPES) map[t] = withN(0);
    map.wall = withN(3);
    map.door = undefined;   // not registered — the ARM B case
    registryAnswering(map);

    const res = summaryOf();
    // ── THE OBSERVABLE DIFFERENCE ──────────────────────────────────────────
    const refusals = res.rows.filter(r => r.type === 'undetermined');
    expect(refusals).toHaveLength(1);                 // was: silently dropped
    expect(refusals[0]!.id).toBe('door');
    expect(refusals[0]!.label).toContain('cannot determine');
    expect(refusals[0]!.meta).toContain('RELATIONSHIP_NOT_READABLE');

    // The total no longer masquerades as complete.
    expect(res.summary).toContain('AT LEAST');
    expect(res.summary).toContain('could not be read');
    expect(res.summary).toContain('unknown');
  });

  it('a THROWING store is undetermined, not empty', () => {
    const map: Record<string, unknown> = {};
    for (const t of ALL_TYPES) map[t] = withN(0);
    map.room = { getAll: () => { throw new Error('registry cold'); } };
    registryAnswering(map);

    const res = summaryOf();
    expect(res.rows.some(r => r.id === 'room' && r.type === 'undetermined')).toBe(true);
    expect(res.summary).toContain('AT LEAST');
  });

  it('the two summaries are not the same sentence', () => {
    const base: Record<string, unknown> = {};
    for (const t of ALL_TYPES) base[t] = withN(0);
    base.wall = withN(3);

    registryAnswering({ ...base });
    const allReadable = summaryOf().summary;
    spy.mockRestore();

    registryAnswering({ ...base, door: undefined });
    const oneUnreadable = summaryOf().summary;

    expect(allReadable).not.toBe(oneUnreadable);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NEGATIVE CONTROL
// ═════════════════════════════════════════════════════════════════════════════

describe('NEGATIVE CONTROL — a fully readable registry never refuses', () => {
  beforeEach(() => {
    const map: Record<string, unknown> = {};
    for (const t of ALL_TYPES) map[t] = withN(2);
    registryAnswering(map);
  });

  it('reports a definite total with no refusal row', () => {
    const res = summaryOf();
    expect(res.rows.some(r => r.type === 'undetermined')).toBe(false);
    expect(res.summary).not.toContain('AT LEAST');
    expect(res.summary).toContain(`${ALL_TYPES.length * 2} elements`);
  });

  it('every populated type still appears with its real count', () => {
    const res = summaryOf();
    const wall = res.rows.find(r => r.id === 'wall');
    expect(wall?.label).toBe('Walls: 2');
  });
});
