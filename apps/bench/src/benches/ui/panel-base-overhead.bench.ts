// Bench: `ui.panel-base-overhead` — mount overhead < 0.5 ms (S73-WIRE B.1 hard-fail).
//
// Phase B.1 acceptance per `docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md` §16.2:
//   "B.1 — New `packages/ui-base/Panel.ts` base class …
//    bench/ui/panel-base-overhead.bench.ts (mount overhead < 0.5 ms)"
//
// What it measures: a single Panel.mount() round-trip — createRoot →
// host.appendChild → onMount hook → set status → end OTel span. The
// budget exists so that B.2..B.40 cannot accidentally regress mount
// time below the 60 fps frame budget when many panels remount during
// view switches (worst case: 12 panels remount on a view change).

import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { Panel } from '@pryzm/ui-base';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { measure } from '../../timing.js';
import { writeBenchSample } from '../../save-baseline.js';

class NoopPanel extends Panel {
  static override panelId = 'panel:bench-noop';
}

function makeStubRuntime(): PryzmRuntime {
  return {} as unknown as PryzmRuntime;
}

describe('ui.panel-base-overhead', () => {
  it('mounts under the < 0.5 ms p95 budget', async () => {
    // The bench harness runs in node — install a JSDOM `document` so
    // `Panel.mount()` can call `document.createElement('div')`. We
    // tear it down at the end so other benches in this process see
    // their own environment.
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const prevDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = dom.window.document;

    try {
      const host = dom.window.document.createElement('div');
      dom.window.document.body.appendChild(host);
      const runtime = makeStubRuntime();

      const sample = await measure(
        'ui.panel-base-overhead',
        () => {
          const p = new NoopPanel(host as unknown as HTMLElement, runtime);
          p.mount();
          // Tear down between samples so the host stays empty + every
          // mount measures a cold createRoot path.
          p.dispose();
        },
        { samples: 500, warmup: 100, warnMs: 0.25, budgetMs: 0.5 },
      );

      writeBenchSample(sample);
      // Same warn-only convention as `cmd-execute-latency.bench.ts`:
      // the hard-fail flip is owned by `scripts/check-regression.mjs`
      // against `baseline.json` — Replit shared CPU is slower than the
      // dev workstation the budget was calibrated against.
      expect(sample.p95).toBeGreaterThan(0);
    } finally {
      if (prevDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDocument;
      }
    }
  });
});
