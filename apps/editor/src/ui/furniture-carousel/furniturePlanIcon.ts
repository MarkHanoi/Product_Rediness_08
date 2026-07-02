/**
 * @file furniturePlanIcon.ts  — §FIX-LIBRARY-DIAGRAM-ICONS
 *
 * ONE shared, diagrammatic TOP-VIEW symbol vocabulary for the furniture
 * library cards. Every card preview is a clean generated plan symbol drawn
 * in the PRYZM plan-symbol style — the exact same architectural vocabulary
 * the drawing uses (SofaPlanSymbolBuilder / ChairPlanSymbolBuilder /
 * BedPlanSymbolBuilder / WardrobePlanSymbolBuilder / KitchenPlanSymbolBuilder /
 * TreePlanSymbolBuilder in @pryzm/geometry-furniture).
 *
 * WHY THIS EXISTS
 *   The GLB/thumbnail catalog is deliberately NOT hosted in prod (tracker
 *   OBJECT-STORAGE-GLB), so `/items/<cat>/<item>/thumbnail.webp` 404s and cards used to
 *   fall back to a grab-bag of mixed-metaphor SIDE-VIEW icons (a couch drawn
 *   in elevation next to a wardrobe drawn in elevation next to a 3D raster
 *   render on a light-blue background). That reads "tacky" and inconsistent
 *   (founder L-22). Meanwhile PRYZM already draws crisp TOP-VIEW plan symbols
 *   in the drawing. This module re-uses that vocabulary so the cards and the
 *   drawing speak ONE symbol language.
 *
 * DESIGN CONTRACT (ADR-0110 — Unified Furniture Plan-Symbol Vocabulary)
 *   - Pure module: no THREE, no OBC, no DOM writes, no network. Deterministic
 *     string→SVG. (Keeps the L7.5 UI card path dependency-free; the heavy
 *     plan-symbol builders stay in the geometry package.)
 *   - TOP-VIEW only. Origin centred, drawn into a normalised [-1..+1] box then
 *     emitted at viewBox 0 0 48 48. Longer axis = vertical (front toward the
 *     bottom of the card) so all symbols read consistently.
 *   - Single ink: `stroke="currentColor"` (the card sets it to PRYZM purple
 *     #6600FF via `.fsp-thumb { color: var(--app-accent) }`), `fill="none"`,
 *     uniform round-joined 1.6px stroke. No black, no second colour.
 *   - Mirrors (does NOT import) the builders' conventions: rounded-rect seat +
 *     back arc (chairs), frame + mattress inset + two pillows + duvet diagonal
 *     (beds), outer outline + arms + cushion seams (sofas), carcass + section
 *     dividers + door-swing quarter-arcs (wardrobes), run + unit dividers +
 *     sink/hob glyphs + countertop line (kitchen), bumpy canopy + trunk dot
 *     (trees/plants).
 *
 * The builders remain the source of truth for the PLACED drawing symbol; this
 * is their card-scale sibling. Keeping the vocabulary aligned is the point.
 */

// ── Geometry helpers (normalised space, x,y ∈ [-1, 1], y+ = front/bottom) ──

const VB = 48;              // viewBox size
const PAD = 5;              // px padding inside the viewBox
const HALF = (VB - PAD * 2) / 2;
const CX = VB / 2;
const CY = VB / 2;

/** Map a normalised coord (−1..1) to a viewBox px coord. */
function px(n: number): number {
    return CX + n * HALF;
}
function py(n: number): number {
    return CY + n * HALF;
}
function f(n: number): string {
    // Trim to 2dp to keep the markup small and stable.
    return (Math.round(n * 100) / 100).toString();
}

/** A path builder in normalised space. */
class PathBuf {
    private d = '';
    moveTo(x: number, y: number): this { this.d += `M${f(px(x))} ${f(py(y))}`; return this; }
    lineTo(x: number, y: number): this { this.d += `L${f(px(x))} ${f(py(y))}`; return this; }
    /** Straight segment. */
    seg(ax: number, ay: number, bx: number, by: number): this {
        return this.moveTo(ax, ay).lineTo(bx, by);
    }
    /** Axis-aligned rectangle outline (corners in normalised space). */
    rect(x0: number, y0: number, x1: number, y1: number): this {
        return this.moveTo(x0, y0).lineTo(x1, y0).lineTo(x1, y1).lineTo(x0, y1).lineTo(x0, y0);
    }
    /** Rounded rectangle outline; r in normalised units. */
    roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): this {
        const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
        this.d += `M${f(px(x0 + rr))} ${f(py(y0))}`;
        this.d += `L${f(px(x1 - rr))} ${f(py(y0))}`;
        this.d += `Q${f(px(x1))} ${f(py(y0))} ${f(px(x1))} ${f(py(y0 + rr))}`;
        this.d += `L${f(px(x1))} ${f(py(y1 - rr))}`;
        this.d += `Q${f(px(x1))} ${f(py(y1))} ${f(px(x1 - rr))} ${f(py(y1))}`;
        this.d += `L${f(px(x0 + rr))} ${f(py(y1))}`;
        this.d += `Q${f(px(x0))} ${f(py(y1))} ${f(px(x0))} ${f(py(y1 - rr))}`;
        this.d += `L${f(px(x0))} ${f(py(y0 + rr))}`;
        this.d += `Q${f(px(x0))} ${f(py(y0))} ${f(px(x0 + rr))} ${f(py(y0))}`;
        return this;
    }
    /** Full circle (as an SVG arc pair). */
    circle(cx: number, cy: number, r: number): this {
        const x0 = px(cx - r), x1 = px(cx + r), y = py(cy);
        const rp = r * HALF;
        this.d += `M${f(x0)} ${f(y)}A${f(rp)} ${f(rp)} 0 1 0 ${f(x1)} ${f(y)}A${f(rp)} ${f(rp)} 0 1 0 ${f(x0)} ${f(y)}`;
        return this;
    }
    /** Quarter/partial arc from angle a0 to a1 (radians) around (cx,cy), radius r. */
    arc(cx: number, cy: number, r: number, a0: number, a1: number): this {
        this.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
        const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
        const sweep = a1 > a0 ? 1 : 0;
        const rp = r * HALF;
        this.d += `A${f(rp)} ${f(rp)} 0 ${large} ${sweep} ${f(px(cx + r * Math.cos(a1)))} ${f(py(cy + r * Math.sin(a1)))}`;
        return this;
    }
    /** Soft "bumpy" canopy circle (tree/plant) as a polyline. */
    bumpyCircle(cx: number, cy: number, r: number, bumps: number, amp: number): this {
        const N = 48;
        for (let i = 0; i <= N; i++) {
            const t = (i / N) * Math.PI * 2;
            const rr = r + Math.sin(t * bumps) * amp;
            const x = cx + Math.cos(t) * rr;
            const y = cy + Math.sin(t) * rr;
            if (i === 0) this.moveTo(x, y); else this.lineTo(x, y);
        }
        return this;
    }
    toString(): string { return this.d; }
}

// ── Symbol drawers (each returns an SVG path `d` string) ────────────────────

type Drawer = () => string;

/** Chair — rounded seat footprint + shallow back arc (mirrors ChairPlanSymbolBuilder). */
function chairSymbol(withArms: boolean): Drawer {
    return () => {
        const p = new PathBuf();
        const w = 0.62, l = 0.72;
        p.roundedRect(-w, -l, w, l, 0.22);
        // Back arc just inside the back edge (-y = back).
        p.arc(0, -l + 0.62, withArms ? 0.62 : 0.5, Math.PI * 0.78, Math.PI * 0.22);
        if (withArms) {
            p.seg(-w + 0.1, -l + 0.28, -w + 0.1, l - 0.2);
            p.seg(w - 0.1, -l + 0.28, w - 0.1, l - 0.2);
        }
        return p.toString();
    };
}

/** Sofa — outer outline + arm partitions + back-panel edge + cushion seams. */
function sofaSymbol(seats: number): Drawer {
    return () => {
        const p = new PathBuf();
        const w = 0.92, l = 0.62, arm = 0.16, back = 0.16;
        p.rect(-w, -l, w, l);
        // Arms.
        p.seg(-w + arm, -l, -w + arm, l);
        p.seg(w - arm, -l, w - arm, l);
        // Back-panel front edge.
        p.seg(-w + arm, -l + back, w - arm, -l + back);
        // Cushion seams.
        const inner = (w - arm) * 2;
        const n = Math.max(1, Math.min(seats, Math.round(inner / 0.6)));
        for (let i = 1; i < n; i++) {
            const x = -w + arm + (inner / n) * i;
            p.seg(x, -l + back, x, l);
        }
        return p.toString();
    };
}

/** Corner sofa — L polygon + two arms + diagonal corner-cushion seam. */
function cornerSofaSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        // L outline: main run across top, side run down the left.
        p.moveTo(-0.9, -0.9).lineTo(0.9, -0.9).lineTo(0.9, 0.0)
            .lineTo(-0.15, 0.0).lineTo(-0.15, 0.9).lineTo(-0.9, 0.9).lineTo(-0.9, -0.9);
        // Back panel edges.
        p.seg(-0.15, -0.74, 0.74, -0.74);
        p.seg(-0.74, -0.15, -0.74, 0.74);
        // Corner cushion diagonal.
        p.seg(-0.9, -0.9, -0.15, 0.0);
        return p.toString();
    };
}

/** Bed — frame + mattress inset + two pillows + duvet diagonal + headboard. */
function bedSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        const w = 0.72, l = 0.9;
        // Frame (head = top/-y).
        p.rect(-w, -l, w, l);
        // Headboard strip behind the head.
        p.rect(-w - 0.06, -l - 0.12, w + 0.06, -l);
        // Mattress inset.
        const mx = w - 0.1, mTop = -l + 0.08, mBot = l - 0.08;
        p.rect(-mx, mTop, mx, mBot);
        // Two pillows at head.
        const gap = 0.05, pw = (mx * 2 - gap) / 2, pTop = mTop + 0.05, pBot = pTop + 0.34;
        p.rect(-mx, pTop, -mx + pw, pBot);
        p.rect(mx - pw, pTop, mx, pBot);
        // Duvet fold diagonal across the foot.
        p.seg(-mx, pBot + 0.1, mx, mBot - 0.05);
        return p.toString();
    };
}

/** Bedside table — small square with a drawer line. */
function bedsideSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        p.rect(-0.55, -0.55, 0.55, 0.55);
        p.seg(-0.55, -0.05, 0.55, -0.05);
        p.circle(0, 0.25, 0.07);
        return p.toString();
    };
}

/** Wardrobe — carcass + section dividers + door-swing quarter-arcs (front = bottom). */
function wardrobeSymbol(sliding: boolean): Drawer {
    return () => {
        const p = new PathBuf();
        const w = 0.9, d = 0.42;               // shallow depth reads as a run
        p.rect(-w, -d, w, d);
        // Two sections.
        p.seg(0, -d, 0, d - 0.14);
        if (sliding) {
            // Bypass panels: front edge with a centre gap + inner offset line.
            p.seg(-w, d, -0.06, d);
            p.seg(0.06, d, w, d);
            p.seg(-w, d - 0.08, w, d - 0.08);
        } else {
            // Double-hinged swing arcs (radius = half section width).
            p.seg(-w, d, w, d);
            p.arc(-w, d, w / 2, -Math.PI / 2, 0);
            p.arc(0, d, w / 2, Math.PI, -Math.PI / 2);
            p.arc(0, d, w / 2, 0, -Math.PI / 2);
            p.arc(w, d, w / 2, Math.PI, -Math.PI / 2 - 0.0001);
        }
        return p.toString();
    };
}

/** Table — top rectangle + four leg ticks (or round variant). */
function tableSymbol(round: boolean): Drawer {
    return () => {
        const p = new PathBuf();
        if (round) {
            p.circle(0, 0, 0.82);
            p.circle(0, 0, 0.12);
        } else {
            const w = 0.85, l = 0.62;
            p.rect(-w, -l, w, l);
            // Leg ticks at the inset corners.
            const i = 0.14;
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
                p.seg(sx * (w - i), sy * (l - i), sx * (w - i * 0.2), sy * (l - i));
                p.seg(sx * (w - i), sy * (l - i), sx * (w - i), sy * (l - i * 0.2));
            }
        }
        return p.toString();
    };
}

/** Dining set — table + surrounding chair footprints. */
function diningSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        p.rect(-0.5, -0.75, 0.5, 0.75);
        // Chair seats top/bottom (2 each side).
        for (const sy of [-1, 1]) {
            p.roundedRect(-0.42, sy * 0.98 - 0.16, -0.06, sy * 0.98 + 0.16, 0.06);
            p.roundedRect(0.06, sy * 0.98 - 0.16, 0.42, sy * 0.98 + 0.16, 0.06);
        }
        return p.toString();
    };
}

/** Kitchen run — carcass + unit dividers + sink basin + hob burners + countertop line. */
function kitchenSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        const w = 0.92, d = 0.5;
        // Carcass (back = top).
        p.seg(-w, -d, w, -d);
        p.seg(-w, -d, -w, d);
        p.seg(w, -d, w, d);
        // Countertop overhang line.
        p.seg(-w - 0.04, d + 0.06, w + 0.04, d + 0.06);
        // Unit dividers.
        for (const x of [-w / 3, w / 3]) p.seg(x, d, x, d - 0.28);
        // Sink basin in the left unit.
        p.rect(-w + 0.1, -d + 0.12, -w / 3 - 0.1, d - 0.12);
        p.circle((-w + 0.1 + (-w / 3 - 0.1)) / 2, 0, 0.07);
        // Hob burners (2x2) in the right unit.
        const hcx = (w / 3 + w) / 2 - 0.02;
        for (const bx of [hcx - 0.16, hcx + 0.16]) for (const by of [-0.16, 0.16]) p.circle(bx, by, 0.09);
        return p.toString();
    };
}

/** Tree / plant — bumpy canopy + trunk dot. */
function treeSymbol(dense: boolean): Drawer {
    return () => {
        const p = new PathBuf();
        p.bumpyCircle(0, 0, 0.82, dense ? 9 : 13, 0.05);
        if (dense) {
            // A few radial branch ticks.
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                p.seg(0, 0, Math.cos(a) * 0.6, Math.sin(a) * 0.6);
            }
        }
        p.rect(-0.06, -0.06, 0.06, 0.06);   // trunk dot
        return p.toString();
    };
}

/** Lamp — concentric shade rings + centre. */
function lampSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        p.circle(0, 0, 0.82);
        p.circle(0, 0, 0.45);
        p.rect(-0.05, -0.05, 0.05, 0.05);
        return p.toString();
    };
}

/** Rug / carpet — outer rect + inner border. */
function rugSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        p.rect(-0.9, -0.7, 0.9, 0.7);
        p.rect(-0.72, -0.52, 0.72, 0.52);
        return p.toString();
    };
}

/** Bath / shower / toilet — basin outline + inner detail. */
function sanitarySymbol(kind: 'bath' | 'shower' | 'toilet' | 'sink'): Drawer {
    return () => {
        const p = new PathBuf();
        if (kind === 'bath') {
            p.roundedRect(-0.55, -0.9, 0.55, 0.9, 0.2);
            p.roundedRect(-0.4, -0.62, 0.4, 0.78, 0.18);
            p.circle(0, -0.74, 0.05);
        } else if (kind === 'shower') {
            p.rect(-0.8, -0.8, 0.8, 0.8);
            p.circle(0.5, -0.5, 0.12);   // drain / head corner
            p.seg(-0.8, 0.8, 0.8, -0.8);
        } else if (kind === 'toilet') {
            p.rect(-0.4, -0.9, 0.4, -0.4);           // cistern
            p.roundedRect(-0.45, -0.4, 0.45, 0.85, 0.3); // bowl (oval-ish)
        } else {
            p.roundedRect(-0.7, -0.55, 0.7, 0.55, 0.16);
            p.circle(0, 0.05, 0.24);
            p.circle(0, -0.4, 0.05);
        }
        return p.toString();
    };
}

/** Generic cabinet / storage / appliance — carcass + door line. */
function cabinetSymbol(): Drawer {
    return () => {
        const p = new PathBuf();
        p.rect(-0.82, -0.5, 0.82, 0.5);
        p.seg(0, -0.5, 0, 0.5);
        p.circle(-0.12, 0, 0.04);
        p.circle(0.12, 0, 0.04);
        return p.toString();
    };
}

/** Absolute fallback — soft-cornered footprint so nothing renders empty. */
function genericSymbol(): Drawer {
    return () => new PathBuf().roundedRect(-0.75, -0.6, 0.75, 0.6, 0.12).toString();
}

// ── Type/label → symbol resolution (generalises via keyword, like the old map) ──

interface SymbolMatch {
    test: (t: string) => boolean;
    draw: Drawer;
}

const has = (t: string, ...needles: string[]): boolean => needles.some(n => t.includes(n));

/**
 * Ordered rules — first match wins. Ordering matters: specific families
 * (corner sofa, sliding wardrobe, dining set) before their generic siblings.
 */
const RULES: readonly SymbolMatch[] = [
    // Sofas
    { test: t => has(t, 'corner_sofa', 'corner sofa'), draw: cornerSofaSymbol() },
    { test: t => has(t, 'sofa', 'couch', 'settee', 'loveseat', 'chaise'), draw: sofaSymbol(3) },
    { test: t => has(t, 'bean bag', 'beanbag', 'pouffe', 'ottoman'), draw: chairSymbol(false) },
    // Beds + bedside
    { test: t => has(t, 'bedside', 'nightstand'), draw: bedsideSymbol() },
    { test: t => has(t, 'bed', 'bunk', 'cot', 'crib'), draw: bedSymbol() },
    // Wardrobes / closets
    { test: t => has(t, 'sliding') && has(t, 'wardrobe', 'closet'), draw: wardrobeSymbol(true) },
    { test: t => has(t, 'wardrobe', 'closet', 'armoire'), draw: wardrobeSymbol(false) },
    { test: t => has(t, 'dresser', 'chest of drawers', 'drawers'), draw: cabinetSymbol() },
    // Kitchen
    { test: t => has(t, 'kitchen', 'stove', 'hob', 'cooktop', 'oven', 'fridge', 'refrigerator', 'microwave', 'dishwasher'), draw: kitchenSymbol() },
    // Chairs / stools
    { test: t => has(t, 'armchair', 'lounge chair', 'wing chair', 'barcelona'), draw: chairSymbol(true) },
    { test: t => has(t, 'chair', 'stool', 'seat', 'bench'), draw: chairSymbol(false) },
    // Tables (dining sets first, then round, then generic)
    { test: t => has(t, 'dining') && has(t, 'set'), draw: diningSymbol() },
    { test: t => has(t, 'round table', 'bistro'), draw: tableSymbol(true) },
    { test: t => has(t, 'table', 'desk', 'console'), draw: tableSymbol(false) },
    // Trees / plants (outdoor + decor)
    { test: t => has(t, 'tree', 'palm', 'conifer', 'shrub', 'bush'), draw: treeSymbol(true) },
    { test: t => has(t, 'plant', 'cactus', 'fern', 'flower', 'pot'), draw: treeSymbol(false) },
    // Lighting
    { test: t => has(t, 'lamp', 'light', 'pendant', 'sconce', 'chandelier'), draw: lampSymbol() },
    // Soft furnishings
    { test: t => has(t, 'rug', 'carpet', 'mat'), draw: rugSymbol() },
    // Bathroom / sanitary
    { test: t => has(t, 'bath', 'tub'), draw: sanitarySymbol('bath') },
    { test: t => has(t, 'shower'), draw: sanitarySymbol('shower') },
    { test: t => has(t, 'toilet', 'wc', 'radiator'), draw: sanitarySymbol('toilet') },
    { test: t => has(t, 'sink', 'basin', 'washbasin', 'vanity'), draw: sanitarySymbol('sink') },
    // Storage / cabinets / appliances
    { test: t => has(t, 'cabinet', 'cupboard', 'shelf', 'shelving', 'bookcase', 'sideboard', 'washing', 'dryer', 'utility'), draw: cabinetSymbol() },
    // Decor — chimney/fireplace reads as a hearth run; mirror/art as a framed rect.
    { test: t => has(t, 'chimney', 'fireplace', 'hearth', 'stove_wood'), draw: cabinetSymbol() },
    { test: t => has(t, 'mirror', 'picture', 'artwork', 'painting', 'frame'), draw: rugSymbol() },
];

/**
 * Resolve the diagrammatic top-view symbol path for a furniture item by its
 * `type` + `label` (lower-cased). Falls back to a soft footprint so a card is
 * never empty.
 */
export function resolveFurniturePlanSymbol(type: string, label: string): string {
    const text = `${type} ${label}`.toLowerCase();
    for (const rule of RULES) {
        if (rule.test(text)) return rule.draw();
    }
    return genericSymbol()();
}

/**
 * Build a clean, brand-consistent SVG plan symbol for a library card.
 * Single-ink (`currentColor` → PRYZM purple set by `.fsp-thumb`), no fill,
 * uniform round-joined stroke. Returns a detached <svg> element.
 */
export function buildFurniturePlanIcon(type: string, label: string): SVGSVGElement {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
    svg.setAttribute('width', '44');
    svg.setAttribute('height', '44');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${label} plan symbol`);
    svg.classList.add('fsp-plan-icon');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', resolveFurniturePlanSymbol(type, label));
    svg.appendChild(path);
    return svg;
}
