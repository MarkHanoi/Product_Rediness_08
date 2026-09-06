// §PL-LIVE-QUANTITIES (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — the CONTROL that makes STR
// §25.7's figures LIVE on the Parcel Law tab, and wires the adjustable rate.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE DEFECT THIS FILE EXISTS TO FIX, MEASURED BEFORE IT WAS WRITTEN
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The intended-area figures already render — on the singleton envelope card, through
// `buildIntendedAreaFold(collectIntendedAreas(...))` at `GISAreaLayout.ts:3753`. But the card is
// re-rendered by `refreshEnvelopePanel()`, and every one of its triggers is a fixed list that
// contains NO space-envelope signal: envelope-visibility toggles, the recompute button,
// `pryzmMountEnvelopeCard` re-hosting, and the event list at `GISAreaLayout.ts:5600`
// (`site.parcel-boundary-set` · `site.zoning-updated` · `apartment|ceiling|furnish|lighting
// .layout-executed`) plus `pryzm-building-generation-ended`.
//
// So today: drag an envelope face with the §25.6 gizmo, or create a room envelope, and the area
// figures DO NOT MOVE until something unrelated happens to fire one of those events. That is
// exactly what §25.7 forbids — *"the plan view, the 3d scene and the graph shall talk to each
// other as a single living entity. Everything shall be live."*
//
// ⭐ THE FIX IS THE CHANNEL THE RENDERER ALREADY USES, NOT A FOURTH UPDATE PATH.
// `attachSpaceEnvelopeRender.ts` subscribes to `Store.subscribeDirty()` and its header explains
// why that is the ONE road: `applyPatch()` notifies it on EXECUTE, UNDO and REDO alike, so a
// single subscription covers a face drag, a create, a delete and a Ctrl+Z. RESI-ORCHESTRATOR-PLAN
// §3 asks lanes to honour the existing synchronisation contract rather than invent a fourth
// update path; this control subscribes to the same channel the 3D scene does, so the panel and
// the scene cannot show different vintages of one envelope.
//
// ⛔ P6 — THIS FILE WRITES NO ELEMENT STORE. The only state it writes is the session rate slot
// (`indicativeRateState.ts`), which is a UI preference, not model state: it creates, deletes and
// mutates nothing in the model and never bypasses the command bus. Every figure it shows is READ.
//
// ⛔ P4 — no `(window as any)`. The two globals it needs (`runtime`, `bimManager`) are reached
// through a typed, injectable host so a spec drives this with fakes of the SEAM.

import { trace } from '@opentelemetry/api';
import {
    estimateAtIndicativeRate,
    type IndicativeCostOutcome,
    type IndicativeRate,
} from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { collectIntendedAreas, type IntendedAreaSnapshot } from '../site/intendedAreaChannel';
import { buildLiveQuantitiesModel } from '../site/liveQuantitiesModel';
import {
    buildLiveQuantitiesSection,
    DEFAULT_INDICATIVE_CURRENCY,
    LIVE_QUANTITIES_APPLY_BTN_TESTID,
    LIVE_QUANTITIES_CURRENCY_TESTID,
    LIVE_QUANTITIES_RATE_INPUT_TESTID,
    LIVE_QUANTITIES_STATUS_TESTID,
} from '../site/liveQuantitiesSection';
import {
    getIndicativeRate,
    parseIndicativeRateInput,
    setIndicativeRate,
    subscribeIndicativeRate,
} from '../site/indicativeRateState';
import { readLevelCandidates } from '../site/adoptProposalAsEnvelope';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawQuantities');

/** `data-testid` on the slot this control owns. */
export const PARCEL_LAW_QUANTITIES_SLOT_TESTID = 'analysis-parcel-law-quantities';
/** Carries how many live re-renders the store channel has driven — read by the spec. */
export const PARCEL_LAW_QUANTITIES_LIVE_ATTR = 'data-live-repaints';
/** `'yes'` when the store's dirty channel was subscribed; `'no'` (with a reason) when not. */
export const PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR = 'data-live-subscribed';

/**
 * The space-envelope store, as this control needs it. STRUCTURAL, so no import edge is owed to
 * the plugin — the same shape `attachSpaceEnvelopeRender.ts` declares, and deliberately the same
 * two members so the two subscribers cannot diverge in what they require.
 */
export interface LiveEnvelopeStore {
    getState(): ReadonlyMap<string, unknown>;
    subscribeDirty?(
        listener: (
            diff: { readonly added: ReadonlySet<string>; readonly updated: ReadonlySet<string>; readonly removed: ReadonlySet<string> },
            state: ReadonlyMap<string, unknown>,
        ) => void,
    ): () => void;
}

export interface ParcelLawQuantitiesDeps {
    /** Production: `() => window.runtime` — resolved per CALL, never captured (§L-545). */
    readonly runtime: () => PryzmRuntime | null | undefined;
    /** Production: `() => window.bimManager?.getLevels?.()`. Returns the raw records. */
    readonly readLevels: () => unknown;
    /** Production: `() => new Date().toISOString()`. Injected so a spec pins the statement. */
    readonly nowIso: () => string;
}

/** Read `runtime.stores.spaceEnvelope` without asserting a shape the runtime may not have. */
function resolveEnvelopeStore(rt: PryzmRuntime | null | undefined): LiveEnvelopeStore | null {
    const s = (rt as unknown as { stores?: Record<string, unknown> } | null | undefined)
        ?.stores?.spaceEnvelope;
    if (!s || typeof s !== 'object') return null;
    const candidate = s as LiveEnvelopeStore;
    return typeof candidate.getState === 'function' ? candidate : null;
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultParcelLawQuantitiesDeps(): ParcelLawQuantitiesDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: PryzmRuntime | null;
        bimManager?: { getLevels?: () => unknown[] };
    };
    return {
        runtime: () => w.runtime ?? null,
        readLevels: () => {
            try { return w.bimManager?.getLevels?.() ?? []; } catch { return []; }
        },
        nowIso: () => new Date().toISOString(),
    };
}

export interface ParcelLawQuantitiesHandle {
    readonly element: HTMLElement;
    /** Re-read everything and repaint. Cheap; never throws into the host. */
    repaint(): void;
    /** How many repaints the STORE channel has driven. Read by the liveness spec. */
    liveRepaintCount(): number;
    dispose(): void;
}

/**
 * Mount the live-quantities + indicative-cost section into `host`.
 *
 * ⛔ NEVER THROWS INTO THE SURFACE. A tab that cannot build is a tab the founder cannot open, and
 * reachability is the entire point of the lane that created this tab (L-12915). Every arm that
 * fails renders a SENTENCE saying what failed, never an empty div.
 */
export function mountParcelLawQuantities(
    host: HTMLElement,
    deps: ParcelLawQuantitiesDeps = defaultParcelLawQuantitiesDeps(),
): ParcelLawQuantitiesHandle {
    const span = _tracer.startSpan('pryzm.analysis.mountParcelLawQuantities');
    const root = document.createElement('div');
    root.className = 'anl-parcel-law-quantities';
    root.setAttribute('data-testid', PARCEL_LAW_QUANTITIES_SLOT_TESTID);

    let disposed = false;
    let liveRepaints = 0;
    let unsubStore: (() => void) | null = null;
    let unsubRate: (() => void) | null = null;
    /** The status line survives a repaint only as long as the message is about the LAST gesture. */
    let pendingStatus: string | null = null;

    const snapshot = (): IntendedAreaSnapshot => {
        const store = resolveEnvelopeStore(deps.runtime());
        const levels = readLevelCandidates(deps.readLevels())
            .map((l) => ({ id: l.id, name: l.name, elevation: l.elevation }));
        return collectIntendedAreas(store, levels);
    };

    const render = (): void => {
        if (disposed) return;
        try {
            const model = buildLiveQuantitiesModel(snapshot());
            const rate: IndicativeRate | null = getIndicativeRate();
            const outcome: IndicativeCostOutcome = estimateAtIndicativeRate(rate, model.area);
            root.innerHTML = buildLiveQuantitiesSection(model, rate, outcome);
            if (pendingStatus !== null) {
                const status = root.querySelector<HTMLElement>(`[data-testid="${LIVE_QUANTITIES_STATUS_TESTID}"]`);
                if (status) status.textContent = pendingStatus;
            }
            wireControls();
        } catch (e) {
            console.warn('[analysis][parcel-law][quantities] render failed (non-fatal):', e);
            root.textContent =
                'The live-quantities section could not render this pass. The figures it shows are '
                + 'still on the buildable-envelope card; this is a failure of THIS section, not a '
                + 'finding about your project.';
        }
    };

    /**
     * Attach the rate handlers. Called after every render because `innerHTML` replaces the nodes —
     * the same convention `GISAreaLayout`'s `wireStudyHeightEntry` follows for the card.
     */
    const wireControls = (): void => {
        const input = root.querySelector<HTMLInputElement>(`[data-testid="${LIVE_QUANTITIES_RATE_INPUT_TESTID}"]`);
        const select = root.querySelector<HTMLSelectElement>(`[data-testid="${LIVE_QUANTITIES_CURRENCY_TESTID}"]`);
        const btn = root.querySelector<HTMLButtonElement>(`[data-testid="${LIVE_QUANTITIES_APPLY_BTN_TESTID}"]`);
        if (!btn) return;
        btn.onclick = (): void => {
            const parsed = parseIndicativeRateInput(
                input?.value ?? '',
                select?.value ?? DEFAULT_INDICATIVE_CURRENCY,
                deps.nowIso(),
            );
            if (!parsed.ok) {
                // ⛔ The rate is UNCHANGED on a bad input, and the message says so. Silently
                // clearing it would turn a typo into a lost decision.
                pendingStatus = parsed.text;
                const status = root.querySelector<HTMLElement>(`[data-testid="${LIVE_QUANTITIES_STATUS_TESTID}"]`);
                if (status) status.textContent = parsed.text;
                return;
            }
            pendingStatus = parsed.rate === null
                ? 'Rate cleared. No cost estimate will be shown until you set one.'
                : `Rate set to ${parsed.rate.amountPerM2} ${parsed.rate.currency}/m² — your assumption, not a published figure.`;
            // The state push repaints THIS control through `subscribeIndicativeRate` below, and
            // any other surface that subscribes. One writer, many readers.
            setIndicativeRate(parsed.rate);
        };
    };

    try {
        host.appendChild(root);
        render();

        // ── THE LIVE CHANNEL — the same one the 3D scene uses. See the header. ────────────────
        const store = resolveEnvelopeStore(deps.runtime());
        if (store && typeof store.subscribeDirty === 'function') {
            try {
                unsubStore = store.subscribeDirty(() => {
                    if (disposed || !root.isConnected) return;
                    liveRepaints += 1;
                    // ⚠ `pendingStatus` is deliberately NOT cleared here: a store change is not a
                    // rate gesture, and wiping the user's last message on an unrelated edit would
                    // make the panel feel like it forgot what they just did.
                    render();
                    root.setAttribute(PARCEL_LAW_QUANTITIES_LIVE_ATTR, String(liveRepaints));
                });
                root.setAttribute(PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR, 'yes');
            } catch (e) {
                root.setAttribute(PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR, 'no:threw');
                console.warn('[analysis][parcel-law][quantities] subscribeDirty threw — the section '
                    + 'will not update as envelopes change:', e);
            }
        } else {
            // ⛔ LOUD, and it names WHICH half is missing. A silent no-op here would look exactly
            // like a project with no envelopes — the failure-vs-emptiness confusion this repo
            // pays for most often. The rendered section already prints the honest sentence.
            root.setAttribute(
                PARCEL_LAW_QUANTITIES_SUBSCRIBED_ATTR,
                store ? 'no:store-has-no-dirty-channel' : 'no:no-store',
            );
            console.warn('[analysis][parcel-law][quantities] runtime.stores.spaceEnvelope '
                + (store ? 'exposes no subscribeDirty' : 'is not reachable')
                + ' — quantities will not update live this session.');
        }

        unsubRate = subscribeIndicativeRate(() => {
            if (disposed || !root.isConnected) return;
            render();
        });
        span.setAttribute('pryzm.analysis.parcelLawQuantities.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.analysis.parcelLawQuantities.mounted', false);
        console.warn('[analysis][parcel-law][quantities] mount failed (non-fatal):', e);
    } finally {
        span.end();
    }

    return {
        element: root,
        repaint: render,
        liveRepaintCount: () => liveRepaints,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsubStore?.(); } catch { /* teardown is best-effort */ }
            try { unsubRate?.(); } catch { /* teardown is best-effort */ }
            unsubStore = null;
            unsubRate = null;
            root.remove();
        },
    };
}
