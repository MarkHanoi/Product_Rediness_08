// massingRailTools — ADR-0383's half of the **Master planning** rail category.
// ADR-0383 · ADR-0384 D7 · C116 · C82 · P6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THIS FILE IS THE RECIPROCAL ROW `masterPlanningRailRegistry.ts` SAID WAS MISSING
// ═══════════════════════════════════════════════════════════════════════════════
// The SITEWORKS lane built that registry hours before this file and wrote, honestly,
// that the obligation it depends on exists in only one of the two documents:
//
//   ⚠ "REPORTED HONESTLY, BECAUSE THE ADR OVERSTATES IT: **ADR-0383 carries no
//      reciprocal ruling.** … its landed code (`massingGroupRoster.ts`,
//      `massingGroupSelectionState.ts`) adds no rail entry. … This file is built as
//      the registry that lane can join WITHOUT touching `CreateRailPanel`."
//
// ⭐ SO THIS LANE JOINS IT, AND THE MEASUREMENT THAT SENTENCE MADE IS NOW FALSE — which
// is the correct way for it to stop being true. ⛔ THE ALTERNATIVE WAS TAKEN AND
// REVERTED IN THIS SAME SESSION: lane MP-WIRE had already added a SECOND `Master
// planning` row to `ToolsPanelController`, minutes after SITEWORKS added the first.
// Both were in the working tree at once. Two rows with one label is C82's 267-of-280
// dead-pair census at its first instant, and it would have shipped as two identical
// buttons on the founder's rail on the very evening he asked why the category did not
// exist at all. The rival row was deleted; this registration replaces it.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THESE TWO ENTRIES DO, AND WHAT THEY DELIBERATELY DO NOT
// ═══════════════════════════════════════════════════════════════════════════════
// They are the two GESTURES of master planning, and they are gestures the product
// already has: `armEnvelopeDraw` (the perimeter draw shared by the 2-D Site Map and
// the 3-D Site) and `addDrawnEnvelopeProfile` (the session roster's append).
//
// ⛔ NEITHER ONE CREATES ANYTHING, and that is not an omission. A rail entry is a
// `() => void` with no room for a storey count, and "how many floors does every block
// have" is the one question the create cannot be asked without. The ROSTER, the storey
// count and the single `Create all blocks` button live in the Parcel Law panel,
// question 2 — `masterPlanSection.ts`, mounted by `parcelLawTab.ts`. These entries
// START the journey; that section finishes it, and its own empty state says so.
//
// ⛔ AND NEITHER ONE DISPATCHES (P6 is satisfied vacuously here). The ONE mutation in
// the whole master-planning path is the `spaceEnvelope.batch.create` that section
// sends. A rail button that quietly wrote a store would be a second mutation path.
//
// Pure of DOM: this module registers two closures and touches nothing else.

import {
    addDrawnEnvelopeProfile,
    getDrawnEnvelopeProfiles,
    DRAWN_ENVELOPE_MAX_PROFILES,
} from '@app/ui/site/drawnEnvelopeFootprintState';
import { armEnvelopeDraw } from '@app/ui/site/siteEnvelopeDrawArming';
import { registerMasterPlanningTool } from './masterPlanningRailRegistry.js';

/**
 * ⛔ LOUD, NEVER SILENT — the same rule and the same channel `siteworksRailTools.ts`
 * uses two files over. A palette click that quietly does nothing is the C82 failure
 * the whole registry exists to avoid, and a refusal that only reaches the console is
 * indistinguishable from one to a user.
 */
function notify(message: string): void {
    const rt = (window as unknown as {
        runtime?: { toasts?: { show?: (m: string, k?: string, d?: number) => unknown } };
    }).runtime;
    try {
        if (typeof rt?.toasts?.show === 'function') { rt.toasts.show(message, 'error', 7000); return; }
    } catch { /* a toast that throws must never take the palette click with it */ }
    console.warn('[master-plan]', message);
}

/**
 * Arm the ONE perimeter draw, and report its OWN refusal when no surface accepts.
 *
 * ⛔ THE REFUSAL SENTENCE IS THE ARMING MODULE'S, VERBATIM. It names the route back
 * (C16 CA-18 — *"open the 2D Site Map or 3D Site, then press Draw again"*), and a
 * re-worded copy here would be a second answer to one question.
 */
function armOrExplain(): boolean {
    let ok = false;
    try {
        const act = armEnvelopeDraw();
        ok = act.ok;
        if (!act.ok) notify(act.reason ?? 'No site view accepted the perimeter draw.');
    } catch (e) {
        notify(`The perimeter draw could not start: ${String((e as Error)?.message ?? e)}`);
    }
    return ok;
}

/**
 * Register ADR-0383's two entries into the shared Master planning registry.
 *
 * ⭐ IDEMPOTENT BY THE REGISTRY'S OWN RULE — re-registering a key REPLACES its entry.
 * The caller still guards, because registering twice would be a wasted allocation
 * rather than a duplicate button.
 */
export function registerMassingRailTools(): void {
    registerMasterPlanningTool({
        key: 'massing.draw-profile',
        label: 'Building Profile',
        icon: 'material-symbols:pentagon-outline',
        // Draw ONE building's perimeter. The roster's unchanged rule applies: a finished
        // perimeter writes the MOST RECENT profile, so this both starts the first profile
        // and redraws the current one — which is why there is no mode flag anywhere.
        action: () => { armOrExplain(); },
    });
    registerMasterPlanningTool({
        key: 'massing.add-profile',
        label: 'Another Profile',
        icon: 'material-symbols:library-add-outline',
        // ⭐ APPEND A PROFILE SEEDED FROM THE CURRENT ONE, THEN ARM. The copy is not the
        // point — drawing over it is, and the next finished perimeter replaces it. This is
        // two existing rules composed, never a third one (`drawnEnvelopeFootprintState`).
        action: () => {
            const profiles = getDrawnEnvelopeProfiles();
            const last = profiles[profiles.length - 1];
            if (last === undefined) {
                notify(
                    'Draw the first building profile before adding a second — press Building '
                    + 'Profile and click the corners of a perimeter on a site view.',
                );
                return;
            }
            const before = profiles.length;
            addDrawnEnvelopeProfile(last.footprint);
            if (getDrawnEnvelopeProfiles().length === before) {
                notify(
                    `That profile was not added — this session already holds ${DRAWN_ENVELOPE_MAX_PROFILES} `
                    + 'profiles, which is the guard against a runaway caller. Remove one you no longer '
                    + 'want in the Parcel Law panel and add again.',
                );
                return;
            }
            armOrExplain();
        },
    });
}
