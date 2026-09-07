// §STARTUP-NAME-FROM-LOCATION — the default project name, place + code (L-13173, lane NAME-CARD-OUT,
// 2026-09-07).
//
// ⭐ WHAT REPLACED WHAT. This file replaces `startupProjectNameCard.spec.ts`, which pinned a DOM
// card ("Name your project", raised over the live globe on the location path) that the founder
// asked to have removed once §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT (`d1ecb2fe`) removed the wait it
// was hiding. The card's spec is gone WITH the card — a spec whose subject has been deleted is not
// a regression net, it is a compile error waiting to be silenced. What survives is the half that is
// still shipped: the naming RULE.
//
// ⛔ THE CODE IS THE PART WORTH PINNING. "Barcelona" alone does not disambiguate a second Barcelona
// project in the hub grid, which is where he reads these; the code is what makes two rows tellable
// apart at a glance. Its exact shape — the last four alphanumerics of the project id, uppercased —
// is asserted here against the three project-id shapes this stack actually mints.

import { describe, it, expect } from 'vitest';
import {
    startupProjectName,
    startupProjectNameDefault,
    startupProjectCode,
    STARTUP_NAME_SEPARATOR,
    STARTUP_NAME_CODE_LENGTH,
} from '../startupProjectName';

describe('startupProjectNameDefault — the place, not the disambiguation path', () => {
    it('takes the FIRST comma-segment of the provider display name', () => {
        // Nominatim's answer for the founder's own query. The whole string is a disambiguation
        // path, not a name — it is what he would immediately delete.
        expect(
            startupProjectNameDefault('Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España'),
        ).toBe('Barcelona');
    });

    it('passes a single-segment address through unchanged', () => {
        expect(startupProjectNameDefault('Barcelona')).toBe('Barcelona');
    });

    it('⛔ NEVER INVENTS — an empty or unusable address yields an empty string', () => {
        expect(startupProjectNameDefault('')).toBe('');
        expect(startupProjectNameDefault('   ')).toBe('');
        expect(startupProjectNameDefault(',,,')).toBe('');
        expect(startupProjectNameDefault(null)).toBe('');
        expect(startupProjectNameDefault(undefined)).toBe('');
    });
});

describe('startupProjectCode — the last four alphanumerics of the project id, uppercased', () => {
    it('reads the `proj-<epoch>-<hex>` shape (server/projectStore, randomBytes(6))', () => {
        expect(startupProjectCode('proj-1787554200066-a936f1ea8b34')).toBe('8B34');
    });

    it('reads the `proj-<uuid>` shape (Contract 45 §7.1, crypto.randomUUID)', () => {
        expect(startupProjectCode('proj-2f8d6c1e-4b7a-4c39-9f21-6ae0d4b95c73')).toBe('5C73');
    });

    it('reads the `proj-<epoch>-<base36>` shape (server.js:3017, Math.random().toString(36))', () => {
        expect(startupProjectCode('proj-1787554200066-k3f7q')).toBe('3F7Q');
    });

    it('⛔ DROPS PUNCTUATION so a dash can never land inside a four-character code', () => {
        // `'proj-...-ab'` has only two alphanumerics after the last dash; without the strip the
        // code would read `"-AB"` and look like a typo rather than an identifier.
        expect(startupProjectCode('proj-1787554200066-ab')).toBe('66AB');
        expect(startupProjectCode('proj-1787554200066-ab')).not.toContain('-');
    });

    it('is DERIVABLE BY EYE — the code is a literal substring of the id, not a hash', () => {
        // This is why the id was chosen over a random or hashed code: "open the 8B34 one" narrows a
        // log line, a URL and a database row. A hash would disambiguate equally well and mean
        // nothing.
        const id = 'proj-1787554200066-a936f1ea8b34';
        expect(id.toUpperCase()).toContain(startupProjectCode(id));
    });

    it('is STABLE — the same id always yields the same code (no clock, no randomness)', () => {
        const id = 'proj-1787554200066-a936f1ea8b34';
        expect(startupProjectCode(id)).toBe(startupProjectCode(id));
    });

    it('is exactly STARTUP_NAME_CODE_LENGTH characters for any realistic id', () => {
        expect(startupProjectCode('proj-1787554200066-a936f1ea8b34')).toHaveLength(STARTUP_NAME_CODE_LENGTH);
        // ⭐ SHORT ON PURPOSE. `.ph-card-name` in the hub grid is
        // `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` at 13px, so a long name is
        // truncated FROM THE END — exactly where the disambiguator sits. Four characters survive
        // that; the incumbent `2026-09-07 18:31` stamp (16) does not, and the hub already prints a
        // date one line lower in `.ph-card-meta`.
        expect(STARTUP_NAME_CODE_LENGTH).toBeLessThanOrEqual(4);
    });

    it('⛔ NEVER INVENTS — no id, or an id with no alphanumerics, yields no code', () => {
        expect(startupProjectCode(null)).toBe('');
        expect(startupProjectCode(undefined)).toBe('');
        expect(startupProjectCode('')).toBe('');
        expect(startupProjectCode('---')).toBe('');
    });
});

describe('startupProjectName — "Barcelona — 8B34"', () => {
    it('composes the place, the separator and the code', () => {
        expect(startupProjectName('Barcelona, Catalunya, España', 'proj-1787554200066-a936f1ea8b34'))
            .toBe('Barcelona — 8B34');
    });

    it('uses the SAME separator as the pre-location default, so the two read as one family', () => {
        // `projectAutoName.generateUntitledSiteName` → "Untitled Site — 2026-09-07 18:31".
        expect(STARTUP_NAME_SEPARATOR).toBe(' — ');
        expect(startupProjectName('Barcelona', 'proj-x-a936f1ea8b34')).toContain(STARTUP_NAME_SEPARATOR);
    });

    it('⭐ DISAMBIGUATES TWO BARCELONAS — the whole reason the founder asked for a code', () => {
        const first = startupProjectName('Barcelona, Catalunya', 'proj-1787554200066-a936f1ea8b34');
        const second = startupProjectName('Barcelona, Catalunya', 'proj-1787554260311-77c4e0d31f92');
        expect(first).not.toBe(second);
        expect(first).toBe('Barcelona — 8B34');
        expect(second).toBe('Barcelona — 1F92');
    });

    it('⛔ THE PLACE IS LOAD-BEARING: no place ⇒ NO NAME AT ALL, never a bare code', () => {
        // The caller writes nothing on `''`, so the project keeps the `Untitled Site — <stamp>` it
        // already has rather than gaining a fabricated one.
        expect(startupProjectName('', 'proj-1787554200066-a936f1ea8b34')).toBe('');
        expect(startupProjectName(null, 'proj-1787554200066-a936f1ea8b34')).toBe('');
    });

    it('⛔ THE CODE IS NOT: no id ⇒ the bare place, never a dangling separator', () => {
        expect(startupProjectName('Barcelona, Catalunya', null)).toBe('Barcelona');
        expect(startupProjectName('Barcelona, Catalunya', '')).toBe('Barcelona');
        expect(startupProjectName('Barcelona, Catalunya', null).endsWith('—')).toBe(false);
    });

    it('is PURE — no DOM, no window, no clock: the same inputs give the same name forever', () => {
        // ⛔ The module this replaced built a `<div>` on `document.body`. If a future edit puts DOM
        // back into the naming path, the card is being re-added by another name.
        const a = startupProjectName('Barcelona, Catalunya', 'proj-1787554200066-a936f1ea8b34');
        const b = startupProjectName('Barcelona, Catalunya', 'proj-1787554200066-a936f1ea8b34');
        expect(a).toBe(b);
        expect(document.body.children.length).toBe(0);
    });
});
