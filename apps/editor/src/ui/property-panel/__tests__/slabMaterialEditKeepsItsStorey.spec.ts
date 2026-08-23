/**
 * @file apps/editor/src/ui/property-panel/__tests__/slabMaterialEditKeepsItsStorey.spec.ts
 *
 * §FIX-LEVEL-MOVE-NEEDS-A-GESTURE (L-10060/L-10061) — lane LAYERMAT10, 2026-08-23.
 *
 * ─── THE FOUNDER'S REPORT, AND THE LAYER IT IS PROVED AT ────────────────────
 *
 * "after changing material and colour of the slab — it shifts location — it
 * moves — why? solve it — architecturally sound — no shortcuts", with:
 *
 *   [elementLevelChangedMirror] §L-946: slab slab_01M0R5XZ… moved L0 → L1787517791662
 *   [YjsDocAdapter] W5-3: command type 'slab.changeLevel' has NO sync disposition.
 *   [LevelPlaneConstraint] Locked model Y=2.8000 … for element "Slab"
 *   …later… [CommandManager] EXECUTE: UPDATE_SLAB_LAYERS / UPDATE_ELEMENT_PARAMETER
 *
 * ⭐ MEASURED ROOT, not the briefed hypothesis. The brief proposed "a panel
 * re-render writes the level select's value back". THAT IS NOT WHAT HAPPENS —
 * `opt.selected = true` never fires `change`, and nothing in the client
 * synthesises one (`dispatchEvent(new Event('change'` over production code → 0
 * hits; every hit in the repo is a test). What IS true, and is the whole defect:
 * the storey `<select>` in the Spatial Context card COMMITTED AN IRREVERSIBLE
 * `<family>.changeLevel` ON A BARE `change` EVENT — and it is the ONLY site in
 * the client that dispatches that verb outside the AI host. It sits two sections
 * ABOVE the LAYERS table inside `.gpp-panel { overflow-y: auto }`, so every route
 * to the material controls runs the pointer and the keyboard straight over it,
 * which is why the move landed BEFORE either material command in his log.
 *
 * The file already knew: `_buildDuplicateToLevelRow`'s own header says
 * "committing it on the same accidental scroll-wheel over a `<select>` would
 * scatter copies through the model. The target is chosen, then confirmed."
 * The same reasoning was written down one row away and not applied here.
 *
 * ─── WHY THESE ASSERTIONS AND NOT A UNIT TEST ON THE COMMAND ────────────────
 *
 * §COMMITTED-IS-NOT-REACHABLE. `slab.changeLevel` is a correct command; asserting
 * anything about it would prove nothing, because THE DISPATCH is the bug. So
 * these drive the REAL section builder, find the REAL control, fire REAL events,
 * and read what reaches the bus.
 *
 * ⛔ Arm 1 FAILS ON THE PRE-FIX TREE — a bare `change` dispatched `slab.changeLevel`
 * there and dispatches nothing here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _buildSpatialSection } from '../PropertyPanelSections';

// ── The world the panel reads ────────────────────────────────────────────────

const GROUND = { id: 'L0', name: 'Ground Floor', elevation: 0 };
const UPPER  = { id: 'L1787517791662', name: 'Level 1', elevation: 2.8 };

interface Dispatch { verb: string; payload: any }

let dispatched: Dispatch[] = [];

const slab = (over: Record<string, unknown> = {}) => ({
    id: 'slab_01M0R5XZ2PTAST99SNNG9TN2J6',
    elementType: 'slab',
    type: 'slab',
    levelId: 'L0',
    thickness: 0.2,
    materialColor: '#909090',
    layers: [{ name: 'RC Concrete', function: 'structure', thickness: 0.2, materialColor: '#909090' }],
    ...over,
});

beforeEach(() => {
    dispatched = [];
    (globalThis as any).window.bimManager = {
        getLevels: () => [GROUND, UPPER],
        getLevelById: (id: string) => [GROUND, UPPER].find(l => l.id === id),
    };
    (globalThis as any).window.runtime = {
        bus: {
            executeCommand: (verb: string, payload: any) => {
                dispatched.push({ verb, payload });
                return Promise.resolve({ ok: true });
            },
        },
    };
});

afterEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as any).window.bimManager;
    delete (globalThis as any).window.runtime;
});

function mountSpatial(el: Record<string, unknown>): HTMLElement {
    const section = _buildSpatialSection(el, false);
    document.body.appendChild(section);
    return section;
}

/**
 * Found by WHAT IT CONTAINS, never by the class this lane added.
 *
 * ⭐ This matters for the pre-fix proof and is not fussiness. A selector keyed on
 * `.gpp-level-change-select` would make every arm below fail on the OLD tree with
 * "control not found" — a green-to-red transition that says nothing about the
 * defect, and would pass again the moment someone re-added the class while
 * leaving the `change` dispatch in place. Keying on the OPTION SET (the storey
 * ids, which both trees render) makes the pre-fix failure land on the assertion
 * that matters: the bus received `slab.changeLevel` from a bare `change`.
 *
 * The "Duplicate to" row renders a second, near-identical select over the same
 * levels, so the two are told apart by their PRESELECTION, which is the one thing
 * the two rows deliberately disagree about: change-level preselects the storey
 * the element is ON, duplicate-to preselects one it is NOT on.
 */
const levelSelect = (): HTMLSelectElement | null => {
    const all = [...document.querySelectorAll('select')] as HTMLSelectElement[];
    const overLevels = all.filter(s =>
        [...s.options].length === 2 &&
        [...s.options].every(o => o.value === GROUND.id || o.value === UPPER.id));
    return overLevels.find(s => s.value === 'L0') ?? null;
};

const moveBtn = (): HTMLButtonElement =>
    document.querySelector('button.gpp-level-change-move') as HTMLButtonElement;

const levelMoves = (): Dispatch[] =>
    dispatched.filter(d => d.verb.endsWith('.changeLevel'));

// ── ARM 1 — the regression the founder reported ──────────────────────────────

describe('L-10060 — a stray change on the storey control moves NOTHING', () => {

    it('renders the storey control for a slab at all (the control is not removed)', () => {
        mountSpatial(slab());
        expect(levelSelect(), 'the storey <select> must still exist — L-1032 put it there').toBeTruthy();
        expect(moveBtn(), 'and it must now be paired with an explicit confirm').toBeTruthy();
    });

    it('FAILS PRE-FIX: a bare change event dispatches no command', () => {
        mountSpatial(slab());
        const sel = levelSelect()!;
        // Exactly what a wheel tick or an arrow key does to a focused <select>
        // on the way down the panel to the LAYERS table.
        sel.value = UPPER.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));

        expect(
            levelMoves(),
            'a change on the storey select reached the bus — this is the slab moving ' +
            'from L0 to L1787517791662 while the user scrolls to the material controls',
        ).toEqual([]);
        expect(dispatched, 'nothing at all should reach the bus from a select change').toEqual([]);
    });

    it('the confirm button is DISARMED while the chosen storey is the current one', () => {
        mountSpatial(slab());
        expect(moveBtn().disabled).toBe(true);
        const sel = levelSelect()!;
        sel.value = UPPER.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        expect(moveBtn().disabled).toBe(false);
    });

    it('clicking Move with the CURRENT storey selected is a no-op, not a second command', () => {
        mountSpatial(slab());
        moveBtn().click();
        expect(dispatched).toEqual([]);
    });

    // A fix that removes the feature is not a fix.
    it('choose-then-confirm still dispatches the real verb with the register field names', () => {
        mountSpatial(slab());
        const sel = levelSelect()!;
        sel.value = UPPER.id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        moveBtn().click();

        expect(levelMoves().length, 'the deliberate gesture must still move the slab').toBe(1);
        const { verb, payload } = levelMoves()[0];
        expect(verb).toBe('slab.changeLevel');
        // §L-978 — the payload is built from LEVEL_CHANGE_VERBS, so the field
        // spelling is the family's own (`slabId`/`levelId`), not `id`/`newLevelId`.
        expect(payload.slabId).toBe('slab_01M0R5XZ2PTAST99SNNG9TN2J6');
        expect(payload.levelId).toBe(UPPER.id);
    });
});

// ── ARM 2 — the same control, every other family that has it ─────────────────
//
// A defect in a SHARED panel section is rarely one family's. `_buildLevelChangeRow`
// is the single row all twelve families in LEVEL_CHANGE_VERBS render, so walls had
// exactly the same coupling and these pin that the fix reached them too.

describe('L-10060 — the coupling was never slab-only', () => {
    const FAMILIES = [
        { elementType: 'wall',      verb: 'wall.changeLevel' },
        { elementType: 'roof',      verb: 'roof.changeLevel' },
        { elementType: 'column',    verb: 'column.changeLevel' },
        { elementType: 'furniture', verb: 'furniture.changeLevel' },
    ];

    for (const fam of FAMILIES) {
        it(`${fam.elementType}: a bare change dispatches nothing; Move dispatches ${fam.verb}`, () => {
            mountSpatial({
                id: `${fam.elementType}_1`,
                elementType: fam.elementType,
                type: fam.elementType,
                levelId: 'L0',
            });
            const sel = levelSelect()!;
            expect(sel, `${fam.elementType} must render the storey control`).toBeTruthy();

            sel.value = UPPER.id;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            expect(levelMoves(), `${fam.elementType} moved on a bare change event`).toEqual([]);

            moveBtn().click();
            expect(levelMoves().map(d => d.verb)).toEqual([fam.verb]);
        });
    }

    it('a DOOR still gets the declared refusal, not a control (C15 §2)', () => {
        mountSpatial({ id: 'door_1', elementType: 'door', type: 'door', levelId: 'L0' });
        expect(levelSelect(), 'a hosted element must NOT get a storey control').toBeFalsy();
        expect(document.body.textContent).toContain('door belongs to its host wall');
    });
});
