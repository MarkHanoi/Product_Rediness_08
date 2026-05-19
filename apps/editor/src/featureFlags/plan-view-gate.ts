// plan-view-gate — runtime observation of `featureFlags.plan_view_v2` (W-07).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-07.
// Audit reference: §3 H-1, §4 D13.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// `packages/persistence-client/src/manifest.ts` declares
// `plan_view_v2: z.boolean().default(true)` as a kill-switch slot.  Prior to
// W-07 the editor had **zero runtime consumers** — the flag was a manifest
// field that nothing read.  W-07 wires the flag into the editor bootstrap
// path so:
//
//   1. The flag is read on every project open.
//   2. An OTel span attribute (`pryzm.plan_view.version`) records which
//      mode the session ran in — observability for the M24 beta cohort.
//   3. If the flag is `false`, the editor surfaces a "PRYZM 1 plan-view
//      fallback is not available in this build (Phase 3C)" panel via the
//      `mountFallbackPanel` helper exported here.
//
// v0 fallback policy (per ADR-0023 amendment 2026-04-28):
//   The editor does NOT carry a PRYZM 1 plan-view fallback target — legacy
//   `apps/editor` deletion is S61 / Phase 3C.  The flag is observable for
//   telemetry only; turning it off renders an explicit "no fallback"
//   panel rather than silently doing nothing.  Reactivating an actual
//   fallback target requires the Phase 3B legacy preservation work.
//
// PURE: no DOM, no THREE.  The fallback panel mount uses raw DOM + inline
// styles in the same vanilla style as `ProjectHub.ts` — deliberately
// kept dependency-free so a misconfigured manifest cannot crash bootstrap.

export const PLAN_VIEW_FLAG_NAME = 'plan_view_v2' as const;

/** Manifest shape the gate reads.  Mirrors the relevant slice of
 *  `PryzmManifestSchema` so we can take a structural dependency without
 *  pulling persistence-client into editor's hot path. */
export interface PlanViewManifestSlice {
  readonly featureFlags?: {
    readonly plan_view_v2?: boolean;
  };
}

export type PlanViewMode = 'v2' | 'v1-fallback';

/** Resolve the active plan-view mode from a manifest slice.  Defaults to
 *  `'v2'` (kill-switch convention: absence ⇒ feature ON). */
export function resolvePlanViewMode(
  manifest: PlanViewManifestSlice | null | undefined,
): PlanViewMode {
  const v2 = manifest?.featureFlags?.plan_view_v2 ?? true;
  return v2 ? 'v2' : 'v1-fallback';
}

/** Telemetry attribute key — pinned constant so OTel span code + tests
 *  use the same name. */
export const PLAN_VIEW_TELEMETRY_ATTR = 'pryzm.plan_view.version' as const;

/** Build the OTel span attribute payload for the current mode. */
export function planViewTelemetryAttrs(mode: PlanViewMode): Record<string, string> {
  return { [PLAN_VIEW_TELEMETRY_ATTR]: mode };
}

/** Diagnostic logger contract — anything with a `warn` method.  Defaults
 *  to `console.warn` in production; tests inject a spy. */
export interface PlanViewLogger {
  warn(message: string, ...rest: unknown[]): void;
  info?(message: string, ...rest: unknown[]): void;
}

const defaultLogger: PlanViewLogger = {
  warn: (...args) => { console.warn(...args); },
  info: (...args) => { console.info(...args); },
};

/** Mount a "no fallback available" panel into the host element.  Returns
 *  a teardown function.  Idempotent: calling twice on the same host
 *  replaces the previous panel.
 *
 *  Inline styles are used (no CSS dependency) so the panel renders even
 *  if the editor stylesheet failed to load. */
export function mountFallbackPanel(host: HTMLElement): () => void {
  // Remove any prior panel.
  const prior = host.querySelector('[data-pryzm-plan-view-fallback="1"]');
  if (prior) prior.remove();

  const panel = host.ownerDocument!.createElement('div');
  panel.dataset.pryzmPlanViewFallback = '1';
  panel.setAttribute('role', 'alert');
  panel.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'background:#1a1a1a',
    'color:#f5f5f5',
    'font-family:system-ui,sans-serif',
    'padding:32px',
    'text-align:center',
    'gap:12px',
    'z-index:1',
  ].join(';');

  const heading = host.ownerDocument!.createElement('h2');
  heading.textContent = 'Plan view (v2) is disabled for this project';
  heading.style.cssText = 'margin:0;font-size:18px;font-weight:600';

  const body = host.ownerDocument!.createElement('p');
  body.textContent =
    'PRYZM 1 plan-view fallback is not available in this build (Phase 3C). '
    + 'Re-enable plan_view_v2 in the project manifest to restore the plan view.';
  body.style.cssText = 'margin:0;font-size:14px;max-width:480px;line-height:1.5';

  const ref = host.ownerDocument!.createElement('p');
  ref.textContent = 'See ADR-0023 amendment 2026-04-28 for the v0 fallback policy.';
  ref.style.cssText = 'margin:0;font-size:12px;opacity:0.7';

  panel.append(heading, body, ref);
  host.appendChild(panel);

  return (): void => { panel.remove(); };
}

/** Apply the plan-view gate at editor bootstrap.  Returns the resolved
 *  mode + a teardown for the fallback panel (if mounted).  Callers must
 *  invoke the teardown on project close.
 *
 *  This is the single, observable read site for the flag — anything
 *  else that needs the mode receives it via the returned value, not by
 *  re-reading the manifest. */
export interface ApplyPlanViewGateOptions {
  readonly manifest: PlanViewManifestSlice | null | undefined;
  /** Host element for the fallback panel.  When omitted, no DOM mount
   *  happens (useful for headless tests + bench runs). */
  readonly host?: HTMLElement;
  readonly logger?: PlanViewLogger;
  /** OTel attribute sink.  Production wires `span.setAttributes(...)`;
   *  tests pass a spy.  When omitted, no telemetry is recorded. */
  readonly recordTelemetry?: (attrs: Record<string, string>) => void;
}

export interface PlanViewGateResult {
  readonly mode: PlanViewMode;
  readonly fallbackMounted: boolean;
  readonly dispose: () => void;
}

export function applyPlanViewGate(opts: ApplyPlanViewGateOptions): PlanViewGateResult {
  const mode = resolvePlanViewMode(opts.manifest);
  const logger = opts.logger ?? defaultLogger;
  const attrs = planViewTelemetryAttrs(mode);

  opts.recordTelemetry?.(attrs);

  if (mode === 'v2') {
    logger.info?.(
      `[plan-view] plan_view_v2 enabled — mounting v2 canvas host (${PLAN_VIEW_TELEMETRY_ATTR}=v2).`,
    );
    return { mode, fallbackMounted: false, dispose: () => {} };
  }

  logger.warn(
    `[plan-view] plan_view_v2 is false — fallback not available in v0 (${PLAN_VIEW_TELEMETRY_ATTR}=v1-fallback).`,
  );

  if (!opts.host) {
    return { mode, fallbackMounted: false, dispose: () => {} };
  }

  const teardown = mountFallbackPanel(opts.host);
  return { mode, fallbackMounted: true, dispose: teardown };
}
