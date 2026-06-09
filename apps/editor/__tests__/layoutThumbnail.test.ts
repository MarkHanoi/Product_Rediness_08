// layoutThumbnail — pure SVG plan thumbnail tests (SPEC §11, A5-modal-core).

import { describe, expect, it } from 'vitest';
import { buildLayoutThumbnailSvg } from '../src/ui/apartment-layout/layoutThumbnail.js';
import type { LayoutOption } from '@pryzm/ai-host';

function opt(over: Partial<LayoutOption> = {}): LayoutOption {
    return {
        summary: 's', rooms: [], corridorWidthMin: 1000,
        walls: [
            { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },
            { start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 } },
        ],
        doors: [{ wallRef: 0, offset: 2000, width: 900 }],
        ...over,
    };
}

describe('buildLayoutThumbnailSvg (A5-modal-core)', () => {
    it('emits a sized svg with a viewBox', () => {
        const svg = buildLayoutThumbnailSvg(opt(), { width: 200, height: 150 });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('viewBox="0 0 200 150"');
        expect(svg).toContain('width="200"');
    });

    it('draws one <line> per wall and door symbols (opening line + arc + hinge) per door', () => {
        // showScaleBar:false isolates the wall/door primitives (the scale bar
        // adds its own <line>/<text> elements that would otherwise pollute the
        // count).
        const svg = buildLayoutThumbnailSvg(opt(), { showScaleBar: false });
        // Walls: one <line> per wall + one <line> per door (opening gap).
        // (2 walls + 1 door's opening line = 3 lines.)
        expect((svg.match(/<line /g) ?? []).length).toBe(3);
        // §PREVIEW-SHELL-FIDELITY: with no isExternal walls a bbox shell RING is
        // emitted as a <path class="alm-shell-ring">. Count the DOOR arc paths
        // specifically (arc paths use the "A" elliptical-arc command) so the
        // shell ring doesn't pollute the door-symbol count: 1 door = 1 arc.
        const arcPaths = svg.match(/<path d="M [^"]*A[^"]*"/g) ?? [];
        expect(arcPaths.length).toBe(1);
        expect((svg.match(/<circle /g) ?? []).length).toBe(1);
        // The shell ring is present and distinct (closed Z path, no arc).
        expect(svg).toContain('class="alm-shell-ring"');
    });

    it('keeps drawn coordinates inside the padded box', () => {
        const svg = buildLayoutThumbnailSvg(opt(), { width: 160, height: 120, padding: 8 });
        const nums = [...svg.matchAll(/(?:x1|y1|x2|y2|cx|cy)="([\d.]+)"/g)].map(m => Number(m[1]));
        expect(nums.length).toBeGreaterThan(0);
        for (const n of nums) {
            expect(n).toBeGreaterThanOrEqual(8 - 0.01);
            expect(n).toBeLessThanOrEqual(160 - 8 + 0.01);
        }
    });

    it('flips Y so plan-north reads up (smaller svg-y for larger plan-y)', () => {
        // A single vertical wall from y=0 to y=4000: its end (higher plan-y)
        // must map to a SMALLER svg y than its start.
        const svg = buildLayoutThumbnailSvg({
            summary: '', rooms: [], doors: [], corridorWidthMin: 0,
            walls: [{ start: { x: 0, y: 0 }, end: { x: 0, y: 4000 } }],
        });
        const m = svg.match(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/)!;
        const y1 = Number(m[1]); const y2 = Number(m[2]);
        expect(y2).toBeLessThan(y1);
    });

    it('drops a door whose wallRef is out of range (no throw)', () => {
        const svg = buildLayoutThumbnailSvg(
            opt({ doors: [{ wallRef: 9, offset: 100, width: 900 }] }),
            { showScaleBar: false },
        );
        // No door symbols rendered: only the 2 wall lines, no arc, no hinge.
        // (The shell-ring <path> still exists, so count DOOR arc paths only.)
        expect((svg.match(/<path d="M [^"]*A[^"]*"/g) ?? []).length).toBe(0);
        expect((svg.match(/<circle /g) ?? []).length).toBe(0);
        expect((svg.match(/<line /g) ?? []).length).toBe(2);
    });

    it('an option with no walls yields a valid empty svg', () => {
        const svg = buildLayoutThumbnailSvg(opt({ walls: [], doors: [] }), { width: 100, height: 80 });
        expect(svg).toContain('viewBox="0 0 100 80"');
        expect(svg).toContain('</svg>');
        expect((svg.match(/<line /g) ?? []).length).toBe(0);
    });

    it('renders a background rect only when a background colour is given', () => {
        expect(buildLayoutThumbnailSvg(opt(), { background: '#fff' })).toContain('<rect ');
        expect(buildLayoutThumbnailSvg(opt())).not.toContain('<rect ');
    });

    // §SUB-ZONE upgrade (2026-05-29): rooms with polygons render as filled
    // <polygon> elements with occupancy-based fills + labels.
    it('renders a <polygon> per room with a polygon + occupancy-based fill', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Living Room', type: 'living', area: 18, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 5000, y: 0 },
                        { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                    ],
                    occupancy: 'living-room',
                },
            ],
        }, { width: 200, height: 150 });
        expect((svg.match(/<polygon /g) ?? []).length).toBe(1);
        // living-room fill in the palette is blue-200 (#bfdbfe).
        expect(svg).toContain('fill="#bfdbfe"');
    });

    it('renders a label (name + area) when the room is large enough', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Kitchen', type: 'kitchen', area: 12, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 6000, y: 0 },
                        { x: 6000, y: 4000 }, { x: 0, y: 4000 },
                    ],
                    occupancy: 'kitchen',
                },
            ],
        }, { width: 320, height: 240 });
        expect(svg).toContain('>Kitchen<');
        expect(svg).toContain('>12 m²<');
    });

    it('skips room labels when showLabels:false', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Bedroom', type: 'bedroom', area: 10, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 4000, y: 0 },
                        { x: 4000, y: 3000 }, { x: 0, y: 3000 },
                    ],
                    occupancy: 'bedroom',
                },
            ],
        }, { width: 320, height: 240, showLabels: false, showScaleBar: false });
        expect(svg).not.toContain('>Bedroom<');
        // No room label <text> (scale bar disabled to avoid its own <text>).
        expect((svg.match(/<text /g) ?? []).length).toBe(0);
    });

    // §WINDOW-SYMBOLS (2026-05-29) — perimeter openings.
    it('renders a window glazing symbol per windowSpansWorld entry', () => {
        // 5 × 4 m shell (rooms polygon supplies the bbox). One window on the
        // south wall, x ∈ [1.5, 2.5] m at z = 0 m.
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 5000, y: 0 },
                    { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                ],
                occupancy: 'living-room',
            }],
        }, {
            windowSpansWorld: [{ a: { x: 1.5, z: 0 }, b: { x: 2.5, z: 0 } }],
            showScaleBar: false,
        });
        // 1 window = 1 white gap line + 1 sky-blue glazing line.
        expect(svg).toContain('stroke="#0ea5e9"');                       // glazing colour
        // Two lines per window, both axis-aligned along y=240 - pad (south wall).
        const skyLines = svg.match(/stroke="#0ea5e9"/g) ?? [];
        expect(skyLines.length).toBe(1);
    });

    it('renders perimeter door symbols (purple bar) per doorSpansWorld entry', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 5000, y: 0 },
                    { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                ],
                occupancy: 'living-room',
            }],
        }, {
            doorSpansWorld: [{ a: { x: 2.0, z: 4.0 }, b: { x: 2.9, z: 4.0 } }],
            showScaleBar: false,
        });
        // PRYZM purple = #6600FF — the perimeter door's leaf stroke.
        const purpleLines = svg.match(/stroke="#6600FF"/g) ?? [];
        expect(purpleLines.length).toBe(1);
    });

    it('omits perimeter openings when no spans are supplied', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 5000, y: 0 },
                    { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                ],
                occupancy: 'living-room',
            }],
        }, { showScaleBar: false });
        expect(svg).not.toContain('#0ea5e9');     // no window glazing
        // No purple lines either (no doors in the option, no perimeter doors).
        expect(svg).not.toContain('#6600FF');
    });

    // §MODAL-DYNAMIC part-3: scale bar.
    it('renders a scale bar with a nice-round metre label at default size', () => {
        // A 12 × 10 m apartment-sized shell.
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 12000, y: 0 },
                    { x: 12000, y: 10000 }, { x: 0, y: 10000 },
                ],
                occupancy: 'living-room',
            }],
        });
        expect(svg).toContain('class="alm-scalebar"');
        // The label is one of the nice-round values: 1, 2, 5, 10, 20, 50.
        expect(svg).toMatch(/>(1|2|5|10|20|50) m</);
    });

    it('omits the scale bar when showScaleBar:false', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 12000, y: 0 },
                    { x: 12000, y: 10000 }, { x: 0, y: 10000 },
                ],
                occupancy: 'living-room',
            }],
        }, { showScaleBar: false });
        expect(svg).not.toContain('alm-scalebar');
    });

    it('omits the scale bar on tiny thumbs (width < 120)', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 12000, y: 0 },
                    { x: 12000, y: 10000 }, { x: 0, y: 10000 },
                ],
                occupancy: 'living-room',
            }],
        }, { width: 100, height: 80 });
        expect(svg).not.toContain('alm-scalebar');
    });

    // §CLICK-FOCUS (2026-05-29) — polygons carry `data-room-name` + a class
    // hook so the modal can wire click → focus the matching area input. Named
    // rooms get the stamp; unnamed rooms don't (no input to focus).
    it('stamps data-room-name + alm-room-polygon class + a11y attrs on named room polygons', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Bedroom 1', type: 'bedroom', area: 12, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 4000, y: 0 },
                        { x: 4000, y: 3000 }, { x: 0, y: 3000 },
                    ],
                    occupancy: 'bedroom',
                },
            ],
        });
        expect(svg).toContain('data-room-name="Bedroom 1"');
        expect(svg).toContain('class="alm-room-polygon"');
        // §A11Y — keyboard activation requires role="button" + tabindex="0".
        expect(svg).toContain('role="button"');
        expect(svg).toContain('tabindex="0"');
        expect(svg).toContain('aria-label="Edit area of Bedroom 1"');
    });

    it('omits data-room-name on rooms without a name (nothing to focus)', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: '', type: 'living', area: 0, windowCount: 0,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 5000, y: 0 },
                        { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                    ],
                    occupancy: 'living-room',
                },
            ],
        });
        expect(svg).not.toContain('data-room-name');
        expect(svg).not.toContain('alm-room-polygon');
    });

    it('uses room polygons (not wall bbox) for layout when both are present', () => {
        // Polygons at x ∈ [0, 10000] but walls at x ∈ [-500, 500]: the SVG
        // should fit polygons (the EXACT shell) and clip the wall stubs.
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [],
            walls: [{ start: { x: -500, y: 0 }, end: { x: 500, y: 0 } }],
            rooms: [
                {
                    name: 'A', type: 'living', area: 0, windowCount: 0,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 10000, y: 0 },
                        { x: 10000, y: 6000 }, { x: 0, y: 6000 },
                    ],
                    occupancy: 'living-room',
                },
            ],
        }, { width: 200, height: 150, padding: 0 });
        // Wall start (mm x=-500) maps to negative svg-x when bbox is rooms[0]
        // x ∈ [0, 10000]. Check the FIRST wall x1 attribute is negative.
        const m = svg.match(/<line x1="(-?[\d.]+)"/);
        expect(m).toBeTruthy();
        expect(Number(m![1])).toBeLessThan(0);
    });

    // T1.W-D (2026-05-30) — option.windows render as a triple-line glazing
    // symbol on the host wall (mirrors the perimeter window symbol).
    describe('T1.W-D option.windows rendering', () => {
        it('emits an opening line + a glazing line per option.windows entry', () => {
            // Baseline: walls + 1 door + 0 windows = 3 lines (2 walls + 1 door
            // opening). Adding 1 option-window adds 2 more lines (opening + glazing).
            const base = buildLayoutThumbnailSvg(opt(), { showScaleBar: false });
            const baseLines = (base.match(/<line /g) ?? []).length;

            const withWindow = buildLayoutThumbnailSvg(opt({
                windows: [{ wallRef: 0, offset: 1500, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom' }],
            }), { showScaleBar: false });
            const linesNow = (withWindow.match(/<line /g) ?? []).length;
            expect(linesNow - baseLines).toBe(2);
        });

        it('uses the window colour for the glazing stroke', () => {
            const svg = buildLayoutThumbnailSvg(opt({
                windows: [{ wallRef: 0, offset: 1500, width: 1500, height: 1300, sillHeight: 900, roomType: 'living' }],
            }), { showScaleBar: false, windowColor: '#1e90ff' });
            // The glazing stroke uses the configured windowColor.
            expect(svg).toContain('stroke="#1e90ff"');
        });

        it('skips degenerate windows (host wall missing or zero-length)', () => {
            // wallRef out of range → window dropped silently
            const svg = buildLayoutThumbnailSvg(opt({
                windows: [{ wallRef: 99, offset: 1500, width: 1500, height: 1300, sillHeight: 900 }],
            }), { showScaleBar: false });
            // Should not throw; line count matches the no-windows baseline.
            const base = buildLayoutThumbnailSvg(opt(), { showScaleBar: false });
            expect((svg.match(/<line /g) ?? []).length).toBe((base.match(/<line /g) ?? []).length);
        });

        it('renders multiple option.windows independently', () => {
            const svg = buildLayoutThumbnailSvg(opt({
                windows: [
                    { wallRef: 0, offset: 500,  width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom' },
                    { wallRef: 1, offset: 1000, width: 1200, height: 1200, sillHeight: 1000, roomType: 'kitchen' },
                ],
            }), { showScaleBar: false });
            const base = buildLayoutThumbnailSvg(opt(), { showScaleBar: false });
            const delta = (svg.match(/<line /g) ?? []).length - (base.match(/<line /g) ?? []).length;
            expect(delta).toBe(4);   // 2 lines per window × 2 windows
        });
    });

    // §PREVIEW-SHELL-FIDELITY (2026-06-09, founder feedback) — the perimeter
    // shell reads as ONE clear closed ring, and NO opening mark pokes outside it.
    describe('§PREVIEW-SHELL-FIDELITY perimeter ring + opening clamp', () => {
        // 5 × 4 m rectilinear shell from a single room polygon (no isExternal walls).
        const shellOpt = (over: Partial<LayoutOption> = {}): LayoutOption => ({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [{
                name: '', type: 'living', area: 0, windowCount: 0,
                hasDirectAccess: true, adjacentTo: [],
                polygon: [
                    { x: 0, y: 0 }, { x: 5000, y: 0 },
                    { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                ],
                occupancy: 'living-room',
            }],
            ...over,
        });

        function bbox(svg: string): { minX: number; maxX: number; minY: number; maxY: number } {
            const nums = [...svg.matchAll(/(?:x1|x2|cx)="(-?[\d.]+)"/g)].map(m => Number(m[1]));
            const ynums = [...svg.matchAll(/(?:y1|y2|cy)="(-?[\d.]+)"/g)].map(m => Number(m[1]));
            // include the shell-ring path corners too
            for (const m of svg.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)) {
                nums.push(Number(m[1])); ynums.push(Number(m[2]));
            }
            return {
                minX: Math.min(...nums), maxX: Math.max(...nums),
                minY: Math.min(...ynums), maxY: Math.max(...ynums),
            };
        }

        it('emits a distinct closed shell RING path when no isExternal walls are present', () => {
            const svg = buildLayoutThumbnailSvg(shellOpt(), { showScaleBar: false });
            expect(svg).toContain('class="alm-shell-ring"');
            // Closed rectangle ring → ends in Z.
            expect(svg).toMatch(/class="alm-shell-ring" d="M [^"]*Z"/);
        });

        it('draws isExternal walls as the HEAVY shell stroke (not the bbox ring)', () => {
            const wallW = 2.5;
            const svg = buildLayoutThumbnailSvg({
                summary: '', corridorWidthMin: 0, doors: [], rooms: [],
                walls: [
                    { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, isExternal: true },
                    { start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 }, isExternal: true },
                    { start: { x: 2000, y: 0 }, end: { x: 2000, y: 4000 } }, // interior
                ],
            }, { showScaleBar: false, wallWidth: wallW });
            // No bbox-ring fallback when external walls exist.
            expect(svg).not.toContain('alm-shell-ring');
            // The 2 external walls render at the heavier shell stroke (wallW + 1.6),
            // the interior wall at the normal wallW.
            const shellStroke = `stroke-width="${wallW + 1.6}"`;
            expect((svg.match(new RegExp(shellStroke.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(2);
        });

        it('clamps an option.window whose offset+width OVERRUNS the host wall to within the perimeter bbox', () => {
            // Host wall (wallRef 0) spans x∈[0,5000] at y=0. A window with
            // offset 4500 + width 2000 would run to x=6500 — OUT of the shell —
            // without the clamp.
            const svg = buildLayoutThumbnailSvg(shellOpt({
                walls: [{ start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } }],
                windows: [{ wallRef: 0, offset: 4500, width: 2000, height: 1300, sillHeight: 900 }],
            }), { width: 200, height: 150, padding: 10, showScaleBar: false });
            const bb = bbox(svg);
            // The shell ring maps x∈[0,5000] to a fixed pixel span; the glazing
            // line must not exceed the ring's right edge. Pull the shell-ring max-x
            // and assert no opening x exceeds it.
            const ring = svg.match(/class="alm-shell-ring" d="([^"]+)"/)![1]!;
            const ringXs = [...ring.matchAll(/[ML] (-?[\d.]+) /g)].map(m => Number(m[1]));
            const ringMaxX = Math.max(...ringXs);
            expect(bb.maxX).toBeLessThanOrEqual(ringMaxX + 0.5);
        });

        it('clamps a windowSpansWorld span lying OUTSIDE the shared bounds into the perimeter', () => {
            // boundsMm shell is 5×4 m (0..5000 × 0..4000 mm). A window world-span
            // on the EAST wall running x∈[5.5, 6.0] m (past the shell) at
            // z∈[1.0, 2.0] m — the x is past the east edge so must be clamped to
            // maxX (5000 mm) → the glazing mark lands ON the east ring edge, not
            // beyond it.
            const svg = buildLayoutThumbnailSvg(shellOpt(), {
                width: 200, height: 150, padding: 10, showScaleBar: false,
                boundsMm: { minX: 0, maxX: 5000, minY: 0, maxY: 4000 },
                windowSpansWorld: [{ a: { x: 5.5, z: 1.0 }, b: { x: 6.0, z: 2.0 } }],
            });
            const ring = svg.match(/class="alm-shell-ring" d="([^"]+)"/)![1]!;
            const ringXs = [...ring.matchAll(/[ML] (-?[\d.]+) /g)].map(m => Number(m[1]));
            const ringMaxX = Math.max(...ringXs);
            // The glazing line (sky-blue) x coords must sit ON/inside the ring edge.
            const glazing = svg.match(/stroke="#0ea5e9"[^/]*\/>/)![0]!;
            const gx = [...glazing.matchAll(/x[12]="(-?[\d.]+)"/g)].map(m => Number(m[1]));
            for (const x of gx) expect(x).toBeLessThanOrEqual(ringMaxX + 0.5);
        });
    });

    // §SHARED-FLOOR-BOUNDS (2026-06-09, founder feedback #1) — the house modal
    // fits every storey of a variant to ONE shared bounds so the Ground-floor and
    // upper-floor thumbnails render at the SAME scale + extent.
    describe('§SHARED-FLOOR-BOUNDS boundsMm override', () => {
        function roomOpt(maxXmm: number, maxYmm: number): LayoutOption {
            return {
                summary: '', corridorWidthMin: 0, doors: [], walls: [],
                rooms: [{
                    name: '', type: 'living', area: 0, windowCount: 0,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: maxXmm, y: 0 },
                        { x: maxXmm, y: maxYmm }, { x: 0, y: maxYmm },
                    ],
                    occupancy: 'living-room',
                }],
            };
        }

        function firstPolygonPoints(svg: string): Array<[number, number]> {
            const m = svg.match(/<polygon points="([^"]+)"/);
            if (!m) return [];
            return m[1]!.split(' ').map(pair => {
                const [x, y] = pair.split(',').map(Number);
                return [x!, y!] as [number, number];
            });
        }

        it('fits the SAME footprint to an explicit larger bounds at a SMALLER scale', () => {
            const cfg = { width: 320, height: 240, padding: 12, showScaleBar: false } as const;
            // A small 6×4 m plate fit to its OWN bounds fills the box.
            const own = buildLayoutThumbnailSvg(roomOpt(6000, 4000), cfg);
            // The SAME plate fit to a larger SHARED bounds (a 10×8 m shell) draws
            // smaller — it occupies only part of the box, leaving margin.
            const shared = buildLayoutThumbnailSvg(roomOpt(6000, 4000), {
                ...cfg, boundsMm: { minX: 0, maxX: 10000, minY: 0, maxY: 8000 },
            });
            const ownPts = firstPolygonPoints(own);
            const sharedPts = firstPolygonPoints(shared);
            const span = (pts: Array<[number, number]>): number => {
                const xs = pts.map(p => p[0]);
                return Math.max(...xs) - Math.min(...xs);
            };
            // The polygon's on-screen width must be SMALLER under the larger shared
            // bounds than under its own fit-to-rooms bounds.
            expect(span(sharedPts)).toBeLessThan(span(ownPts));
        });

        it('two DIFFERENT-sized plates share an IDENTICAL scale under the same boundsMm', () => {
            const bounds = { minX: 0, maxX: 10000, minY: 0, maxY: 8000 };
            const cfg = { width: 320, height: 240, padding: 12, showScaleBar: false, boundsMm: bounds } as const;
            // Ground (full 10×8 m shell) and First (smaller 6×4 m plate) share the
            // same bounds → the same metre-to-pixel scale. A 10000 mm edge on the
            // ground plate and a 6000 mm edge on the first plate must scale by the
            // SAME factor (ratio of on-screen spans == ratio of mm spans).
            const ground = buildLayoutThumbnailSvg(roomOpt(10000, 8000), cfg);
            const first = buildLayoutThumbnailSvg(roomOpt(6000, 4000), cfg);
            const span = (svg: string): number => {
                const pts = firstPolygonPoints(svg);
                const xs = pts.map(p => p[0]);
                return Math.max(...xs) - Math.min(...xs);
            };
            const scaleGround = span(ground) / 10000;
            const scaleFirst = span(first) / 6000;
            expect(Math.abs(scaleGround - scaleFirst)).toBeLessThan(1e-6);
        });

        it('ignores a degenerate boundsMm and falls back to per-option fit', () => {
            const cfg = { width: 320, height: 240, padding: 12, showScaleBar: false } as const;
            const own = buildLayoutThumbnailSvg(roomOpt(6000, 4000), cfg);
            // maxX == minX → not a usable box → legacy per-option fit (identical svg).
            const degenerate = buildLayoutThumbnailSvg(roomOpt(6000, 4000), {
                ...cfg, boundsMm: { minX: 5, maxX: 5, minY: 0, maxY: 8000 },
            });
            expect(degenerate).toBe(own);
        });
    });
});
