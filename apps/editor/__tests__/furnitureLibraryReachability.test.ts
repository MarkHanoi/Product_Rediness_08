// @vitest-environment happy-dom
/**
 * §MEDIA111 (founder, 2026-08-26) — the Interiors library is REGISTRY-DERIVED,
 * measured in both directions.
 *
 * The founder's audit ask: *"check all the elements (decoration, lighting) that
 * are created via [PRYZM AI / Furnish All] but not accessible via UI."* The
 * audit found 39 buildable furniture kinds with NO library card — the
 * authored-but-unreachable pattern (L-11503 killed it for lighting by deriving
 * the palette from the registry). The carousel registry is a hand-list
 * (CATEGORIES_A + CATEGORIES_B), and a hand-list cannot be fully derived
 * without per-kind labels and footprints that live nowhere else — so this
 * test is the derivation: it reads the REGISTRY (`FURNITURE_TYPE_TO_CATEGORY`,
 * the exhaustive Record over every FurnitureType — a kind cannot be minted
 * without a row there) and fails the build whenever a kind exists without a
 * card, unless the kind is on the NAMED ledger below.
 *
 * Both arms are SET comparisons, never counts (the check-contract-index-
 * equivalence lesson: a right count with a wrong set is still wrong):
 *   • arm A — authored ⇒ reachable: every FurnitureType has a card or a named
 *     reason (shrink-only ledger);
 *   • arm B — the ledger is honest: no ledgered kind has quietly grown a card;
 *   • arm C — reachable ⇒ authored: no parametric card names a ghost kind.
 */
import { describe, it, expect } from 'vitest';
import { FURNITURE_TYPE_TO_CATEGORY } from '@pryzm/geometry-furniture';
import { getCategories } from '../src/ui/furniture-carousel/FurnitureCategoryRegistry';

/**
 * Kinds that have NO library card BY DESIGN. Every row names its reason.
 * SHRINK-ONLY: adding a row here is how a lane hides an unreachable kind —
 * do it only with a reason a reviewer can falsify.
 */
const NO_CARD_BY_DESIGN: Readonly<Record<string, string>> = {
    sofa:         'semantic alias → 2-seat (the sofa_1seat/2seat/3seat cards are the library surface)',
    sofa_unit:    'auto-furnish modular section — the sofa cards are its UI surface',
    lounge_chair: 'semantic alias → chair_barcelona_black, which has a card',
    rug:          'auto-furnish semantic rug: draws deterministically from the 13 carpet cards; a card would place an unknown design',
    ai_element:   'requires aiElementConfig — created only through PRYZM AI (FurnitureFactory throws without it)',
    glb_import:   'GLB catalogue import — every kave_* card IS this kind',
    bath:         'D-FLE projection of the plumbing bath; the UI surface is plumbing:bath:default (Services consolidation)',
    wc_washbasin: 'D-FLE projection of the plumbing basin; the UI surface is plumbing:sink:default',
    wc_mirror:    'compact WC mirror for the D-FLE WC archetype; bathroom_mirror is the UI surface',
};

const GLB_OR_SENTINEL = (t: string): boolean =>
    t.startsWith('kave_') || t.startsWith('plumbing:') || t.startsWith('wip_');

describe('§MEDIA111 — Interiors library is registry-derived (authored ⇒ reachable)', () => {
    const registryKinds = Object.keys(FURNITURE_TYPE_TO_CATEGORY);
    const cardTypes = new Set(getCategories().flatMap((c) => c.items.map((i) => i.type)));

    it('arm A — every FurnitureType has a library card, or a NAMED reason it has none', () => {
        const unreachable = registryKinds.filter(
            (t) => !cardTypes.has(t) && !(t in NO_CARD_BY_DESIGN),
        );
        expect(
            unreachable,
            `authored-but-unreachable kinds — add a card or a falsifiable ledger row:\n  ${unreachable.join('\n  ')}`,
        ).toEqual([]);
    });

    it('arm B — the ledger is shrink-only: no ledgered kind has grown a card', () => {
        const stale = Object.keys(NO_CARD_BY_DESIGN).filter((t) => cardTypes.has(t));
        expect(stale, 'remove these rows from NO_CARD_BY_DESIGN — they have cards now').toEqual([]);
    });

    it('arm C — every parametric card names a kind the registry knows (no ghost cards)', () => {
        const ghosts = [...cardTypes].filter(
            (t) => !GLB_OR_SENTINEL(t) && !(t in FURNITURE_TYPE_TO_CATEGORY),
        );
        expect(ghosts).toEqual([]);
    });

    it('arm D — every card category id is a category the rail can render', () => {
        const ids = getCategories().map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);   // no duplicate category descriptors
        for (const id of ['electronics', 'utility']) expect(ids).toContain(id);
    });
});
