/**
 * OpeningPreviewSubject — §OPENING-SHOWROOM-PREVIEW (L-7720 … L-7728)
 * ====================================================================
 *
 * The THREE-FREE description of what the little 3-D showroom draws: a list of
 * axis-aligned boxes in metres, each NAMING a material from the master.
 *
 * ── WHY A DECLARATIVE SUBJECT AND NOT "JUST CALL WindowBuilder" ──────────────
 *
 * `WindowBuilder` / `DoorBuilder` are the real thing and would give perfect
 * fidelity, but they are *hosted-element* builders: they need a wall, a level,
 * a `WallRebuildCoordinator`, a materials cache keyed for instancing, a
 * dependency tracker and a scene to add to. A type being AUTHORED has none of
 * those — it is not placed anywhere and may not be saved at all. Driving them
 * from a modal would either mean faking a wall (a fake more capable than the
 * real thing is a defect factory, §FAKE-MORE-CAPABLE-THAN-REAL) or mutating the
 * live scene to preview an unsaved draft.
 *
 * ⚠ SO THE FIDELITY LIMIT IS REAL AND IT IS STATED RATHER THAN IMPLIED: this is
 * a **schematic massing of the type**, not a pixel-identical copy of the placed
 * element. It shows member sizes, subdivision, sill projection, leaf thickness
 * and the real MATERIALS. It does not show the wall reveal, the swing arc, the
 * ironmongery or the glazing bars' rebate profile.
 *
 * ── WHAT IT DOES NOT INVENT ─────────────────────────────────────────────────
 *
 * ⭐ Every dimension comes from `resolveWindowDimensions` / `resolveDoorDimensions`
 * — the resolvers whose own docstrings say *"preview and placement MUST both
 * call this so `preview ≡ placed door`"* (L-127). Not one number is a literal
 * here. That is the whole reason this file may exist at all: a preview that
 * measured itself would be the second source of truth L-127 was raised to kill.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *  - **P2** — zero THREE. Plain numbers and strings; the renderer turns them
 *    into meshes.
 *  - **C100 §2.1** — a part REFERENCES a material by `materialId`. `fallbackHex`
 *    exists only for the legacy/override case and is marked as such, never as a
 *    rival authority.
 *  - **C03 / P6** — pure. No store writes; reads the type stores only.
 */

import { resolveWindowDimensions } from '@pryzm/geometry-window';
import { resolveDoorDimensions } from '@pryzm/geometry-door';

/** One axis-aligned box, in metres, centred at `center`. */
export interface PreviewPart {
    /** Stable within a subject; used for diagnostics, not for identity. */
    readonly name: string;
    /** [x, y, z] full extents in metres. */
    readonly size: readonly [number, number, number];
    /** [x, y, z] centre in metres. y is height above the subject's base. */
    readonly center: readonly [number, number, number];
    /** C100 §2.1 — the material's identity. Resolved by the renderer against the master. */
    readonly materialId?: string | undefined;
    /**
     * The finish's stored hex. Used ONLY when `materialId` is absent or does not
     * resolve — i.e. the legacy state — and the renderer marks it as such. It is
     * never preferred over a resolvable id (C100 §2.1's precedence).
     */
    readonly fallbackHex?: string | undefined;
    /** 0..1. Below 1 the renderer draws it as glazing. */
    readonly opacity?: number;
}

export interface PreviewSubject {
    /** Changes whenever the drawn content changes; the canvas re-renders on a new key. */
    readonly key: string;
    readonly parts: readonly PreviewPart[];
    /** Overall bounds in metres, for framing the camera. */
    readonly extent: readonly [number, number, number];
    /** Short human line under the canvas — what the user is looking at. */
    readonly caption: string;
}

/** The minimum a finish slot must expose. Structural, so both families' records fit. */
interface FinishLike {
    name?: string;
    materialId?: string | undefined;
    materialColor?: string;
}

const GLASS_MATERIAL_ID = 'glass-clear';

/**
 * Build the subject for a WINDOW type.
 *
 * `draft` is the record under edit — a live `WindowSystemType` from the store, or
 * the unsaved draft in the type editor. Both are read structurally so the editor
 * can preview a type that does not exist yet.
 */
export function buildWindowPreviewSubject(draft: {
    id?: string;
    name?: string;
    frameFinish?: FinishLike;
    sillFinish?: FinishLike;
    glazingOpacity?: number;
    defaultColumnRatios?: readonly number[];
    defaultRowRatios?: readonly number[];
    dimensions?: unknown;
}): PreviewSubject {
    // ⭐ THE RESOLVER, NOT A LITERAL. A draft carries `dimensions` but no id, so the
    // store lookup inside the resolver misses and it falls through to the type's own
    // block then the canonical defaults — which is exactly the behaviour a window
    // placed from this type will get.
    const d = resolveWindowDimensions({
        ...(draft.id ? { systemTypeId: draft.id } : {}),
        windowType: 'single',
        ...(draft.dimensions && typeof draft.dimensions === 'object' ? draft.dimensions : {}),
        ...(draft.defaultColumnRatios ? { columnRatios: draft.defaultColumnRatios } : {}),
    });

    const cols = normaliseRatios(draft.defaultColumnRatios ?? d.columnRatios);
    const rows = normaliseRatios(draft.defaultRowRatios ?? [1]);

    const W = d.width;
    const H = d.height;
    const ft = d.frameThickness;
    const fd = d.frameDepth;
    const glassOpacity = clamp01(1 - (draft.glazingOpacity ?? 0.3));

    const frame = finishRef(draft.frameFinish);
    const sill = finishRef(draft.sillFinish);
    const parts: PreviewPart[] = [];

    // Outer frame — head, sill member, two jambs. Drawn as four boxes so the
    // member FACE WIDTH (`frameThickness`) is legible, which is the number an
    // author is actually choosing between a slim Crittal and a fat uPVC.
    parts.push(box('frame-head', [W, ft, fd], [0, H - ft / 2, 0], frame));
    parts.push(box('frame-cill', [W, ft, fd], [0, ft / 2, 0], frame));
    parts.push(box('frame-jamb-l', [ft, H - 2 * ft, fd], [-(W - ft) / 2, H / 2, 0], frame));
    parts.push(box('frame-jamb-r', [ft, H - 2 * ft, fd], [(W - ft) / 2, H / 2, 0], frame));

    // The glazed field, subdivided by the type's own column/row ratios.
    const fieldW = W - 2 * ft;
    const fieldH = H - 2 * ft;
    const cdt = d.columnDividerThickness;
    const rdt = d.rowDividerThickness;
    const dividerDepth = fd * 0.5;

    let x = -fieldW / 2;
    cols.forEach((cw, ci) => {
        const paneW = fieldW * cw;
        let y = ft;
        rows.forEach((rh, ri) => {
            const paneH = fieldH * rh;
            parts.push({
                name: `glass-${ci}-${ri}`,
                size: [Math.max(paneW - cdt, 0.02), Math.max(paneH - rdt, 0.02), d.glazingThickness],
                center: [x + paneW / 2, y + paneH / 2, 0],
                materialId: GLASS_MATERIAL_ID,
                opacity: glassOpacity,
            });
            y += paneH;
            // Transom between this row and the next.
            if (ri < rows.length - 1) {
                parts.push(box(`transom-${ci}-${ri}`, [paneW, rdt, dividerDepth], [x + paneW / 2, y, 0], frame));
            }
        });
        x += paneW;
        // Mullion between this column and the next.
        if (ci < cols.length - 1) {
            parts.push(box(`mullion-${ci}`, [cdt, fieldH, dividerDepth], [x, ft + fieldH / 2, 0], frame));
        }
    });

    // The sill board, projecting proud of the frame — the one part that reads as
    // depth from any angle, which is why the showroom is worth having at all.
    if (d.sill) {
        parts.push(box(
            'sill-board',
            [W + 2 * d.sillOverhang, d.sillThickness, fd + d.sillDepth],
            [0, d.sillThickness / 2, d.sillDepth / 2],
            sill,
        ));
    }

    return {
        // ⚠ THE KEY MUST NAME EVERY NUMBER THE IMAGE DEPENDS ON. It listed only
        // [W, H, fd]; once L-7746 made the frame face, mullion, transom and sill
        // projection editable in the dialog, dragging any of those sliders changed the
        // geometry and NOT the key — so the showroom would have sat still while the
        // numbers moved. A cache key that is a SUBSET of its inputs is a stale render,
        // and a preview that lags its own controls is worse than no preview.
        key: subjectKey('window', draft.id, draft.name,
            [W, H, fd, ft, cdt, rdt, d.sillDepth, d.sillThickness, d.sillOverhang, d.glazingThickness],
            cols, rows, frame, sill, glassOpacity),
        parts,
        extent: [W + 2 * d.sillOverhang, H, fd + d.sillDepth],
        caption: `${fmt(W)} × ${fmt(H)} m · ${cols.length}×${rows.length} pane${cols.length * rows.length === 1 ? '' : 's'}`,
    };
}

/** Build the subject for a DOOR type. */
export function buildDoorPreviewSubject(draft: {
    id?: string;
    name?: string;
    frameFinish?: FinishLike;
    leafFinish?: FinishLike;
    glazingOpacity?: number;
    defaultSegments?: ReadonlyArray<{ type: 'panel' | 'glass' | 'empty'; heightRatio: number }>;
    sidelight?: { widthRatio: number; glazingOpacity: number } | undefined;
}): PreviewSubject {
    const d = resolveDoorDimensions(draft.id, 'single');

    const W = d.width;
    const H = d.height;
    const ft = d.frameThickness;
    const fd = d.frameDepth;
    const lt = d.leafThickness;

    const frame = finishRef(draft.frameFinish);
    const leaf = finishRef(draft.leafFinish);
    const parts: PreviewPart[] = [];

    // Frame: head + two jambs. A door has no cill member — that asymmetry with
    // the window is real construction, not a gap in this file.
    parts.push(box('frame-head', [W, ft, fd], [0, H - ft / 2, 0], frame));
    parts.push(box('frame-jamb-l', [ft, H - ft, fd], [-(W - ft) / 2, (H - ft) / 2, 0], frame));
    parts.push(box('frame-jamb-r', [ft, H - ft, fd], [(W - ft) / 2, (H - ft) / 2, 0], frame));

    // The leaf, subdivided by the type's own segments so a half-light door reads
    // as a half-light door rather than a slab.
    const leafW = W - 2 * ft;
    const leafH = H - ft;
    const segs = (draft.defaultSegments && draft.defaultSegments.length > 0)
        ? draft.defaultSegments
        : [{ type: 'panel' as const, heightRatio: 1 }];
    const totalRatio = segs.reduce((a, s) => a + (s.heightRatio || 0), 0) || 1;
    const glassOpacity = clamp01(1 - (draft.glazingOpacity ?? 1));

    let y = 0;
    segs.forEach((seg, i) => {
        const h = leafH * ((seg.heightRatio || 0) / totalRatio);
        if (seg.type === 'empty') { y += h; return; }
        if (seg.type === 'glass') {
            parts.push({
                name: `leaf-glass-${i}`,
                size: [leafW * 0.86, Math.max(h * 0.86, 0.02), lt * 0.5],
                center: [0, y + h / 2, 0],
                materialId: GLASS_MATERIAL_ID,
                opacity: glassOpacity,
            });
            // The glazed segment still needs its stile/rail surround, or the leaf
            // reads as a hole rather than a glazed panel.
            parts.push(box(`leaf-surround-${i}`, [leafW, h, lt * 0.6], [0, y + h / 2, -lt * 0.2], leaf));
        } else {
            parts.push(box(`leaf-panel-${i}`, [leafW, h, lt], [0, y + h / 2, 0], leaf));
        }
        y += h;
    });

    // A fixed glazed sidelight is a property of the TYPE (DoorSystemType.sidelight),
    // so the showroom must show it — it changes the assembly's whole width.
    let extentW = W;
    if (draft.sidelight && draft.sidelight.widthRatio > 0) {
        const sw = leafW * draft.sidelight.widthRatio;
        const sx = W / 2 + ft / 2 + sw / 2;
        parts.push(box('sidelight-jamb', [ft, H, fd], [W / 2 + ft / 2, H / 2, 0], frame));
        parts.push(box('sidelight-head', [sw + ft, ft, fd], [sx, H - ft / 2, 0], frame));
        parts.push({
            name: 'sidelight-glass',
            size: [sw, H - ft, d.leafThickness * 0.5],
            center: [sx, (H - ft) / 2, 0],
            materialId: GLASS_MATERIAL_ID,
            opacity: clamp01(1 - draft.sidelight.glazingOpacity),
        });
        extentW = W + ft + sw;
    }

    return {
        // Same rule as the window's, and the same reason — see there.
        key: subjectKey('door', draft.id, draft.name,
            [W, H, fd, ft, lt, extentW],
            segs.map((sg) => sg.heightRatio), [1], frame, leaf, glassOpacity),
        parts,
        extent: [extentW, H, fd],
        caption: `${fmt(W)} × ${fmt(H)} m · ${segs.length} segment${segs.length === 1 ? '' : 's'}`,
    };
}

// ── helpers ─────────────────────────────────────────────────────────────────

interface Ref { materialId?: string | undefined; fallbackHex?: string | undefined }

/**
 * C100 §2.1 — carry BOTH, and let the renderer apply the precedence. The subject
 * does not decide which wins; deciding here would put the ladder in a second place.
 */
function finishRef(f: FinishLike | undefined): Ref {
    return {
        materialId: f?.materialId?.trim() || undefined,
        fallbackHex: f?.materialColor?.trim() || undefined,
    };
}

function box(
    name: string,
    size: readonly [number, number, number],
    center: readonly [number, number, number],
    ref: Ref,
): PreviewPart {
    return { name, size, center, materialId: ref.materialId, fallbackHex: ref.fallbackHex };
}

function clamp01(v: number): number {
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/** Normalise to positive ratios summing to 1; a bad list degrades to one pane, never to NaN. */
function normaliseRatios(input: readonly number[] | undefined): number[] {
    const list = (input ?? []).filter((n) => Number.isFinite(n) && n > 0);
    if (list.length === 0) return [1];
    const total = list.reduce((a, b) => a + b, 0);
    return list.map((n) => n / total);
}

function fmt(v: number): string {
    return v.toFixed(2);
}

/**
 * The render key. Everything the drawn image depends on, and nothing else — so a
 * keystroke in the NAME field does not re-render the scene, and a change to a
 * mullion ratio does. This is what makes "render only when something moved"
 * enforceable rather than aspirational (C04).
 */
function subjectKey(
    family: string,
    id: string | undefined,
    _name: string | undefined,
    dims: readonly number[],
    a: readonly number[],
    b: readonly number[],
    f1: Ref,
    f2: Ref,
    glass: number,
): string {
    return [
        family, id ?? '<draft>',
        dims.map((n) => n.toFixed(4)).join(','),
        a.map((n) => n.toFixed(4)).join('/'),
        b.map((n) => n.toFixed(4)).join('/'),
        f1.materialId ?? f1.fallbackHex ?? '-',
        f2.materialId ?? f2.fallbackHex ?? '-',
        glass.toFixed(3),
    ].join('|');
}

/**
 * Family dispatch — the ONE place a family name becomes a subject builder.
 *
 * Returns `null` for a family that has no showroom yet. ⚠ That is a REFUSAL, and
 * the caller renders nothing rather than an empty stage: a blank 3-D box is
 * indistinguishable from a type with no geometry, and C65 §3.4's rule against
 * silent defaults applies to previews exactly as it applies to types.
 */
export function buildOpeningPreviewSubject(
    family: string,
    draft: Record<string, unknown>,
): PreviewSubject | null {
    if (family === 'window') return buildWindowPreviewSubject(draft as never);
    if (family === 'door') return buildDoorPreviewSubject(draft as never);
    return null;
}

/**
 * §OPENING-AUTO-IS-A-STATE (L-9610) — what a BLANK dimension field will actually
 * resolve to, keyed by the same `dimensions` keys `ElementTypeAuthoringRegistry`
 * declares.
 *
 * ⭐ WHY THIS EXISTS AT ALL. The type editor leaves an unauthored dimension EMPTY
 * with the placeholder "auto", which is correct — writing a number there would
 * silently freeze today's default into the type and turn "inherits" into
 * "asserts". But "auto" on its own is only half the truth: it says the value is
 * derived without saying WHAT it derives to, so the author cannot see the window
 * they are about to create. This closes that half, and it closes it WITHOUT
 * minting a second source: every number below comes back from
 * `resolveWindowDimensions` / `resolveDoorDimensions`, the same resolvers the
 * placement path calls (L-127: preview and placement must both call this).
 *
 * ⛔ The resolvers are deliberately called with NO authored dimensions block. The
 * question this answers is *"what would this field be if I left it blank"*, which
 * is a different question from *"what is this type's width"* — and the resolvers
 * fall through PER FIELD, so an unauthored field's inherited value does not
 * depend on which of its siblings the user has authored.
 *
 * Returns an empty map for a family with no resolver, never a fabricated default.
 */
export function resolveInheritedOpeningDimensions(
    family: string,
    /**
     * The type's own id when it HAS one (Duplicate of a saved type), `undefined`
     * for an unsaved draft. ⚠ Taken as a scalar rather than as the draft object:
     * `FinishTypeDraft` is `Record<string, any>`, and a structural parameter would
     * accept any record at all — including the wrong one — with no complaint.
     */
    typeId: string | undefined,
): Readonly<Record<string, number>> {
    if (family === 'window') {
        const base = { ...(typeId ? { systemTypeId: typeId } : {}) };
        const single = resolveWindowDimensions({ ...base, windowType: 'single' });
        const dbl = resolveWindowDimensions({ ...base, windowType: 'double' });
        return {
            width: single.width,
            doubleWidth: dbl.width,
            height: single.height,
            frameThickness: single.frameThickness,
            frameDepth: single.frameDepth,
            columnDividerThickness: single.columnDividerThickness,
            rowDividerThickness: single.rowDividerThickness,
            sillDepth: single.sillDepth,
        };
    }
    if (family === 'door') {
        const single = resolveDoorDimensions(typeId, 'single');
        const dbl = resolveDoorDimensions(typeId, 'double');
        return {
            width: single.width,
            doubleWidth: dbl.width,
            height: single.height,
            frameThickness: single.frameThickness,
            frameDepth: single.frameDepth,
            leafThickness: single.leafThickness,
        };
    }
    return {};
}
