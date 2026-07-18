// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59) — PURE decision tests for the
// site-authoring two-pane layout. These pin the founder-visible behaviour WITHOUT a
// live SplitViewManager (OBC.World + THREE) or Cesium viewer:
//   Req 1 — during SITE authoring the legacy Canvas2D plan pane's project-load
//           auto-open is SUPPRESSED → exactly two panes (2D map + 3D Site); after site
//           authoring ends the suppression lifts and the plan pane can re-open.
//   Req 2 — the paned 3D Site FRAMES the plot ONCE on the first parcel-boundary commit
//           (no whole-city zoom-out), then falls back to the no-re-fly path (no jitter).

import { describe, it, expect } from 'vitest';
import {
    shouldAutoOpenSplitView,
    shouldFramePanedSiteOnUpdate,
    PARCEL_BOUNDARY_SET_EVENT,
} from '../views/siteAuthoringPaneDecisions';

describe('§L-412 Req 1 — legacy plan-pane auto-open vs the site-authoring split', () => {
    it('auto-opens on a fresh project load (not active, not suppressed)', () => {
        expect(shouldAutoOpenSplitView({ isActive: false, autoOpenSuppressed: false })).toBe(true);
    });

    it('does NOT auto-open while the site-authoring split has suppressed it', () => {
        // The site-authoring split is mounted → exactly two panes; the redundant
        // Canvas2D plan pane must stay OFF.
        expect(shouldAutoOpenSplitView({ isActive: false, autoOpenSuppressed: true })).toBe(false);
    });

    it('does NOT re-open when it is already active (idempotent)', () => {
        expect(shouldAutoOpenSplitView({ isActive: true, autoOpenSuppressed: false })).toBe(false);
    });

    it('wins the idle-callback race: suppression set AFTER scheduling still blocks the open', () => {
        // At schedule time the split had not mounted yet → would have opened.
        const atScheduleTime = { isActive: false, autoOpenSuppressed: false };
        expect(shouldAutoOpenSplitView(atScheduleTime)).toBe(true);
        // Between schedule and fire, the site-authoring split mounts + suppresses.
        const atFireTime = { isActive: false, autoOpenSuppressed: true };
        // Because the guard is re-evaluated at FIRE time, the plan pane stays closed.
        expect(shouldAutoOpenSplitView(atFireTime)).toBe(false);
    });

    it('after site authoring ends the suppression lifts → the plan pane can re-open', () => {
        // unmountSiteAuthoringPanes() → allowAutoOpen() clears the flag.
        expect(shouldAutoOpenSplitView({ isActive: false, autoOpenSuppressed: false })).toBe(true);
    });
});

describe('§L-412 Req 2 — paned 3D Site frames the plot ONCE on the first commit', () => {
    const base = { source: PARCEL_BOUNDARY_SET_EVENT, site3dPaned: true, alreadyFramed: false };

    it('frames on the FIRST parcel-boundary commit into a live pane', () => {
        expect(shouldFramePanedSiteOnUpdate(base)).toBe(true);
    });

    it('does NOT re-frame on subsequent parcel commits (already framed) — no jitter', () => {
        expect(shouldFramePanedSiteOnUpdate({ ...base, alreadyFramed: true })).toBe(false);
    });

    it('does NOT frame on zoning / layout edits — only the parcel-boundary commit frames', () => {
        expect(shouldFramePanedSiteOnUpdate({ ...base, source: 'site.zoning-updated' })).toBe(false);
        expect(shouldFramePanedSiteOnUpdate({ ...base, source: 'apartment.layout-executed' })).toBe(false);
    });

    it('does NOT frame when the 3D Site is not hosted in a pane (classic single-view)', () => {
        expect(shouldFramePanedSiteOnUpdate({ ...base, site3dPaned: false })).toBe(false);
    });
});
