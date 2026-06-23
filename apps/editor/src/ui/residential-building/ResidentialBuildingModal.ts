// Residential building (multi-family) — "Choose a residential building" modal
// DOM controller (P3.3). The SIBLING of `HouseLayoutModal`, but far simpler: a
// residential building is ONE deterministic result with N floors, so there is no
// variant grid + no live program-edit form here (the inputs are gathered before
// the modal opens). The user reviews the per-floor preview and either builds it
// or cancels.
//
// Thin DOM shell over the pure builders: mounts a transient overlay
// (document.body.appendChild — NOT PanelManager), renders one plan thumbnail per
// placed apartment via the apartment `buildLayoutThumbnailSvg`, and dismisses on
// Build / Cancel / overlay-click / Escape. Reuses the apartment modal's
// `alm-overlay`/`alm-panel` brand classes (white + #6600FF, z-index 4000); the
// per-tile `rb-*` CSS is injected once on first open.

import type { ResidentialBuildingOk, PlacedApartment } from '@pryzm/ai-host';
import { buildResidentialCardModel, type ResidentialCardModel } from './residentialCardModel.js';
import { buildResidentialModalHtml, RESIDENTIAL_MODAL_STYLES } from './residentialModalHtml.js';
import {
    type FriendlyResidentialError,
    buildResidentialErrorModalHtml,
} from './residentialError.js';
import { buildLayoutThumbnailSvg, type ThumbnailOptions } from '../apartment-layout/layoutThumbnail.js';

export interface ResidentialBuildingModalCallbacks {
    /** User pressed "Build this building". */
    readonly onBuild: () => void;
    /** User cancelled (Cancel / overlay click / Escape). */
    readonly onCancel: () => void;
}

export interface ResidentialErrorModalCallbacks {
    /** User dismissed the error (OK / overlay click / Escape). */
    readonly onDismiss: () => void;
    /** OPTIONAL — user pressed "Adjust inputs" (shown only when wired). */
    readonly onAdjust?: () => void;
}

const STYLE_ID = 'pryzm-residential-modal-styles';

export class ResidentialBuildingModal {
    private _el: HTMLDivElement | null = null;
    private _escHandler: ((e: KeyboardEvent) => void) | null = null;

    get isOpen(): boolean { return this._el !== null; }

    /** Render the orchestrator result as a per-floor preview. Replaces any open
     *  instance. No-op DOM injection of the scoped CSS on first call. */
    show(result: ResidentialBuildingOk, cb: ResidentialBuildingModalCallbacks): void {
        this.dismiss();
        this._ensureStyles();

        const card = buildResidentialCardModel(result);
        const floorThumbs = this._floorThumbs(card);

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML = buildResidentialModalHtml(card, floorThumbs);

        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target === overlay) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('.alm-cancel')) { this.dismiss(); cb.onCancel(); return; }
            if (target.closest('[data-action="build"]')) { this.dismiss(); cb.onBuild(); return; }
        });

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onCancel(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
        console.log(
            '[resi-building] modal mounted to <body> —',
            card.floorCount, 'floor(s),', card.totalApartments, 'apartment(s),',
            card.totalRejected, 'rejected; overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)',
        );
    }

    /** Render an ERROR / rejection state in the SAME brand shell (white + #6600FF
     *  with the established `.alm-notice--rejected` error token). Replaces any open
     *  instance. The user gets a clear title, the friendly reason + actionable
     *  guidance, and a single OK dismiss (plus an optional "Adjust inputs"). */
    showError(err: FriendlyResidentialError, cb: ResidentialErrorModalCallbacks): void {
        this.dismiss();
        this._ensureStyles();

        const overlay = document.createElement('div');
        overlay.className = 'alm-overlay';
        overlay.innerHTML = buildResidentialErrorModalHtml(err, { withAdjust: typeof cb.onAdjust === 'function' });

        overlay.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (target === overlay) { this.dismiss(); cb.onDismiss(); return; }
            if (target.closest('[data-action="adjust"]')) { this.dismiss(); cb.onAdjust?.(); return; }
            if (target.closest('[data-action="dismiss-error"]')) { this.dismiss(); cb.onDismiss(); return; }
        });

        this._escHandler = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') { this.dismiss(); cb.onDismiss(); }
        };
        window.addEventListener('keydown', this._escHandler, { capture: true });

        document.body.appendChild(overlay);
        this._el = overlay;
        console.log(
            '[resi-building] error modal mounted to <body> — kind', err.kind,
            '· overlay z-index', getComputedStyle(overlay).zIndex || '(unstyled — alm- CSS missing?)',
        );
    }

    /** Remove the overlay + listeners. Idempotent. */
    dismiss(): void {
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler, { capture: true } as EventListenerOptions);
            this._escHandler = null;
        }
        if (this._el) { this._el.remove(); this._el = null; }
    }

    private _ensureStyles(): void {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = RESIDENTIAL_MODAL_STYLES;
        document.head.appendChild(style);
    }

    /** Per-floor → per-apartment thumbnail SVG strings. A rejected apartment gets
     *  '' (the HTML builder draws the hatched box instead). Each placed apartment's
     *  thumbnail fits to its OWN cell bounds (the cell is the apartment's plate). */
    private _floorThumbs(card: ResidentialCardModel): string[][] {
        return card.floors.map(floor =>
            floor.apartments.map(a => (a.status === 'ok' ? this._apartmentThumb(a.apt) : '')),
        );
    }

    /** Render one placed apartment's plan thumbnail. The cell layout's walls/rooms
     *  are in the cell's world-mm frame, so the thumbnail fits to the cell bounds
     *  (mm) for a consistent scale across the floor. */
    private _apartmentThumb(apt: PlacedApartment): string {
        const layout = apt.layout;
        if (!layout) return '';
        const cell = apt.cell.rect;
        // mm plan frame: plan-x = world-x × 1000, plan-y = world-z × 1000.
        const boundsMm = {
            minX: cell.x0 * 1000, maxX: cell.x1 * 1000,
            minY: cell.z0 * 1000, maxY: cell.z1 * 1000,
        };
        const perimeterRingMm = [
            { x: cell.x0 * 1000, y: cell.z0 * 1000 },
            { x: cell.x1 * 1000, y: cell.z0 * 1000 },
            { x: cell.x1 * 1000, y: cell.z1 * 1000 },
            { x: cell.x0 * 1000, y: cell.z1 * 1000 },
        ];
        const opts: ThumbnailOptions = {
            background: '#ffffff', width: 220, height: 150,
            boundsMm,
            perimeterRingMm,
        };
        try {
            return buildLayoutThumbnailSvg(layout, opts);
        } catch (e) {
            console.warn('[resi-building] thumbnail render failed (skipped):', e);
            return '';
        }
    }
}
