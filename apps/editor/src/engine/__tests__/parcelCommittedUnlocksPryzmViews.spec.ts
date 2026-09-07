/**
 * §PARCEL-COMMITTED-IS-ONE-FACT (L-13086) — the PRYZM views unlock on the COMMITTED
 * BOUNDARY, however the ring arrived.
 *
 * THE FOUNDER'S REPORT (2026-09-07), with the pane switcher open and his own console
 * reading `site.parcel-boundary-set … area 802.7 m² provenance=cadastral/catastro
 * refcat=3332402DF3833C`:
 *
 *   > "pLEASE AS SOON AS THE PARCEL IS SELECTED ENABLE THE USER TO GO TO PRYZM 3D AND
 *   >  PRYZM 2D VIEWS"
 *
 * `2D PRYZM` was greyed, printing the draw-surface pin's own sentence — *"it stays on
 * screen until you have drawn one or skipped drawing"* — a condition he had already met.
 *
 * ⛔ THE ASYMMETRY THIS FILE EXISTS TO RULE OUT, AND THE ANSWER IT RECORDS. The suspected
 * root cause was that a CADASTRAL SELECT takes a different route from a free DRAW and never
 * reaches whatever the unlock listens to. MEASURED: it is not — both routes end at
 * `SiteBoundaryMap2D.commit()` → `dispatchParcelBoundary`, which emits ONE
 * `site.parcel-boundary-set` and writes the SAME `parcel.boundary.polygon`. The defect was
 * that the pin asked NEITHER: its only release was the end of the whole wizard. So the arms
 * below assert the unlock is **route-blind by construction** — it reads the committed ring,
 * never a provenance, a flag or a gesture — because that is the property that stops the two
 * routes drifting apart the next time one of them changes.
 *
 * ⚠ ASSERTED AT THE MODEL, NOT AT THE BUTTON, for the same reason
 * `onboardingDrawSurfacePinned.spec.ts` gives: three surfaces can move a view and
 * `PaneLayoutStore.dispatch` is the ONE seam they all cross. A test that only proved a
 * button was enabled would prove the founder's instance fixed and the class still open.
 */

import { describe, it, expect } from 'vitest';

import {
    DRAW_SURFACE_PIN_REASON,
    isParcelBoundaryCommittedInModel,
    shouldPinDrawSurface,
    type ParcelStoreHolder,
} from '../views/siteAuthoringPaneDecisions';
import { LEFT_PANE, RIGHT_PANE, type PaneLayout, type RendererKind } from '../views/paneViewModel';
import { PaneLayoutStore } from '../views/paneLayoutStore';
import { describeSiteViewQuickToggle, segmentClickIntents } from '../views/siteViewQuickToggleModel';
import { describePaneViewOptions } from '../views/paneViewOptions';

const MAP = 'site-map-2d' as const;
const SITE3D = 'site-3d' as const;
const PLAN = 'bim-plan-2d' as const;

/** Every renderer the site-authoring shell registers a mounter for. */
const MOUNTABLE: ReadonlySet<RendererKind> = new Set<RendererKind>([
    'maplibre',
    'cesium',
    'canvas2d',
]);

/** The onboarding default: 2D map LEFT, live 3D Site RIGHT. */
function splitLayout(): PaneLayout {
    return { [LEFT_PANE]: MAP, [RIGHT_PANE]: SITE3D };
}

/** A runtime holder whose site store answers with `site`. */
function holder(site: unknown): ParcelStoreHolder {
    return { siteModelStore: { getSite: () => site } };
}

/** A ring of `n` vertices — the only thing the unlock actually reads. */
function ring(n: number): Array<{ x: number; z: number }> {
    return Array.from({ length: n }, (_, i) => ({ x: i, z: i }));
}

/** A Site whose parcel carries `polygon`, plus whatever provenance the caller wants. */
function siteWith(polygon: Array<{ x: number; z: number }>, extra: Record<string, unknown> = {}) {
    return { parcel: { boundary: { polygon, edgeClassifications: [] }, ...extra } };
}

describe('§PARCEL-COMMITTED-IS-ONE-FACT — reading the committed boundary', () => {
    it('is FALSE with no runtime, no store, and a store that throws', () => {
        expect(isParcelBoundaryCommittedInModel(null, null)).toBe(false);
        expect(isParcelBoundaryCommittedInModel({}, {})).toBe(false);
        expect(
            isParcelBoundaryCommittedInModel(
                { siteModelStore: { getSite: () => { throw new Error('store is mid-rebuild'); } } },
                null,
            ),
        ).toBe(false);
    });

    it('⭐ is FALSE for the `ensureSite()` SEED — a Site exists but no plot does', () => {
        // ⛔ THE TRAP THIS ARM GUARDS. `isSiteCommittedInModel` is TRUE here: "Draw it on the
        // map" with no location calls `ensureSite()`, which seeds a Site with an EMPTY
        // polygon on purpose. Releasing the pin on THAT reading would unpin the draw map at
        // STEP 2 — before any plot is drawn — which is the exact dead end L-10720 closed.
        expect(isParcelBoundaryCommittedInModel(holder(siteWith([])), null)).toBe(false);
        // A degenerate ring is not a plot either.
        expect(isParcelBoundaryCommittedInModel(holder(siteWith(ring(2))), null)).toBe(false);
    });

    it('is TRUE once the ring closes real land (3+ vertices)', () => {
        expect(isParcelBoundaryCommittedInModel(holder(siteWith(ring(3))), null)).toBe(true);
        expect(isParcelBoundaryCommittedInModel(holder(siteWith(ring(6))), null)).toBe(true);
    });

    it('⭐ THE ASYMMETRY ARM — a CADASTRAL commit and a DRAWN commit read IDENTICALLY', () => {
        // The founder's own parcel: `provenance = cadastral/catastro`, `refcat` present.
        const cadastral = holder(
            siteWith(ring(5), {
                provenance: { kind: 'cadastral', source: 'catastro', refcat: '3332402DF3833C' },
                areaM2: 802.7,
            }),
        );
        // The same plot as a free-hand drawing: no provenance, no refcat.
        const drawn = holder(siteWith(ring(5)));

        expect(isParcelBoundaryCommittedInModel(cadastral, null)).toBe(true);
        expect(isParcelBoundaryCommittedInModel(drawn, null)).toBe(true);
        // ⛔ AND THE READ IS BLIND TO WHAT SEPARATES THEM. Not "both happen to be true" —
        // the same ring under a THIRD, unknown provenance must answer the same, which is
        // what makes this route-blind by construction rather than by enumeration.
        expect(
            isParcelBoundaryCommittedInModel(
                holder(siteWith(ring(5), { provenance: { kind: 'some-future-importer' } })),
                null,
            ),
        ).toBe(true);
    });

    it('⭐ reads the WINDOW holder when the captured runtime is null (L-13002 discipline)', () => {
        // The live boot path is `createMainLayout(props, null)`, so the captured runtime is
        // null and the commit landed against `window.runtime`. A captured-only read answers
        // `false` on every production session — the sixth recurrence of that shape.
        expect(isParcelBoundaryCommittedInModel(null, holder(siteWith(ring(4))))).toBe(true);
        expect(isParcelBoundaryCommittedInModel({}, holder(siteWith(ring(4))))).toBe(true);
        // A captured holder that answers "no plot" must not veto the window holder that has one.
        expect(
            isParcelBoundaryCommittedInModel(holder(siteWith([])), holder(siteWith(ring(4)))),
        ).toBe(true);
    });
});

describe('§PARCEL-COMMITTED-IS-ONE-FACT — whether the pin is taken at all', () => {
    it('pins only while the guided flow runs AND no plot exists', () => {
        expect(shouldPinDrawSurface({ onboardingGlobePhase: true, parcelCommitted: false })).toBe(true);
    });

    it('⭐ does NOT pin over a plot that already exists', () => {
        // Re-entering the site, or `paneLayoutForPreset('parcel-law')`: taking a pin here
        // would refuse choices for a condition already met — the founder's complaint, one
        // mount earlier.
        expect(shouldPinDrawSurface({ onboardingGlobePhase: true, parcelCommitted: true })).toBe(false);
    });

    it('never pins outside the guided flow', () => {
        expect(shouldPinDrawSurface({ onboardingGlobePhase: false, parcelCommitted: false })).toBe(false);
        expect(shouldPinDrawSurface({ onboardingGlobePhase: false, parcelCommitted: true })).toBe(false);
    });
});

describe('§PARCEL-COMMITTED-IS-ONE-FACT — the copy tells the truth about both routes', () => {
    it('⭐ names the cadastral route, not only the drawn one', () => {
        // ⚠ A note that still says "until you have drawn one" AFTER the user PICKED his plot
        // off the cadastre is worse than no note: it reads as a refusal for a condition he
        // has met. The founder's own instruction was to keep the honesty and make it true.
        expect(DRAW_SURFACE_PIN_REASON).toContain('cadastre');
        expect(DRAW_SURFACE_PIN_REASON).toContain('drawn');
        expect(DRAW_SURFACE_PIN_REASON).toContain('skip');
    });
});

describe('§PARCEL-COMMITTED-IS-ONE-FACT — 2D PRYZM in a pane, before and after the commit', () => {
    /** The store as the split mounts it while the pin is live. */
    function pinnedStore(): { store: PaneLayoutStore; release: () => void } {
        const store = new PaneLayoutStore(splitLayout());
        const release = store.pinView(MAP, DRAW_SURFACE_PIN_REASON);
        return { store, release };
    }

    function planRow(store: PaneLayoutStore) {
        return describeSiteViewQuickToggle({
            layout: store.getLayout(),
            paneId: LEFT_PANE,
            canRestoreSplit: false,
            mountableKinds: MOUNTABLE,
            pinnedViews: store.pinnedViews(),
        }).segments.find((s) => s.optionId === 'pryzm-2d')!;
    }

    it('BEFORE the commit the row is refused, and the refusal is the pin sentence', () => {
        const { store } = pinnedStore();

        const row = planRow(store);
        expect(row.viewType).toBe(PLAN);
        expect(row.enabled).toBe(false);
        expect(row.reason).toBe(DRAW_SURFACE_PIN_REASON);
        // Refused at the STORE too, so a programmatic caller meets the same answer.
        expect(store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: PLAN }).ok)
            .toBe(false);
    });

    it('⭐ AFTER the commit releases the pin, 2D PRYZM is selectable and the click assigns it', () => {
        const { store, release } = pinnedStore();

        // This is what the `site.parcel-boundary-set` subscription does, and it does it for
        // a cadastral SELECT and a free DRAW alike — one event, one release.
        release();

        const row = planRow(store);
        expect(row.enabled).toBe(true);
        expect(row.reason).toBeUndefined();
        expect(segmentClickIntents(row, store.getLayout())).toEqual([
            { type: 'view.pane.assign', paneId: LEFT_PANE, viewType: PLAN },
        ]);
        // And the store now accepts it — the model and the seam agree.
        expect(store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: PLAN }).ok)
            .toBe(true);
        expect(store.getLayout()[LEFT_PANE]).toBe(PLAN);
    });

    it('the registry option list agrees with the panel row in both states', () => {
        // ⛔ TWO SURFACES, ONE ANSWER. `describePaneViewOptions` is the "More views" list and
        // the adjudicator the panel itself calls; if these could disagree the founder would
        // meet an enabled row in one control and a greyed one in the other.
        const { store, release } = pinnedStore();
        const before = describePaneViewOptions({
            layout: store.getLayout(),
            paneId: LEFT_PANE,
            mountableKinds: MOUNTABLE,
            pinnedViews: store.pinnedViews(),
        }).find((o) => o.viewType === PLAN)!;
        expect(before.enabled).toBe(false);
        expect(before.reason).toBe(DRAW_SURFACE_PIN_REASON);

        release();

        const after = describePaneViewOptions({
            layout: store.getLayout(),
            paneId: LEFT_PANE,
            mountableKinds: MOUNTABLE,
            pinnedViews: store.pinnedViews(),
        }).find((o) => o.viewType === PLAN)!;
        expect(after.enabled).toBe(true);
        expect(after.state).toBe('available');
    });

    it('⛔ releasing the pin does NOT disable anything that was live before it', () => {
        // The pin only ever ADDED refusals. Releasing it must not change the 3D Site row,
        // which was available throughout — a regression here would trade one dead end for
        // another.
        const { store, release } = pinnedStore();
        const site3dBefore = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            paneId: RIGHT_PANE,
            canRestoreSplit: false,
            mountableKinds: MOUNTABLE,
            pinnedViews: store.pinnedViews(),
        }).segments.find((s) => s.optionId === 'site-3d')!;
        release();
        const site3dAfter = describeSiteViewQuickToggle({
            layout: store.getLayout(),
            paneId: RIGHT_PANE,
            canRestoreSplit: false,
            mountableKinds: MOUNTABLE,
            pinnedViews: store.pinnedViews(),
        }).segments.find((s) => s.optionId === 'site-3d')!;
        expect(site3dBefore.enabled).toBe(true);
        expect(site3dAfter.enabled).toBe(true);
    });
});
