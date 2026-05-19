// featureFlags.plan-view — runtime gate test (W-07).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-07.
//
// Verifies that the `plan_view_v2` flag in a project manifest is read at
// editor bootstrap and that the branch is taken (fallback panel + warning
// log + telemetry attribute).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  applyPlanViewGate,
  mountFallbackPanel,
  planViewTelemetryAttrs,
  PLAN_VIEW_TELEMETRY_ATTR,
  resolvePlanViewMode,
} from '../src/featureFlags/index.js';

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('resolvePlanViewMode — manifest → mode', () => {
  it('defaults to v2 when manifest is null/undefined', () => {
    expect(resolvePlanViewMode(null)).toBe('v2');
    expect(resolvePlanViewMode(undefined)).toBe('v2');
  });

  it('defaults to v2 when featureFlags is missing', () => {
    expect(resolvePlanViewMode({})).toBe('v2');
  });

  it('defaults to v2 when plan_view_v2 is omitted', () => {
    expect(resolvePlanViewMode({ featureFlags: {} })).toBe('v2');
  });

  it('returns v2 when plan_view_v2 is true', () => {
    expect(resolvePlanViewMode({ featureFlags: { plan_view_v2: true } })).toBe('v2');
  });

  it('returns v1-fallback when plan_view_v2 is false', () => {
    expect(resolvePlanViewMode({ featureFlags: { plan_view_v2: false } })).toBe(
      'v1-fallback',
    );
  });
});

describe('planViewTelemetryAttrs — pinned attribute key', () => {
  it('emits the canonical pryzm.plan_view.version attribute', () => {
    expect(planViewTelemetryAttrs('v2')).toEqual({
      [PLAN_VIEW_TELEMETRY_ATTR]: 'v2',
    });
    expect(planViewTelemetryAttrs('v1-fallback')).toEqual({
      [PLAN_VIEW_TELEMETRY_ATTR]: 'v1-fallback',
    });
  });

  it('attribute key is the documented constant', () => {
    expect(PLAN_VIEW_TELEMETRY_ATTR).toBe('pryzm.plan_view.version');
  });
});

describe('mountFallbackPanel — DOM mount', () => {
  it('mounts a panel with role=alert into the host', () => {
    const host = makeHost();
    mountFallbackPanel(host);
    const panel = host.querySelector('[data-pryzm-plan-view-fallback="1"]');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('role')).toBe('alert');
  });

  it('panel mentions the v0 fallback policy + ADR-0023', () => {
    const host = makeHost();
    mountFallbackPanel(host);
    const text = host.textContent ?? '';
    expect(text).toMatch(/PRYZM 1 plan-view fallback is not available/);
    expect(text).toMatch(/ADR-0023/);
  });

  it('replaces a prior panel on second call (idempotent)', () => {
    const host = makeHost();
    const first = mountFallbackPanel(host);
    mountFallbackPanel(host);
    expect(host.querySelectorAll('[data-pryzm-plan-view-fallback="1"]').length).toBe(1);
    first(); // teardown of the first panel — already replaced; should no-op safely.
  });

  it('teardown removes the panel from the DOM', () => {
    const host = makeHost();
    const teardown = mountFallbackPanel(host);
    expect(host.querySelector('[data-pryzm-plan-view-fallback="1"]')).not.toBeNull();
    teardown();
    expect(host.querySelector('[data-pryzm-plan-view-fallback="1"]')).toBeNull();
  });
});

describe('applyPlanViewGate — bootstrap integration', () => {
  it('on flag=true: records v2 telemetry, no fallback mount, info log', () => {
    const host = makeHost();
    const recordTelemetry = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn() };
    const r = applyPlanViewGate({
      manifest: { featureFlags: { plan_view_v2: true } },
      host,
      logger,
      recordTelemetry,
    });
    expect(r.mode).toBe('v2');
    expect(r.fallbackMounted).toBe(false);
    expect(recordTelemetry).toHaveBeenCalledWith({
      [PLAN_VIEW_TELEMETRY_ATTR]: 'v2',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-pryzm-plan-view-fallback="1"]')).toBeNull();
  });

  it('on flag=false: warns, mounts fallback, records v1-fallback telemetry', () => {
    const host = makeHost();
    const recordTelemetry = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn() };
    const r = applyPlanViewGate({
      manifest: { featureFlags: { plan_view_v2: false } },
      host,
      logger,
      recordTelemetry,
    });
    expect(r.mode).toBe('v1-fallback');
    expect(r.fallbackMounted).toBe(true);
    expect(recordTelemetry).toHaveBeenCalledWith({
      [PLAN_VIEW_TELEMETRY_ATTR]: 'v1-fallback',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-pryzm-plan-view-fallback="1"]')).not.toBeNull();
    r.dispose();
    expect(host.querySelector('[data-pryzm-plan-view-fallback="1"]')).toBeNull();
  });

  it('on flag=false without host: still warns + records, no DOM mount', () => {
    const recordTelemetry = vi.fn();
    const logger = { warn: vi.fn(), info: vi.fn() };
    const r = applyPlanViewGate({
      manifest: { featureFlags: { plan_view_v2: false } },
      logger,
      recordTelemetry,
    });
    expect(r.mode).toBe('v1-fallback');
    expect(r.fallbackMounted).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(recordTelemetry).toHaveBeenCalledWith({
      [PLAN_VIEW_TELEMETRY_ATTR]: 'v1-fallback',
    });
    // dispose() must be a no-op safely callable.
    expect(() => r.dispose()).not.toThrow();
  });

  it('on missing manifest: defaults to v2 (kill-switch convention)', () => {
    const r = applyPlanViewGate({ manifest: null });
    expect(r.mode).toBe('v2');
    expect(r.fallbackMounted).toBe(false);
  });

  it('telemetry sink omitted: gate still resolves cleanly', () => {
    const host = makeHost();
    const r = applyPlanViewGate({
      manifest: { featureFlags: { plan_view_v2: false } },
      host,
    });
    expect(r.mode).toBe('v1-fallback');
    expect(r.fallbackMounted).toBe(true);
    r.dispose();
  });
});
