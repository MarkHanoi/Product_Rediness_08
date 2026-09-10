/**
 * @vitest-environment happy-dom
 */
// masterPlanningRailIcons — EVERY Master planning entry must draw a GLYPH, not a hole.
// C82 · C116 · ADR-0384 D7 · ADR-0383 · [[gate-blind-on-the-wrong-axis]].
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ THE FOUNDER'S REPORT: "FIVE EMPTY CIRCLES — NO ICONS, NO LABELS"
// ═══════════════════════════════════════════════════════════════════════════════
//
// He opened the Master planning category and got five identical blank discs. The
// mechanism was one line — `iconFromName()` returns `<circle r="4"/>` for any name
// its map has never heard of — and NOT ONE of the five names the two registration
// functions supply was in that map:
//
//     material-symbols:add-road-outline        (siteworks · Road)
//     material-symbols:local-parking-outline   (siteworks · Parking Area)
//     material-symbols:directions-walk         (siteworks · Pedestrian Area)
//     material-symbols:pentagon-outline        (massing   · Building Profile)
//     material-symbols:library-add-outline     (massing   · Another Profile)
//
// ⭐ AND THE LABELS WERE NEVER MISSING. `.da-icon-cell-label` is `opacity: 0` until
// `.da-icon-cell:hover` in EVERY category (`disciplineAccordion.ts:320`) — the rail
// is an icon grid by design. With five identical discs there was simply no way to
// tell the five tools apart without hovering each one, so "no labels" is what "no
// icons" LOOKS like on this surface. Fixing the glyphs fixes both halves of the
// report; nothing about the label mechanism is changed, because nothing about it
// was wrong.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS SUITE ASSERTS A SET AND NEVER A COUNT
// ═══════════════════════════════════════════════════════════════════════════════
// Five entries were registered. Five icons were drawn. Five cells appeared. Every
// count in the system agreed, and the product was blank — the MEMBERSHIP axis was
// the one nobody compared ([[gate-blind-on-the-wrong-axis]]). So the predicate here
// is per-NAME and per-ENTRY: for each registered entry, the exact string the rail
// hands to `iconFromName` must resolve to a mapped path. A sixth entry registered
// with a sixth unmapped name fails BY NAME.
//
// ⚠ WHAT THIS SUITE DOES NOT ESTABLISH, STATED PLAINLY. It does not construct
// `ToolsPanelController`. That leg — the REAL right-hand rail, the category present
// exactly once, and these entries in it after nothing but the panel's construction
// — is `apps/editor/src/ui/site/__tests__/masterPlanWireReachability.spec.ts` ARM C,
// which already drives it and is named here so nobody reads one file as both. What
// IS pinned here is the property that suite cannot see: that the icon NAME each
// entry carries resolves to a real glyph in the map the cell renderer reads.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    iconFromName,
    isMappedIconName,
    FALLBACK_ICON_PATH,
} from '../../../icons/PryzmIconsSystem';
import {
    masterPlanningTools,
    registerMasterPlanningTool,
    __resetMasterPlanningToolsForTest,
} from '../masterPlanningRailRegistry.js';
import { registerSiteworksRailTools } from '../siteworksRailTools.js';
import { registerMassingRailTools } from '../massingRailTools.js';

/**
 * The two REAL registration calls `CreateRailPanel`'s constructor makes, in its
 * order. ⛔ Nothing is hand-listed: the entries under test are whatever those two
 * functions register, so an entry added to either one is covered the day it lands
 * rather than the day somebody remembers to extend a literal here.
 */
function registerTheRealEntries(): void {
    __resetMasterPlanningToolsForTest();
    registerSiteworksRailTools();
    registerMassingRailTools();
}

/** Exactly what `CreateRailPanel._renderSection` puts into the cell's innerHTML. */
function cellInnerHtmlFor(icon: string): string {
    // The panel branches on `startsWith('<svg')`; every rail-registry entry today
    // takes the NAME branch, and the arm below pins that.
    return icon.startsWith('<svg') ? icon : iconFromName(icon, 28);
}

describe('Master planning rail — every entry draws a real glyph', () => {
    beforeEach(registerTheRealEntries);

    it('⛔⛔ registers entries at all — a floor, so a silent registry cannot pass every arm below vacuously', () => {
        // §CONTEXT-DATA-HONESTY — "no entry violates the rule" and "there are no
        // entries" are the same value to a `for` loop. Five is what the two
        // functions register today; the floor is the shape, not the census.
        expect(masterPlanningTools().length).toBeGreaterThanOrEqual(5);
    });

    it('⛔ EVERY registered icon name is MAPPED — the five-blank-discs regression, by name', () => {
        const unmapped = masterPlanningTools()
            .filter((e) => !e.icon.startsWith('<svg') && !isMappedIconName(e.icon))
            .map((e) => `${e.key} → ${e.icon}`);
        expect(unmapped).toEqual([]);
    });

    it('⛔ EVERY entry renders something OTHER than the fallback disc', () => {
        const blank = masterPlanningTools()
            .filter((e) => cellInnerHtmlFor(e.icon).includes(FALLBACK_ICON_PATH))
            .map((e) => `${e.key} → ${e.icon}`);
        expect(blank).toEqual([]);
    });

    it('every entry carries a non-empty human LABEL and a distinct KEY', () => {
        const tools = masterPlanningTools();
        for (const e of tools) {
            expect(e.label.trim().length, `entry ${e.key} has no label`).toBeGreaterThan(0);
        }
        expect(new Set(tools.map((e) => e.key)).size).toBe(tools.length);
        // The labels are what the hover tooltip shows, so two entries sharing one
        // would be indistinguishable even AFTER the glyphs are fixed.
        expect(new Set(tools.map((e) => e.label)).size).toBe(tools.length);
    });

    it('the icons are DISTINCT from one another — five different glyphs, not one repeated', () => {
        // ⭐ THIS IS THE ARM THAT WOULD HAVE CAUGHT THE ORIGINAL BUG WITHOUT KNOWING
        // ABOUT THE FALLBACK. Five entries all rendering the same SVG is the observable
        // the founder reported, whatever produced it.
        const rendered = masterPlanningTools().map((e) => cellInnerHtmlFor(e.icon));
        expect(new Set(rendered).size).toBe(rendered.length);
    });

    // ── SCRAMBLE CONTROLS (L-586) ────────────────────────────────────────────
    // ⛔ Without these, every arm above passes on a predicate that cannot fail.

    it('SCRAMBLE — an invented name is NOT mapped and DOES render the fallback disc', () => {
        const invented = 'material-symbols:this-glyph-was-never-drawn';
        expect(isMappedIconName(invented)).toBe(false);
        expect(iconFromName(invented, 28)).toContain(FALLBACK_ICON_PATH);
    });

    it('SCRAMBLE — a registry entry carrying an invented name IS caught by the arms above', () => {
        // Drive the REAL registry, not a copy of the predicate: register a sixth
        // entry with an unmapped name and prove the same filter that reads `[]`
        // above now names it. A guard never watched failing is unproven.
        const before = masterPlanningTools().length;
        registerMasterPlanningTool({
            key: 'scramble.blank',
            label: 'Scramble',
            icon: 'material-symbols:no-such-glyph-exists',
            action: () => {},
        });
        expect(masterPlanningTools().length).toBe(before + 1);
        const unmapped = masterPlanningTools()
            .filter((e) => !e.icon.startsWith('<svg') && !isMappedIconName(e.icon))
            .map((e) => e.key);
        expect(unmapped).toEqual(['scramble.blank']);
    });
});
