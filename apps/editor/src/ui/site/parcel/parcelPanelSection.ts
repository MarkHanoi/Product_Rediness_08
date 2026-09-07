// §L-1582 (C06 §13.3 · C57 §1.4 / §1.9) — THE GIS-PANEL HOST FOR THE PARCEL DATA CARD.
//
// Founder 2026-08-20: *"there was a panel for each parcel with data. This panel should be
// a section under the GIS panel under the left-hand side rail panel. Check and bring it
// back — it is not accessible now!"*
//
// ⛔ NOTHING IS RE-IMPLEMENTED HERE. This file resolves the COMMITTED parcel out of the
// C19 `SiteModelStore`, turns it into the card view-model with the shared adapter, and
// mounts the element `parcelCard.ts` produces — the same element the map overlay mounts.
// That is the §GIS-ENVELOPE-REHOST (L-1362, C06 §13.3) pattern: the panel is a HOST, the
// producer is the AUTHORITY. Hand-writing a second parcel card here would give this app
// two GIS surfaces that can disagree about whether a ring is a legal cadastral parcel —
// the same failure the envelope re-host cites, with a legal consequence attached.
//
// ── THREE STATES, THREE DIFFERENT SENTENCES ─────────────────────────────────────
//
// The section refuses to collapse these, because they call for opposite responses:
//
//   1. NO SITE / NO COMMITTED BOUNDARY  → `PARCEL_NO_BOUNDARY_TEXT` ("nothing selected yet").
//   2. BOUNDARY COMMITTED, PROVENANCE `null` → `PARCEL_PROVENANCE_ABSENT_TEXT`
//      ("not recorded — and here is why"). This is EVERY project that predates §L-1580,
//      because `dispatchParcelBoundary` had no provenance parameter to record.
//   3. PROVENANCE PRESENT → the full card, footprint banner and area basis intact.
//
// State 2 is the one that must never render as a blank card or as zeros (C84 EI-1b), and
// it is the state the founder's existing projects are all in.
//
// ── LIVE, NOT A SNAPSHOT ────────────────────────────────────────────────────────
//
// Unlike `renderGisActions` (which reads `pryzmGetSiteViewState()` once and says so), this
// section SUBSCRIBES to the site store. A parcel committed while the panel is open must
// not leave a stale "not recorded" sentence on screen asserting a fact that stopped being
// true. The subscription is torn down by the returned handle, and re-entrancy is guarded
// by re-reading the store on every notification rather than caching a model.

// ── §L-1583 — WHY THERE IS NO "RE-RESOLVE PROVENANCE" BUTTON ────────────────────
//
// The obvious affordance for state 2 is a button that re-queries the cadastre at the
// committed parcel's centroid and stamps whatever comes back. `reapplyZoningForActiveSite`
// (siteDispatch.ts) is the precedent — it re-runs ZONING against an already-committed
// boundary without touching geometry — and the query point is already derivable
// (`deriveParcelQueryLatLon`). It was designed and then REFUSED, for a reason worth
// recording rather than rediscovering:
//
//   A re-resolve cannot establish that the parcel it fetches IS the parcel that was
//   committed. It fetches whatever the cadastre publishes at a point INSIDE the stored
//   ring — which, for a HAND-DRAWN boundary (indistinguishable from a legacy cadastral
//   one, because that is precisely the ambiguity state 2 names), is the neighbouring legal
//   parcel that the user's freehand outline happens to sit on. Stamping `kind: 'cadastral'`
//   + a referencia catastral onto a ring the user drew is a FALSE PROVENANCE record: it
//   would read identically to a real one, and it would attach a legal identifier to
//   geometry no authority ever published. That is a strictly worse outcome than the honest
//   "not recorded" this section shows, and it is the exact failure C57 §1.4/§1.5 exist to
//   prevent (cf. §L-616: an unknown drawn as a fact is an overstatement on real land).
//
//   An AREA-agreement guard is not sufficient. Area is rotation- and shape-blind: two
//   different rings of the same size pass it. The guard that WOULD be sufficient is ring
//   IDENTITY — project the fetched WGS84 ring through `buildBoundaryFromLatLonRing` about
//   the SAME origin, apply the SAME `location.trueNorth`, and require a bounded per-vertex
//   correspondence (a Hausdorff distance under the publisher's own coordinate quantum,
//   0.111 m for Catastro per C57 §1.11.1). Until that exists, a re-resolve is a guess.
//
// The route the absent card names instead — re-select the plot on the 2D map — is safe by
// construction: it commits the ring and its provenance in ONE command (§L-1580), so the
// attribution always describes the geometry it arrived with. That is the invariant a
// re-resolve would be the only way to break.

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { SiteModel } from '@pryzm/schemas';
import {
    buildParcelCard,
    parcelProvenanceToCardModel,
    PARCEL_NO_BOUNDARY_TEXT,
    PARCEL_PROVENANCE_ABSENT_TEXT,
    type ParcelCardAction,
    type ParcelCardDetailFold,
    type ParcelCardExtraFact,
    type ParcelCardRowHighlight,
} from './parcelCard.js';
// §26.6 rule 2 (L-13046) — the state-2 area row below is built by hand in this file; its label
// takes the SAME control the card's own rows take, from the ONE builder, so a parcel whose
// provenance was never recorded still has a hyperlinked area.
import { getSiteHighlight } from '../siteGeometryHighlight.js';
import { buildSiteHighlightLabelEl } from '../siteHighlightRowControl.js';
// §L-1585 — the button below dispatches a DECLARED registry action, never a hand-written
// handler. §GIS-ACTION-REGISTRY (L-1187): "A panel is a HOST; the action is the AUTHORITY."
import {
    GIS_ACTIONS,
    resolveGisAction,
    type GisCapabilityHost,
} from '../../gis/gisActionRegistry.js';

/** `data-testid` on the slot the GIS panel offers. */
export const GIS_PARCEL_SLOT_TESTID = 'gis-parcel-slot';

/** Torn down by the panel when the section is rebuilt or the rail closes. */
export interface ParcelSectionHandle {
    readonly element: HTMLElement;
    dispose(): void;
}

/** The minimal store surface this section reads. Structural, so a test needs no runtime. */
interface SiteStoreLike {
    getSite(): SiteModel | null;
    subscribe?(listener: () => void): () => void;
}

function resolveSiteStore(runtime: PryzmRuntime | null | undefined): SiteStoreLike | null {
    // Mirrors the resolution `ProjectSerializer` had to learn the hard way (§L-545): the
    // store is a PER-RUNTIME instance, and the ambient `window.runtime` is not always the
    // one the caller holds. Try the caller's first, then the ambient one — and take the
    // first that actually exists rather than assuming either.
    const fromArg = (runtime as unknown as { siteModelStore?: SiteStoreLike } | null | undefined)?.siteModelStore;
    if (fromArg && typeof fromArg.getSite === 'function') return fromArg;
    const ambient = (typeof window !== 'undefined')
        ? (window as unknown as { runtime?: { siteModelStore?: SiteStoreLike } }).runtime?.siteModelStore
        : undefined;
    return (ambient && typeof ambient.getSite === 'function') ? ambient : null;
}

/**
 * §ONE-PARCEL-BLOCK (L-13005) — the ring measurements a host contributes to the card, plus
 * the one attribution line that says how they were measured.
 *
 * The section itself derives NONE of this: it is a pass-through from the host that already
 * holds the `ParcelLawModel` to the ONE card producer. Keeping it a value (rather than a
 * second reader inside this file) is what stops the section acquiring a second model.
 */
export interface ParcelSectionExtras {
    readonly facts: readonly ParcelCardExtraFact[];
    readonly note?: string;
    /**
     * §26.6 rule 2 (L-13046) — the host's decision that the card's OWN area row(s) are the
     * parcel hyperlink. Passed through to `buildParcelCard`; never decided here.
     */
    readonly areaHighlight?: ParcelCardRowHighlight;
    /**
     * §STAGE-01-DENSITY (C115 §1.4 `C115-111`) — the host rows that belong to the TECHNICAL
     * half: rendered inside the *"View full parcel data"* disclosure when `detailFold` is
     * supplied, and inline directly after `facts` when it is not.
     *
     * ⛔ A PLACEMENT FIELD, NOT A FILTER. `C115-40` forbids row-level withholding, and this
     * section withholds nothing: a host that supplies no fold gets every row it always got, in
     * the order it always got them.
     */
    readonly detailFacts?: readonly ParcelCardExtraFact[];
    /**
     * §STAGE-01-DENSITY (C115 §1.4 `C115-111` · §11 `C115-93`) — the disclosure itself, when
     * the host wants one. Supplied today only by the Parcel Law panel, whose section ① the
     * founder asked to make smaller; the GIS rail section, the PARCEL rail panel and the 2D map
     * overlay pass none and render the flat card unchanged.
     */
    readonly detailFold?: ParcelCardDetailFold;
}

/**
 * §L-1582 — build the parcel card for whatever the store currently holds.
 *
 * Exported separately from `mountParcelSection` so a test can drive the THREE states
 * against a plain object store, with no rail, no runtime and no DOM lifecycle — the
 * subject under test is which card gets produced for which store state.
 *
 * `extras` (§ONE-PARCEL-BLOCK, L-13005) is optional and defaults to nothing, so every
 * existing caller — the GIS section, the rail panel, and this repo's five specs over this
 * function — renders exactly the card it rendered before.
 */
export function buildParcelSectionBody(
    site: SiteModel | null,
    actions: readonly ParcelCardAction[] = [],
    extras?: ParcelSectionExtras | null,
): HTMLElement {
    const extraFacts = extras?.facts ?? [];
    const extraFactsNote = extras?.note;
    const areaHighlight = extras?.areaHighlight;
    // §STAGE-01-DENSITY (C115 §1.4 `C115-111`) — pass-through only. This section decides nothing
    // about what is technical and nothing about what a fold says: the host that holds the model
    // decides, the ONE card producer typesets. Undefined for every host but the Parcel Law panel.
    const detailFacts = extras?.detailFacts ?? [];
    const detailFold = extras?.detailFold;
    const polygon = site?.parcel?.boundary?.polygon;
    const hasBoundary = Array.isArray(polygon) && polygon.length >= 3;
    if (!site || !hasBoundary) {
        return buildParcelCard(null, {
            absentText: PARCEL_NO_BOUNDARY_TEXT, actions, extraFacts, extraFactsNote, detailFacts,
        });
    }

    const provenance = site.parcel.provenance ?? null;
    if (!provenance) {
        // STATE 2 — the ring is real, its attribution was never recorded. Say exactly that.
        // The committed AREA is still a fact we hold, so it is shown; what is unknown is
        // where the ring came from, not how big it is. Showing the area here is not a
        // softening of the absence — the absence sentence sits directly above it.
        const card = buildParcelCard(null, {
            absentText: PARCEL_PROVENANCE_ABSENT_TEXT, actions, extraFacts, extraFactsNote, detailFacts,
        });
        const area = site.parcel.area;
        if (Number.isFinite(area) && area > 0) {
            const row = document.createElement('div');
            row.className = 'pryzm-parcel-card-row';
            const k = document.createElement('span');
            k.className = 'pryzm-parcel-card-key';
            // §26.6 rule 2 — the ring is real even when its attribution is not, so the area on
            // this arm is a hyperlink to it exactly as on the full card.
            if (areaHighlight) {
                k.appendChild(buildSiteHighlightLabelEl(
                    'Area (from ring)',
                    areaHighlight.subject,
                    areaHighlight.availability,
                    getSiteHighlight() === areaHighlight.subject,
                ));
            } else {
                k.textContent = 'Area (from ring)';
            }
            const v = document.createElement('span');
            v.className = 'pryzm-parcel-card-val';
            v.textContent = `${Math.round(area)} m²`;
            row.appendChild(k); row.appendChild(v);
            card.appendChild(row);
        }
        return card;
    }

    return buildParcelCard(
        parcelProvenanceToCardModel(provenance, site.parcel.area),
        { actions, extraFacts, extraFactsNote, areaHighlight, detailFacts, detailFold },
    );
}

/**
 * §L-1585 — THE BUTTON. Founder, 2026-08-20: *"just bring visible AGAIN VIA BUTTON ON THE
 * GIS PANEL!"*
 *
 * What he is asking for is a way to GET the card back, not merely a place where it would
 * appear if data happened to exist. A section whose only content is "provenance not
 * recorded", with nothing to press, is the L-942 shape: a refusing branch whose escape
 * hatch was never built. So the section always carries ONE labelled affordance, and it is
 * the same one in all three states, because there is exactly one route that obtains this
 * data — select the plot on the 2D map, which commits the ring and its provenance together
 * (§L-1580).
 *
 * ⛔ IT IS NOT A NEW CAPABILITY AND NOT A HAND-WRITTEN HANDLER. It resolves the DECLARED
 * `site.map-2d` action out of `GIS_ACTIONS` and dispatches that. If its entry point is not
 * registered, `resolveGisAction` returns null and the button renders DISABLED with the
 * reason shown — the registry's honest-unavailability rule (L-1187), not a live-looking
 * button that does nothing. That is the rule the founder has already been bitten by.
 */
export function buildOpenMapAction(host: GisCapabilityHost): ParcelCardAction {
    const decl = GIS_ACTIONS.find((a) => a.id === 'site.map-2d');
    const dispatch = decl ? resolveGisAction(decl, host) : null;
    if (!dispatch) {
        return {
            label: 'Select parcel on the 2D map',
            testId: 'parcel-open-map-btn',
            variant: 'primary',
            disabled: true,
            title:
                'The 2D map is not available from here right now — its entry point '
                + '(pryzmEnterSiteView) is not registered in this session. Open the site view first.',
            onClick: () => { /* unavailable — see title */ },
        };
    }
    return {
        label: 'Select parcel on the 2D map',
        testId: 'parcel-open-map-btn',
        variant: 'primary',
        title:
            'Open the 2D map in parcel-select mode. Selecting a plot records its cadastral '
            + 'reference, address, area and source alongside the boundary.',
        onClick: dispatch,
    };
}

/**
 * Options for `mountParcelSection`. Every field is optional and every default is the
 * behaviour this function had before the field existed, so the GIS section, the rail panel
 * and `ProjectBrowserPanel` are untouched by their addition.
 */
export interface MountParcelSectionOptions {
    /**
     * §ONE-PARCEL-BLOCK (L-13005) — the host's ring measurements, read AT EACH RENDER.
     *
     * ⚠ A THUNK, NOT AN ARRAY, AND THAT IS THE WHOLE POINT. This section re-renders the card
     * on every site-store notification. A snapshot captured at mount would leave the
     * measured rows frozen while the identity rows around them refreshed — one block showing
     * two vintages of one parcel, which is the failure the merge exists to remove rather than
     * a cosmetic one. The thunk is called inside `render()`, so both halves are read on the
     * same pass.
     */
    readonly extraFacts?: () => ParcelSectionExtras | null;
    /**
     * §SELECT-PARCEL-IS-A-VIEW-ACTION (L-13004) — the actions the card carries.
     *
     * Defaults to `[buildOpenMapAction(window)]`, which is what the GIS section and the rail
     * panel want and what `parcelProvenanceRehost.test.ts` pins. A host whose surface already
     * offers the route ON THE VIEW passes `() => []` so the panel does not carry a second
     * copy of a control that belongs elsewhere. ⛔ Passing `() => []` REMOVES A COPY, never
     * the route (C19 §5.6 clause 4) — the caller is responsible for the route existing
     * somewhere the user can reach.
     */
    readonly actions?: (host: GisCapabilityHost) => readonly ParcelCardAction[];
}

/**
 * §L-1582 — mount the parcel data section into a host element supplied by the GIS panel.
 *
 * Returns a handle whose `dispose()` drops the store subscription. Never throws into the
 * panel build: a rail panel that cannot build is a rail panel the founder cannot open, and
 * the whole point of this change is reachability.
 */
export function mountParcelSection(
    host: HTMLElement,
    runtime: PryzmRuntime | null | undefined,
    opts: MountParcelSectionOptions = {},
): ParcelSectionHandle {
    const store = resolveSiteStore(runtime);
    let unsub: (() => void) | null = null;

    const render = (): void => {
        try {
            // §L-1585 — `window` is the capability host, exactly as the GIS action rows
            // use it: the entry points are the typed `window.pryzm*` globals GISAreaLayout
            // registers at boot (globals.d.ts).
            const capabilityHost = (typeof window !== 'undefined' ? window : {}) as unknown as GisCapabilityHost;
            const actions = opts.actions
                ? opts.actions(capabilityHost)
                : [buildOpenMapAction(capabilityHost)];
            // §ONE-PARCEL-BLOCK — read on the SAME pass as the store, never captured at mount.
            let extras: ParcelSectionExtras | null = null;
            try {
                extras = opts.extraFacts?.() ?? null;
            } catch (e) {
                // A host whose measurements threw gets a card without them, not no card at
                // all — the rows it contributes are additive to an answer that already stands.
                console.warn('[gis][parcel-section] §ONE-PARCEL-BLOCK extra facts failed (non-fatal):', e);
            }
            host.replaceChildren();
            host.appendChild(buildParcelSectionBody(store?.getSite() ?? null, actions, extras));
        } catch (e) {
            console.warn('[gis][parcel-section] §L-1582 render failed (non-fatal):', e);
        }
    };

    render();

    if (store?.subscribe) {
        try {
            unsub = store.subscribe(() => {
                // Re-read the store rather than trusting the notification's payload: the
                // section's whole job is to report what is COMMITTED, and the store is the
                // only thing that knows that.
                if (!host.isConnected) return;
                render();
            });
        } catch (e) {
            console.warn('[gis][parcel-section] §L-1582 subscribe failed — the section will not live-update:', e);
        }
    } else {
        console.warn(
            '[gis][parcel-section] §L-1582 — no SiteModelStore subscription available; the '
            + 'section shows the state at the moment the panel was opened and will not update.',
        );
    }

    return {
        element: host,
        dispose(): void {
            try { unsub?.(); } catch { /* teardown is best-effort */ }
            unsub = null;
        },
    };
}
