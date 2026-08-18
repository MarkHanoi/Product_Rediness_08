// ─── §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — every element gets a type picker ───────
//
// THE ROOT CAUSE THIS SPEC EXISTS TO PREVENT RECURRING:
// `_buildTypeSelector` is a hand-written if-ladder, and the ladder IS the answer to
// "which families have a type picker?". Every previous generalisation pass
// (ADR-0105, L-620/621/622/623) audited the ladder's branches and therefore fixed
// only families that ALREADY had a picker — a family with no branch is structurally
// invisible to a review of the thing it is missing from. Railing and lighting were
// two symptoms of that one omission.
//
// The cure is a DECLARATION the panel derives from, and this spec pins the
// declaration's completeness contract:
//   (1) every declaration either publishes a catalogue OR states honestly why it has
//       none — never neither, which is the empty "Element Type —" the founder saw;
//   (2) a published catalogue is non-empty and reaches the panel's query;
//   (3) the widget renders a real <select> + Apply for a publishable family, and a
//       sentence (not silence) for a family with no catalogue;
//   (4) Apply dispatches the ONE uniform command with the chosen id;
//   (5) a family whose catalogue exists but has no change-type route must NOT
//       dispatch — a dropdown that mutates nothing is the dead control this pass
//       removes, not one it adds;
//   (6) the picker reports the element's CURRENT type from its record, and refuses
//       to claim a type the record does not have.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    allElementTypeCatalogs,
    resolveElementTypeCatalog,
} from '../ElementTypeCatalogRegistry';
import { buildGenericTypeSelectorWidget } from '../GenericTypeSelectorWidget';
import { curtainWallTypeStore } from '@pryzm/core-app-model';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { _buildTypeSelector } from '../PropertyPanelTypeSelector';

// ── (1)(2) the declaration contract ──────────────────────────────────────────

describe('ElementTypeCatalogRegistry — the declaration contract', () => {
    it('(1) every family declares EITHER a catalogue OR a reason it has none', () => {
        for (const c of allElementTypeCatalogs()) {
            const publishes = typeof c.listTypes === 'function';
            const explains = !!(c.unavailableReason || c.readOnlyReason);
            expect(
                publishes || explains,
                `family "${c.family}" declares neither a catalogue nor a reason — that is the empty "Element Type —"`,
            ).toBe(true);
            expect(c.label.length, `family "${c.family}" has no label`).toBeGreaterThan(0);
        }
    });

    it('(2) every published catalogue is non-empty and well-formed', () => {
        for (const c of allElementTypeCatalogs()) {
            if (!c.listTypes) continue;
            const types = c.listTypes();
            expect(types.length, `family "${c.family}" publishes an EMPTY catalogue`).toBeGreaterThan(0);
            for (const t of types) {
                expect(t.id, `${c.family}: a type with no id`).toBeTruthy();
                expect(t.name, `${c.family}: type "${t.id}" has no display name`).toBeTruthy();
            }
            // Ids must be unique, or Apply is ambiguous.
            expect(new Set(types.map(t => t.id)).size).toBe(types.length);
        }
    });

    it('(2) the two families the founder reported are declared or bespoke-served', () => {
        // lighting: registry-served (it had NO picker of any kind).
        expect(resolveElementTypeCatalog('lighting')).not.toBeNull();
        expect(resolveElementTypeCatalog('lighting')!.listTypes!().length).toBeGreaterThan(1);
        // stair-railing: bespoke-served, so intentionally NOT in the registry —
        // its widget resolves the shared handrail catalogue directly.
        expect(resolveElementTypeCatalog('stair-railing')).toBeNull();
    });

    it('(2) roof gains a picker for the change-type route it already had', () => {
        const roof = resolveElementTypeCatalog('roof');
        expect(roof).not.toBeNull();
        expect(roof!.listTypes!().map(t => t.id)).toContain('gable');
        expect(roof!.currentTypeId!({ roofType: 'hip' })).toBe('hip');
    });

    it('a family served by a BESPOKE widget is not double-declared', () => {
        for (const family of ['wall', 'slab', 'door', 'window', 'stair', 'furniture', 'column', 'beam']) {
            expect(resolveElementTypeCatalog(family), `${family} is declared twice`).toBeNull();
        }
    });
});

// ── (3)(4)(5)(6) the widget ──────────────────────────────────────────────────

describe('GenericTypeSelectorWidget', () => {
    const lighting = resolveElementTypeCatalog('lighting')!;

    it('(3) renders a select + Apply for a published catalogue', () => {
        const el = buildGenericTypeSelectorWidget(lighting, { id: 'l1', fixtureType: 'downlight' }, () => {});
        expect(el).not.toBeNull();
        expect(el!.querySelector('select')).not.toBeNull();
        expect(el!.querySelector('button')!.textContent).toBe('Apply');
        expect(el!.textContent).toContain('Lighting Type');
    });

    it('(3) renders a SENTENCE, not silence, for a family with no catalogue', () => {
        // §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — this case USED to prove the point
        // with `curtainwall`, whose sentence read "Curtain walls have no published type
        // catalogue — edit the grid and panels directly." That is the exact string the
        // founder reported, and this assertion is what held it in place: the sentence-not-
        // silence CONTRACT is real, but it was being demonstrated on a family that should
        // have had a catalogue all along. Curtain wall now publishes one (see below);
        // 'grid' demonstrates the same contract on a family that never will — the registry
        // declares it "Grids are datums, not typed elements."
        const grid = resolveElementTypeCatalog('grid')!;
        const el = buildGenericTypeSelectorWidget(grid, { id: 'g1' }, () => {});
        expect(el).not.toBeNull();
        expect(el!.querySelector('select')).toBeNull();
        expect(el!.textContent).toContain('datums, not typed elements');
    });

    // ── §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — the founder's report ──
    describe('curtain wall publishes a real catalogue', () => {
        it('renders a select + Apply, NOT the old "no published type catalogue" sentence', () => {
            const cw = resolveElementTypeCatalog('curtainwall')!;
            const el = buildGenericTypeSelectorWidget(cw, { id: 'cw1' }, () => {});
            expect(el).not.toBeNull();
            expect(el!.querySelector('select')).not.toBeNull();
            expect(el!.textContent).toContain('Curtain Wall Type');
            // The founder's reported string must be GONE, not merely supplemented.
            expect(el!.textContent).not.toContain('no published type catalogue');
        });

        it("preselects the wall's CURRENT type from systemTypeId, never inferred from dimensions", () => {
            const cw = resolveElementTypeCatalog('curtainwall')!;
            const el = buildGenericTypeSelectorWidget(
                cw, { id: 'cw1', systemTypeId: 'cw.glazed.pitch-750' }, () => {},
            );
            expect((el!.querySelector('select') as HTMLSelectElement).value).toBe('cw.glazed.pitch-750');
        });

        it('publishes ONLY types whose appearance the renderer can actually produce', () => {
            // ── DELIBERATELY UPDATED IN SLICE B, exactly as its predecessor demanded ──
            //
            // This assertion used to forbid any published type from NAMING a panel
            // material, because `_getPanelMaterial(panelType)` derived a panel's
            // appearance from `PANEL_TYPE_DEFAULTS[panelType]` alone and such a type
            // would have rendered as plain glazing — an affordance with no
            // implementation (`WallRake.ts:50-62`). It carried an instruction: if a
            // later slice adds the path, update this alongside the renderer, never
            // quietly delete it. Slice B added the path
            // (`CurtainWallInstanceManager` now resolves `CurtainPanelData.materialId`
            // through the master library), so the ban is lifted and replaced by the
            // obligation that REPLACES it — the reason the ban existed at all.
            //
            // THE INVARIANT IS UNCHANGED: a published type must never claim an
            // appearance the user will not get. What changed is that naming a material
            // is now a promise the renderer keeps, provided the id is real and any
            // stand-in is declared.
            const types = resolveElementTypeCatalog('curtainwall')!.listTypes!();
            expect(types.length).toBeGreaterThan(0);

            const catalogueIds = new Set(MATERIAL_CATALOG.map(m => m.id));
            for (const def of curtainWallTypeStore.getAll()) {
                if (def.panelMaterialId === undefined) continue;
                // (a) The material must be a REAL C100 row. An id that misses the library
                // silently falls back to the panelType default, which is precisely the
                // "names a finish, renders as glazing" defect wearing a new hat.
                expect(
                    catalogueIds.has(def.panelMaterialId),
                    `curtain-wall type "${def.id}" names panel material ` +
                    `"${def.panelMaterialId}", which is not a row in MATERIAL_CATALOG — ` +
                    'it would silently render as the panel type default',
                ).toBe(true);
                // (b) Same for the frame.
                if (def.mullionMaterialId !== undefined) {
                    expect(catalogueIds.has(def.mullionMaterialId), `${def.id} mullion`).toBe(true);
                }
            }

            // (c) Any type that is a STAND-IN must SAY SO where the user can read it.
            // The founder ruled that green mirror / grey shiny mirror / white satin may
            // use nearest-row substitutes "for now"; an undeclared substitute is the
            // silent-substitution defect this session keeps finding.
            for (const def of curtainWallTypeStore.getAll()) {
                if (!def.substitutionNote) continue;
                const shown = types.find(t => t.id === def.id);
                expect(shown, `${def.id} is not listed at all`).toBeTruthy();
                expect(
                    shown!.detail ?? '',
                    `curtain-wall type "${def.id}" substitutes a material but the picker ` +
                    'does not show the note — the substitution would be invisible',
                ).toContain(def.substitutionNote);
            }
        });

        it('two types that render IDENTICALLY must both say why', () => {
            // The sharpest form of the original ban. Publishing twelve names that produce
            // four appearances was the failure mode refused in Phase A. Distinct panel
            // materials are now genuinely distinct — except where the catalogue has no row
            // and a stand-in collides with another type. That is tolerable ONLY while both
            // colliding types declare it; otherwise the founder finds two identical
            // facades under two different names, which is the original defect exactly.
            const defs = curtainWallTypeStore.getAll().filter(d => d.panelMaterialId !== undefined);
            const byMaterial = new Map<string, typeof defs>();
            for (const d of defs) {
                // The identity is EVERYTHING the user sees, not the materials alone.
                // Types 13 and 14 (ribbon at 1.0 m and 1.5 m courses) share a glass and a
                // frame and are plainly different facades; keying on material alone would
                // have demanded they declare a "substitution" that is not one, and the
                // pressure would then be to weaken this guard rather than fix the key.
                const k = [
                    d.panelMaterialId, d.mullionMaterialId ?? '',
                    d.mullionPitch, d.transomCourse ?? 'none', d.mullionSize,
                ].join('|');
                byMaterial.set(k, [...(byMaterial.get(k) ?? []), d]);
            }
            for (const [key, group] of byMaterial) {
                if (group.length < 2) continue;
                for (const d of group) {
                    expect(
                        d.substitutionNote,
                        `curtain-wall types [${group.map(g => g.id).join(', ')}] all render as ` +
                        `"${key}" but "${d.id}" does not declare a substitution — the user ` +
                        'would see identical facades under different names',
                    ).toBeTruthy();
                }
            }
        });
    });

    it('(6) preselects the element\'s CURRENT type from its record', () => {
        const el = buildGenericTypeSelectorWidget(lighting, { id: 'l1', fixtureType: 'pendant' }, () => {});
        expect((el!.querySelector('select') as HTMLSelectElement).value).toBe('pendant');
    });

    it('(6) refuses to claim a type the record does not have', () => {
        const el = buildGenericTypeSelectorWidget(lighting, { id: 'l1', fixtureType: 'not-a-fixture' }, () => {});
        const sel = el!.querySelector('select') as HTMLSelectElement;
        expect(sel.value).toBe('');
        expect(sel.options[0].textContent).toContain('uncatalogued');
    });

    it('(4) Apply reports the chosen id', () => {
        const seen: string[] = [];
        const el = buildGenericTypeSelectorWidget(lighting, { id: 'l1', fixtureType: 'downlight' }, p => seen.push(p.typeId));
        const sel = el!.querySelector('select') as HTMLSelectElement;
        sel.value = 'pendant_cluster';
        (el!.querySelector('button') as HTMLButtonElement).click();
        expect(seen).toEqual(['pendant_cluster']);
    });

    it('(4) Apply on the UNCHANGED type is a no-op — no phantom command', () => {
        const seen: string[] = [];
        const el = buildGenericTypeSelectorWidget(lighting, { id: 'l1', fixtureType: 'pendant' }, p => seen.push(p.typeId));
        (el!.querySelector('button') as HTMLButtonElement).click();
        expect(seen).toEqual([]);
    });
});

// ── The panel seam: does the registry actually reach `_buildTypeSelector`? ────

interface Dispatch { type: string; payload: Record<string, unknown>; }

describe('_buildTypeSelector — the registry fall-through', () => {
    let dispatches: Dispatch[];

    beforeEach(() => {
        dispatches = [];
        (window as unknown as Record<string, unknown>).runtime = {
            bus: {
                executeCommand: (type: string, payload: Record<string, unknown>) => {
                    dispatches.push({ type, payload });
                    return Promise.resolve();
                },
            },
        };
    });

    const host = { onRerender: () => {} };

    it('(3) a LIGHTING element now gets a picker (it previously got null)', () => {
        const el = _buildTypeSelector(host, { id: 'light_1', elementType: 'Lighting', fixtureType: 'downlight' });
        expect(el).not.toBeNull();
        expect(el!.querySelector('select')).not.toBeNull();
    });

    it('(4) Apply dispatches the ONE uniform element.changeType with the chosen id', () => {
        const el = _buildTypeSelector(host, { id: 'light_1', elementType: 'Lighting', fixtureType: 'downlight' })!;
        const sel = el.querySelector('select') as HTMLSelectElement;
        sel.value = 'linear_led';
        (el.querySelector('button') as HTMLButtonElement).click();

        expect(dispatches).toHaveLength(1);
        expect(dispatches[0].type).toBe('element.changeType');
        expect(dispatches[0].payload).toMatchObject({
            elementId: 'light_1',
            elementType: 'lighting',
            newTypeId: 'linear_led',
        });
    });

    it('(4) a ROOF element dispatches too — the route existed, the picker did not', () => {
        const el = _buildTypeSelector(host, { id: 'rf-1', elementType: 'roof', roofType: 'flat' })!;
        const sel = el.querySelector('select') as HTMLSelectElement;
        sel.value = 'gable';
        (el.querySelector('button') as HTMLButtonElement).click();
        expect(dispatches[0].payload).toMatchObject({ elementType: 'roof', newTypeId: 'gable' });
    });

    it('(5) a read-only family renders its reason and dispatches NOTHING', () => {
        const el = _buildTypeSelector(host, { id: 'rm-1', elementType: 'room' });
        expect(el).not.toBeNull();
        expect(el!.querySelector('select')).toBeNull();
        expect(el!.textContent).toContain('not wired yet');
        expect(dispatches).toHaveLength(0);
    });

    it('a STAIR still reaches its bespoke widget — the ladder keeps precedence', () => {
        const el = _buildTypeSelector(host, { id: 'st-1', elementType: 'stair', typeId: 'timber-closed' });
        expect(el).not.toBeNull();
        expect(el!.className).toBe('stairts-outer');
    });

    it('an element the panel does not type still yields null', () => {
        expect(_buildTypeSelector(host, { id: 'x', elementType: 'not-an-element' })).toBeNull();
    });
});
