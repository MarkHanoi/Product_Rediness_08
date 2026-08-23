/**
 * FinishMaterialSelect — §OPENING-FINISH-IS-A-REFERENCE (L-7700 … L-7712)
 * =======================================================================
 *
 * THE ONE finish-material picker for hosted openings (door + window), at both
 * tiers the user can author: the TYPE (New/Duplicate Type… editor, the Data
 * Workbench element-types panel) and the INSTANCE (the property inspector).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * The founder's report, verbatim: *"all materials to be dynamic — nothing text.
 * The materials should be fetched from real data from the material library."*
 * The measured defect behind it (2026-08-23):
 *
 *   • `FinishTypeEditorModal` offered a FREE-TEXT input per finish slot. A type
 *     created there was born carrying the string `"Steel Frame"` and no
 *     `materialId` at all — C100 §2.1's *"an element carrying only a hex has
 *     irreversibly lost the name"*, one tier up.
 *   • `WindowSection.ts` rendered `Finish Material` as a free-text box writing
 *     `finishMaterial`, a derived display STRING. `DoorSection.ts` had already
 *     been given real library dropdowns. Two surfaces for one concept, drifted.
 *   • ZERO of the 8 built-in window types and ZERO of the 9 built-in door types
 *     carried a `materialId` on any finish slot, so `windowFinishColour.ts`'s
 *     C100 ladder — which is CORRECT and already shipped — had nothing to
 *     resolve and fell through to the cached hex on every single opening.
 *
 * So the master was reachable, the resolver was right, and the AUTHORING SURFACE
 * could not name a material. That is §AUTHORED-BUT-UNWIRED-IS-THE-BOTTLENECK:
 * the fix is a wire and a seed, not a new data model.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *
 *  - **C100 §1.1 / §1.3** — this file mints NO material table. It reads
 *    `STANDARD_MATERIAL_LIBRARY`, the derived projection of `MATERIAL_CATALOG`.
 *    Apply C100 §3's review test: *rename or recolour a material in the master —
 *    does this file need editing?* **No.** Adapter, not duplicate.
 *  - **C100 §2.1** — the picker writes `materialId` as the identity and
 *    `materialColor` as the CACHE resolved from it. It never writes a hex the
 *    master did not supply.
 *  - **C100 §5 / §CONTEXT-DATA-HONESTY** — FOUR states, never collapsed into
 *    one. See {@link FinishMaterialState}. In particular a legacy free-text
 *    finish is NEVER rendered as *"— select material —"*: **"the user's value was
 *    never a library material" and "nobody has chosen one yet" are different
 *    facts and must not be the same value.**
 *  - **C03 / P6** — pure DOM builder. No store writes, no command dispatch: the
 *    caller owns the mutation.
 *  - **P2** — no THREE. `STANDARD_MATERIAL_LIBRARY` entries are read for `id`,
 *    `label`, `category` and `params.color` only.
 *
 * ⛔ **KNOWN GAP, NAMED RATHER THAN HIDDEN (L-7712).** This picker offers the
 * **T1** built-in tier only. C100 §1.1 resolves **T2 then T1**, and
 * `MaterialsBucket.ts` does offer T2 ("My Materials") because it sits in
 * `apps/editor` where the `@pryzm/core-app-model` root barrel is already paid
 * for. Importing that barrel from an L2 geometry package to reach
 * `userMaterialStore` would drag the whole model layer into the door/window
 * bundles. The gap is real: a user-created material is assignable to an opening
 * from the Data Workbench and not from the inspector. It is logged, not papered
 * over.
 */

// ⚠ C100 §1.3 — `findMaterialById` / `materialHexById` are the DESIGNATED
// accessors and the contract's wording is a MUST: *"MUST use these; MUST NOT
// hand-roll `.find()` over the array, and MUST NOT add a rival accessor."*
// The private `makeMaterialSelect` this file replaces hand-rolled the scan twice
// (`DoorSection.ts` findColor + the change handler), which is exactly how each
// call site acquires its own miss behaviour. `STANDARD_MATERIAL_LIBRARY` is still
// imported — for ENUMERATION, which is a different question from lookup and has
// no designated accessor.
import {
    STANDARD_MATERIAL_LIBRARY,
    findMaterialById,
    materialHexById,
} from '@pryzm/core-app-model/material-library';

/** Neutral chip colour when nothing is resolvable. Deliberately not a building material. */
const NO_MATERIAL_SWATCH = '#e0d8d0';

/**
 * C100 §5 — what the picker is actually showing, as a NAMED state.
 *
 * `unresolved` and `legacy` are the two the old free-text box collapsed into
 * silence, and they are different defects with different fixes:
 *   • `unresolved` — an id IS stored and names nothing. The catalogue lost a row,
 *     or the id drifted. Fixing it may mean fixing the master.
 *   • `legacy` — no id was ever stored; the user has a free-text name from before
 *     openings referenced materials. Fixing it means picking one, and the name
 *     must survive on screen until they do.
 */
export type FinishMaterialState = 'resolved' | 'unresolved' | 'legacy' | 'empty';

/** Sentinel option values. Prefixed so they can never collide with a master id. */
const OPT_NONE = '';
const OPT_KEEP_LEGACY = '__legacy__';
const OPT_KEEP_UNRESOLVED = '__unresolved__';

export interface FinishMaterialSelectOptions {
    /** The stored `materialId`, when the finish has one. */
    currentId?: string | undefined;
    /**
     * The stored free-text finish `name`, used ONLY to render the honest
     * `legacy` state when `currentId` is absent. Never written back as an id.
     */
    legacyName?: string | undefined;
    /**
     * Called on an explicit user pick. `materialId` is `''` when the user
     * selected "— no material —"; the caller decides what that means for its
     * record (C11 §5.4 — the domain rule is the caller's, not the widget's).
     */
    onChange: (materialId: string, materialColor: string, materialLabel: string) => void;
    /** Rendered but not editable — e.g. a built-in type that must be duplicated first. */
    disabled?: boolean;
    /** Reason surfaced as a tooltip when `disabled`. C06: never a dead control with no explanation. */
    disabledReason?: string;
}

/** '#rrggbb' for a master id, or `undefined` when it does not resolve. C100 §5: never a substitute. */
export function finishMaterialHex(id: string | undefined): string | undefined {
    if (!id) return undefined;
    return materialHexById(id);
}

/** The master's display label for an id, or `undefined` on a miss. */
export function finishMaterialLabel(id: string | undefined): string | undefined {
    if (!id) return undefined;
    return findMaterialById(id)?.label;
}

/**
 * Classify what a finish slot currently holds. Exported so panels and tests can
 * assert the STATE rather than re-deriving it from two nullable fields.
 */
export function finishMaterialState(
    currentId: string | undefined,
    legacyName: string | undefined,
): FinishMaterialState {
    const id = currentId?.trim();
    if (id) return finishMaterialHex(id) ? 'resolved' : 'unresolved';
    return legacyName?.trim() ? 'legacy' : 'empty';
}

const normalise = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Best-effort SUGGESTION for a legacy free-text finish name.
 *
 * ⛔ **THIS IS NOT A RESOLUTION PATH AND MUST NOT BECOME ONE.** C100 §5's last
 * MUST: *"an INFERRED value is reported as inference, not as resolution.
 * Inference that passes for resolution is the same lie one layer up."* Nothing
 * here is ever written automatically — the returned id is offered to the user as
 * a labelled option they must choose, and the legacy string stays on screen and
 * in the record until they do.
 *
 * Matching is deliberately conservative: exact normalised equality against the
 * master's label, then a whole-word containment both ways. `"Steel Frame"` finds
 * nothing (there is no master row called that) and that is the CORRECT answer —
 * a near-miss guess is how `wood-oak` and `wood-walnut` became one grey-teal in
 * the furniture bridge (C100 §9.4).
 */
export function suggestMaterialForLegacyName(legacyName: string | undefined): string | undefined {
    const want = normalise(legacyName ?? '');
    if (want.length < 3) return undefined;

    for (const m of STANDARD_MATERIAL_LIBRARY) {
        if (normalise(m.label) === want) return m.id;
    }
    const wantWords = want.split(' ').filter((w) => w.length > 2);
    if (wantWords.length === 0) return undefined;

    for (const m of STANDARD_MATERIAL_LIBRARY) {
        const have = normalise(m.label).split(' ');
        if (wantWords.every((w) => have.includes(w))) return m.id;
    }
    return undefined;
}

/**
 * Build the picker.
 *
 * Layout is `[swatch] [select]` filling the panel's shared value column, matching
 * every other control in the inspector (§FIX-PROPERTIES-PANEL-POLISH).
 */
export function buildFinishMaterialSelect(opts: FinishMaterialSelectOptions): HTMLElement {
    const currentId = opts.currentId?.trim() || undefined;
    const legacyName = opts.legacyName?.trim() || undefined;
    const state = finishMaterialState(currentId, legacyName);

    const wrap = document.createElement('div');
    wrap.className = 'fms-wrap';
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;min-width:0;';
    wrap.dataset.finishState = state;

    const swatch = document.createElement('div');
    swatch.className = 'fms-swatch';
    const paintSwatch = (hex: string | undefined): void => {
        swatch.style.background = hex ?? NO_MATERIAL_SWATCH;
    };
    swatch.style.cssText =
        'width:14px;height:14px;border-radius:3px;flex-shrink:0;border:1px solid rgba(0,0,0,.12);';
    paintSwatch(finishMaterialHex(currentId));

    const sel = document.createElement('select');
    sel.className = 'dw-select fms-select';
    sel.style.cssText = 'flex:1 1 auto;min-width:0;';
    if (opts.disabled) {
        sel.disabled = true;
        if (opts.disabledReason) sel.title = opts.disabledReason;
    }

    const addOption = (value: string, text: string, selected = false): HTMLOptionElement => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = text;
        if (selected) o.selected = true;
        sel.appendChild(o);
        return o;
    };

    // ── The honest head of the list — C100 §5 ────────────────────────────────
    // Exactly one of these three heads renders, and each one SAYS which state the
    // slot is in. The old free-text box said nothing, which is why a lost material
    // and an unset one looked identical.
    if (state === 'legacy') {
        addOption(OPT_KEEP_LEGACY, `⚠ "${legacyName}" — not a library material`, true);
        const suggestion = suggestMaterialForLegacyName(legacyName);
        if (suggestion) {
            addOption(suggestion, `↪ Use ${finishMaterialLabel(suggestion)}`);
        }
        addOption(OPT_NONE, '— no material —');
        wrap.title =
            `This finish carries the text "${legacyName}", which is not a material in the library. ` +
            'Pick one to give it a colour, a carbon factor and a place in the schedules. ' +
            'Your text is kept until you do.';
    } else if (state === 'unresolved') {
        addOption(OPT_KEEP_UNRESOLVED, `⚠ Unresolved material (${currentId})`, true);
        addOption(OPT_NONE, '— no material —');
        wrap.title =
            `This finish references the material id "${currentId}", which is not in the library. ` +
            'It has not been changed. Pick a material to replace the reference.';
    } else {
        addOption(OPT_NONE, '— select material —', state === 'empty');
    }

    // ── The master, grouped by category ──────────────────────────────────────
    const grouped = new Map<string, typeof STANDARD_MATERIAL_LIBRARY>();
    for (const m of STANDARD_MATERIAL_LIBRARY) {
        const list = grouped.get(m.category) ?? [];
        list.push(m);
        grouped.set(m.category, list);
    }
    Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([cat, mats]) => {
            const grp = document.createElement('optgroup');
            grp.label = cat;
            for (const m of mats) {
                const o = document.createElement('option');
                o.value = m.id;
                o.textContent = m.label;
                if (m.id === currentId) o.selected = true;
                grp.appendChild(o);
            }
            sel.appendChild(grp);
        });

    sel.addEventListener('change', () => {
        const value = sel.value;
        // Re-selecting the honest head is a no-op, never a write. A user who opens
        // the list and closes it again must not silently lose their legacy string.
        if (value === OPT_KEEP_LEGACY || value === OPT_KEEP_UNRESOLVED) return;

        const hex = finishMaterialHex(value);
        paintSwatch(hex);
        wrap.dataset.finishState = value ? (hex ? 'resolved' : 'unresolved') : 'empty';
        wrap.title = '';
        opts.onChange(value, hex ?? NO_MATERIAL_SWATCH, finishMaterialLabel(value) ?? '');
    });

    wrap.appendChild(swatch);
    wrap.appendChild(sel);
    return wrap;
}
