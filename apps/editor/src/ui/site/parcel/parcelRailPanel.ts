// §PARCEL-OWN-PANEL (L-5130..L-5136 · C06 §13.3 · C19 · C57 §1.4/§1.9) — the PARCEL
// panel, as its own left-rail destination.
//
// Founder 2026-08-21: *"the GIS panel has great data, but we should have another panel
// only for parcel data: with all the relevant parcel data — also on the left-hand side
// rail toolbar."*
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS IS A RE-SURFACING, NOT A RE-DERIVATION — AND THAT IS THE WHOLE DESIGN
// ═══════════════════════════════════════════════════════════════════════════════
// The parcel data ALREADY resolves. On the founder's screen it reads `Catastro
// (Spain)`, ref `3634515DF3833D`, 423 m² registry against 424 m² from the ring. So
// the one thing this file must not do is fetch it again.
//
// It mounts `mountParcelSection()` — the SAME function `ProjectBrowserPanel`'s GIS
// section mounts, which in turn resolves the COMMITTED parcel out of the C19
// `SiteModelStore` and renders it with `parcelCard.ts`, the ONE card producer. There
// is no second provider call, no second store read path, and no second card.
//
// ⛔ A hand-written parcel card here would give this app TWO surfaces that can
// disagree about whether a ring is a legal cadastral parcel or an OSM building
// outline — the C06 §13.3 breach with a legal consequence attached (§GIS-ENVELOPE-REHOST
// L-1362 / §GIS-PARCEL-REHOST L-1582 record the same rule twice already). The panel is
// a HOST; the producer is the AUTHORITY.
//
// ── WHAT THE FOUNDER ASKED BE CARRIED, AND WHERE IT ALREADY COMES FROM ─────────
// *"carry the two facts that make it trustworthy: the source, and the retrieval
// timestamp"* — both are ALREADY rendered by `buildParcelCard`, from
// `ParcelCardModel.label` (C57 §1.9 attribution, mandatory wherever provider data is
// displayed) and `ParcelCardModel.ingestTimestamp`. MEASURED at `parcelCard.ts:383`
// and `:390`. Nothing is added here for them, because adding them here would be the
// second source of the same fact.
//
// *"If registry area and ring area disagree, show BOTH as it does now; that
// disagreement is information, not noise."* — also already true, and deliberately so:
// `parcelCard.ts:355-362` renders `Area (registry)` and `Area (from ring)` as two
// rows whose labels state the basis, under a C57 §2.4 comment saying they are
// DIFFERENT FACTS and are never merged. This panel inherits that by construction. The
// 423-vs-424 the founder quoted is the mechanism working.
//
// ── THE THREE STATES ARE INHERITED, NOT RE-DECIDED ────────────────────────────
// `buildParcelSectionBody` distinguishes "no boundary" / "boundary committed but
// provenance never recorded" / "full card", each with its own sentence. This panel
// re-hosts that decision rather than restating it, so the dedicated panel and the GIS
// section cannot drift into two different answers for one project.
//
// ── LIVE, AND TORN DOWN ───────────────────────────────────────────────────────
// `mountParcelSection` subscribes to the site store, so a parcel selected while this
// panel is open updates it. The handle's `dispose()` drops that subscription — the
// rail MUST call it when the panel is not the active section, or a subscription
// outlives its DOM and re-renders into a detached tree (the defect §GIS-PARCEL-REHOST
// already fixed once for the GIS section; this panel gets its own handle rather than
// sharing that one, because two slots sharing a single handle would let closing
// either one silently deafen the other).

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { SiteModel } from '@pryzm/schemas';
import { mountParcelSection, type ParcelSectionHandle } from './parcelPanelSection.js';
// §PARCEL-ALL-INFO (L-6905) — the phase and the pure slot decision. Neither is a renderer and
// neither is a second reader of the envelope: one reports whether a determination is running,
// the other maps (card present? · boundary? · phase) onto one of five states.
import {
    getEnvelopeResolutionPhase,
    msUntilEnvelopeResolutionDeadline,
} from '../envelopeResolutionState.js';
import {
    resolveParcelEnvelopeSlotState,
    parcelEnvelopeSlotText,
    parcelEnvelopeSlotOffersRecompute,
    parcelEnvelopeResolvingNoticeApplies,
    PARCEL_ENVELOPE_RESOLVING_OVER_CARD_TEXT,
} from './parcelEnvelopeSlotState.js';

/** `data-testid` on the panel root. */
export const PARCEL_RAIL_PANEL_TESTID = 'parcel-rail-panel';
/** `data-testid` on the slot the shared parcel section is mounted into. */
export const PARCEL_RAIL_SLOT_TESTID = 'parcel-rail-slot';
/** `data-testid` on the slot the SINGLETON buildable-envelope card is re-homed into. */
export const PARCEL_RAIL_ENVELOPE_SLOT_TESTID = 'parcel-rail-envelope-slot';
/** `data-testid` on the sentence shown when the card is not there. */
export const PARCEL_RAIL_ENVELOPE_STATE_TESTID = 'parcel-rail-envelope-state';
/** `data-testid` on the notice shown ABOVE a present card while a better answer is in flight. */
export const PARCEL_RAIL_ENVELOPE_RESOLVING_TESTID = 'parcel-rail-envelope-resolving';
/** `data-testid` on the recompute escape hatch. */
export const PARCEL_RAIL_ENVELOPE_RECOMPUTE_TESTID = 'parcel-rail-envelope-recompute';

/**
 * The one-line orientation shown above the card.
 *
 * It names the ROUTE that produces this data rather than describing the data, because
 * the panel's empty state is the common one for existing projects and a user looking
 * at it needs to know what to do, not what they are missing (C82 §1.2 — a refusal
 * carries its escape hatch; the card's own button is that hatch).
 */
export const PARCEL_PANEL_INTRO =
    'Cadastral and registry facts for the plot committed to this project. '
    + 'Selecting a plot on the 2D map records its reference, address, area and source together.';

export interface ParcelRailPanelHandle {
    readonly element: HTMLElement;
    dispose(): void;
}

/** The minimal store surface this panel reads, structural so a test needs no runtime. */
interface SiteStoreLike {
    getSite(): SiteModel | null;
    subscribe?(listener: () => void): () => void;
}

/** Mirrors `parcelPanelSection.resolveSiteStore` — the caller's runtime first, then the ambient
 *  one, taking the first that actually exists (§L-545: the store is a PER-RUNTIME instance and
 *  `window.runtime` is not always the one the caller holds). */
function resolveSiteStore(runtime: PryzmRuntime | null | undefined): SiteStoreLike | null {
    const fromArg = (runtime as unknown as { siteModelStore?: SiteStoreLike } | null | undefined)?.siteModelStore;
    if (fromArg && typeof fromArg.getSite === 'function') return fromArg;
    const ambient = (typeof window !== 'undefined')
        ? (window as unknown as { runtime?: { siteModelStore?: SiteStoreLike } }).runtime?.siteModelStore
        : undefined;
    return (ambient && typeof ambient.getSite === 'function') ? ambient : null;
}

/** Does the C19 site hold a ring worth determining an envelope against? */
function hasCommittedBoundary(site: SiteModel | null): boolean {
    const polygon = site?.parcel?.boundary?.polygon;
    return Array.isArray(polygon) && polygon.length >= 3;
}

/**
 * Build the PARCEL rail panel.
 *
 * Never throws into the rail: a section that cannot build is a section the founder
 * cannot open, and reachability is the entire point of this change (the same
 * never-throw rule `mountParcelSection` states for itself).
 */
export function buildParcelRailPanel(
    runtime: PryzmRuntime | null | undefined,
): ParcelRailPanelHandle {
    const root = document.createElement('div');
    root.className = 'pb-parcel-panel';
    root.setAttribute('data-testid', PARCEL_RAIL_PANEL_TESTID);

    let section: ParcelSectionHandle | null = null;
    let unsubStore: (() => void) | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    try {
        const intro = document.createElement('div');
        intro.className = 'pb-parcel-intro';
        // textContent, not innerHTML — this file has no HTML sink and keeps it that
        // way (C08 §3.1 §XSS-SINK-SCAN), matching `DrawingModeBar`'s and
        // `parcelCard`'s zero-interpolation posture.
        intro.textContent = PARCEL_PANEL_INTRO;
        root.appendChild(intro);

        const slot = document.createElement('div');
        slot.className = 'pb-parcel-slot';
        slot.setAttribute('data-testid', PARCEL_RAIL_SLOT_TESTID);
        root.appendChild(slot);

        // ⭐ THE REUSE. One call, one reader, one card producer.
        section = mountParcelSection(slot, runtime);

        // ══════════════════════════════════════════════════════════════════════════════
        // §PARCEL-ALL-INFO (L-6905..L-6909) — EVERYTHING ELSE HE ASKED FOR, IN ONE MOUNT
        // ══════════════════════════════════════════════════════════════════════════════
        // Founder 2026-08-22: *"On parcel selection I want to have all information directly
        // showing up: it is still on GIS."*
        //
        // He listed: the buildable envelope (REAL · CONSTRUCTED, the stored-determination
        // note, setbacks F/S/R, max height, max FAR, buildable area, the provenance
        // sentence); Designed vs permitted with its per-metric NOT CHECKED / NO LIMIT SET /
        // OVER rows; How these were measured; and Full site & massing data (PARCEL /
        // ORDINANCE LIMITS / MASSING POTENTIAL / PER STOREY).
        //
        // ⭐ THAT IS ALL ONE ELEMENT. Every item is a fold of the SINGLETON buildable-
        // envelope card, assembled by `refreshEnvelopePanel` in GISAreaLayout.ts and
        // re-homed by `window.pryzmMountEnvelopeCard(host)` — the §GIS-ENVELOPE-REHOST
        // (L-1362) seam, whose whole purpose is that a panel may claim the card without
        // rebuilding it. So this is ONE call, exactly as `§PARCEL-OWN-PANEL` was one call.
        //
        // ⛔ NOTHING IS RE-DERIVED AND NOTHING IS RE-DRAWN HERE. A second renderer of these
        // figures is how two panels come to disagree about a legally-loaded number — and
        // these are legally loaded: heights, setbacks and FAR cited to PGM articles. The
        // card carries four refusal templates and a determination doctrine; re-implementing
        // any of it is the C06 §13.3 breach that produced two disagreeing GIS surfaces.
        //
        // ── ⚠ THE CARD IS A SINGLETON, AND THAT IS SAFE ONLY BECAUSE THE RAIL IS EXCLUSIVE
        //
        // MEASURED: `envelopePanel` is ONE `HTMLDivElement` held in a `mountGISArea` closure
        // (GISAreaLayout.ts:2185) and `ensureEnvelopePanel` MOVES it (`viewport.appendChild`)
        // rather than cloning. Two hosts therefore cannot display it at once — the second
        // claim silently empties the first. That would be a real defect if GIS and PARCEL
        // could be open together; they cannot. `ProjectBrowserPanel` has ONE `_rail.activeId`
        // and disposes the non-active section (ProjectBrowserPanel.ts:218-228). One host is
        // live at a time, by construction.
        //
        // The seam is self-healing on top of that: `getForma3dHostEl` returns the preferred
        // host only while `document.contains(host)` — so when this panel closes and its slot
        // leaves the document, the card falls back to the GIS slot or the 3D viewport instead
        // of being stranded on a detached node.
        //
        // ⭐ THE SECTION ABOVE IS THE OPPOSITE CASE AND IS ALSO SAFE, FOR A DIFFERENT REASON.
        // `mountParcelSection` is not a singleton element — it BUILDS into whatever host it is
        // given and returns its own handle. Two hosts mounting it get two independent DOM
        // trees and two independent store subscriptions, which is exactly why
        // §PARCEL-OWN-PANEL gave this panel its own handle rather than sharing the GIS one:
        // a shared handle would let closing either slot drop the other's subscription.
        //
        // So the honest answer to "can two panels host one section?" is TWO answers: a
        // re-homed singleton can be hosted by many and displayed by one; a mount-per-host
        // builder can be hosted and displayed by many, provided each owns its own handle.
        const envSlot = document.createElement('div');
        envSlot.className = 'pb-parcel-envelope-slot';
        envSlot.setAttribute('data-testid', PARCEL_RAIL_ENVELOPE_SLOT_TESTID);
        root.appendChild(envSlot);

        const store = resolveSiteStore(runtime);

        /** Render the envelope half: claim the card, then say what is true if it did not come. */
        const renderEnvelope = (): void => {
            if (disposed || !envSlot.isConnected) return;
            try {
                // Drop only OUR chrome. ⛔ Never `replaceChildren()` — the card is a re-homed
                // singleton and clearing the slot would detach the one instance every other
                // host shares, which is a strictly worse defect than the blank panel it would
                // look like.
                for (const el of [...envSlot.children]) {
                    if (el.getAttribute('data-testid') !== 'buildable-envelope-card') el.remove();
                }
                if (deadlineTimer !== null) { clearTimeout(deadlineTimer); deadlineTimer = null; }

                const cardPresent = window.pryzmMountEnvelopeCard?.(envSlot) ?? false;
                const phase = getEnvelopeResolutionPhase();
                const state = resolveParcelEnvelopeSlotState({
                    cardPresent,
                    hasCommittedBoundary: hasCommittedBoundary(store?.getSite() ?? null),
                    resolutionPhase: phase,
                });

                if (state === 'card-present') {
                    // ⭐ The narrow in-flight case: the card IS showing figures, and they are the
                    // provisional fallback `computeAndCacheEstimatedEnvelope` cached at commit
                    // time, not the cited determination still being fetched. Say so ABOVE it.
                    if (parcelEnvelopeResolvingNoticeApplies({ cardPresent, resolutionPhase: phase })) {
                        const note = document.createElement('div');
                        note.className = 'pb-parcel-envelope-resolving';
                        note.setAttribute('data-testid', PARCEL_RAIL_ENVELOPE_RESOLVING_TESTID);
                        note.textContent = PARCEL_ENVELOPE_RESOLVING_OVER_CARD_TEXT;
                        envSlot.insertBefore(note, envSlot.firstChild);
                        scheduleDeadlineRerender();
                    }
                    return;
                }

                const msg = document.createElement('div');
                msg.className = 'pb-parcel-envelope-state';
                msg.setAttribute('data-testid', PARCEL_RAIL_ENVELOPE_STATE_TESTID);
                msg.setAttribute('data-state', state);
                // textContent — no interpolation sink in this file (C08 §3.1).
                msg.textContent = parcelEnvelopeSlotText(state);
                envSlot.appendChild(msg);

                if (state === 'resolving') scheduleDeadlineRerender();

                if (parcelEnvelopeSlotOffersRecompute(state)) {
                    // ⛔ NOT A NEW CAPABILITY. It dispatches `window.pryzmRecomputeEnvelopeCard`
                    // — the §L-1587 seam over the ONE `recomputeEnvelopeDetermination` closure,
                    // which re-runs the SAME C58 determination against the SAME committed
                    // boundary via `reapplyZoningForActiveSite` (zoning only, never geometry).
                    // Every refusal branch therefore survives: a parcel that genuinely has no
                    // envelope still refuses, and the button says so rather than pretending.
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'pb-parcel-envelope-recompute';
                    btn.setAttribute('data-testid', PARCEL_RAIL_ENVELOPE_RECOMPUTE_TESTID);
                    btn.textContent = 'Recompute from the committed parcel';
                    btn.title =
                        'Re-runs the buildability determination against the parcel boundary '
                        + 'already committed to this project. Does not move or re-derive the '
                        + 'boundary.';
                    btn.addEventListener('click', () => {
                        btn.disabled = true;
                        btn.textContent = 'Recomputing…';
                        try { window.pryzmRecomputeEnvelopeCard?.(); }
                        catch (e) { console.warn('[parcel-panel] recompute threw (non-fatal):', e); }
                        // Re-ask rather than trust the return value: the recompute is synchronous
                        // today but the jurisdiction leg it routes into completes ASYNCHRONOUSLY,
                        // so the honest next state is whatever the phase says now — which, one
                        // tick after a successful re-launch, is `resolving`.
                        renderEnvelope();
                    });
                    envSlot.appendChild(btn);
                }
            } catch (e) {
                console.warn('[parcel-panel] §PARCEL-ALL-INFO envelope render failed (non-fatal):', e);
            }
        };

        /**
         * ONE timer, not a poll.
         *
         * The SUCCESS transition arrives for free: `dispatchEnvelope` writes through
         * `siteUpdateZoning`, which notifies the `SiteModelStore` this panel subscribes to
         * below. The only transition with no natural signal is `resolving` → `stalled`, and
         * it needs exactly one `setTimeout` at the deadline. Polling every second would repaint
         * the card ~45 times per parcel for no information gain — and on WebGL, which is the
         * founder's backend, a card repaint is not free.
         */
        function scheduleDeadlineRerender(): void {
            const ms = msUntilEnvelopeResolutionDeadline();
            if (ms === null) return;
            if (deadlineTimer !== null) clearTimeout(deadlineTimer);
            deadlineTimer = setTimeout(() => {
                deadlineTimer = null;
                renderEnvelope();
            }, ms + 50);
        }

        // Mounted after the slot is in the DOM: the host seam ignores a detached element on
        // purpose, so a closed panel can never strand the card.
        queueMicrotask(renderEnvelope);

        // ⭐ LIVE. `dispatchEnvelope` → `siteUpdateZoning` → the site store notifies, so the
        // 6–11 s window ENDS on screen without the user touching anything. Its own subscription,
        // not the parcel section's handle: §PARCEL-OWN-PANEL's rule that a shared handle lets
        // one closer deafen another applies to this panel's two subscriptions too.
        if (store?.subscribe) {
            try {
                unsubStore = store.subscribe(() => {
                    if (disposed || !envSlot.isConnected) return;
                    renderEnvelope();
                });
            } catch (e) {
                console.warn(
                    '[parcel-panel] §PARCEL-ALL-INFO subscribe failed — the envelope half will '
                    + 'not live-update; it shows the state at the moment the panel opened:', e,
                );
            }
        }
    } catch (e) {
        console.warn('[parcel-panel] §PARCEL-OWN-PANEL build failed (non-fatal):', e);
    }

    return {
        element: root,
        dispose(): void {
            disposed = true;
            try { section?.dispose(); } catch { /* teardown is best-effort */ }
            section = null;
            try { unsubStore?.(); } catch { /* teardown is best-effort */ }
            unsubStore = null;
            if (deadlineTimer !== null) { clearTimeout(deadlineTimer); deadlineTimer = null; }
            // ⛔ DO NOT release the card host to `null` here. `getForma3dHostEl` already falls
            // back the moment this slot leaves the document (`document.contains`), and calling
            // `pryzmMountEnvelopeCard(null)` would ALSO evict the card from the GIS slot if GIS
            // had claimed it since — a panel disposing itself must not reach into another host's
            // state. Self-healing beats explicit release here precisely because the resource is
            // shared.
        },
    };
}
