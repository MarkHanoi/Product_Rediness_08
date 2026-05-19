// Parity fixture for w07-phase-filter.

import { describe, expect, it } from 'vitest';
import {
  w07PhaseFilter,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityWaveContext,
  type PhaseFilterState,
} from '../../src/waves/index.js';

const PHASES = ['Existing', 'P1-2025', 'P2-2026', 'P3-2027'];

const view = (ps: PhaseFilterState | null | undefined): VisibilityView => ({
  id: 'v1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: null,
  phaseState: ps,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

const ps = (mode: PhaseFilterState['mode'], active: string): PhaseFilterState => ({
  activePhase: active, phaseOrder: PHASES, mode,
});

describe('w07-phase-filter (parity)', () => {
  it('no phase state → pass through', () => {
    expect(w07PhaseFilter(ctx(el(), view(null))).visible).toBe(true);
    expect(w07PhaseFilter(ctx(el(), view(undefined))).visible).toBe(true);
  });

  it('element not phased → pass through regardless of mode', () => {
    expect(w07PhaseFilter(ctx(el({ createdInPhase: null }), view(ps('show-new', 'P1-2025')))).visible).toBe(true);
  });

  describe('mode: show-all', () => {
    it('existing-phase element + active = P2 → visible', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing' }), view(ps('show-all', 'P2-2026')),
      )).visible).toBe(true);
    });
    it('future element (created P3, active P2) → hidden', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'P3-2027' }), view(ps('show-all', 'P2-2026')),
      )).visible).toBe(false);
    });
    it('demolished by active phase → halftoned', () => {
      const r = w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing', demolishedInPhase: 'P1-2025' }),
        view(ps('show-all', 'P2-2026')),
      ));
      expect(r.visible).toBe(true);
      expect(r.halftone).toBe(true);
    });
  });

  describe('mode: show-new', () => {
    it('created in active phase → visible', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'P2-2026' }), view(ps('show-new', 'P2-2026')),
      )).visible).toBe(true);
    });
    it('created in earlier phase → hidden', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'P1-2025' }), view(ps('show-new', 'P2-2026')),
      )).visible).toBe(false);
    });
  });

  describe('mode: show-existing', () => {
    it('created earlier, not demolished → visible', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing' }), view(ps('show-existing', 'P2-2026')),
      )).visible).toBe(true);
    });
    it('created in active phase → hidden (not "existing" yet)', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'P2-2026' }), view(ps('show-existing', 'P2-2026')),
      )).visible).toBe(false);
    });
    it('demolished by active phase → hidden', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing', demolishedInPhase: 'P1-2025' }),
        view(ps('show-existing', 'P2-2026')),
      )).visible).toBe(false);
    });
  });

  describe('mode: show-demolished', () => {
    it('demolished in active phase → visible', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing', demolishedInPhase: 'P2-2026' }),
        view(ps('show-demolished', 'P2-2026')),
      )).visible).toBe(true);
    });
    it('demolished earlier → hidden', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing', demolishedInPhase: 'P1-2025' }),
        view(ps('show-demolished', 'P2-2026')),
      )).visible).toBe(false);
    });
  });

  describe('mode: show-temporary', () => {
    it('created and demolished in active phase → visible', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'P2-2026', demolishedInPhase: 'P2-2026' }),
        view(ps('show-temporary', 'P2-2026')),
      )).visible).toBe(true);
    });
    it('created but not demolished in active phase → hidden', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'P2-2026' }),
        view(ps('show-temporary', 'P2-2026')),
      )).visible).toBe(false);
    });
  });

  describe('orphan-phase edge cases (bug #12010)', () => {
    it('createdInPhase not in phaseOrder → pass through', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'OrphanPhase' }),
        view(ps('show-all', 'P2-2026')),
      )).visible).toBe(true);
    });
    it('activePhase not in phaseOrder → pass through', () => {
      expect(w07PhaseFilter(ctx(
        el({ createdInPhase: 'Existing' }),
        view(ps('show-all', 'OrphanActive')),
      )).visible).toBe(true);
    });
    it('demolished < created (ill-formed) treated as never-demolished', () => {
      const r = w07PhaseFilter(ctx(
        el({ createdInPhase: 'P2-2026', demolishedInPhase: 'P1-2025' }),
        view(ps('show-all', 'P3-2027')),
      ));
      expect(r.visible).toBe(true);
      expect(r.halftone).toBeFalsy();
    });
  });
});
