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
import { mountParcelSection, type ParcelSectionHandle } from './parcelPanelSection.js';

/** `data-testid` on the panel root. */
export const PARCEL_RAIL_PANEL_TESTID = 'parcel-rail-panel';
/** `data-testid` on the slot the shared parcel section is mounted into. */
export const PARCEL_RAIL_SLOT_TESTID = 'parcel-rail-slot';

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
    } catch (e) {
        console.warn('[parcel-panel] §PARCEL-OWN-PANEL build failed (non-fatal):', e);
    }

    return {
        element: root,
        dispose(): void {
            try { section?.dispose(); } catch { /* teardown is best-effort */ }
            section = null;
        },
    };
}
