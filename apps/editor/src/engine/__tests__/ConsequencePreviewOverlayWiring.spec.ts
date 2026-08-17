/**
 * ConsequencePreviewOverlayWiring — BIM30 R3, the overlay's first real caller (Task 2).
 *
 * R0 recorded the overlay's trigger surface WIRE-PENDING-R3: instantiated, listening on
 * `pryzm-consequence-preview`, but with ZERO emitters. This test drives the FULL wired
 * path — `triggerConsequencePreview(command)` → runtime event → overlay debounce →
 * `ConsequencePreviewProvider.preview()` → `renderPlan()` → DOM — and asserts the panel
 * renders the plan's changed count AND its undetermined items (shown AS undetermined,
 * never hidden — ADR-0322 §5).
 *
 * This is the TEST-PROVEN half of the wiring. The LIVE caller
 * (MovePlanToolHandler's wall drag-preview seam) emits the same event through the same
 * `triggerConsequencePreview` helper this test exercises; that half is live-proven only
 * in the running editor (no headless canvas here).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsequencePreviewOverlay,
  triggerConsequencePreview,
} from '@app/ui/canvas/ConsequencePreviewOverlay';
import { plannedOutcome, previewUnrecognisedVerb } from '@pryzm/command-bus';
import type { ConsequencePlan, PreviewOutcome } from '@pryzm/command-bus';
import type { ConsequencePreviewProvider, PreviewCommand } from '@app/engine/consequence/ConsequencePreviewService';

// ── A minimal runtime event bus on window (the overlay wires to window.runtime.events) ──
function installEventBus(): void {
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  (window as unknown as { runtime: unknown }).runtime = {
    events: {
      on(type: string, h: (p: unknown) => void) {
        const list = handlers.get(type) ?? [];
        list.push(h);
        handlers.set(type, list);
        return () => {};
      },
      emit(type: string, p: unknown) {
        for (const h of handlers.get(type) ?? []) h(p);
      },
    },
  };
}

// ── A plan with a determined change AND a declared blind spot ────────────────────
function fakePlan(): ConsequencePlan {
  return {
    planId: 'plan-test-1',
    planHash: 'deadbeef',
    stateHash: 'cafebabe',
    command: { type: 'wall.updateBaseline', payload: { wallId: 'wall-1' } },
    direct: { kind: 'determined', elements: ['wall-1'] },
    indirect: { kind: 'undetermined', scope: 'indirect', reason: 'NO_DEPENDENCY_INDEX' },
    changed: ['wall-1', 'wall-2'],
    excluded: ['door-9'],
    topology: { added: [], removed: [], modified: ['wall-2'] },
    validation: { violationsCreated: [], violationsResolved: [] },
    regeneration: { required: [], skipped: [] },
    refused: [{ elementId: 'door-3', reason: 'opening 1200 mm needs 1200 mm but only 400 mm remains' }],
    undetermined: [
      { scope: 'regeneration of elements dependent on wall wall-1', reason: 'NO_DEPENDENCY_INDEX' },
    ],
  };
}

const panel = () => document.getElementById('consequence-preview-panel');

async function waitForPanelContent(timeoutMs = 2000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = panel();
    if (el && el.innerHTML.trim().length > 0 && el.style.opacity === '1') return el.innerHTML;
    await new Promise((r) => setTimeout(r, 20));
  }
  return panel()?.innerHTML ?? '';
}

describe('ConsequencePreviewOverlay — wired emit→overlay→render (BIM30 R3 Task 2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    installEventBus();
  });

  it('renders the ConsequencePlan (changed + undetermined + refused) when a preview command is emitted', async () => {
    const preview = vi.fn(async (_cmd: PreviewCommand) => plannedOutcome(fakePlan()));
    const service: ConsequencePreviewProvider = { preview };

    // The overlay wires its listeners in the constructor.
    new ConsequencePreviewOverlay(null, service);

    // The LIVE seam calls exactly this helper (no client coords — the overlay tracks them).
    triggerConsequencePreview({ type: 'wall.updateBaseline', payload: { wallId: 'wall-1', newBaseLine: [] } });

    const html = await waitForPanelContent();

    // The provider was actually consulted with the emitted command (no dispatch/bus).
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview.mock.calls[0]![0]).toMatchObject({ type: 'wall.updateBaseline' });

    // CHANGED count surfaced.
    expect(html).toContain('2 elements would change');
    // REFUSED with its numbers carried verbatim.
    expect(html).toContain('400 mm remains');
    // UNDETERMINED shown AS undetermined — the load-bearing assertion (never hidden).
    expect(html).toContain('UNDETERMINED');
    expect(html).toContain('NO_DEPENDENCY_INDEX');
  });

  /**
   * §B.4 — THE ARM THAT DID NOT EXIST.
   *
   * Before the seam was wired, `preview()` returned `ConsequencePlan | null` and the
   * overlay's `_computeAndShow` ended `if (!plan) return;`. An unrecognised verb therefore
   * rendered NOTHING — pixel-identical to a hover that produced an empty plan, which is a
   * positive statement that nothing is affected. The two facts were the same screen.
   *
   * ⚠ This assertion is only writable because the outcome is typed. A test asserting the
   * OLD behaviour could only ever have asserted an absence, and an absence is exactly what
   * a silent failure also looks like — the control could not have failed.
   */
  it('an UNDETERMINED outcome is SHOWN, with its typed reason — never rendered as silence', async () => {
    const preview = vi.fn(async (_cmd: PreviewCommand) => previewUnrecognisedVerb('roof.move'));
    new ConsequencePreviewOverlay(null, { preview });

    triggerConsequencePreview({ type: 'roof.move', payload: { roofId: 'roof-1' } });

    const html = await waitForPanelContent();

    // The panel is VISIBLE — the whole defect was that it was not.
    expect(panel()?.style.opacity).toBe('1');
    // The typed reason reaches the user, not a generic apology.
    expect(html).toContain('UNSUPPORTED_ELEMENT_TYPE');
    expect(html).toContain('no-normalizer-for-verb');
    // ⭐ And it explicitly denies the reading that the old silence invited.
    expect(html).toContain('NOT a claim that nothing would change');
    // It must NOT masquerade as a plan. `renderPlan` leads with the '●' changed-count
    // section; `renderUndetermined` must never produce one. (Asserting on the words
    // "would change" would be self-defeating — the amber copy above contains them
    // deliberately, in the sentence that denies the empty-plan reading.)
    expect(html).not.toContain('●');
  });

  it('does nothing when no preview service is wired (honest inert state, no throw)', async () => {
    new ConsequencePreviewOverlay(null, null);
    triggerConsequencePreview({ type: 'wall.updateBaseline', payload: { wallId: 'wall-1' } });
    await new Promise((r) => setTimeout(r, 350));
    // Panel exists but was never shown.
    expect(panel()?.style.opacity).not.toBe('1');
  });

  it('a hide event dismisses an in-flight preview (no stale render after leave)', async () => {
    let resolvePreview!: (p: PreviewOutcome) => void;
    const preview = vi.fn(() => new Promise<PreviewOutcome>((res) => { resolvePreview = res; }));
    new ConsequencePreviewOverlay(null, { preview });

    triggerConsequencePreview({ type: 'wall.updateBaseline', payload: { wallId: 'wall-1' } });
    // Let the debounce fire so preview() is in flight, then hide before it resolves.
    await new Promise((r) => setTimeout(r, 350));
    (window as unknown as { runtime: { events: { emit: (t: string, p: unknown) => void } } }).runtime.events.emit('pryzm-consequence-hide', {});
    resolvePreview(plannedOutcome(fakePlan()));
    await new Promise((r) => setTimeout(r, 50));

    expect(panel()?.style.opacity).not.toBe('1');
  });
});
