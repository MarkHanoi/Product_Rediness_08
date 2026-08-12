/**
 * ConsequenceReportView — BIM30 R5 (ADR-0322 §6 · STR-06 §15).
 *
 * The three rules the view exists to obey, each with a test that would fail if the rule
 * were dropped:
 *
 *   1. A DIVERGENCE IS VISIBLE (STR-06 §2) — `plan-fidelity-divergence` renders as a named
 *      band naming its unexpected/missing ids, not a console line.
 *   2. UNDETERMINED NEVER RENDERS AS "NOTHING" (ADR-0322 §5) — plan-time blind spots render
 *      AS undetermined, with what actually happened beside them; an unmeasurable validation
 *      or metrics channel renders as NOT MEASURED, never as a zero.
 *   3. THE VIEW RENDERS WHAT IT IS GIVEN, OR THAT IT HAS NONE — a stale or plan-less
 *      execution renders the typed ABSENCE of a prediction, never a confident blank.
 *
 * Plus the R5 metric surface: `before → after` WITH UNITS, from the typed `metrics` field.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsequenceReportView } from '@app/ui/canvas/ConsequenceReportView';
import type { ConsequencePlan, ConsequenceReport, ExecutionConsequence } from '@pryzm/command-bus';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function plan(over: Partial<ConsequencePlan> = {}): ConsequencePlan {
  return {
    planId: 'plan-1',
    planHash: 'aaaa1111',
    stateHash: 'bbbb2222',
    command: { type: 'wall.move', payload: { id: 'wall-1' } },
    direct: { kind: 'determined', elements: ['wall-1'] },
    indirect: { kind: 'determined', elements: ['room-kitchen'] },
    changed: ['wall-1', 'room-kitchen'],
    excluded: ['door-9'],
    topology: { added: [], removed: [], modified: [] },
    validation: { violationsCreated: [], violationsResolved: [] },
    regeneration: { required: [], skipped: [] },
    metrics: [{ elementId: 'room-kitchen', metric: 'area', before: 12.4, after: 10.8, unit: 'm2' }],
    refused: [],
    undetermined: [
      { scope: 'regeneration of elements dependent on wall wall-1', reason: 'NO_DEPENDENCY_INDEX', detail: 'Phase 5 not wired' },
    ],
    ...over,
  };
}

function report(over: Partial<ConsequenceReport> = {}): ConsequenceReport {
  const p = over.plan ?? plan();
  return {
    commandId: 'cmd-1',
    plan: p,
    actual: { changed: ['wall-1', 'room-kitchen'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    predictedVsActual: { unexpected: [], missing: [], undeterminedResolved: [] },
    validation: { violationsCreated: [], violationsResolved: [] },
    divergence: { kind: 'plan-agreed' },
    undeterminedOutcomes: p.undetermined.map((item) => ({
      item, outcome: 'undetermined-at-plan-time' as const, actualChangedOutsidePrediction: [],
    })),
    provenance: { actor: { kind: 'human', id: 'u-7' }, origin: { surface: 'toolbar' } },
    ...over,
  };
}

const html = (v: ConsequenceReportView): string => v.element.innerHTML;

describe('ConsequenceReportView — R5 report surface', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  // ── Rule 1: divergence is VISIBLE ───────────────────────────────────────────
  it('renders a plan-fidelity divergence as a NAMED, visible band with its ids', () => {
    const v = new ConsequenceReportView();
    v.show(report({
      divergence: { kind: 'plan-fidelity-divergence', unexpected: ['door-77'], missing: ['room-kitchen'] },
      predictedVsActual: { unexpected: ['door-77'], missing: ['room-kitchen'], undeterminedResolved: [] },
      actual: { changed: ['wall-1', 'door-77'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    }));
    const out = html(v);
    expect(out).toContain('PLAN-FIDELITY DIVERGENCE');
    expect(out).toContain('door-77');   // changed but not predicted
    expect(out).toContain('room-kitchen'); // predicted but did not change
    expect(v.visible).toBe(true);
  });

  it('renders agreement as agreement — and does NOT print the divergence band', () => {
    const v = new ConsequenceReportView();
    v.show(report());
    expect(html(v)).toContain('PLAN AGREED');
    expect(html(v)).not.toContain('PLAN-FIDELITY DIVERGENCE');
  });

  it('an R1-era report with NO verdict says so — it does not read as agreement', () => {
    const v = new ConsequenceReportView();
    const r = report();
    const noVerdict = { ...r } as Record<string, unknown>;
    delete noVerdict.divergence;
    v.show(noVerdict as unknown as ConsequenceReport);
    expect(html(v)).toContain('NO DIVERGENCE VERDICT');
    expect(html(v)).not.toContain('PLAN AGREED');
  });

  // ── Rule 2: UNDETERMINED never renders as nothing ───────────────────────────
  it('renders plan-time UNDETERMINED items AS undetermined, with reality beside them', () => {
    const v = new ConsequenceReportView();
    v.show(report({
      undeterminedOutcomes: [{
        item: { scope: 'regeneration of elements dependent on wall wall-1', reason: 'NO_DEPENDENCY_INDEX' },
        outcome: 'undetermined-at-plan-time',
        actualChangedOutsidePrediction: ['slab-4'],
      }],
    }));
    const out = html(v);
    expect(out).toContain('UNDETERMINED at plan time');
    expect(out).toContain('NO_DEPENDENCY_INDEX');
    expect(out).toContain('regeneration of elements dependent on wall wall-1');
    // what ACTUALLY happened, beside the blind spot — not collapsed into right/wrong
    expect(out).toContain('slab-4');
  });

  it('an UNMEASURABLE validation channel renders as NOT MEASURED, never as "no violation changed"', () => {
    const v = new ConsequenceReportView();
    v.show(report({
      validationUndetermined: {
        scope: 'post-mutation validation delta',
        reason: 'ENGINE_NOT_AVAILABLE',
        detail: 'no violation snapshotter is composed',
      },
    }));
    const out = html(v);
    expect(out).toContain('NOT MEASURED');
    expect(out).toContain('ENGINE_NOT_AVAILABLE');
    // The empty delta beside it must NOT be printed as a determination.
    expect(out).not.toContain('no violation changed');
  });

  it('an UNMEASURABLE metrics channel renders as NOT MEASURED', () => {
    const v = new ConsequenceReportView();
    v.show(report({
      metricsUndetermined: { scope: 'actual room areas', reason: 'ENGINE_NOT_AVAILABLE', detail: 'no metric read-back' },
    }));
    expect(html(v)).toContain('actual metrics NOT MEASURED');
  });

  it('a plan that declared blind spots and a report that reconciled NONE says so', () => {
    const v = new ConsequenceReportView();
    const r = report();
    const noOutcomes = { ...r } as Record<string, unknown>;
    delete noOutcomes.undeterminedOutcomes;
    v.show(noOutcomes as unknown as ConsequenceReport);
    expect(html(v)).toContain('NOT RECONCILED');
  });

  // ── The R5 metric surface ───────────────────────────────────────────────────
  it('renders the metric transition before → after WITH its unit', () => {
    const v = new ConsequenceReportView();
    v.show(report());
    const out = html(v);
    expect(out).toContain('room-kitchen area');
    expect(out).toContain('12.4 m²');
    expect(out).toContain('10.8 m²');
  });

  it('shows the MEASURED value beside the predicted one when the report carries actuals', () => {
    const v = new ConsequenceReportView();
    v.show(report({
      metrics: [{ elementId: 'room-kitchen', metric: 'area', before: 12.4, after: 10.9, unit: 'm2' }],
    }));
    expect(html(v)).toContain('measured 10.9 m²');
  });

  it('a metric with no recorded prior value says "not recorded" — never 0', () => {
    const v = new ConsequenceReportView();
    v.show(report({
      plan: plan({ metrics: [{ elementId: 'room-x', metric: 'area', before: undefined, after: 8.2, unit: 'm2' }] }),
    }));
    const out = html(v);
    expect(out).toContain('not recorded');
    expect(out).not.toContain('0.0 m² → 8.2');
  });

  // ── Rule 3: no report ⇒ say so, never a confident blank ─────────────────────
  it('a plan-less execution renders the TYPED ABSENCE of a prediction, not an empty panel', () => {
    const v = new ConsequenceReportView();
    const c: ExecutionConsequence = {
      kind: 'unplanned',
      commandId: 'cmd-2',
      prediction: { kind: 'absent', reason: 'NO_PLAN_SUPPLIED' },
      actual: { changed: ['wall-1'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    };
    v.showConsequence(c);
    const out = html(v);
    expect(out).toContain('NO CONSEQUENCE REPORT');
    expect(out).toContain('NO_PLAN_SUPPLIED');
    expect(out.trim().length).toBeGreaterThan(0);
    // The distinction the whole contract rests on, stated to the user.
    expect(out).toContain('not "nothing changed"');
  });

  it('a STALE plan renders the refusal as evidence — never as the prediction', () => {
    const v = new ConsequenceReportView();
    const c: ExecutionConsequence = {
      kind: 'plan-stale',
      commandId: 'cmd-3',
      refusal: {
        kind: 'PLAN_STALE', stalePlan: plan(),
        plannedPlanHash: 'aaaa1111', plannedStateHash: 'bbbb2222',
        livePlanHash: 'cccc3333', liveStateHash: 'dddd4444',
      },
      actual: { changed: ['wall-1'], topology: { added: [], removed: [], modified: [] }, regenerated: [] },
    };
    v.showConsequence(c);
    const out = html(v);
    expect(out).toContain('NO CONSEQUENCE REPORT');
    expect(out).toContain('PLAN_STALE');
    expect(out).toContain('aaaa1111');
    expect(out).toContain('cccc3333');
    expect(out).not.toContain('PLAN AGREED');
  });

  it('a reconciled consequence routes to the full report', () => {
    const v = new ConsequenceReportView();
    v.showConsequence({ kind: 'reconciled', report: report() });
    expect(html(v)).toContain('predicted vs actual');
  });

  // ── The plan doc's remaining named sections ─────────────────────────────────
  it('carries every section R5 names: changed/excluded/undetermined/regenerated/refused/validation/provenance/predicted-vs-actual + derived untouched', () => {
    const v = new ConsequenceReportView();
    v.show(report({ plan: plan({ refused: [{ elementId: 'door-3', reason: 'opening 1200 mm needs 1200 mm but only 400 mm remains' }] }) }));
    const out = html(v);
    expect(out).toContain('predicted vs actual');
    expect(out).toContain('considered unchanged');   // excluded
    expect(out).toContain('untouched (derived');      // derived at report time, never stored
    expect(out).toContain('regenerated');
    expect(out).toContain('refused');
    expect(out).toContain('only 400 mm remains');     // the refusal keeps its NUMBERS
    expect(out).toContain('validation');
    expect(out).toContain('UNDETERMINED');
    expect(out).toContain('human');                   // provenance actor
    expect(out).toContain('toolbar');                 // provenance origin
  });
});
