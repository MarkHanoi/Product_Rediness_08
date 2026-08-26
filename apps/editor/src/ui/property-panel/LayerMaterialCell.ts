/**
 * LayerMaterialCell — §MAT-INSTANCE-LAYER-IS-A-REFERENCE (L-10064 … L-10067)
 * ==========================================================================
 *
 * The per-layer MATERIAL control for the two INSTANCE layer editors —
 * `WallLayersEditor` and `SlabLayersEditor` — plus the one place the measured
 * answer to *"material or colour: which one is painted?"* is written down.
 *
 * ── THE FOUNDER'S REPORT ────────────────────────────────────────────────────
 *
 * 2026-08-23, looking at a selected WALL: *"I wanted to have the material for
 * each layer — so the user can change not only the colour but the material
 * also — why is not in place?"* His screenshot: a LAYERS table reading
 * `NAME · FUNCTION · MM`, a `Color Override` swatch above it, and no material
 * anywhere.
 *
 * ⭐ HE IS RIGHT, AND IT IS A DIFFERENT SURFACE FROM THE ONE THAT WAS FIXED.
 * Lane MAT50 shipped *"a wall layer can NAME a master material"* (L-8610) into
 * `WallTypeEditorModal` — the element **TYPE** editor. The pipe from there was
 * already complete (`elementTypeAuthoringAdapters.ts:79` is `layers:
 * draft.layers`, verbatim). Nobody wired the **INSTANCE** editors, which are the
 * ones the property panel actually renders when you click a wall. Measured
 * 2026-08-23 before building: `grep materialId apps/editor/src/ui/property-panel/*.ts`
 * → only `CurtainSubElementPanel.ts` and `FinishTypeDraftIntent.ts`. So: ABSENT,
 * not UNREACHABLE (C01 §6 rule 6) — the fix is a control, not a route.
 *
 * ── REUSED, NOT REBUILT ─────────────────────────────────────────────────────
 *
 * The picker is `buildFinishMaterialSelect` from `@pryzm/geometry-door` — THE ONE
 * finish-material control C100 §10.12.d minted for door + window, and the one
 * MAT50 reused for the type editor. A third name→value control would be C68
 * §7.c's anti-pattern *"even when it is shorter"*, and would drift from the four
 * honest states the original classifies (resolved / unresolved / legacy / empty).
 * This module adds NO picker. It adds the PRECEDENCE, which the type editor did
 * not have to answer because a type has no instance colour to lose to.
 *
 * ── ⭐ THE PRECEDENCE, MEASURED — AND THE TWO FAMILIES DISAGREE ─────────────
 *
 * The founder asked for the precedence to be *stated in the UI, not left to the
 * user to guess*. Establishing it turned up something worth saying plainly: WALL
 * and SLAB resolve a layer's colour by DIFFERENT rules, and neither is this
 * lane's to change (`geometry-wall` and `geometry-slab` are other lanes').
 *
 *   • SLAB — `packages/geometry-slab/src/SlabFragmentBuilder.ts:692`
 *       `layerMasterHex ?? layer.materialColor ?? data.materialColor ?? '#909090'`
 *     **THE MATERIAL WINS.** Once a slab layer names a resolvable material, the
 *     master's hex is painted and the layer's own colour is only the fallback for
 *     a miss (which the builder also `console.warn`s, C100 §5).
 *
 *   • WALL — `packages/geometry-wall/src/WallFragmentBuilder.ts:2118` and `:2586`
 *       `sideOverride ?? layer.materialColor ?? wall.materialColor ?? DEFAULT`
 *     **THE LAYER COLOUR WINS**, and `layer.materialId` is not consulted by the
 *     wall builder at all. A wall layer's material reaches the mesh only because
 *     picking one also brings the hex (below); it reaches the SCHEDULES,
 *     quantities and carbon factors on its own.
 *
 * ⛔ SO THE UI MUST NOT SAY ONE SENTENCE FOR BOTH. Telling a slab user "your
 * colour overrides the material" would be false, and a swatch that silently does
 * nothing is the §CONTEXT-DATA-HONESTY failure — refusal and success rendered
 * identically. Each family gets its own measured sentence, and the badge on a
 * divergent layer says which of the two is actually on the mesh.
 *
 * ── THE REFERENCE AND THE HEX MOVE TOGETHER (C100 §10.12.b) ─────────────────
 *
 * Picking a material writes `materialId` AND brings `materialColor` to that
 * master row's exact value, in one change. Not tidiness: every §2.1 resolver
 * infers a deliberate user OVERRIDE from *"an id beside a disagreeing hex"*, so
 * writing one without the other would make every freshly-picked layer claim to be
 * overridden. It is also what makes the wall arm work at all, since the wall
 * builder reads only the hex.
 *
 * ── OVERRIDES ARE MARKED (C100 §2.2 / §6.1 MUST) ────────────────────────────
 *
 * ⭐ No new field encodes "is override". The state IS
 * `materialColor ≠ masterHex(materialId)`, exactly as §10.12.e spells it — so
 * there is no codec change, no schema change, and an old layer without an id
 * behaves precisely as it did.
 */

// ⚠ Same specifier `WallTypeEditorModal.ts` (this directory) already imports, for
// the same control. Not re-declared as a manifest dependency: adding one to
// `apps/editor/package.json` desyncs `pnpm-lock.yaml` and breaks the
// frozen-lockfile install, and this import is proven to resolve and build here.
import { buildFinishMaterialSelect, finishMaterialHex } from '@pryzm/geometry-door';

/** The two INSTANCE layer editors this control serves. */
export type LayeredFamily = 'wall' | 'slab';

export interface LayerColourPrecedence {
    /** Which of the two the RENDERER actually paints when they disagree. */
    readonly winner: 'material' | 'colour';
    /** The resolution chain, strongest first, in the user's words. */
    readonly chain: readonly string[];
    /** `file:line` that settles it. Re-measure; never re-transcribe. */
    readonly evidence: string;
    /** One sentence, shown above the LAYERS table. No jargon. */
    readonly note: string;
    /** Shown on a layer whose colour disagrees with its material's master hex. */
    readonly divergedLabel: string;
    /** The tooltip for that badge. `%s` is replaced by the master hex. */
    readonly divergedHint: string;
}

/**
 * ⚠ MEASURED 2026-08-23 by reading the two fragment builders, not inferred from
 * one and generalised — that is the §fake-more-capable-than-real shape, and
 * `levelChangeVerbs.ts` records a correction for exactly it ("written from the
 * wall/slab/roof builders rather than measured across all of them").
 */
export const LAYER_COLOUR_PRECEDENCE: Readonly<Record<LayeredFamily, LayerColourPrecedence>> = {
    slab: {
        winner: 'material',
        chain: [
            "the layer's material (the library colour)",
            "the layer's own colour",
            "the slab's Color Override",
        ],
        // §SLAB116 (L-11780): the ladder moved out of the layered build arm into ONE
        // named function that the single-layer body and the in-place restyle path
        // also call — until then a one-layer slab (every plan-tool slab) was painted
        // from slab-level fields and this sentence was false for it.
        evidence: "packages/geometry-slab/src/SlabFragmentBuilder.ts:1696 — SlabFragmentBuilder.resolveLayerPaint(): masterHex(layer.materialId) ?? layer.materialColor ?? data.materialColor ?? '#909090'",
        note: 'A layer that names a material is painted in THAT material’s colour. The colour box beside it is kept as a fallback and is used only if the material is ever missing. Clear the material to paint your own colour.',
        divergedLabel: 'material wins',
        divergedHint: 'This slab layer is painted in its material’s colour (%s), not the colour shown. Click ↺ to match them, or set the material to “— no material —” to paint your own colour.',
    },
    wall: {
        winner: 'colour',
        chain: [
            'a wall side finish, when one is authored',
            "the layer's own colour",
            "the wall's Color Override",
        ],
        evidence: 'packages/geometry-wall/src/WallFragmentBuilder.ts:2118 and :2586 — sideOverride ?? layer.materialColor ?? wall.materialColor ?? WALL_DEFAULT_BODY_COLOUR; layer.materialId is not read by the wall builder',
        note: 'The colour box is what gets painted. The material names the library row this layer is made of — it drives schedules, quantities and carbon, and picking one also sets the colour to match.',
        divergedLabel: 'overridden',
        divergedHint: 'Painted with your colour instead of this material’s (%s). Click ↺ to reset it to the material’s colour.',
    },
} as const;

/** True when the layer names a material whose master hex differs from its colour. */
export function layerColourDiverges(layer: { materialId?: string; materialColor?: string }): boolean {
    const master = finishMaterialHex(layer.materialId);
    if (master === undefined) return false;
    return master.toLowerCase() !== String(layer.materialColor ?? '').toLowerCase();
}

/** The one-line precedence sentence rendered above a LAYERS table. */
export function buildLayerPrecedenceNote(family: LayeredFamily): HTMLElement {
    const p = LAYER_COLOUR_PRECEDENCE[family];
    const note = document.createElement('div');
    note.className = 'lmc-precedence';
    note.style.cssText =
        'font-size:10px;line-height:1.45;color:#6b7280;margin:0 0 6px;padding:5px 7px;' +
        'background:#f4f2fb;border-left:2px solid #6600FF;border-radius:3px;';
    note.textContent = p.note;
    // The measured chain, for anyone who wants the full order without reading a builder.
    note.title = `Colour is resolved in this order:\n  ${p.chain.map((c, i) => `${i + 1}. ${c}`).join('\n  ')}\n\nMeasured at ${p.evidence}`;
    return note;
}

export interface LayerMaterialCellOptions {
    family: LayeredFamily;
    /** The LIVE editable layer object. Mutated in place, like every other row control. */
    layer: { name?: string; materialId?: string; materialColor?: string };
    /** 1-based, for accessible labels only. */
    index: number;
    /**
     * Called after the layer has been mutated, so the caller can re-paint its own
     * dependent widgets (the row's colour input, the total, a preview).
     */
    onChanged: () => void;
}

/**
 * Build the `[material picker] [↺ override badge]` sub-row for one layer.
 *
 * ── WHY A SUB-ROW AND NOT A SIXTH COLUMN ────────────────────────────────────
 * The property panel is a narrow docked column and the LAYERS table already
 * carries five tracks in `16px 1fr 100px 48px 20px`. A sixth would crush NAME and
 * FUNCTION to unreadable stubs — and C06's point about a dead control applies to
 * an illegible one too. The picker gets its own full-width line under the row it
 * belongs to, indented to sit under NAME, which also gives the four honest states
 * (`⚠ "Screed" — not a library material`) room to actually be read.
 */
export interface LayerMaterialCell {
    /** The sub-row to append under the layer's own row. */
    readonly el: HTMLElement;
    /**
     * Re-derive the override badge from the layer's CURRENT values.
     *
     * ⚠ Load-bearing, and it is the reason this returns an object rather than an
     * element. The override state is `materialColor ≠ masterHex(materialId)`, and
     * `materialColor` is edited by a control this module does not own — the row's
     * `<input type="color">`. Without a repaint hook the badge would be correct on
     * first paint and STALE the moment the user touched the swatch: a layer marked
     * "overridden" that is not, or worse, an override with no mark at all, which is
     * precisely the C100 §2.2 MUST this control exists to satisfy.
     */
    repaint(): void;
}

export function buildLayerMaterialCell(opts: LayerMaterialCellOptions): LayerMaterialCell {
    const { family, layer, index, onChanged } = opts;
    const p = LAYER_COLOUR_PRECEDENCE[family];

    const sub = document.createElement('div');
    sub.className = 'lmc-sub';
    sub.style.cssText =
        'display:flex;align-items:center;gap:5px;margin:0 0 5px 19px;min-width:0;';

    const pickerHost = document.createElement('div');
    pickerHost.style.cssText = 'flex:1 1 auto;min-width:0;';

    // The override badge doubles as the RESET control — one affordance, so the
    // marking and the way out of it cannot drift apart.
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'lmc-override';
    badge.style.cssText =
        'display:none;align-items:center;gap:3px;flex:0 0 auto;height:20px;padding:0 6px;' +
        'border:1px solid #6600FF;border-radius:4px;background:#f3ecff;color:#6600FF;' +
        'font:600 9px/1 system-ui;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;';
    badge.setAttribute('aria-label', `Reset layer ${index} colour to its material's value`);

    const paintBadge = (): void => {
        const master = finishMaterialHex(layer.materialId);
        const diverged = layerColourDiverges(layer);
        badge.style.display = diverged ? 'inline-flex' : 'none';
        badge.textContent = diverged ? `↺ ${p.divergedLabel}` : '';
        badge.title = diverged ? p.divergedHint.replace('%s', master ?? '') : '';
        sub.dataset.override = diverged ? 'true' : 'false';
    };

    const rebuildPicker = (): void => {
        pickerHost.innerHTML = '';
        pickerHost.appendChild(buildFinishMaterialSelect({
            currentId: layer.materialId,
            // A pre-reference layer's own free-text name is what it has INSTEAD of
            // an id, so it drives the honest `legacy` state rather than being
            // silently dropped (C100 §10.12.d). "RC Concrete" is a real example:
            // it is not a library label, and saying so is the correct answer.
            legacyName: layer.name,
            onChange: (materialId, materialColor) => {
                layer.materialId = materialId === '' ? undefined : materialId;
                // C100 §10.12.b — the reference and the hex move together, or an
                // id shipped beside a disagreeing hex reads as a user override.
                if (materialColor) layer.materialColor = materialColor;
                rebuildPicker();
                paintBadge();
                onChanged();
            },
        }));
    };

    badge.addEventListener('click', () => {
        const master = finishMaterialHex(layer.materialId);
        if (master === undefined) return;
        layer.materialColor = master;
        paintBadge();
        onChanged();
    });

    rebuildPicker();
    paintBadge();

    sub.appendChild(pickerHost);
    sub.appendChild(badge);
    return { el: sub, repaint: paintBadge };
}
