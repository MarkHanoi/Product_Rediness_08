/**
 * ⭐ §FIX-ELEMENT-TYPE-KEY-CASING (L-13045) — the CASING ROUND-TRIP over the element-type
 * tables, and the one arm that would have caught the dead "Edit Profile" row.
 *
 * THE DEFECT THIS PINS, IN ONE SENTENCE
 * ─────────────────────────────────────
 * `ContextualEditBar`'s `bim-selection-changed` handler lowercases the element type before
 * every table read (`_elementType = (…).toLowerCase()`), while the PRODUCERS stamp whatever
 * casing reads naturally — `SpaceEnvelopeMeshBuilder.ts:200` stamps camelCase
 * `'spaceEnvelope'` and `SelectionManager` forwards it verbatim. So a table row written in
 * anything but lowercase was UNREACHABLE, and unreachable silently: the lookup missed, the
 * `?? fallback` fired, and the affordance was hidden with no warning on any channel. A
 * repo-wide grep for the lowercase literal `spaceenvelope` returns ZERO hits — nothing in the
 * tree ever spoke the key the lookup asked for.
 *
 * WHY IT IS WRITTEN AS AN ENUMERATION, NOT AS `expect(resolve('spaceenvelope'))`
 * ─────────────────────────────────────────────────────────────────────────────
 * A hard-coded assertion on the one known-bad key would go green the moment that key is
 * fixed and would say nothing about the NEXT camelCase row somebody adds — and adding one is
 * the natural thing to do, because the producers speak camelCase. These tests therefore
 * iterate `Object.keys()` of the REAL tables and require every key to survive every casing
 * the pipeline can hand it. A new row is covered on the day it is written, by nobody.
 *
 * ✅ ESTABLISHES: every key in both production tables resolves under the lowercasing the bar
 *    applies, under its own casing, and under upper case; that the resolver still refuses a
 *    tool lacking `enterProfileEditMode` (the §FIX-DEAD-EDIT-PROFILE-BUTTON floor, which the
 *    case-insensitivity must not have loosened); and that the type the producer ACTUALLY
 *    stamps resolves after the bar lowercases it.
 * ⛔ DOES NOT ESTABLISH: that the button appears on screen. Nothing in this feature is
 *    browser-verified, including on bim-3d (C114 §14d, and `:456` / `:522` / `:591`). This
 *    proves the LOOKUP is now reachable, not that the gesture works.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    TYPE_DISPLAY,
    lookupByElementType,
    normaliseElementTypeKey,
    profileEditCandidates,
    resolveProfileEditTool,
    type ProfileEditCapableTool,
    type ProfileEditToolBag,
} from '../elementTypeKey';

/** The exact transform `ContextualEditBar`'s selection handler applies before every read. */
const asTheBarSeesIt = (stamped: string): string => stamped.toLowerCase();

/**
 * Every casing a producer might plausibly stamp for the SAME key. The bar's lowercasing is
 * applied on top of each, because that is the real pipeline.
 */
const casings = (key: string): string[] => [
    key,
    key.toLowerCase(),
    key.toUpperCase(),
    ` ${key} `,
];

describe('normaliseElementTypeKey — the normal form', () => {
    it('is idempotent, case-folding and whitespace-trimming', () => {
        for (const key of Object.keys(TYPE_DISPLAY)) {
            const once = normaliseElementTypeKey(key);
            expect(normaliseElementTypeKey(once)).toBe(once);
            expect(normaliseElementTypeKey(key.toUpperCase())).toBe(once);
            expect(normaliseElementTypeKey(`  ${key}  `)).toBe(once);
        }
    });

    it('maps absent input to the empty key rather than throwing', () => {
        expect(normaliseElementTypeKey(null)).toBe('');
        expect(normaliseElementTypeKey(undefined)).toBe('');
        expect(normaliseElementTypeKey('   ')).toBe('');
    });
});

describe('TYPE_DISPLAY — every row survives the round-trip', () => {
    it('resolves every key under every casing the pipeline can produce', () => {
        const keys = Object.keys(TYPE_DISPLAY);
        expect(keys.length).toBeGreaterThan(0);

        for (const key of keys) {
            const expected = TYPE_DISPLAY[key];
            for (const variant of casings(key)) {
                // Both the raw stamp AND the stamp after the bar lowercases it.
                expect(lookupByElementType(TYPE_DISPLAY, variant)).toBe(expected);
                expect(lookupByElementType(TYPE_DISPLAY, asTheBarSeesIt(variant))).toBe(expected);
            }
        }
    });

    it('⛔ no two rows collide once normalised — a collision would make one unreachable', () => {
        // The other way this table can lie: two keys that differ only by casing or spacing
        // would silently shadow each other under a case-insensitive read, and which one wins
        // would depend on key insertion order. That is worse than the miss it replaced.
        const seen = new Map<string, string>();
        for (const key of Object.keys(TYPE_DISPLAY)) {
            const norm = normaliseElementTypeKey(key);
            expect(seen.has(norm), `"${key}" collides with "${seen.get(norm)}"`).toBe(false);
            seen.set(norm, key);
        }
    });

    it('returns undefined — never a wrong row — for an unknown type', () => {
        expect(lookupByElementType(TYPE_DISPLAY, 'no-such-element')).toBeUndefined();
        expect(lookupByElementType(TYPE_DISPLAY, '')).toBeUndefined();
        expect(lookupByElementType(TYPE_DISPLAY, null)).toBeUndefined();
    });
});

describe('profileEditCandidates / resolveProfileEditTool — the round-trip that was missing', () => {
    /** A bag where EVERY declared handle carries a distinct, profile-edit-capable stub. */
    const fullBag = (): { bag: ProfileEditToolBag; toolFor: Map<string, ProfileEditCapableTool> } => {
        const handles: Array<keyof ProfileEditToolBag> = [
            'slabTool', 'floorTool', 'ceilingTool', 'wallTool', 'spaceEnvelopeTool',
        ];
        const bag: ProfileEditToolBag = {};
        for (const h of handles) {
            bag[h] = { enterProfileEditMode: () => h };
        }
        // Key the expectation by TABLE key, derived from the table itself.
        const table = profileEditCandidates(bag);
        const toolFor = new Map<string, ProfileEditCapableTool>();
        for (const [type, tool] of Object.entries(table)) {
            expect(tool, `no handle backs the "${type}" row`).toBeTruthy();
            toolFor.set(type, tool!);
        }
        return { bag, toolFor };
    };

    it('⭐ resolves EVERY row under the lowercasing the bar applies', () => {
        // THE arm that fails at the parent commit: `spaceEnvelope` → `spaceenvelope` → the
        // old `candidates[type]` returned undefined → the button was hidden.
        const { bag, toolFor } = fullBag();
        expect(toolFor.size).toBeGreaterThan(0);

        for (const [type, tool] of toolFor) {
            for (const variant of casings(type)) {
                expect(
                    resolveProfileEditTool(asTheBarSeesIt(variant), bag),
                    `"${type}" is unreachable when the bar sees "${asTheBarSeesIt(variant)}"`,
                ).toBe(tool);
            }
        }
    });

    it('⛔ no two rows collide once normalised', () => {
        const seen = new Map<string, string>();
        for (const type of Object.keys(profileEditCandidates({}))) {
            const norm = normaliseElementTypeKey(type);
            expect(seen.has(norm), `"${type}" collides with "${seen.get(norm)}"`).toBe(false);
            seen.set(norm, type);
        }
    });

    it('keeps the §FIX-DEAD-EDIT-PROFILE-BUTTON floor: no method, no tool', () => {
        // Case-insensitivity must widen WHICH KEYS ARE FOUND, never which tools qualify. A
        // tool without `enterProfileEditMode` is still refused — that is the rule the whole
        // resolver exists to uphold, and floor/ceiling are why.
        for (const type of Object.keys(profileEditCandidates({}))) {
            const handleless: ProfileEditToolBag = {
                slabTool: {}, floorTool: {}, ceilingTool: {}, wallTool: {}, spaceEnvelopeTool: {},
            };
            expect(resolveProfileEditTool(asTheBarSeesIt(type), handleless)).toBeNull();
        }
    });

    it('refuses an absent, empty or unknown type without throwing', () => {
        const { bag } = fullBag();
        expect(resolveProfileEditTool(null, bag)).toBeNull();
        expect(resolveProfileEditTool(undefined, bag)).toBeNull();
        expect(resolveProfileEditTool('', bag)).toBeNull();
        expect(resolveProfileEditTool('no-such-element', bag)).toBeNull();
    });

    it('an unwired handle yields no tool — the button stays hidden, not broken', () => {
        // `window.spaceEnvelopeTool` is assigned in `initTools`; before that runs, the row
        // exists and the handle does not. That must read as "not offered", never as a crash.
        for (const type of Object.keys(profileEditCandidates({}))) {
            expect(resolveProfileEditTool(asTheBarSeesIt(type), {})).toBeNull();
        }
    });
});

describe('the PRODUCERS — the tables answer the strings actually stamped on userData', () => {
    const EDITOR_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const read = (rel: string): string => fs.readFileSync(path.join(EDITOR_SRC, rel), 'utf8');

    it('⭐ the envelope type SpaceEnvelopeMeshBuilder stamps is served by both tables', () => {
        // Derived from the producer, not hard-coded — a rename there fails this rather than
        // quietly re-opening the gap.
        const builder = read('engine/SpaceEnvelopeMeshBuilder.ts');
        const stamped = /group\.userData\['elementType'\] = '([^']+)'/.exec(builder)?.[1];
        expect(stamped, 'SpaceEnvelopeMeshBuilder no longer stamps a group elementType').toBeTruthy();

        const seen = asTheBarSeesIt(stamped!);
        expect(lookupByElementType(TYPE_DISPLAY, seen)).toBe('Space Envelope');

        const spaceEnvelopeTool: ProfileEditCapableTool = { enterProfileEditMode: () => undefined };
        expect(resolveProfileEditTool(seen, { spaceEnvelopeTool })).toBe(spaceEnvelopeTool);
    });

    it('⛔ the bar still lowercases — this suite is measuring the real pipeline', () => {
        // If the `.toLowerCase()` is ever removed, the round-trips above stop describing what
        // production does and would keep passing while meaning something else. Pin the
        // premise, so the tests cannot outlive it.
        const bar = read('ui/ContextualEditBar.ts');
        expect(bar).toMatch(/_elementType\s*=\s*obj[\s\S]{0,300}?\.toLowerCase\(\)/);
    });
});
