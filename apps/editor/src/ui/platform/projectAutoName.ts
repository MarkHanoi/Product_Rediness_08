// PRYZM-EARTH-ONBOARDING PRD Milestone 1 (docs/03-execution/plans/
// PRYZM-EARTH-ONBOARDING-PRD-2026-08-06.md §10, §12 conflict #1) — the
// auto-generated placeholder name used when "+ New Project" bypasses the
// name/description/type modal in `ProjectHub.ts`. The name is a placeholder
// only: it is editable later (the existing rename modal, unchanged) and is
// expected to be REPLACED once location/parcel data resolves (PRD §11.1,
// Milestone 3 — municipality/refcat-derived naming; not implemented here).
//
// Deliberately its OWN file, with zero DOM/THREE/I-O imports: `ProjectHub.ts`
// transitively pulls in DOM-constructing modules at import time (e.g.
// `AppTheme.ts` → `ViewTabBar.ts` calls `document.createElement` in a
// constructor reached from module-scope code), which makes it un-importable
// under this app's node-environment vitest config
// (`apps/editor/vitest.config.ts` — deliberately `environment: 'node'`, see
// its header comment). Keeping this pure function isolated here lets it be
// unit-tested directly without a DOM harness.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.platform.projectHub');

/**
 * Generates a placeholder project name, e.g. "Untitled Site — 2026-08-06 09:05".
 * Exported (not just inline logic) per P8 — every new exported function
 * carries at least one OTel span.
 */
export function generateUntitledSiteName(now: Date = new Date()): string {
    const span = _tracer.startSpan('pryzm.platform.projectHub.generateUntitledSiteName');
    try {
        // Locale-stable, sortable-ish, human-readable timestamp — deliberately not
        // using toLocaleString() (locale-dependent, awkward for automated tests).
        const pad = (n: number) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        return `Untitled Site — ${stamp}`;
    } finally {
        span.end();
    }
}
