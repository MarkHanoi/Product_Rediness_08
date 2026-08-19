/**
 * §FEAT-WALL-PROFILE-EDIT-MATRIX — THE MATRIX, MEASURED (L-1065).
 *
 * The question the first gate could not answer: not *"is this a wall?"* but *"does the
 * profile geometry exist for THIS WALL'S VARIANT?"*. This suite states the whole matrix as
 * assertions, so the answer to "what can the founder test today" is read off a run rather
 * than off a paragraph — and so a row that opens without geometry behind it fails here
 * first.
 *
 * It also pins two properties of the matrix ITSELF:
 *   • every closed cell today is `unbuilt`, NOT `impossible` — nothing here is refused as a
 *     law, and the day someone writes a law they have to change this test to say so;
 *   • every refusal names what IS available, so a "no" is never a dead end (C16 CA-18).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    wallProfileVariantAvailability,
    wallProfileActiveAxes,
    gateSentenceForAxis,
    WALL_PROFILE_AXES,
    WALL_PROFILE_AVAILABLE_TODAY,
} from '../src/WallProfileVariants';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const BASE = {
    baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] as const,
    height: 3,
};

const VARIANTS = {
    'plain (straight, vertical, 1 layer, no openings)': { ...BASE },
    'raked':                                            { ...BASE, rakeAngleDeg: 70 },
    'curved':                                           { ...BASE, curve: { control: { x: 3, z: 1.2 }, segments: 12 } },
    'curved + raked':                                   { ...BASE, curve: { control: { x: 3, z: 1.2 }, segments: 12 }, rakeAngleDeg: 70 },
    'layered (> 1 band)':                               { ...BASE, layers: [{}, {}, {}] },
    'hosting an opening':                               { ...BASE, openings: [{}] },
} as const;

describe('§FEAT-WALL-PROFILE-EDIT-MATRIX — what is OFFERED, per variant', () => {
    it('the matrix, printed as one table (this is the artefact, not a side effect)', () => {
        const rows = Object.entries(VARIANTS).map(([name, w]) => {
            const v = wallProfileVariantAvailability(w as never);
            return `${name.padEnd(48)} | ${v.ok ? 'OFFERED' : 'CLOSED '} | ${v.status ?? 'available'} | ${v.blockedBy.join('+') || '-'}`;
        });
        // eslint-disable-next-line no-console
        console.log('\n' + rows.join('\n') + '\n');
        expect(rows).toHaveLength(6);
    });

    it('PLAIN is the one open cell', () => {
        expect(wallProfileVariantAvailability(VARIANTS['plain (straight, vertical, 1 layer, no openings)'] as never).ok)
            .toBe(true);
    });

    it('RAKED is CLOSED — L-1065, the cell that was offered with nothing behind it', () => {
        const v = wallProfileVariantAvailability(VARIANTS['raked'] as never);
        expect(v.ok).toBe(false);
        expect(v.blockedBy).toEqual(['raked']);
        expect(v.status).toBe('unbuilt');
        // and the refusal must not read like a law
        expect(v.reason).toMatch(/NOT YET/);
        expect(v.reason).toMatch(/not because it is impossible/i);
    });

    it('a wall raked to exactly 90 (or not raked at all) is VERTICAL and stays open', () => {
        expect(wallProfileVariantAvailability({ ...BASE, rakeAngleDeg: 90 } as never).ok).toBe(true);
        expect(wallProfileVariantAvailability({ ...BASE, rakeAngleDeg: undefined } as never).ok).toBe(true);
        expect(wallProfileVariantAvailability({ ...BASE, rakeAngleDeg: NaN } as never).ok).toBe(true);
    });

    it('CURVED, CURVED+RAKED, LAYERED and HOSTING are all CLOSED', () => {
        for (const key of ['curved', 'curved + raked', 'layered (> 1 band)', 'hosting an opening'] as const) {
            expect(wallProfileVariantAvailability(VARIANTS[key] as never).ok, key).toBe(false);
        }
    });

    it('CURVED + RAKED names BOTH axes — a compound refusal is not one axis silently winning', () => {
        const v = wallProfileVariantAvailability(VARIANTS['curved + raked'] as never);
        expect([...v.blockedBy].sort()).toEqual(['curved', 'raked']);
    });

    it('a single layer is NOT layered — the axis keys on more than one band', () => {
        expect(wallProfileActiveAxes({ ...BASE, layers: [{}] } as never)).toEqual([]);
        expect(wallProfileActiveAxes({ ...BASE, layers: [{}, {}] } as never)).toEqual(['layered']);
    });
});

describe('§FEAT-WALL-PROFILE-EDIT-MATRIX — properties of the matrix itself', () => {
    it('NOTHING is refused as IMPOSSIBLE today — every closed cell is "not yet" (L-1067)', () => {
        // If this fails because a row was set to `impossible`, that row must carry an argument
        // for why the combination is ill-posed, not merely unwritten. Rake × profile is not
        // one: the ring is authored in the un-sheared frame precisely so the two compose.
        expect(WALL_PROFILE_AXES.filter((r) => r.status === 'impossible')).toEqual([]);
    });

    it('every closed axis names an owner, so no row is held by nobody', () => {
        for (const row of WALL_PROFILE_AXES) {
            if (row.status !== 'available') expect(row.owner, row.axis).toBeTruthy();
        }
    });

    it('every refusal names what IS available (C16 CA-18)', () => {
        for (const w of Object.values(VARIANTS)) {
            const v = wallProfileVariantAvailability(w as never);
            if (!v.ok) expect(v.reason).toContain(WALL_PROFILE_AVAILABLE_TODAY);
        }
    });

    it('the gate owns its own sentences — curved/layered/openings text is NOT copied here', () => {
        // Each of these comes back from `profileAuthorability` verbatim…
        for (const axis of ['curved', 'layered', 'hosted-openings'] as const) {
            expect(gateSentenceForAxis(axis), axis).toBeTruthy();
        }
        // …and RAKE returns null, which is the fact that made L-1065 possible: the store gate
        // has no rake arm, so it would ACCEPT a profile on a raked wall.
        expect(gateSentenceForAxis('raked')).toBeNull();

        const src = fs.readFileSync(path.join(REPO, 'packages/geometry-wall/src/WallProfileVariants.ts'), 'utf8');
        expect(src).not.toContain('developable surface');   // the curved sentence
        expect(src).not.toContain('purely horizontal');     // the openings sentence
    });
});

describe('§FEAT-WALL-PROFILE-EDIT-MATRIX — the UI consults it (reachability)', () => {
    const bar = () => fs.readFileSync(path.join(REPO, 'apps/editor/src/ui/ContextualEditBar.ts'), 'utf8');
    const tool = () => fs.readFileSync(path.join(REPO, 'packages/geometry-wall/src/WallTool.ts'), 'utf8');

    it('the toolbar asks profileEditAvailability for ENABLEMENT and shows the reason', () => {
        const s = bar();
        expect(s).toMatch(/tool\.profileEditAvailability\(id\)/);
        expect(s).toMatch(/this\._editProfileBtn\.title\s*=/);
    });

    it('the click path declines VISIBLY rather than opening or doing nothing', () => {
        expect(bar()).toMatch(/_declineOperation\(\s*'Edit Profile'/);
    });

    it('WallTool refuses the same way, so the button state and the refusal are ONE judgement', () => {
        const s = tool();
        expect(s).toMatch(/wallProfileVariantAvailability\(wall as never\)/);
        expect(s).toMatch(/public profileEditAvailability\(wallId: string\)/);
    });
});
