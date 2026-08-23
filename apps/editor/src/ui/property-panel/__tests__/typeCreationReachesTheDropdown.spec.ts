/**
 * @file apps/editor/src/ui/property-panel/__tests__/typeCreationReachesTheDropdown.spec.ts
 *
 * §FIX-TYPE-CREATED-THEN-NOTHING (L-10068) — lane LAYERMAT10, 2026-08-23.
 *
 * Founder: *"new type creation doesn't work"*, with his console showing the type
 * being created TWICE and nothing following it:
 *   [SlabTypeSelectorWidget] Created new type: Custom Slab Type st-1787522180714
 *   [SlabTypeSelectorWidget] Created new type: zfh st-1787522228499
 * …and no `UPDATE_SLAB_TYPE`, no apply, no dropdown refresh.
 *
 * ⭐ THE LOG CANNOT TELL THE TWO CANDIDATE HALVES APART, so both are measured here
 * and they get DIFFERENT verdicts — which is the point of the suite:
 *
 *   · ARM A — does the created type reach the OPTION LIST?  Pre-fix: NO. The list
 *     was built once at widget construction and `_handleNewType` returned `void`
 *     with nothing listening. **This was the whole defect.**
 *   · ARM B — does APPLY reach the bus with the new type?  Pre-fix the dispatch
 *     path was fine — but UNREACHABLE, because you cannot select what is not in the
 *     list. Arm B pins that the working half is now actually usable.
 *
 * ⛔ "It doesn't work" is not allowed to stay a guess: A fails pre-fix, B passes
 * once A does. One broken half that made the other look broken.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSlabTypeSelectorWidget } from '../SlabTypeSelectorWidget';
import { buildFloorTypeSelectorWidget } from '../FloorTypeSelectorWidget';
import { buildCeilingTypeSelectorWidget } from '../CeilingTypeSelectorWidget';

// ── A minimal type store with the two methods the widgets actually call ──────

/**
 * ⚠ THREE SIBLING WIDGETS, THREE STORE APIS — measured, not assumed. Slab writes
 * `typeStore.add(...)`; floor and ceiling write `typeStore.addCustomType(...)`.
 * The fake carries both rather than picking one, because a harness that models
 * only the API it happened to look at first is the §fake-more-capable-than-real
 * trap in reverse: it would have reported floor and ceiling GREEN by never
 * reaching their write at all.
 */
function makeStore(seed: any[] = []) {
    const rows = [...seed];
    const add = (t: any) => { rows.push(t); return t; };
    return {
        rows,
        getAll: () => [...rows],
        getById: (id: string) => rows.find(r => r.id === id) ?? null,
        add,
        addCustomType: add,
    };
}

const BUILTIN = {
    id: 'st-builtin', name: 'RC 200', description: '', totalThickness: 0.2,
    layers: [{ name: 'RC Concrete', function: 'structure', thickness: 0.2, materialColor: '#909090' }],
};

/** The three widgets share one shape; the suite drives all three. */
const FAMILIES = [
    { kind: 'slab',    build: buildSlabTypeSelectorWidget,    storeKey: 'slabSystemTypeStore' },
    { kind: 'floor',   build: buildFloorTypeSelectorWidget,   storeKey: 'floorSystemTypeStore' },
    { kind: 'ceiling', build: buildCeilingTypeSelectorWidget, storeKey: 'ceilingSystemTypeStore' },
] as const;

let promptQueue: string[] = [];

beforeEach(() => {
    promptQueue = [];
    (globalThis as any).window.prompt = vi.fn(() => promptQueue.shift() ?? null);
    // ⛔ If the fix regressed to the old workaround this would fire; failing loudly
    // on it is deliberate — the alert told the user to work around the bug.
    (globalThis as any).window.alert = vi.fn(() => {
        throw new Error('an alert() fired — the "re-select the element" workaround is back');
    });
});

afterEach(() => {
    document.body.innerHTML = '';
    for (const f of FAMILIES) delete (globalThis as any).window[f.storeKey];
});

function mount(fam: typeof FAMILIES[number], store: any) {
    (globalThis as any).window[fam.storeKey] = store;
    const applied: any[] = [];
    const el = fam.build(
        { id: `${fam.kind}_1`, elementType: fam.kind, type: fam.kind, systemTypeId: null } as any,
        (p: any) => { applied.push(p); },
    );
    expect(el, `${fam.kind} widget returned null`).toBeTruthy();
    document.body.appendChild(el!);
    return { applied, sel: el!.querySelector('select') as HTMLSelectElement, el: el! };
}

/** Drive the real "New Type…" flow through the real prompts. */
function createTypeVia(sel: HTMLSelectElement, name: string, mm: string): void {
    promptQueue = [name, mm];
    sel.value = '__new__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── ARM A — the half that was broken ─────────────────────────────────────────

describe('L-10068 ARM A — a created type reaches the dropdown', () => {

    for (const fam of FAMILIES) {
        it(`FAILS PRE-FIX: ${fam.kind} — the new type appears in the option list`, () => {
            const store = makeStore([BUILTIN]);
            const { sel } = mount(fam, store);
            const before = [...sel.options].length;

            createTypeVia(sel, 'zfh', '250');

            expect(store.rows.length, 'the type was not even stored').toBe(2);
            const labels = [...sel.options].map(o => o.textContent ?? '');
            expect(
                labels.some(l => l.includes('zfh')),
                'the type was created and is NOT in the dropdown — this is the founder\'s ' +
                '"new type creation doesn\'t work": it exists and is unselectable',
            ).toBe(true);
            expect([...sel.options].length).toBe(before + 1);
        });

        it(`${fam.kind} — and it is SELECTED, so Apply is reachable in one gesture`, () => {
            const store = makeStore([BUILTIN]);
            const { sel } = mount(fam, store);
            createTypeVia(sel, 'zfh', '250');
            const created = store.rows[1];
            expect(sel.value).toBe(created.id);
        });

        it(`${fam.kind} — the new option is placed ABOVE the action rows, not under "New Type…"`, () => {
            const store = makeStore([BUILTIN]);
            const { sel } = mount(fam, store);
            createTypeVia(sel, 'zfh', '250');
            const values = [...sel.options].map(o => o.value);
            const created = store.rows[1];
            expect(values.indexOf(created.id)).toBeLessThan(values.indexOf('__duplicate__'));
        });

        it(`${fam.kind} — the user is TOLD what happened and what is still owed (C16 CA-21)`, () => {
            const store = makeStore([BUILTIN]);
            const { el } = mount(fam, store);
            createTypeVia(el.querySelector('select') as HTMLSelectElement, 'zfh', '250');
            const status = el.querySelector('.ets-status') as HTMLElement;
            expect(status, 'no status line').toBeTruthy();
            expect(status.style.display).toBe('block');
            expect(status.textContent).toContain('zfh');
            expect(status.textContent).toContain('Apply');
        });
    }
});

// ── ARM B — the half that was NOT broken, now reachable ──────────────────────

describe('L-10068 ARM B — Apply carries the new type (the dispatch half was fine)', () => {

    for (const fam of FAMILIES) {
        it(`${fam.kind}: Apply after creation sends the new type's id, layers and thickness`, () => {
            const store = makeStore([BUILTIN]);
            const { sel, applied, el } = mount(fam, store);
            createTypeVia(sel, 'zfh', '250');

            const apply = [...el.querySelectorAll('button')]
                .find(b => (b.textContent ?? '').includes('Apply')) as HTMLButtonElement;
            apply.click();

            expect(applied.length, 'Apply did not fire').toBe(1);
            const created = store.rows[1];
            expect(applied[0].systemTypeId).toBe(created.id);
            expect(applied[0].thickness).toBeCloseTo(0.25, 6);
            expect(applied[0].layers.length).toBe(1);
        });

        /**
         * ⛔ CREATING IS NOT APPLYING. Same discipline as §FIX-LEVEL-MOVE-NEEDS-A-GESTURE
         * (L-10060) one file over: a model mutation needs its own gesture.
         */
        it(`${fam.kind}: creating a type does NOT retype the element on its own`, () => {
            const store = makeStore([BUILTIN]);
            const { sel, applied } = mount(fam, store);
            createTypeVia(sel, 'zfh', '250');
            expect(applied, 'creating a type applied it without an Apply click').toEqual([]);
        });
    }
});

// ── The refusal paths must survive ───────────────────────────────────────────

describe('L-10068 — the refusals still refuse', () => {

    it('cancelling the name prompt creates nothing', () => {
        const store = makeStore([BUILTIN]);
        const { sel } = mount(FAMILIES[0], store);
        promptQueue = [];
        sel.value = '__new__';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        expect(store.rows.length).toBe(1);
    });

    it('an invalid thickness creates nothing and does not touch the dropdown', () => {
        const store = makeStore([BUILTIN]);
        const { sel } = mount(FAMILIES[0], store);
        const before = [...sel.options].length;
        // The widget alerts on an invalid thickness; the beforeEach alert throws, so
        // assert the refusal happened rather than pretending the alert is fine.
        expect(() => createTypeVia(sel, 'bad', '-5')).toThrow(/alert\(\) fired/);
        expect(store.rows.length).toBe(1);
        expect([...sel.options].length).toBe(before);
    });
});
