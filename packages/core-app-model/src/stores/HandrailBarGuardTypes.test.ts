/**
 * §FEAT-HANDRAIL-BAR-GUARD-MATRIX (C95 §15.16) — every shipped handrail preset
 * names a real material and is code-plausible as a guard.
 *
 * ─── WHAT THIS FILE EXISTS TO STOP ──────────────────────────────────────────
 * Two failure modes, both of which had ALREADY HAPPENED in this family:
 *
 * 1. **A preset naming a material the catalogue does not have.** It renders grey
 *    with no error (`resolveMaterialColour` → `unresolved` → `#cccccc`), which is
 *    exactly the ~145-warning symptom the founder is seeing right now (L-1203).
 *    A hard-coded hex is worse still: it resolves FIRST and makes every later
 *    material pick a silent no-op (C100 §2.1, L-1196).
 *
 * 2. ⭐ **A baluster preset whose balusters are not actually at the pitch its own
 *    description claims.** Measured 2026-08-19: SEVEN shipped baluster types said
 *    "at a 100 mm-sphere-compliant pitch" and shipped a clear opening between
 *    1186 mm and 1780 mm — because `HandrailFragmentBuilder` resolves the pitch as
 *    `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`, and every one of
 *    them set `postSpacing` while omitting `balusterSpacing`, so `infillMaxGap`
 *    was never reached. A documented-but-untrue safety claim is the worst class of
 *    defect, and on a child-safety element it is the worst instance of it.
 *
 * ⛔ THE CATALOGUE IS NOT STUBBED. These assertions run against the live
 * `MATERIAL_CATALOG`, so a material removed from the master fails the build here
 * rather than shipping a grey preset.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import { HandrailTypeStore, handrailTypeStore } from './HandrailTypeStore';
import type { HandrailTypeDefinition } from './HandrailTypeStore';
import { HANDRAIL_CONSTRAINTS } from './HandrailTypes';

/** The 100 mm sphere rule — the governing child-safety limit for a guard infill. */
const SPHERE_RULE_M = 0.1;

const ALL: HandrailTypeDefinition[] = new HandrailTypeStore().getBuiltIn();
const BAR_GUARDS = ALL.filter((t) => t.id.startsWith('bar-guard-'));
const BALUSTER_TYPES = ALL.filter((t) => t.fillType === 'baluster');

/**
 * The pitch `HandrailFragmentBuilder` will actually use, replicating its precedence
 * exactly. The source pin below fails if that precedence ever changes, so this
 * replica cannot drift into agreeing with a builder that no longer behaves this way.
 */
function effectivePitch(t: HandrailTypeDefinition): number {
    const authored = t.balusterSpacing ?? t.postSpacing;
    const width = t.balusterWidth ?? 0.02;
    return authored ?? (t.infillMaxGap !== undefined && t.infillMaxGap > 0 ? t.infillMaxGap + width : 0.11);
}

describe('§FEAT-HANDRAIL-BAR-GUARD-MATRIX — the matrix ships', () => {
    it('adds at least the 20 new types the founder asked for', () => {
        expect(BAR_GUARDS.length).toBeGreaterThanOrEqual(20);
    });

    it('every id is unique across the whole built-in set', () => {
        const ids = ALL.map((t) => t.id);
        expect(new Set(ids).size, `duplicate built-in ids: ${ids.length} rows`).toBe(ids.length);
    });

    it('every bar-guard NAME states the bar size, so the founder can see which axis the number landed on', () => {
        // "5 to 10 cm vertical bars" was ambiguous between bar WIDTH and bar SPACING.
        // The reading (width) is encoded in the name so it can be corrected in one
        // sentence rather than discovered later across 24 wrong types.
        for (const t of BAR_GUARDS) {
            const mm = Math.round((t.balusterWidth ?? 0) * 1000);
            expect(t.name, `${t.id} must name its bar size`).toContain(`Bar Guard ${mm} mm`);
        }
    });

    it('every bar is within the founder\'s 50–100 mm range', () => {
        for (const t of BAR_GUARDS) {
            const mm = Math.round((t.balusterWidth ?? 0) * 1000);
            expect(mm, `${t.id} bar width`).toBeGreaterThanOrEqual(50);
            expect(mm, `${t.id} bar width`).toBeLessThanOrEqual(100);
        }
    });

    it('the matrix spans the range rather than clustering on one size', () => {
        const sizes = new Set(BAR_GUARDS.map((t) => Math.round((t.balusterWidth ?? 0) * 1000)));
        expect(sizes.size, `only ${[...sizes].join(', ')} mm represented`).toBeGreaterThanOrEqual(4);
    });
});

describe('§FEAT-HANDRAIL-BAR-GUARD-MATRIX — every preset names a REAL material (C100 §2.1)', () => {
    it('every built-in resolves its materialId against the LIVE master catalogue', () => {
        const unresolved = ALL
            .filter((t) => !t.materialId || !MATERIAL_CATALOG.some((m) => m.id === t.materialId))
            .map((t) => `${t.id} -> ${t.materialId ?? '(none)'}`);
        expect(unresolved, `these presets would render grey with no error: ${unresolved.join(', ')}`).toEqual([]);
    });

    it('NO built-in carries a hex — a hex resolves first and shadows the reference forever', () => {
        const withHex = ALL.filter((t) => t.materialColor !== undefined).map((t) => t.id);
        expect(withHex, `built-ins carrying a hex override: ${withHex.join(', ')}`).toEqual([]);
    });

    it('no NEW material was minted — every bar-guard id is one the catalogue already had', () => {
        // Lane HR4 measured that one gesture minted 93 materials and the device dies
        // near 100. This set references; it never creates.
        for (const t of BAR_GUARDS) {
            expect(MATERIAL_CATALOG.some((m) => m.id === t.materialId), `${t.id}`).toBe(true);
        }
    });

    it('every bar-guard NAME matches its material\'s catalogue label', () => {
        // The name is derived from the label, so a preset cannot advertise a material
        // the catalogue does not agree with.
        for (const t of BAR_GUARDS) {
            const rec = MATERIAL_CATALOG.find((m) => m.id === t.materialId)!;
            expect(t.name.startsWith(rec.label), `${t.id}: "${t.name}" vs label "${rec.label}"`).toBe(true);
        }
    });
});

describe('§FIX-HANDRAIL-INFILLMAXGAP-DEAD — every baluster preset is code-plausible AS SHIPPED', () => {
    /**
     * ⚠ ADVISORY, NOT A COMPLIANCE VERDICT — and the difference is measured, not
     * assumed. No layer in this repository evaluates a guard rule:
     * `packages/ordinance-extraction` is the PLANNING/zoning layer, and
     * `StairValidationAuthority` — which IS region-aware (AS-1657 / EUROPEAN /
     * IBC-USA) — contains zero references to railing, guard, baluster or handrail.
     * So this test is a TYPE-LEVEL floor that keeps the presets honest; the real
     * verdict belongs to a jurisdiction authority that does not yet see this family.
     */
    it('a 100 mm sphere cannot pass through any shipped baluster preset', () => {
        const breaching = BALUSTER_TYPES
            .map((t) => ({ t, gap: effectivePitch(t) - (t.balusterWidth ?? 0.02) }))
            .filter((r) => r.gap >= SPHERE_RULE_M)
            .map((r) => `${r.t.id} (clear gap ${Math.round(r.gap * 1000)} mm)`);
        expect(breaching, `presets a child could pass through: ${breaching.join(', ')}`).toEqual([]);
    });

    it('every baluster preset sets balusterSpacing EXPLICITLY', () => {
        // This is the whole fix. Omitting it makes the builder fall through to
        // `postSpacing` — 1.5 m — and `infillMaxGap` is never consulted. Seven
        // shipped types were in exactly that state, each with a description
        // claiming a compliant pitch.
        const implicit = BALUSTER_TYPES.filter((t) => t.balusterSpacing === undefined).map((t) => t.id);
        expect(implicit, `these fall through to postSpacing: ${implicit.join(', ')}`).toEqual([]);
    });

    it('the authored pitch AGREES with the type\'s own infillMaxGap', () => {
        // pitch = gap + width is the identity the rule defines. If the two disagree,
        // the type documents one thing and builds another.
        for (const t of BALUSTER_TYPES) {
            if (t.infillMaxGap === undefined) continue;
            const expected = t.infillMaxGap + (t.balusterWidth ?? 0.02);
            expect(t.balusterSpacing!, `${t.id}`).toBeCloseTo(expected, 4);
        }
    });

    it('PINS the builder precedence this test replicates', () => {
        // §L-1037 shape: a replica that cannot notice the original changing is a
        // replica that will one day agree with nothing. If this line moves, the
        // `effectivePitch` helper above must move with it.
        const src = readFileSync(
            resolve(__dirname, '../../../geometry-handrail/src/HandrailFragmentBuilder.ts'),
            'utf-8',
        );
        expect(
            src.includes('handrail.balusterSpacing ?? handrail.postSpacing'),
            'HandrailFragmentBuilder pitch precedence changed — update effectivePitch()',
        ).toBe(true);
    });
});

describe('§FEAT-HANDRAIL-BAR-GUARD-MATRIX — presets are complete and within published bounds', () => {
    it('every built-in sits inside the ENFORCED height bounds', () => {
        for (const t of ALL) {
            expect(t.height, `${t.id} height`).toBeGreaterThanOrEqual(HANDRAIL_CONSTRAINTS.HEIGHT_MIN);
            expect(t.height, `${t.id} height`).toBeLessThanOrEqual(HANDRAIL_CONSTRAINTS.HEIGHT_MAX);
        }
    });

    it('every built-in respects the ENFORCED railDiameter / postSpacing rules', () => {
        // These mirror UpdateHandrailCommand.canExecute: railDiameter finite and > 0
        // where present, postSpacing finite and >= 0 (0 is legal — "Stair Handrail").
        for (const t of ALL) {
            if (t.railDiameter !== undefined) {
                expect(Number.isFinite(t.railDiameter) && t.railDiameter > 0, `${t.id} railDiameter`).toBe(true);
            }
            if (t.postSpacing !== undefined) {
                expect(Number.isFinite(t.postSpacing) && t.postSpacing >= 0, `${t.id} postSpacing`).toBe(true);
            }
        }
    });

    it('no bar guard leaves a field to an implicit default', () => {
        // C95 §15.15: applying a type MATERIALISES its fields, and the user cannot see
        // which value came from the type and which from a builder default — so a preset
        // with an implicit field is a preset whose result nobody can predict.
        for (const t of BAR_GUARDS) {
            for (const k of ['height', 'thickness', 'baseOffset', 'fillType', 'railProfile',
                             'postSpacing', 'balusterShape', 'balusterWidth',
                             'balusterSpacing', 'infillMaxGap', 'materialId'] as const) {
                expect(t[k], `${t.id} leaves ${k} implicit`).toBeDefined();
            }
            // `postEndCondition` is NOT in that list, and deliberately so: the type shape
            // does not carry it and `resolveHandrailTypeFields` does not project it, so
            // setting it would author a field that materialises nowhere. Absent means
            // 'redistribute' — pitch as a MAXIMUM — which is the intended convention.
            // railDiameter is the OTHER deliberate omission, and ONLY on rectangular
            // profiles: the builder does not read it there, so setting it would ship a
            // field that looks authoritative and changes nothing.
            if (t.railProfile === 'round') expect(t.railDiameter, `${t.id}`).toBeDefined();
            else expect(t.railDiameter, `${t.id} rectangular rail must not carry a dead railDiameter`).toBeUndefined();
        }
    });
});

describe('§FEAT-HANDRAIL-BAR-GUARD-MATRIX — presets survive a project lifecycle', () => {
    it('built-ins survive clearCustomTypes() — they are code, not persisted rows', () => {
        const store = new HandrailTypeStore();
        const before = store.getBuiltIn().length;
        store.add({ id: 'user-custom-1', name: 'My Rail', description: '', height: 1, thickness: 0.05,
                    baseOffset: 0, fillType: 'open', railProfile: 'round' });
        store.clearCustomTypes();
        expect(store.getBuiltIn().length, 'a project switch must not drop a preset').toBe(before);
        expect(store.getCustom()).toEqual([]);
    });

    it('a custom type cannot silently SHADOW a bar guard — the collision throws', () => {
        const store = new HandrailTypeStore();
        const victim = store.getBuiltIn().find((t) => t.id.startsWith('bar-guard-'))!;
        expect(() => store.add({ ...victim } as never)).toThrow(/already exists/);
    });

    it('the shared singleton exposes the matrix too', () => {
        // The picker reads the singleton, not a fresh store.
        expect(handrailTypeStore.getAll().filter((t) => t.id.startsWith('bar-guard-')).length)
            .toBe(BAR_GUARDS.length);
    });
});
