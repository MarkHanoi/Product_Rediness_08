/**
 * DrawingLayerIdentity — §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE ONE PRODUCER OF "WHICH LAYER IS THIS LINE ON, AND WHOSE CATEGORY IS THAT?"
 * ═══════════════════════════════════════════════════════════════════════════════
 * C06 §13.3. Before this module there were SEVEN hand-copied answers to that one
 * question, and only one of them was right:
 *
 *   PlanViewCanvas.ts:406      layerName | name | parent.layerName | parent.name
 *   PlanViewCanvas.ts:2420     (the same four, copied)
 *   CutSectionExtractor.ts:44  (the same four, copied)
 *   DrawingPipelineOrchestrator.ts:163 (the same four, copied)
 *   PlanViewFillRenderer.ts:81 (the same four, copied)
 *   HiddenLineRemoval.ts:517   layerName | name          (a two-arg variant)
 *   SVGCompositeRenderer.ts:219  userData.layer | userData.layerName   ← THE RIGHT ONE
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CLOSES (the founder, 2026-08-21: *"View intent panel works
 * relatively good for walls — but not other elements. I tested windows and did not
 * work — or furniture."*)
 * ─────────────────────────────────────────────────────────────────────────────
 * `userData.layerName` is stamped by exactly TWO producers — `EdgeProjectorService`
 * (`projected.userData.layerName = targetLayerName`) and
 * `OpeningElevationSymbolBuilder`. It is stamped by NONE of the fourteen plan symbol
 * builders (`grep -c layerName` over every `*SymbolBuilder*.ts` in `packages/geometry-*`
 * → zero, measured 2026-08-21). Windows, doors, furniture, stairs, roofs, columns and
 * plumbing in PLAN are drawn ENTIRELY by those fourteen.
 *
 * So for every one of them the composed tag was the EMPTY STRING, the VG category was
 * `null`, the style resolver was never consulted, and `categoryFromFlags()` fell all
 * the way through to its `'projection'` fallback pen. The view-intent panel was not
 * "partly wired" for those categories — it was structurally unreachable. Walls looked
 * like they worked because the BULK of wall linework comes from `EdgeProjectorService`,
 * which does stamp; `WallLayerPlanSymbolBuilder`'s layer-pattern lines never did.
 * That is exactly "works relatively good for walls".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ANSWER IS `userData.layer` AND NOT A RENAME
 * ─────────────────────────────────────────────────────────────────────────────
 * MEASURED against `@thatopen/components` 3.4.6 — a builder's hand-off to OBC is
 * `TechnicalDrawing.toDrawingSpace(seg, drawing)` then `addProjectionLines(ls, LAYER)`:
 *
 *   • `toDrawingSpace` (index.mjs:26088) returns `new THREE.LineSegments(geo)` — a
 *     BRAND-NEW object. Every `userData` key the builder set (`role`, `lineWeight`,
 *     `elementType`) is DROPPED, and so is its material.
 *   • `addProjectionLines` → `DrawingLayers.assign()` (index.mjs:24897) then does
 *     `object.userData.layer = name` and `object.material = layer.material`.
 *
 * Measured output for a real builder-shaped line:
 *     PROJECTED userData = {"layer":"A-FURN"}
 *     material is layer material? true
 *
 * So the LAYER NAME, at `userData.layer`, is the ONLY channel that survives the
 * hand-off — and OBC guarantees it on every line, from every builder, in every view
 * type, with no cooperation from the builder at all. Reading it is not a third
 * convention: it is the one `SVGCompositeRenderer` (the DXF/SVG export half of the
 * product) has always read FIRST. This makes the SCREEN agree with the EXPORTER.
 *
 * ⚠ RENAMING THE BUILDERS' LAYERS WAS CONSIDERED AND REJECTED, ON EVIDENCE.
 *   • It does not fix the reported bug. `A-FURN`, `A-STRS`, `A-ROOF` and `A-PLMB`
 *     ALREADY match the VG category map exactly, and furniture was still ungoverned —
 *     because the tag was empty, not because the name was wrong.
 *   • `SVGCompositeRenderer.ISO_LINE_WEIGHTS` is KEYED ON THE HYPHEN NAMES
 *     (`A-WALL-PATT`, `A-FLOR-HRAL`, `A-ROOF-OTLN`, `S-COLS`, `S-BEAM`). Renaming to
 *     the colon convention would silently drop every one of those to the
 *     `projection-visible` default weight on export.
 *   • The two conventions are NOT rivals. `A-GLAZ-CUT` is an ISO 13567 SUB-LAYER
 *     (hyphen, uppercase — a discipline/content name). `A-WALL:cut` is PRYZM's
 *     internal ZONE marker (see DrawingZone.ts). Collapsing them would destroy a real
 *     distinction. This module therefore matches BOTH, and `drawingZoneFromLayerName`
 *     already accepts both (`/[:-]cut\b/i`).
 */

/**
 * The minimal shape this module needs from a scene object. Declared structurally
 * rather than importing THREE so the one layer-identity authority stays free of the
 * renderer (P2) and can be unit-tested without a scene.
 */
export interface LayerTaggedObject {
    name?: string | undefined;
    userData?: Record<string, unknown> | undefined;
    parent?: LayerTaggedObject | null | undefined;
}

/**
 * ISO 13567 layer base name → VG category (the categories the view-intent panel and
 * `VGGovernanceStore` speak).
 *
 * `S-*` are the STRUCTURAL discipline prefixes. They are not a mistake and must not be
 * "corrected" to `A-*`: `ColumnPlanSymbolBuilder` writes `S-COLS`, and
 * `SVGCompositeRenderer.ISO_LINE_WEIGHTS` carries `S-COLS` / `S-BEAM` / `S-GRID` with
 * their own export weights. Before L-1600 this map held only the `A-*` names, so a
 * column plan symbol resolved to a null category even once its tag was non-empty.
 */
export const ISO_LAYER_TO_VG_CATEGORY: Readonly<Record<string, string>> = {
    'A-WALL': 'wall',
    'A-FLOR': 'slab',
    'A-COLS': 'column',
    'A-BEAM': 'beam',
    'A-DOOR': 'door',
    'A-GLAZ': 'window',
    'A-STRS': 'stair',
    'A-ROOF': 'roof',
    'A-FURN': 'furniture',
    'A-PLMB': 'plumbing',
    'A-CEIL': 'ceiling',
    'A-GRID': 'grid',
    'A-LEVL': 'level',
    // Structural discipline (ISO 13567) — see the note above.
    'S-COLS': 'column',
    'S-BEAM': 'beam',
    'S-GRID': 'grid',
};

/**
 * Prefixes sorted LONGEST FIRST.
 *
 * Longest-prefix-wins is a correctness requirement, not a micro-optimisation: the
 * hyphen arm below makes `A-FLOR-HRAL` match the prefix `A-FLOR`, so a shorter prefix
 * declared earlier in the object literal would claim sub-layers belonging to a longer
 * one. Sorting removes the dependence on declaration order entirely — nobody has to
 * remember to add new entries in the right place.
 */
const ISO_PREFIXES_LONGEST_FIRST: ReadonlyArray<readonly [string, string]> =
    Object.entries(ISO_LAYER_TO_VG_CATEGORY).sort((a, b) => b[0].length - a[0].length);

/**
 * Compose the layer tag for one projected line.
 *
 * ⭐ `userData.layer` FIRST — it is the only key OBC itself guarantees (see the header),
 * and it is the reason this function exists. The remaining four are the PRYZM-side
 * stamps: `EdgeProjectorService` and `OpeningElevationSymbolBuilder` set `layerName`
 * (and the latter also `.name`), and the parent lookups carry group-level tags for
 * IFC fragment sets.
 *
 * Tokens are de-duplicated: a producer that stamps `layer`, `layerName` AND `name`
 * with the same string would otherwise triple it, which is harmless but makes every
 * downstream regex scan three times the text on the hottest loop in the 2D pipeline.
 */
export function composeLayerTag(child: LayerTaggedObject): string {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const raw of [
        child.userData?.layer,
        child.userData?.layerName,
        child.name,
        child.parent?.userData?.layerName,
        child.parent?.name,
    ]) {
        if (typeof raw !== 'string') continue;
        const token = raw.trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        parts.push(token);
    }
    return parts.join(' ');
}

/**
 * Does `tag` name a layer in the `prefix` family?
 *
 * Four arms, and each one is load-bearing:
 *   • `tag === prefix`                — the bare ISO layer (`A-FURN`, `A-WALL`).
 *   • `tag.startsWith(prefix + ':')`  — PRYZM's zone sub-layer (`A-WALL:cut`).
 *   • `tag.startsWith(prefix + '-')`  — the ISO 13567 sub-layer (`A-GLAZ-CUT`,
 *     `A-DOOR-GHOST`, `A-FURN-SHADOW`, `A-GLAZ-SYM`). This arm existed ONLY in the
 *     drifted duplicate `PlanViewVGApplicator.vgCategoryForLayer()` (added 2026-05-22,
 *     §DOOR-WINDOW-PLAN-FRAME) and was never carried to the copy the renderer calls —
 *     which is precisely the kind of divergence one producer exists to make impossible.
 *   • `tag.includes(' ' + prefix)`    — a multi-token tag (a producer that stamped more
 *     than one of the five keys).
 */
function tagIsInFamily(tag: string, prefix: string): boolean {
    return tag === prefix
        || tag.startsWith(`${prefix}:`)
        || tag.startsWith(`${prefix}-`)
        || tag.includes(` ${prefix}`);
}

/**
 * The VG category for a composed layer tag, or `null` when the tag names no known ISO
 * family (IFC's `projection-visible` / `projection-hidden` fallbacks land here, and
 * correctly so — they are governed through overall layer visibility instead).
 */
export function vgCategoryForLayer(layerTag: string): string | null {
    const tag = layerTag.trim();
    if (!tag) return null;
    for (const [prefix, category] of ISO_PREFIXES_LONGEST_FIRST) {
        if (tagIsInFamily(tag, prefix)) return category;
    }
    return null;
}

/**
 * The base ISO layer name a tag belongs to, restricted to a caller-supplied set of
 * base names (in practice `ISO_CUT_LAYER_TO_POCHE_FILL`'s keys — the structural solids
 * a cut plane can actually slice). Returns `null` when the tag is outside that set.
 *
 * The set is a parameter rather than a hard-coded import so this module owns the
 * MATCHING RULE and the poché table stays the single owner of WHICH layers are poché'd.
 */
export function baseIsoLayerForTag(
    layerTag: string,
    baseNames: Iterable<string>,
): string | null {
    const tag = layerTag.trim();
    if (!tag) return null;
    let best: string | null = null;
    for (const prefix of baseNames) {
        if (!tagIsInFamily(tag, prefix)) continue;
        if (best === null || prefix.length > best.length) best = prefix;
    }
    return best;
}
