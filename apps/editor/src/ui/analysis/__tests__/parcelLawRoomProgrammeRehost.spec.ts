/**
 * §PL-ROOM-PROGRAMME (L-13024 clause 3) — the ROOM PROGRAMME is re-hosted into the Parcel
 * Law tab, and there is exactly ONE of it.
 *
 * ⭐ IT IS QUESTION **4** SINCE §STAGE-05-SECTION (2026-09-07 · C115 §8.1 `C115-170` · L-13237).
 * Founder: *"THE ROOMS SHOULD BE THE NEW SECTION 4."* It was question 3, sharing that group with
 * the envelope-authoring controls — the founder's Stage 03 and Stage 05 in one question, which
 * `C115-06` requires to be fixed by SPLITTING group 3 rather than building two groups from
 * nothing. This spec was retargeted in the same commit as the move: a placement spec that keeps
 * passing after the thing moved is a placement spec that measures nothing.
 *
 * Subject:   apps/editor/src/ui/analysis/parcelLawTab.ts
 *            apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts (by absence)
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.5 · §25.8
 * Contracts: C19 §5.6 (a panel HOSTS producers; it computes nothing twice)
 *
 * THE ASK. Founder: *"the ROOM PROGRAMME is the one I want to bring into the Parcel Law
 * panel"*, and *"when we click Create at the end, we might want to use the ROOM GENERATOR
 * beforehand — to add rooms beforehand"*.
 *
 * Two claims, and they need different evidence:
 *   1. PLACEMENT — the panel is inside question 4's body (*"What can I fit inside it?"*),
 *      which is three questions AHEAD of question 7 (*"Take me into BIM."*). That ordering
 *      IS the "usable before Create house" half of the ask, so it is asserted by DOM
 *      position, not by a comment.
 *   2. ONE INSTANCE — `ProjectBrowserPanel` no longer mounts a second copy. That is a
 *      claim about a file this spec does not import, so it is asserted the only way that
 *      cannot rot: by reading the SOURCE for the mount call. A comment saying "moved, not
 *      copied" is exactly what a later edit would leave standing while re-adding the rival.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    mountParcelLawTab,
    defaultParcelLawTabDeps,
    PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID,
    PARCEL_LAW_CREATE_HOUSE_HOST_TESTID,
    type ParcelLawTabDeps,
} from '../parcelLawTab';
import { QUESTION_GROUP_TESTID_PREFIX, QUESTION_GROUP_ORDINAL_ATTR } from '../parcelLawQuestionGroup';
import { ROOM_PROGRAMME_ROOT_TESTID } from '../../room-programme/roomProgrammePanel';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function mount(): { host: HTMLElement; dispose: () => void } {
    const deps: ParcelLawTabDeps = defaultParcelLawTabDeps();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const h = mountParcelLawTab(host, deps);
    return { host, dispose: () => { try { h.dispose(); } catch { /* teardown */ } host.remove(); } };
}

describe('§PL-ROOM-PROGRAMME — the re-host', () => {
    it('mounts the ROOM PROGRAMME panel inside question 4 — its own stage, not question 3', async () => {
        const m = mount();
        await tick();
        try {
            const slot = m.host.querySelector(`[data-testid="${PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID}"]`);
            expect(slot, 'the Q4 slot is missing').not.toBeNull();
            // The REAL panel is in it — not an empty div the tab forgot to fill.
            expect(slot!.querySelector(`[data-testid="${ROOM_PROGRAMME_ROOT_TESTID}"]`),
                'the slot holds no panel').not.toBeNull();
            // …and the slot sits inside question 4's group, not merely somewhere in the tab.
            const q4 = m.host.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}rooms"]`);
            expect(q4, 'question 4 is missing').not.toBeNull();
            expect(q4!.contains(slot!), 'the panel is not inside question 4').toBe(true);
            expect(q4!.getAttribute(QUESTION_GROUP_ORDINAL_ATTR), 'rooms is not the FOURTH rung').toBe('4');
            // ⛔ AND IT LEFT QUESTION 3. A split that copied rather than moved would leave the
            // programme in both, which is the two-rival-surfaces defect this re-host closed.
            const q3 = m.host.querySelector(`[data-testid="${QUESTION_GROUP_TESTID_PREFIX}intent"]`)!;
            expect(q3.querySelector(`[data-testid="${ROOM_PROGRAMME_ROOT_TESTID}"]`),
                'the programme is STILL inside question 3').toBeNull();
        } finally { m.dispose(); }
    });

    it('sits AHEAD of "Take me into BIM" — declare the rooms, then build them', async () => {
        const m = mount();
        await tick();
        try {
            const slot = m.host.querySelector(`[data-testid="${PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID}"]`)!;
            const createHouse = m.host.querySelector(`[data-testid="${PARCEL_LAW_CREATE_HOUSE_HOST_TESTID}"]`)!;
            expect(slot).not.toBeNull();
            expect(createHouse).not.toBeNull();
            // DOCUMENT_POSITION_FOLLOWING === 4: `createHouse` comes after `slot`.
            const following = slot.compareDocumentPosition(createHouse) & Node.DOCUMENT_POSITION_FOLLOWING;
            expect(following, 'Create house must come AFTER the programme').toBeTruthy();
        } finally { m.dispose(); }
    });

    it('is exactly ONE panel in the tab — a re-host, not a second surface', async () => {
        const m = mount();
        await tick();
        try {
            expect(m.host.querySelectorAll(`[data-testid="${ROOM_PROGRAMME_ROOT_TESTID}"]`))
                .toHaveLength(1);
        } finally { m.dispose(); }
    });

    it('disposes with the tab — no subscription outlives the surface', async () => {
        const m = mount();
        await tick();
        expect(m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_ROOT_TESTID}"]`)).not.toBeNull();
        m.dispose();
        expect(document.querySelector(`[data-testid="${ROOM_PROGRAMME_ROOT_TESTID}"]`)).toBeNull();
    });

    it('⛔ ProjectBrowserPanel no longer mounts a rival copy (read from the SOURCE)', () => {
        // The rule this asserts is the one this session has already applied to the Cesium
        // viewer, the MapLibre map, the basemap and the view switcher: ONE surface per job.
        // Read the file rather than trusting a comment — a comment is precisely what a later
        // edit leaves standing while re-adding the rival.
        // Repo-root-relative, the idiom `analysisAreaStandards.spec.ts` already uses —
        // `import.meta.url` is not a file URL under this transform.
        const src = readFileSync(
            join(process.cwd(), 'apps/editor/src/ui/ViewBrowser/ProjectBrowserPanel.ts'), 'utf8');
        expect(src).not.toContain('mountRoomProgrammePanel(');
        expect(src).not.toContain("from '../room-programme/roomProgrammePanel'");
        // And the section row is gone, so the rail cannot build it either.
        expect(src).not.toContain("label: 'Room Programme'");
    });
});
