// @vitest-environment happy-dom
//
// §TITLE-BLOCK-EDIT-FORKS (L-10690) — the founder's ask #4, and the round-trip
// proof for the leg that lost him his views and sheets one issue ago.
//
// ── WHY THIS SUITE EXISTS IN THIS SHAPE ─────────────────────────────────────
// A user-authored title block needs THREE legs or the work is gone on reload:
//   1. a write slot in `ProjectSerializer`
//   2. a read in `ProjectLoader`
//   3. an event in `SaveOrchestrator.MUTATION_EVENTS`
//
// ⛔ LEG 3 IS THE ONE THAT ACTUALLY FAILED IN L-10700. The stores were correct;
// nothing marked the project dirty, so no debounce armed and
// `flushBeforeUnload()` returned early on `!hasDirtyChanges`. The work was never
// written — not dropped by the loader, NEVER SAVED. So this suite asserts the
// event is in that list BY READING THE LIST, not by trusting that an emit is
// enough.
//
// ⛔ AND EVERY ASSERTION NAMES AN AUTHORED ID. "Some templates exist" passes on
// the ten code-seeded built-ins and proves nothing — that is precisely the false
// green that lost him his RCP plan, his Structural view, his Render, his Draft
// view and his sheet. PART 1 asserts the authored id comes back WITH ITS FIELD
// COORDINATES IN MILLIMETRES, alongside the built-ins.
//
// ⚠ WHAT THIS DOES NOT ESTABLISH: it exercises the store round trip the
// serializer and loader actually call, plus the dirty-trigger leg. It does not
// boot `ProjectSerializer.serialize()` (needs a live BimManager) nor the server
// round trip, so "the bytes reach Postgres" remains unproven here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { titleBlockStore } from '@pryzm/core-app-model';
import { SaveOrchestrator } from '../src/ui/platform/SaveOrchestrator';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** His template, and the millimetres he placed the field at. */
const AUTHORED_ID    = 'tb-user-practice-1';
const AUTHORED_NAME  = 'Practice Block (custom)';
const MOVED_FIELD    = 'projectName';
const MOVED_LOCAL_X  = 22.5;   // mm from the strip's left edge
const MOVED_Y        = 143;    // mm from the paper bottom

function authorTemplate(): void {
    const made = titleBlockStore.fork('a1-standard', AUTHORED_ID, AUTHORED_NAME);
    expect(made, 'fork must produce the template').not.toBeNull();
    expect(
        titleBlockStore.setFieldPlacement(AUTHORED_ID, MOVED_FIELD, { localX: MOVED_LOCAL_X, y: MOVED_Y }),
    ).toBe(true);
}

beforeEach(() => titleBlockStore.clearUserTemplates());

describe('TB-P1 — the AUTHORED template survives a session boundary, in millimetres', () => {
    it('round-trips by ID, with the field where the user dragged it', () => {
        authorTemplate();

        // The exact bytes ProjectSerializer writes into the snapshot.
        const snapshot = JSON.parse(JSON.stringify(titleBlockStore.serialize()));

        // A new session: the store starts as code-seeded built-ins only.
        titleBlockStore.clearUserTemplates();
        expect(titleBlockStore.get(AUTHORED_ID), 'precondition: gone before load').toBeUndefined();

        // The exact call ProjectLoader makes.
        titleBlockStore.deserialize(snapshot);

        const back = titleBlockStore.get(AUTHORED_ID);
        expect(back, 'the AUTHORED id must come back — not "some template"').toBeDefined();
        expect(back!.name).toBe(AUTHORED_NAME);

        // ⭐ THE MILLIMETRES. A template that returns with default coordinates is
        // the user's layout lost, and would pass any "it exists" assertion.
        const f = back!.fields.find(x => x.key === MOVED_FIELD)!;
        const stripLeft = back!.paperWidth - back!.borderWidth;      // 841 − 160 = 681
        expect(f.x - stripLeft).toBeCloseTo(MOVED_LOCAL_X, 6);       // 22.5 mm
        expect(f.x).toBeCloseTo(703.5, 6);                           // 681 + 22.5
        expect(f.y).toBeCloseTo(MOVED_Y, 6);                         // 143 mm

        // And it did NOT come back at the built-in's coordinates.
        const builtin = titleBlockStore.get('a1-standard')!.fields.find(x => x.key === MOVED_FIELD)!;
        expect([builtin.x, builtin.y]).toEqual([687, 160]);
        expect(f.x).not.toBe(builtin.x);
        expect(f.y).not.toBe(builtin.y);
    });

    it('the ten built-ins are still there ALONGSIDE it — a restore is not a replace', () => {
        authorTemplate();
        titleBlockStore.deserialize(titleBlockStore.serialize());
        for (const id of ['a0-standard', 'a1-standard', 'a3-standard', 'a3-portrait', 'a4-portrait']) {
            expect(titleBlockStore.get(id), id).toBeDefined();
        }
        expect(titleBlockStore.getAll().length).toBe(11);
    });

    it('only USER templates are written — the built-ins are code, not snapshot bytes', () => {
        authorTemplate();
        const snap = titleBlockStore.serialize();
        expect(snap.templates.map(t => t.id)).toEqual([AUTHORED_ID]);
        // Baking the built-ins into every file would freeze today's geometry into
        // snapshots that then never pick up a correction.
        expect(snap.templates.some(t => titleBlockStore.isBuiltin(t.id))).toBe(false);
    });

    it('a snapshot with NO titleBlocks key clears the store rather than leaking the last project', () => {
        authorTemplate();
        expect(titleBlockStore.get(AUTHORED_ID)).toBeDefined();
        // What ProjectLoader passes for a pre-ask-#4 snapshot: `undefined`.
        titleBlockStore.deserialize(undefined);
        expect(titleBlockStore.get(AUTHORED_ID), 'C13: must not survive into the next project').toBeUndefined();
        expect(titleBlockStore.get('a1-standard'), 'built-ins are not project data').toBeDefined();
    });

    it('a hostile snapshot cannot shadow a built-in id', () => {
        titleBlockStore.deserialize({
            version: 1,
            templates: [{ ...titleBlockStore.get('a1-standard')!, name: 'HIJACKED' }],
        });
        expect(titleBlockStore.get('a1-standard')!.name).toBe('A1 Standard');
    });
});

describe('TB-P2 — ⛔ THE BINDING RULE: editing a built-in FORKS it', () => {
    it('a built-in is never mutated in place — the store refuses, it does not silently no-op', () => {
        const before = JSON.parse(JSON.stringify(titleBlockStore.get('a1-standard')!));

        expect(titleBlockStore.setFieldPlacement('a1-standard', 'projectName', { localX: 0, y: 0 })).toBe(false);
        expect(titleBlockStore.update('a1-standard', { ...before, name: 'nope' })).toBe(false);
        expect(titleBlockStore.delete('a1-standard')).toBe(false);

        expect(titleBlockStore.get('a1-standard')).toEqual(before);
        const f = titleBlockStore.get('a1-standard')!.fields.find(x => x.key === 'projectName')!;
        expect([f.x, f.y]).toEqual([687, 160]);   // his issued sheets still read this
    });

    it('the fork carries the built-in’s geometry, then diverges from it', () => {
        authorTemplate();
        const fork = titleBlockStore.get(AUTHORED_ID)!;
        const src  = titleBlockStore.get('a1-standard')!;

        expect([fork.paperWidth, fork.paperHeight, fork.borderWidth])
            .toEqual([src.paperWidth, src.paperHeight, src.borderWidth]);
        expect(fork.fields).toHaveLength(src.fields.length);

        // Every field but the moved one is still where the built-in put it.
        for (const f of fork.fields) {
            if (f.key === MOVED_FIELD) continue;
            const s = src.fields.find(x => x.key === f.key)!;
            expect([f.x, f.y], f.key).toEqual([s.x, s.y]);
        }
    });

    it('isBuiltin() names all ten seeded ids and nothing the user makes', () => {
        authorTemplate();
        const builtins = titleBlockStore.getAll().filter(t => titleBlockStore.isBuiltin(t.id)).map(t => t.id);
        expect(builtins).toHaveLength(10);
        expect(titleBlockStore.isBuiltin(AUTHORED_ID)).toBe(false);
    });
});

describe('TB-P3 — ⛔ LEG 3: authoring a title block ARMS AUTOSAVE', () => {
    let saves: string[];
    let orch: SaveOrchestrator;

    beforeEach(() => {
        vi.useFakeTimers();
        saves = [];
        let n = 0;
        orch = new SaveOrchestrator({
            getHash: () => `hash-${++n}`,
            onAutoSave: (label: string) => { saves.push(label); },
            debounceMs: 10,
        });
        titleBlockStore.clearUserTemplates();
        saves.length = 0;
    });

    afterEach(() => {
        orch.dispose();
        vi.useRealTimers();
    });

    it('forking a template marks the project dirty', () => {
        titleBlockStore.fork('a1-standard', AUTHORED_ID, AUTHORED_NAME);
        vi.advanceTimersByTime(50);
        expect(saves, 'a forked title block is authored work').toHaveLength(1);
    });

    it('MOVING A FIELD marks the project dirty — this IS ask #4, and it is the easiest to lose', () => {
        titleBlockStore.fork('a1-standard', AUTHORED_ID, AUTHORED_NAME);
        vi.advanceTimersByTime(50);
        saves.length = 0;

        titleBlockStore.setFieldPlacement(AUTHORED_ID, MOVED_FIELD, { localX: MOVED_LOCAL_X, y: MOVED_Y });
        vi.advanceTimersByTime(50);
        expect(saves, 'dragging a field must arm autosave').toHaveLength(1);
    });

    it('deleting a template marks the project dirty', () => {
        titleBlockStore.fork('a1-standard', AUTHORED_ID, AUTHORED_NAME);
        vi.advanceTimersByTime(50);
        saves.length = 0;
        titleBlockStore.delete(AUTHORED_ID);
        vi.advanceTimersByTime(50);
        expect(saves).toHaveLength(1);
    });

    it('a project LOAD is not authoring — `tb:store-loaded` must NOT arm a save', () => {
        titleBlockStore.deserialize({ version: 1, templates: [] });
        vi.advanceTimersByTime(50);
        expect(saves, 'load lifecycle events are deliberately absent from MUTATION_EVENTS').toHaveLength(0);
    });
});

describe('TB-P4 — ⛔ ALL THREE LEGS, read from the source rather than assumed', () => {
    it('LEG 1: ProjectSerializer writes a titleBlocks slot', () => {
        const src = readFileSync(resolve(REPO, 'apps/editor/src/engine/persistence/ProjectSerializer.ts'), 'utf8');
        expect(src).toContain('titleBlockStore.serialize()');
        expect(src).toMatch(/titleBlocks\?:\s*\{/);
    });

    it('LEG 2: ProjectLoader reads it back', () => {
        const src = readFileSync(resolve(REPO, 'apps/editor/src/engine/persistence/ProjectLoader.ts'), 'utf8');
        expect(src).toContain('titleBlockStore.deserialize(');
    });

    it('LEG 3: the three AUTHORING events are in MUTATION_EVENTS, and the LOAD event is not', () => {
        // Reading the list, not trusting the emit — L-10700's whole lesson.
        const src = readFileSync(resolve(REPO, 'apps/editor/src/ui/platform/SaveOrchestrator.ts'), 'utf8');
        const list = src.slice(src.indexOf('MUTATION_EVENTS'), src.indexOf('MUTATION_EVENTS') + 6000);
        for (const ev of ['tb:template-created', 'tb:template-updated', 'tb:template-deleted']) {
            expect(list, ev).toContain(`'${ev}'`);
        }
        expect(list).not.toContain("'tb:store-loaded'");
    });

    it('C13: the store is registered for project-scope teardown', () => {
        const src = readFileSync(resolve(REPO, 'packages/core-app-model/src/views/TitleBlockStore.ts'), 'utf8');
        expect(src).toContain("scopeName: 'titleBlockStore'");
        expect(src).toContain('clearUserTemplates()');
    });
});
