/**
 * PryzmIconsSystem.ts
 *
 * Material-symbols icon map, iconFromName(), iconEl() lookup helpers,
 * and additional door/navigation/UI icons.
 * Part of the PryzmIcons split (WS-B S85-WIRE).
 * Re-exported via PryzmIcons.ts barrel — do not import this file directly.
 */
// ── Shared rendering helpers (local copy — not exported from this module) ─────
const BL  = 'fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"';
const BD  = 'fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"';
const BP  = 'fill="none" stroke="currentColor" stroke-width="3"   stroke-linecap="round" stroke-linejoin="round"';

function blk(shapes: string, vb: string, size = 28): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" style="display:block">${shapes}</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// iconFromName — material-symbols → inline SVG (replaces bim-icon web component)
//
// All icon paths are stroke-based (fill="none" stroke="currentColor") so they
// adapt to any light/dark background exactly like the architectural icons above.
// New icons can be added to MS_MAP; iconEl() wraps them in a <span>.
// ─────────────────────────────────────────────────────────────────────────────

function _s(path: string, size: number): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">${path}</svg>`;
}

const _ICON_MAP: Record<string, string> = {
    'material-symbols:arrow-back':         '<path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>',
    'material-symbols:visibility':         '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'material-symbols:visibility-off':     '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>',
    'material-symbols:apartment':          '<path d="M3 21V5l9-3 9 3v16"/><path d="M9 21V9h6v12"/>',
    'material-symbols:layers':             '<path d="m2 7 10-5 10 5-10 5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    'material-symbols:category':           '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    'material-symbols:view_in_ar':         '<path d="M12 3L2 7v10l10 4 10-4V7z"/><path d="M2 7l10 4 10-4"/><path d="M12 11v10"/>',
    'material-symbols:window':             '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><path d="M12 3v18"/>',
    'material-symbols:door_front':         '<path d="M3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v16"/><path d="M21 21H3"/><circle cx="14" cy="12" r="1"/>',
    'material-symbols:construction':       '<path d="m15 5 4 4"/><path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.6 5.4a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m2 22 5.5-5.5"/><path d="M20 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
    'material-symbols:weekend':            '<path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 11v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0z"/>',
    'material-symbols:plumbing':           '<circle cx="10" cy="6" r="3"/><path d="M10 9v12"/><path d="M6 21h8"/><path d="M18 9a2 2 0 0 0-2 2v3h4v-3a2 2 0 0 0-2-2z"/><path d="M16 14h4"/>',
    'material-symbols:delete':             '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    'material-symbols:undo':               '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    'material-symbols:redo':               '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
    'material-symbols:upload-file':        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>',
    'material-symbols:export-notes':       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="15 15 12 18 9 15"/>',
    'material-symbols:file-download':      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    'material-symbols:architecture':       '<polygon points="12 2 2 7 12 12 22 7"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    'material-symbols:menu':               '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    'solar:sun-bold':                      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    'material-symbols:smart-toy-outline':  '<rect x="4" y="6" width="16" height="13" rx="2"/><path d="M9 10h.01M15 10h.01"/><path d="M9 14h6"/><path d="M12 6V3"/><path d="M8 6V4"/><path d="M16 6V4"/>',
    'material-symbols:local-florist':      '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    'material-symbols:bathtub':            '<rect x="2" y="14" width="20" height="5" rx="1"/><path d="M6 14V5a2 2 0 0 1 2-2h4"/>',
    'material-symbols:wc':                 '<circle cx="7" cy="6" r="2"/><path d="M5 21V12H3V8a3 3 0 0 1 6 0v4h-2v9"/><circle cx="17" cy="6" r="2"/><path d="m15 21 2-6 2 6"/><path d="M15 14h4"/>',
    'material-symbols:wash':               '<path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M8 21h8"/><path d="M12 21v-4"/>',
    'material-symbols:Imagesearch-Roller': '<rect x="3" y="3" width="16" height="10" rx="2"/><path d="M7 13v8"/><path d="M3 21h8"/>',
    'material-symbols:format-paint':       '<path d="M2 6C2 4.9 2.9 4 4 4h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z"/><path d="M14 8v8a2 2 0 0 1-2 2H4"/><path d="M10 12H4"/>',
    'material-symbols:sunny':              '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    'material-symbols:shadows':            '<ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M12 7a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/>',

    // ── Edit-mode operation icons (ContextualEditBar) ─────────────────────────

    /**
     * MOVE — Four-directional arrow cross.
     * Communicates free translation in any axis.
     */
    'material-symbols:open-with':
        '<line x1="12" y1="2" x2="12" y2="22"/>' +
        '<polyline points="9 5 12 2 15 5"/>' +
        '<polyline points="9 19 12 22 15 19"/>' +
        '<line x1="2" y1="12" x2="22" y2="12"/>' +
        '<polyline points="5 9 2 12 5 15"/>' +
        '<polyline points="19 9 22 12 19 15"/>',

    /**
     * ROTATE — Arc with arrowhead, 270° sweep.
     * Communicates rotation around a centre point.
     */
    'material-symbols:rotate-90-degrees-cw':
        '<path d="M21 12a9 9 0 1 1-9-9"/>' +
        '<polyline points="12 3 16.5 3 16.5 7.5"/>',

    /**
     * COPY — Two overlapping rectangles (front offset top-right).
     * Communicates duplication of a selection.
     */
    'material-symbols:content-copy':
        '<rect x="8" y="8" width="11" height="11" rx="1.5"/>' +
        '<path d="M16 8V6a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 6v9.5A1.5 1.5 0 0 0 5 17h2"/>',

    /**
     * JOIN — Two diagonal lines converging into one vertical line.
     * Communicates merging of two linear elements at a junction.
     */
    'material-symbols:call-merge':
        '<line x1="4" y1="4" x2="12" y2="12"/>' +
        '<line x1="20" y1="4" x2="12" y2="12"/>' +
        '<line x1="12" y1="12" x2="12" y2="20"/>',

    /**
     * CUT / TRIM — Classic open scissors.
     * Communicates cutting or trimming a linear element.
     */
    'material-symbols:content-cut':
        '<circle cx="7" cy="6.5" r="2.5"/>' +
        '<circle cx="7" cy="17.5" r="2.5"/>' +
        '<line x1="9.3" y1="7.7" x2="21" y2="19"/>' +
        '<line x1="9.3" y1="16.3" x2="21" y2="5"/>',

    /**
     * MIRROR — Two triangles reflected across a dashed vertical axis.
     * Communicates reflection about a plane of symmetry.
     */
    'material-symbols:flip':
        '<line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="3,2.5"/>' +
        '<polyline points="2 8 12 4 12 20 2 16"/>' +
        '<polyline points="22 8 12 4 12 20 22 16"/>',

    /**
     * SCALE — Outward corner arrows on a bounding box.
     * Communicates uniform or non-uniform scaling.
     */
    'material-symbols:zoom-out-map':
        '<polyline points="15 3 21 3 21 9"/>' +
        '<polyline points="9 21 3 21 3 15"/>' +
        '<line x1="21" y1="3" x2="14" y2="10"/>' +
        '<line x1="3" y1="21" x2="10" y2="14"/>',

    /**
     * OFFSET / PARALLEL — A source line above, a dashed offset line below,
     * with a short perpendicular arrow indicating the offset distance.
     */
    'material-symbols:commit':
        '<line x1="4" y1="8" x2="20" y2="8"/>' +
        '<line x1="4" y1="15" x2="20" y2="15" stroke-dasharray="3,2.5"/>' +
        '<line x1="12" y1="8" x2="12" y2="15"/>' +
        '<polyline points="9 12 12 15 15 12"/>',

    /**
     * REFERENCE EDIT — A polyline with four visible control-point nodes.
     * Communicates vertex-level editing of a reference geometry.
     */
    'material-symbols:polyline':
        '<polyline points="3 17 9 7 15 12 21 5"/>' +
        '<circle cx="3"  cy="17" r="1.8" fill="currentColor" stroke="none"/>' +
        '<circle cx="9"  cy="7"  r="1.8" fill="currentColor" stroke="none"/>' +
        '<circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none"/>' +
        '<circle cx="21" cy="5"  r="1.8" fill="currentColor" stroke="none"/>',

    // ── Lighting ──────────────────────────────────────────────────────────────

    /**
     * PENDANT LAMP — Vertical cord with a tapered shade and base line.
     * Minimalist ceiling-fixture symbol for the Lighting tool.
     */
    'material-symbols:pendant-lamp':
        '<line x1="12" y1="2" x2="12" y2="8"/>' +
        '<path d="M7 8h10l-1.5 9H8.5L7 8z"/>' +
        '<line x1="8" y1="17" x2="16" y2="17"/>',

    // ── Architectural Services ─────────────────────────────────────────────────

    /**
     * BATH — Plan-view bathtub outline with overflow arc.
     * Architectural line-drawing style matching Structure/Architecture icons.
     */
    'arch:bathtub':
        '<rect x="3" y="9" width="18" height="11" rx="2"/>' +
        '<path d="M7 9V6a2 2 0 0 1 2-2h2"/>' +
        '<ellipse cx="12" cy="16" rx="3" ry="2"/>',

    /**
     * TOILET — Plan-view WC with tank rectangle and bowl ellipse.
     * Architectural line-drawing style.
     */
    'arch:toilet':
        '<rect x="9" y="5" width="6" height="5" rx="1"/>' +
        '<path d="M7 10h10a4 4 0 0 1 4 4v1a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-1a4 4 0 0 1 4-4z"/>',

    /**
     * SINK — Plan-view basin oval with single tap line.
     * Architectural line-drawing style.
     */
    'arch:sink':
        '<ellipse cx="12" cy="15" rx="8" ry="6"/>' +
        '<line x1="12" y1="9" x2="12" y2="5"/>' +
        '<line x1="9" y1="5" x2="15" y2="5"/>',

    /**
     * SHOWER — Plan-view square enclosure with shower-head cross and spray dots.
     * Architectural line-drawing style.
     */
    'arch:shower':
        '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
        '<circle cx="12" cy="10" r="2"/>' +
        '<line x1="12" y1="12" x2="12" y2="18"/>' +
        '<line x1="9" y1="15" x2="15" y2="15"/>',

    // ── Annotation tools ──────────────────────────────────────────────────────

    /**
     * LINEAR DIMENSION — Horizontal witness line with perpendicular ticks.
     */
    'arch:linear-dim':
        '<line x1="4" y1="12" x2="20" y2="12"/>' +
        '<line x1="4" y1="8" x2="4" y2="16"/>' +
        '<line x1="20" y1="8" x2="20" y2="16"/>',

    /**
     * ANGULAR DIMENSION — Arc with two radial arms indicating an angle.
     */
    'arch:angular-dim':
        '<path d="M6 18A9 9 0 0 1 18 6"/>' +
        '<line x1="6" y1="18" x2="6" y2="22"/>' +
        '<line x1="18" y1="6" x2="22" y2="6"/>',

    /**
     * RADIUS DIMENSION — Line from center to perimeter arc with tick.
     */
    'arch:radius-dim':
        '<circle cx="12" cy="12" r="8"/>' +
        '<line x1="12" y1="12" x2="19" y2="5"/>' +
        '<line x1="17" y1="3" x2="21" y2="7"/>',

    /**
     * DIAMETER DIMENSION — Circle with a full-diameter line and ticks at ends.
     */
    'arch:diameter-dim':
        '<circle cx="12" cy="12" r="8"/>' +
        '<line x1="5" y1="12" x2="19" y2="12"/>' +
        '<line x1="5" y1="10" x2="5" y2="14"/>' +
        '<line x1="19" y1="10" x2="19" y2="14"/>',

    /**
     * SLOPE DIMENSION — Diagonal line with rise/run triangle and tick.
     */
    'arch:slope-dim':
        '<line x1="4" y1="20" x2="20" y2="4"/>' +
        '<polyline points="4 20 4 12 12 20 4 20"/>' +
        '<line x1="4" y1="12" x2="20" y2="4"/>',

    /**
     * SPOT ELEVATION — Vertical arrow pointing down with a horizontal datum line.
     */
    'arch:spot-elevation':
        '<line x1="12" y1="2" x2="12" y2="18"/>' +
        '<polyline points="8 14 12 18 16 14"/>' +
        '<line x1="6" y1="21" x2="18" y2="21"/>',

    /**
     * TEXT NOTE — Rectangle with three ruled lines representing note text.
     */
    'arch:text-note':
        '<rect x="3" y="4" width="18" height="16" rx="1"/>' +
        '<line x1="6" y1="9" x2="18" y2="9"/>' +
        '<line x1="6" y1="12" x2="18" y2="12"/>' +
        '<line x1="6" y1="15" x2="13" y2="15"/>',

    /**
     * ELEMENT TAG — Rectangular tag body with a leader line.
     */
    'arch:element-tag':
        '<rect x="2" y="7" width="14" height="10" rx="1"/>' +
        '<line x1="16" y1="12" x2="22" y2="12"/>' +
        '<circle cx="22" cy="12" r="1.5" fill="currentColor" stroke="none"/>',

    /**
     * KEYNOTE — Circle with a centred number-placeholder line.
     * Standard balloon keynote symbol.
     */
    'arch:keynote':
        '<circle cx="12" cy="12" r="8"/>' +
        '<line x1="12" y1="9" x2="12" y2="13"/>' +
        '<circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none"/>',

    /**
     * DOOR TAG — Tag with leaf-arc indicator.
     */
    'arch:door-tag':
        '<rect x="2" y="7" width="12" height="10" rx="1"/>' +
        '<path d="M14 12 A6 6 0 0 1 20 6" />' +
        '<line x1="14" y1="12" x2="20" y2="12"/>',

    /**
     * WINDOW TAG — Tag with horizontal glazing lines.
     */
    'arch:window-tag':
        '<rect x="2" y="7" width="12" height="10" rx="1"/>' +
        '<line x1="14" y1="10" x2="22" y2="10"/>' +
        '<line x1="14" y1="14" x2="22" y2="14"/>',

    /**
     * LEVEL TAG — Horizontal datum line with a triangular elevation marker.
     */
    'arch:level-tag':
        '<line x1="2" y1="16" x2="22" y2="16"/>' +
        '<polygon points="12 8 16 16 8 16"/>',

    /**
     * GRID BUBBLE — Circle with a cross-hair and leader line.
     */
    'arch:grid-bubble':
        '<circle cx="12" cy="12" r="7"/>' +
        '<line x1="12" y1="5" x2="12" y2="2"/>' +
        '<line x1="19" y1="12" x2="22" y2="12"/>',

    /**
     * REVISION CLOUD — Scalloped arc path (standard cloud revision symbol).
     */
    'arch:revision-cloud':
        '<path d="M4 14 Q5 11 8 12 Q8 9 11 9 Q11 6 14 7 Q15 4 18 5 Q20 4 21 7 Q23 8 22 11 Q23 13 21 14Z"/>',

    /**
     * SECTION MARK — Horizontal line with filled circles at each end.
     */
    'arch:section-mark':
        '<line x1="2" y1="12" x2="22" y2="12"/>' +
        '<circle cx="5" cy="12" r="3"/>' +
        '<circle cx="19" cy="12" r="3"/>',

    /**
     * ELEVATION MARK — Vertical arrow with circle at base (standard elevation marker).
     */
    'arch:elevation-mark':
        '<line x1="12" y1="2" x2="12" y2="19"/>' +
        '<polyline points="8 6 12 2 16 6"/>' +
        '<circle cx="12" cy="20" r="2"/>',

    /**
     * CALLOUT DETAIL — Rectangle with a break-line and arrow (detail callout balloon).
     */
    'arch:callout-detail':
        '<rect x="3" y="5" width="14" height="10" rx="1"/>' +
        '<line x1="17" y1="12" x2="22" y2="17"/>' +
        '<polyline points="19 17 22 17 22 14"/>',

    /**
     * ANNOTATION VISIBILITY — Eye with an annotation tag overlay.
     */
    'arch:annotation-visibility':
        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>' +
        '<circle cx="12" cy="12" r="3"/>' +
        '<line x1="18" y1="6" x2="22" y2="2"/>',

    /**
     * AI ANNOTATE — Sparkle star with a ruler/note line.
     */
    'arch:annotate-ai':
        '<path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z"/>' +
        '<line x1="4" y1="19" x2="20" y2="19"/>' +
        '<line x1="4" y1="16" x2="14" y2="16"/>',
};

/**
 * Returns an inline SVG string for the given icon name.
 * Falls back to a generic dot if the name is not mapped.
 */
export function iconFromName(name: string, size = 16): string {
    const path = _ICON_MAP[name] ?? '<circle cx="12" cy="12" r="4"/>';
    return _s(path, size);
}

/**
 * Creates a <span> element containing the named icon as an inline SVG.
 * The span uses inline-flex so it sits correctly in button/flex layouts.
 */
export function iconEl(name: string, className = '', size = 16): HTMLElement {
    const span = document.createElement('span');
    if (className) span.className = className;
    span.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;';
    span.innerHTML = iconFromName(name, size);
    return span;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW EXPORTS — from pryzm_icons_corrected_exports.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Door — Single — source: Door_Single.SVG (17 lines) */
export const pryzmDoorSingle = blk(`
<line x1="0.0" y1="3.32" x2="70.42" y2="31.13" ${BD}/>
<line x1="70.49" y1="31.2" x2="79.88" y2="27.81" ${BD}/>
<line x1="9.45" y1="0.0" x2="79.87" y2="27.81" ${BD}/>
<line x1="0.0" y1="3.39" x2="9.39" y2="0.0" ${BD}/>
<line x1="70.49" y1="31.14" x2="70.49" y2="100.0" ${BD}/>
<line x1="79.94" y1="27.81" x2="79.94" y2="96.68" ${BD}/>
<line x1="0.0" y1="3.32" x2="0.0" y2="72.19" ${BD}/>
<line x1="70.49" y1="99.77" x2="79.88" y2="96.38" ${BD}/>
<line x1="13.29" y1="21.17" x2="57.99" y2="37.82" ${BL}/>
<line x1="37.78" y1="30.09" x2="37.92" y2="83.17" ${BL}/>
<line x1="17.32" y1="75.74" x2="57.42" y2="90.34" ${BL}/>
<line x1="0.0" y1="72.24" x2="13.24" y2="77.56" ${BD}/>
<line x1="13.25" y1="21.17" x2="13.12" y2="77.68" ${BL}/>
<line x1="16.79" y1="22.74" x2="16.93" y2="75.82" ${BL}/>
<line x1="13.12" y1="77.29" x2="16.93" y2="75.74" ${BL}/>
<line x1="57.55" y1="37.78" x2="57.55" y2="94.28" ${BL}/>
<line x1="57.55" y1="94.28" x2="70.79" y2="99.6" ${BD}/>
`, '-4 -4 108 108');

/** Interiors (category icon) — source: Interiors.SVG (19 lines) — thick outline style */
export const pryzmInteriors = blk(`
<polygon points="0,8 20,0 67,19 68,92 48,100 0,81" ${BP}/>
<line x1="0.0" y1="7.97" x2="23.96" y2="17.47" ${BL}/>
<line x1="49.29" y1="26.31" x2="67.59" y2="19.09" ${BL}/>
<line x1="1.67" y1="6.99" x2="19.65" y2="0.0" ${BL}/>
<line x1="47.81" y1="27.05" x2="47.81" y2="100.0" ${BL}/>
<line x1="67.63" y1="19.09" x2="67.63" y2="92.37" ${BL}/>
<line x1="47.81" y1="99.71" x2="67.66" y2="92.46" ${BL}/>
<line x1="0.0" y1="7.97" x2="0.22" y2="81.15" ${BL}/>
<line x1="19.64" y1="0.0" x2="67.33" y2="19.1" ${BL}/>
<line x1="23.9" y1="17.42" x2="23.9" y2="90.36" ${BL}/>
<line x1="24.46" y1="17.6" x2="24.46" y2="90.55" ${BL}/>
<line x1="1.67" y1="7.04" x2="49.35" y2="26.14" ${BL}/>
<line x1="24.46" y1="17.6" x2="47.7" y2="26.98" ${BL}/>
<line x1="23.72" y1="17.42" x2="25.48" y2="16.68" ${BL}/>
<line x1="24.46" y1="17.6" x2="26.22" y2="16.86" ${BL}/>
<line x1="47.81" y1="26.87" x2="49.57" y2="26.13" ${BL}/>
<line x1="49.29" y1="26.31" x2="49.29" y2="99.26" ${BL}/>
<line x1="0.19" y1="7.78" x2="1.95" y2="7.04" ${BL}/>
<line x1="0.19" y1="80.79" x2="23.84" y2="90.31" ${BL}/>
<line x1="24.46" y1="90.42" x2="47.7" y2="99.8" ${BL}/>
`, '-20 -4 108 108');

/** Grids & Levels — three vertical grid datums with bubbles intersecting a horizontal level line */
export const pryzmGridsLevels = blk(`
<circle cx="20" cy="14" r="9" ${BL}/>
<circle cx="50" cy="14" r="9" ${BL}/>
<circle cx="80" cy="14" r="9" ${BL}/>
<line x1="20" y1="23" x2="20" y2="92" ${BL} stroke-dasharray="6 4"/>
<line x1="50" y1="23" x2="50" y2="92" ${BL} stroke-dasharray="6 4"/>
<line x1="80" y1="23" x2="80" y2="92" ${BL} stroke-dasharray="6 4"/>
<line x1="2"  y1="62" x2="98" y2="62" ${BP}/>
<polygon points="2,62 9,58 9,66" fill="currentColor" stroke="none"/>
<text x="50" y="14" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="10" font-weight="700" fill="currentColor">B</text>
<text x="20" y="14" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="10" font-weight="700" fill="currentColor">A</text>
<text x="80" y="14" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="10" font-weight="700" fill="currentColor">C</text>
`, '-4 -4 108 108');
