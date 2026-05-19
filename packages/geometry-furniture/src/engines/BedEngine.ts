/**
 * @file BedEngine.ts
 *
 * Parametric bed-construction engine for Japanese-style platform beds
 * (variants: platform / float / walnut).  Pure builder layer
 * (04-BIM §3.8): no store mutation, no command dispatch, no THREE in the
 * semantic layer (03-BIM §1.1).
 *
 * ──────────────────────────────────────────────────────────────────────
 *  PLATFORM (Japanese)  — high-detail build, matches reference photo:
 *
 *                ┌───────────────────────────────────────────┐
 *                │                 HEADBOARD                 │  oak panel
 *                │     (full width over both nightstands)    │  ~ 0.95 m tall
 *      ┌─────────┴───────┬─────────────────────┬─────────────┴───────┐
 *      │   NIGHTSTAND L  │   plinth deck (oak) │   NIGHTSTAND R      │
 *      │   (oak box,     │ ╔═════════════════╗ │   (oak box,         │
 *      │    flush)       │ ║   pillows  ◇ ◇  ║ │    flush)           │
 *      │                 │ ║                 ║ │                     │
 *      │                 │ ║   white sheet   ║ │                     │
 *      │                 │ ║                 ║ │                     │
 *      │                 │ ║   terracotta    ║ │                     │
 *      │                 │ ║   throw blanket ║ │                     │
 *      └─────────────────┘ ╚═════════════════╝ └─────────────────────┘
 *                              foot overhang
 *
 *  Build pipeline (platform):
 *      plinth (oak, overhanging mattress)
 *    + mattress (queen, single slab, sheet-coloured)
 *    + sheet (top half of mattress)
 *    + throw (terracotta, foot half + drape over edge)
 *    + 2 pillows (head end)
 *    + 2 integrated nightstands (oak boxes flush with plinth deck)
 *    + headboard (oak panel spanning bed + both nightstands)
 *
 *  Float / walnut variants currently fall back to the simple three-mesh
 *  base (plinth + mattress + headboard) — to be detailed next once the
 *  platform variant is approved.
 *
 *  Bed long axis = +Z (head at -Z, foot at +Z).  Width along X.
 *  Group origin sits on the floor (Y = 0 = bottom of plinth / nightstands).
 *  All dimensions in metres.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { MaterialService } from '../MaterialService';

// ──────────────────────────────────────────────────────────────────────────────
//  Public types
// ──────────────────────────────────────────────────────────────────────────────

export type BedVariant = 'platform' | 'float' | 'walnut' | 'nordic' | 'solid_wood';

/** Hex palette driving the engine. All numbers are 0xRRGGBB. */
export interface BedPalette {
    readonly wood:     number;
    readonly mattress: number;
    readonly sheet:    number;
    readonly throw_:   number;
    readonly pillow:   number;
    readonly accent?:  number;
}

export interface BedEngineConfig {
    readonly variant: BedVariant;

    // Overall envelope (metres) — interpreted as the plinth deck footprint.
    readonly width:  number;     // X — plinth width (sleeping deck)
    readonly length: number;     // Z — plinth length (head→foot)
    readonly height: number;     // total height to top of mattress

    readonly hasHeadboard?:    boolean;
    readonly headboardHeight?: number;
    readonly mattressInset?:   number;     // overhang of plinth around mattress

    readonly palette: BedPalette;
    readonly lo3?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Engine
// ──────────────────────────────────────────────────────────────────────────────

export class BedEngine {
    constructor(private readonly materialService?: MaterialService) {}

    build(cfg: BedEngineConfig): THREE.Group {
        const root = new THREE.Group();
        root.name = `bed-${cfg.variant}`;
        root.userData = { variant: cfg.variant, role: 'bed' };

        if (cfg.variant === 'platform') {
            this.buildPlatform(root, cfg);
        } else if (cfg.variant === 'walnut') {
            this.buildWalnut(root, cfg);
        } else if (cfg.variant === 'float') {
            this.buildFloat(root, cfg);
        } else if (cfg.variant === 'nordic') {
            this.buildNordic(root, cfg);
        } else if (cfg.variant === 'solid_wood') {
            this.buildSolidWood(root, cfg);
        } else {
            this.buildSimpleBase(root, cfg);
        }

        // Stamp every mesh with role metadata for selection / hit-testing.
        // Contract 48 §5 (extended for beds):
        //   - skipInPlan: true   → 3D edges of bed parts are excluded from
        //     plan projection; BedPlanSymbolBuilder injects a clean symbol.
        //   - edgeAngleDeg: 30   → in elevation/section views, soft bevels
        //     and superquadric pillow facets collapse into clean silhouettes.
        root.traverse((c) => {
            if (c instanceof THREE.Mesh) {
                c.castShadow = true;
                c.receiveShadow = true;
                c.userData = {
                    ...c.userData,
                    isBedPart: true,
                    skipInPlan: true,
                    edgeAngleDeg: 30,
                };
            }
        });

        return root;
    }

    // ──────────────────────────────────────────────────────────────────────
    //  PLATFORM (Japanese) — high-detail build
    // ──────────────────────────────────────────────────────────────────────

    private buildPlatform(root: THREE.Group, cfg: BedEngineConfig): void {
        const p = cfg.palette;

        // ── Geometry constants (Queen, metres) ──────────────────────────
        const PLINTH_W   = Math.max(1.40, cfg.width);     // deck width  (X)
        const PLINTH_L   = Math.max(1.80, cfg.length);    // deck length (Z)

        // Two-part base for the floating cantilever look:
        //   - DECK: thin overhang slab the mattress sits on (visible top).
        //   - RECESS: smaller, slightly darker base set back on every side
        //             so the deck reads as floating with a shadow gap.
        const DECK_H     = 0.06;
        const RECESS_H   = 0.08;
        const RECESS_INSET = 0.10;            // how far recess sits in from deck

        const MATTRESS_INSET_X    = cfg.mattressInset ?? 0.15;
        const MATTRESS_INSET_HEAD = 0.05;
        const MATTRESS_INSET_FOOT = 0.20;
        const MATTRESS_W = PLINTH_W - 2 * MATTRESS_INSET_X;
        const MATTRESS_L = PLINTH_L - MATTRESS_INSET_HEAD - MATTRESS_INSET_FOOT;
        const MATTRESS_H = 0.22;
        const MATTRESS_Z = (MATTRESS_INSET_HEAD - MATTRESS_INSET_FOOT) / 2;

        const NS_W = 0.50;
        const NS_D = 0.50;

        const HB_THICKNESS = 0.05;
        const HB_HEIGHT    = cfg.headboardHeight ?? 0.95;
        const HB_WIDTH     = PLINTH_W + 2 * NS_W;

        const plinthTopY   = RECESS_H + DECK_H;            // top of deck
        const mattressTopY = plinthTopY + MATTRESS_H;
        const NS_H         = plinthTopY + MATTRESS_H;       // flush with mattress top
        const headZ = -PLINTH_L / 2;

        // ── Materials ───────────────────────────────────────────────────
        const oak       = this.woodMat(p.wood);
        const oakDark   = this.woodMat(this.shade(p.wood, -0.10));
        const sheetMat  = this.softMat(p.sheet, 0.95);
        const matMat    = this.softMat(p.mattress, 0.90);
        const throwMat  = this.softMat(p.throw_, 0.88);
        const pillowMat = this.softMat(p.pillow, 0.94);

        // ── 1. Recessed base (creates floating cantilever shadow) ───────
        // Smaller, darker box set back from every edge of the deck.  When
        // the deck rests on it, the deck appears to float with a shadow
        // gap on every side.
        {
            const w = Math.max(0.40, PLINTH_W - 2 * RECESS_INSET);
            const l = Math.max(0.40, PLINTH_L - 2 * RECESS_INSET);
            const geo = new THREE.BoxGeometry(w, RECESS_H, l);
            const m = new THREE.Mesh(geo, this.woodMat(this.shade(p.wood, -0.32)));
            m.position.set(0, RECESS_H / 2, 0);
            m.userData.role = 'plinth_recess';
            root.add(m);
        }

        // ── 2. Deck (thin overhanging oak slab — the visible "platform") ─
        {
            const geo = new THREE.BoxGeometry(PLINTH_W, DECK_H, PLINTH_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, RECESS_H + DECK_H / 2, 0);
            m.userData.role = 'plinth';
            root.add(m);
        }

        // ── 2. Mattress (single queen slab) ─────────────────────────────
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W, MATTRESS_H, MATTRESS_L);
            const m = new THREE.Mesh(geo, matMat);
            m.position.set(0, plinthTopY + MATTRESS_H / 2, MATTRESS_Z);
            m.userData.role = 'mattress';
            root.add(m);
        }

        // ── 3. White sheet — covers head ~62% of mattress ───────────────
        const sheetT = 0.012;
        const sheetW = MATTRESS_W - 0.02;
        const sheetL = MATTRESS_L * 0.62;
        const sheetZ = MATTRESS_Z - MATTRESS_L / 2 + sheetL / 2;
        {
            const geo = new THREE.BoxGeometry(sheetW, sheetT, sheetL);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(0, mattressTopY + sheetT / 2, sheetZ);
            m.userData.role = 'sheet';
            root.add(m);
        }

        // ── 4. Terracotta throw blanket — thin, foot 45% + drape ────────
        const throwT = 0.015;
        const throwW = MATTRESS_W - 0.005;
        const throwL = MATTRESS_L * 0.45;
        const throwZ = MATTRESS_Z + MATTRESS_L / 2 - throwL / 2;
        {
            const geo = new THREE.BoxGeometry(throwW, throwT, throwL);
            const m = new THREE.Mesh(geo, throwMat);
            m.position.set(0, mattressTopY + throwT / 2 + 0.002, throwZ);
            m.userData.role = 'throw';
            root.add(m);
        }
        // Drape hanging down at foot — thin sheet
        {
            const drapeH = 0.20;
            const drapeT = 0.018;
            const geo = new THREE.BoxGeometry(throwW, drapeH, drapeT);
            const m = new THREE.Mesh(geo, throwMat);
            const footMattressEdgeZ = MATTRESS_Z + MATTRESS_L / 2;
            m.position.set(
                0,
                mattressTopY - drapeH / 2 + 0.04,
                footMattressEdgeZ + drapeT / 2,
            );
            m.userData.role = 'throw_drape';
            root.add(m);
        }

        // ── 5. Two pillows (head end) — realistic stuffed cushions ──────
        // Built from a superquadric ellipsoid: rectangular footprint with
        // soft rounded edges (controlled by e2) and a plump vertical
        // bulge (e1).  A second pass adds a gentle dip in the top centre
        // to suggest the natural sag of a stuffed pillow.  Each pillow
        // leans slightly back so it rests against the headboard, the way
        // pillows naturally fall in the reference photo.
        {
            const pillowW = (MATTRESS_W - 0.08) / 2;
            const pillowH = 0.16;
            const pillowL = 0.50;
            const yc = mattressTopY + sheetT + pillowH / 2 - 0.015;
            const zc = MATTRESS_Z - MATTRESS_L / 2 + pillowL / 2 + 0.07;
            const tiltBack = -0.18;   // rad, ≈ -10°, top tips toward headboard

            for (const sign of [-1, 1] as const) {
                const xc = sign * (pillowW / 2 + 0.025);
                const geo = BedEngine.makePillowGeometry(
                    pillowW, pillowH, pillowL,
                );
                const m = new THREE.Mesh(geo, pillowMat);
                m.position.set(xc, yc, zc);
                m.rotation.x = tiltBack;
                m.userData.role = 'pillow';
                root.add(m);
            }
        }

        // ── 6. Two integrated nightstands (single oak block) ────────────
        // One on each side, flush against the plinth, back aligned with
        // headboard wall.  Top flush with mattress top.  Single clean
        // block — minimalist oak board, no drawer reveal, no top lip.
        const nightstandBackZ = headZ;          // back face touches headboard line
        const nightstandZc    = nightstandBackZ + NS_D / 2;
        for (const sign of [-1, 1] as const) {
            const xc = sign * (PLINTH_W / 2 + NS_W / 2);
            const geo = new THREE.BoxGeometry(NS_W, NS_H, NS_D);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(xc, NS_H / 2, nightstandZc);
            m.userData.role = 'nightstand';
            root.add(m);
        }

        // ── 7. Headboard — full-width oak panel spanning over nightstands
        {
            const geo = new THREE.BoxGeometry(HB_WIDTH, HB_HEIGHT, HB_THICKNESS);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(
                0,
                HB_HEIGHT / 2,
                headZ - HB_THICKNESS / 2,
            );
            m.userData.role = 'headboard';
            root.add(m);
        }
        // Subtle horizontal grain band — a thin darker strip near the top
        {
            const bandH = 0.012;
            const geo = new THREE.BoxGeometry(HB_WIDTH - 0.02, bandH, HB_THICKNESS + 0.002);
            const m = new THREE.Mesh(geo, oakDark);
            m.position.set(
                0,
                HB_HEIGHT - 0.10,
                headZ - HB_THICKNESS / 2,
            );
            m.userData.role = 'headboard_band';
            root.add(m);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  WALNUT (Japanese) — floating low platform with LED perimeter glow
    // ──────────────────────────────────────────────────────────────────────
    //
    //  Wide darker-oak deck overhangs the queen mattress by ~25 cm on every
    //  side.  A much-smaller recessed base hides under the centre of the
    //  deck, leaving a ring of empty space underneath where four warm-white
    //  emissive strips on the floor read as integrated LED perimeter
    //  lighting.  Two minimalist "bedside" extensions stick out at the
    //  head end at deck level — no separate cabinets, just lateral wings
    //  of the same deck that act as the surfaces for a lamp / book.
    //  Pillows + sheet are reused from the platform-style pipeline.
    //
    private buildWalnut(root: THREE.Group, cfg: BedEngineConfig): void {
        const p = cfg.palette;

        // ── Geometry constants (Queen, metres) ──────────────────────────
        const MATTRESS_W = 1.60;
        const MATTRESS_L = 2.10;
        const MATTRESS_H = 0.22;
        const MATTRESS_OVERHANG = 0.25;          // user-requested deck overhang

        const DECK_W = MATTRESS_W + 2 * MATTRESS_OVERHANG;   // 2.10
        const DECK_L = MATTRESS_L + 2 * MATTRESS_OVERHANG;   // 2.60
        const DECK_H = 0.06;

        // Recessed base — much smaller than deck so deck reads as floating
        // and there's room around the perimeter for the LED glow.
        const RECESS_INSET = 0.45;               // big inset → wide glow ring
        const RECESS_W = Math.max(0.40, DECK_W - 2 * RECESS_INSET);
        const RECESS_L = Math.max(0.40, DECK_L - 2 * RECESS_INSET);
        const RECESS_H = 0.10;

        // Bedside extension wings (deck-level surfaces at the head end)
        const WING_W = 0.40;
        const WING_L = 0.55;

        // Headboard — short low panel
        const HB_THICKNESS = 0.05;
        const HB_HEIGHT    = cfg.headboardHeight ?? 0.45;
        const HB_WIDTH     = DECK_W + 2 * WING_W;

        const deckTopY    = RECESS_H + DECK_H;
        const mattressTopY = deckTopY + MATTRESS_H;
        const headZ = -DECK_L / 2;

        // ── Materials ───────────────────────────────────────────────────
        // Walnut palette wood is dark; nudge it a hair lighter for a warm
        // medium-walnut (matches the reference photo better than the very
        // dark 0x4a2e1d preset for this floating-deck style).
        const woodHex   = this.shade(p.wood, 0.22);
        const oak       = this.woodMat(woodHex);
        const oakDark   = this.woodMat(this.shade(woodHex, -0.30));
        const sheetMat  = this.softMat(p.sheet, 0.95);
        const matMat    = this.softMat(p.mattress, 0.90);
        const pillowMat = this.softMat(p.pillow, 0.94);
        // Warm white LED — emissive, low roughness, double-sided not needed
        const ledMat = new THREE.MeshStandardMaterial({
            color:           0xfff1d6,
            emissive:        0xffe1a8,
            emissiveIntensity: 1.6,
            roughness:       1.0,
            metalness:       0.0,
        });

        // ── 1. Recessed base ────────────────────────────────────────────
        {
            const geo = new THREE.BoxGeometry(RECESS_W, RECESS_H, RECESS_L);
            const m = new THREE.Mesh(geo, oakDark);
            m.position.set(0, RECESS_H / 2, 0);
            m.userData.role = 'plinth_recess';
            root.add(m);
        }

        // ── 2. LED perimeter glow — four thin emissive strips on the
        //  floor in the gap between the recessed base and the deck edge.
        //  Together they trace a continuous warm-white ring under the deck.
        {
            const stripT = 0.012;
            const ledY   = stripT / 2 + 0.001;       // just above floor
            const stripWLong = DECK_W - 0.06;
            const stripWSide = RECESS_L;

            // Front + back (running along X)
            const longGeo = new THREE.BoxGeometry(stripWLong, stripT, RECESS_INSET - 0.10);
            const zOff = (RECESS_L / 2 + DECK_L / 2) / 2;
            for (const sign of [-1, 1] as const) {
                const m = new THREE.Mesh(longGeo, ledMat);
                m.position.set(0, ledY, sign * zOff);
                m.userData.role = 'led_strip';
                m.castShadow = false;
                root.add(m);
            }
            // Left + right (running along Z)
            const sideGeo = new THREE.BoxGeometry(RECESS_INSET - 0.10, stripT, stripWSide);
            const xOff = (RECESS_W / 2 + DECK_W / 2) / 2;
            for (const sign of [-1, 1] as const) {
                const m = new THREE.Mesh(sideGeo, ledMat);
                m.position.set(sign * xOff, ledY, 0);
                m.userData.role = 'led_strip';
                m.castShadow = false;
                root.add(m);
            }
        }

        // ── 3. Deck (thin overhanging darker-oak slab) ──────────────────
        {
            const geo = new THREE.BoxGeometry(DECK_W, DECK_H, DECK_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, RECESS_H + DECK_H / 2, 0);
            m.userData.role = 'plinth';
            root.add(m);
        }

        // ── 4. Bedside extension wings (deck-level surfaces, head end) ──
        // Same deck thickness, sticking out laterally on each side at the
        // head end.  Read as built-in surfaces, not separate furniture.
        for (const sign of [-1, 1] as const) {
            const xc = sign * (DECK_W / 2 + WING_W / 2);
            const zc = headZ + WING_L / 2;
            const geo = new THREE.BoxGeometry(WING_W, DECK_H, WING_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(xc, RECESS_H + DECK_H / 2, zc);
            m.userData.role = 'bedside_wing';
            root.add(m);
        }

        // ── 5. Mattress (queen) ─────────────────────────────────────────
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W, MATTRESS_H, MATTRESS_L);
            const m = new THREE.Mesh(geo, matMat);
            m.position.set(0, deckTopY + MATTRESS_H / 2, 0);
            m.userData.role = 'mattress';
            root.add(m);
        }

        // ── 6. White sheet — covers head ~62% of mattress ───────────────
        const sheetT = 0.012;
        const sheetW = MATTRESS_W - 0.02;
        const sheetL = MATTRESS_L * 0.62;
        const sheetZ = -MATTRESS_L / 2 + sheetL / 2;
        {
            const geo = new THREE.BoxGeometry(sheetW, sheetT, sheetL);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(0, mattressTopY + sheetT / 2, sheetZ);
            m.userData.role = 'sheet';
            root.add(m);
        }

        // ── 7. Two pillows (head end) — reuse stuffed-cushion geometry ──
        {
            const pillowW = (MATTRESS_W - 0.08) / 2;
            const pillowH = 0.16;
            const pillowL = 0.50;
            const yc = mattressTopY + sheetT + pillowH / 2 - 0.015;
            const zc = -MATTRESS_L / 2 + pillowL / 2 + 0.07;
            const tiltBack = -0.18;
            for (const sign of [-1, 1] as const) {
                const xc = sign * (pillowW / 2 + 0.025);
                const geo = BedEngine.makePillowGeometry(pillowW, pillowH, pillowL);
                const m = new THREE.Mesh(geo, pillowMat);
                m.position.set(xc, yc, zc);
                m.rotation.x = tiltBack;
                m.userData.role = 'pillow';
                root.add(m);
            }
        }

        // ── 8. Low headboard — short panel spanning over the wings ──────
        if (cfg.hasHeadboard ?? true) {
            const geo = new THREE.BoxGeometry(HB_WIDTH, HB_HEIGHT, HB_THICKNESS);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, HB_HEIGHT / 2, headZ - HB_THICKNESS / 2);
            m.userData.role = 'headboard';
            root.add(m);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  FLOAT (Japanese) — floating walnut platform with bedside extensions
    // ──────────────────────────────────────────────────────────────────────
    //
    //  Reference photo build:
    //    • Warm medium-walnut deck, ~20 cm overhang on the sides and foot
    //      around a queen mattress (1.60 × 2.10).
    //    • Tall headboard panel (~95 cm) spanning the full width including
    //      the two bedside-table extensions.
    //    • Two thin deck-level "wings" at the head end on each side, used
    //      as bedside surfaces — flush with the deck, sticking out along Z
    //      next to the headboard.
    //    • A small recessed dark base hidden well inside the deck footprint
    //      so the entire platform reads as floating.
    //    • White duvet draped over most of the mattress + foot drape.
    //    • Two navy-blue pillows leaning against the headboard.
    //    • One real bedside lamp on each wing — warm-white THREE.PointLight
    //      with a small ceramic-shade emissive mesh.
    //
    private buildFloat(root: THREE.Group, cfg: BedEngineConfig): void {
        const p = cfg.palette;

        // ── Geometry constants (Queen, metres) ──────────────────────────
        const MATTRESS_W = 1.60;
        const MATTRESS_L = 2.10;
        const MATTRESS_H = 0.22;
        const OVERHANG   = 0.20;          // 20 cm deck reveal on sides + foot

        const DECK_W = MATTRESS_W + 2 * OVERHANG;     // 2.00
        const DECK_L = MATTRESS_L + OVERHANG;         // 2.30 (head flush, foot reveal)
        const DECK_H = 0.06;

        // Recessed base — significantly inset so the deck reads as floating.
        const RECESS_INSET = 0.30;
        const RECESS_W = Math.max(0.50, DECK_W - 2 * RECESS_INSET);
        const RECESS_L = Math.max(0.50, DECK_L - 2 * RECESS_INSET);
        const RECESS_H = 0.10;

        // Bedside extension wings (flush with the deck, head end).
        const WING_W = 0.45;
        const WING_L = 0.55;

        // Headboard
        const HB_THICKNESS = 0.05;
        const HB_HEIGHT    = cfg.headboardHeight ?? 0.95;
        const HB_WIDTH     = DECK_W + 2 * WING_W;

        // Mattress placed flush against the headboard (head end), so the
        // 20 cm overhang appears at the foot, matching the reference.
        const headZ        = -DECK_L / 2;
        const mattressZ    = headZ + MATTRESS_L / 2;       // flush head
        const deckTopY     = RECESS_H + DECK_H;
        const mattressTopY = deckTopY + MATTRESS_H;

        // ── Materials ───────────────────────────────────────────────────
        const oak       = this.woodMat(p.wood);
        const oakDark   = this.woodMat(this.shade(p.wood, -0.35));
        const oakBand   = this.woodMat(this.shade(p.wood, -0.15));
        const sheetMat  = this.softMat(p.sheet, 0.92);
        const matMat    = this.softMat(p.mattress, 0.90);
        const pillowMat = this.softMat(p.pillow, 0.85);
        const lampShadeMat = new THREE.MeshStandardMaterial({
            color:             0xfff7e0,
            emissive:          0xffd9a0,
            emissiveIntensity: 1.4,
            roughness:         0.85,
            metalness:         0.0,
        });
        const lampBaseMat = this.material(0x222222, 0.35, 0.55);

        // ── 1. Recessed base (hidden — gives the floating shadow) ───────
        {
            const geo = new THREE.BoxGeometry(RECESS_W, RECESS_H, RECESS_L);
            const m = new THREE.Mesh(geo, oakDark);
            m.position.set(0, RECESS_H / 2, 0);
            m.userData.role = 'plinth_recess';
            root.add(m);
        }

        // ── 2. Deck (warm walnut slab — the visible floating platform) ──
        {
            const geo = new THREE.BoxGeometry(DECK_W, DECK_H, DECK_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, RECESS_H + DECK_H / 2, 0);
            m.userData.role = 'plinth';
            root.add(m);
        }

        // ── 3. Bedside extension wings (head end, both sides) ───────────
        for (const sign of [-1, 1] as const) {
            const xc = sign * (DECK_W / 2 + WING_W / 2);
            const zc = headZ + WING_L / 2;
            const geo = new THREE.BoxGeometry(WING_W, DECK_H, WING_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(xc, RECESS_H + DECK_H / 2, zc);
            m.userData.role = 'bedside_wing';
            root.add(m);
        }

        // ── 4. Mattress (queen, single slab) ────────────────────────────
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W, MATTRESS_H, MATTRESS_L);
            const m = new THREE.Mesh(geo, matMat);
            m.position.set(0, deckTopY + MATTRESS_H / 2, mattressZ);
            m.userData.role = 'mattress';
            root.add(m);
        }

        // ── 5. White duvet — covers ~80% of the mattress, top half ──────
        const sheetT = 0.025;
        const sheetW = MATTRESS_W - 0.01;
        const sheetL = MATTRESS_L * 0.80;
        const sheetZ = mattressZ - MATTRESS_L / 2 + sheetL / 2 + MATTRESS_L * 0.10;
        {
            const geo = new THREE.BoxGeometry(sheetW, sheetT, sheetL);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(0, mattressTopY + sheetT / 2, sheetZ);
            m.userData.role = 'sheet';
            root.add(m);
        }
        // White duvet drape down the foot side
        {
            const drapeH = 0.18;
            const drapeT = 0.022;
            const footMattressEdgeZ = mattressZ + MATTRESS_L / 2;
            const geo = new THREE.BoxGeometry(sheetW, drapeH, drapeT);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(
                0,
                mattressTopY - drapeH / 2 + 0.02,
                footMattressEdgeZ + drapeT / 2,
            );
            m.userData.role = 'sheet_drape';
            root.add(m);
        }

        // ── 6. Two navy-blue pillows leaning back against the headboard ─
        {
            const pillowW = (MATTRESS_W - 0.08) / 2;
            const pillowH = 0.16;
            const pillowL = 0.50;
            const yc = mattressTopY + sheetT + pillowH / 2 - 0.015;
            const zc = mattressZ - MATTRESS_L / 2 + pillowL / 2 + 0.06;
            const tiltBack = -0.20;
            for (const sign of [-1, 1] as const) {
                const xc = sign * (pillowW / 2 + 0.025);
                const geo = BedEngine.makePillowGeometry(pillowW, pillowH, pillowL);
                const m = new THREE.Mesh(geo, pillowMat);
                m.position.set(xc, yc, zc);
                m.rotation.x = tiltBack;
                m.userData.role = 'pillow';
                root.add(m);
            }
        }

        // ── 7. Tall headboard — full width, spans deck + both wings ─────
        if (cfg.hasHeadboard ?? true) {
            const geo = new THREE.BoxGeometry(HB_WIDTH, HB_HEIGHT, HB_THICKNESS);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, HB_HEIGHT / 2, headZ - HB_THICKNESS / 2);
            m.userData.role = 'headboard';
            root.add(m);
            // Subtle horizontal grain band near the top edge
            {
                const bandH = 0.012;
                const bandGeo = new THREE.BoxGeometry(
                    HB_WIDTH - 0.02, bandH, HB_THICKNESS + 0.002,
                );
                const band = new THREE.Mesh(bandGeo, oakBand);
                band.position.set(
                    0,
                    HB_HEIGHT - 0.10,
                    headZ - HB_THICKNESS / 2,
                );
                band.userData.role = 'headboard_band';
                root.add(band);
            }
        }

        // ── 8. Two bedside table lamps with REAL point lights ───────────
        // One on each wing surface, against the headboard.
        const wingTopY = RECESS_H + DECK_H;
        const baseR = 0.06;
        const baseH = 0.04;
        const stemR = 0.012;
        const stemH = 0.30;
        const shadeRTop = 0.07;
        const shadeRBot = 0.11;
        const shadeH    = 0.16;
        for (const sign of [-1, 1] as const) {
            const xc = sign * (DECK_W / 2 + WING_W / 2);
            const zc = headZ + WING_L * 0.55;

            // Base disc
            {
                const geo = new THREE.CylinderGeometry(baseR, baseR, baseH, 24);
                const m = new THREE.Mesh(geo, lampBaseMat);
                m.position.set(xc, wingTopY + baseH / 2, zc);
                m.userData.role = 'lamp_base';
                root.add(m);
            }
            // Stem
            {
                const geo = new THREE.CylinderGeometry(stemR, stemR, stemH, 16);
                const m = new THREE.Mesh(geo, lampBaseMat);
                m.position.set(xc, wingTopY + baseH + stemH / 2, zc);
                m.userData.role = 'lamp_stem';
                root.add(m);
            }
            // Conical shade (emissive)
            {
                const geo = new THREE.CylinderGeometry(shadeRTop, shadeRBot, shadeH, 24, 1, true);
                const m = new THREE.Mesh(geo, lampShadeMat);
                m.position.set(xc, wingTopY + baseH + stemH + shadeH / 2, zc);
                m.userData.role = 'lamp_shade';
                root.add(m);
            }
            // Real warm-white point light at the bulb position
            {
                const light = new THREE.PointLight(0xffd9a0, 1.2, 4.0, 1.6);
                light.position.set(
                    xc,
                    wingTopY + baseH + stemH + shadeH * 0.45,
                    zc,
                );
                light.castShadow = false;
                light.userData.role = 'lamp_light';
                root.add(light);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  NORDIC — mid-century walnut bed on turned legs
    // ──────────────────────────────────────────────────────────────────────
    //
    //  Reference photo build:
    //    • Warm walnut frame raised ~18 cm off the floor on four turned
    //      cylindrical legs.
    //    • Thin walnut perimeter rail around the queen mattress (1.60 × 2.10).
    //    • Tall (but not full-height) walnut headboard with rounded top
    //      corners, slightly wider than the frame.
    //    • Cantilevered floating bedside shelf attached to the LEFT side of
    //      the frame, flush at frame height.
    //    • Crisp white sheet covering the mattress, with a side drape.
    //    • Camel / tan throw blanket draped across the foot half of the bed
    //      with two stripe accents and a tassel-style hanging panel.
    //    • Two pillows: one off-white linen, one camel — leaned against
    //      the headboard.
    //
    private buildNordic(root: THREE.Group, cfg: BedEngineConfig): void {
        const p = cfg.palette;

        // ── Geometry constants (Queen, metres) ──────────────────────────
        const MATTRESS_W = 1.60;
        const MATTRESS_L = 2.10;
        const MATTRESS_H = 0.22;

        const RAIL_THICK = 0.05;                   // perimeter rail thickness
        const FRAME_W = MATTRESS_W + 2 * RAIL_THICK;   // 1.70
        const FRAME_L = MATTRESS_L + 2 * RAIL_THICK;   // 2.20
        const FRAME_H = 0.10;                      // rail / slat-deck height

        // Legs (turned walnut cylinders)
        const LEG_R = 0.045;
        const LEG_H = 0.18;
        const LEG_INSET_X = 0.10;
        const LEG_INSET_Z = 0.10;

        // Headboard — wide rounded panel, taller than the frame
        const HB_THICKNESS = 0.04;
        const HB_HEIGHT    = cfg.headboardHeight ?? 0.55;
        const HB_WIDTH     = FRAME_W + 0.30;       // overhangs frame slightly
        const HB_RADIUS    = 0.10;                 // rounded corners

        // Cantilevered bedside shelf (left side, head end)
        const SHELF_W = 0.35;
        const SHELF_D = 0.40;
        const SHELF_H = 0.04;

        const frameTopY    = LEG_H + FRAME_H;
        const mattressTopY = frameTopY + MATTRESS_H;
        const headZ        = -FRAME_L / 2;

        // ── Materials ───────────────────────────────────────────────────
        const oak       = this.woodMat(p.wood);
        const oakDark   = this.woodMat(this.shade(p.wood, -0.20));
        const sheetMat  = this.softMat(p.sheet, 0.92);
        const matMat    = this.softMat(p.mattress, 0.90);
        const pillowOff = this.softMat(p.pillow, 0.88);
        const pillowTan = this.softMat(p.accent ?? 0xb78a64, 0.82);
        const throwMat  = this.softMat(p.throw_, 0.85);
        const stripeMat = this.softMat(this.shade(p.throw_, -0.20), 0.85);

        // ── 1. Four turned legs ─────────────────────────────────────────
        for (const sx of [-1, 1] as const) {
            for (const sz of [-1, 1] as const) {
                const xc = sx * (FRAME_W / 2 - LEG_INSET_X);
                const zc = sz * (FRAME_L / 2 - LEG_INSET_Z);
                const geo = new THREE.CylinderGeometry(LEG_R, LEG_R * 0.9, LEG_H, 18);
                const m = new THREE.Mesh(geo, oak);
                m.position.set(xc, LEG_H / 2, zc);
                m.userData.role = 'leg';
                root.add(m);
            }
        }

        // ── 2. Frame perimeter rails (4 sides) + slat deck ──────────────
        // Long rails (along Z, on each side)
        for (const sign of [-1, 1] as const) {
            const xc = sign * (FRAME_W / 2 - RAIL_THICK / 2);
            const geo = new THREE.BoxGeometry(RAIL_THICK, FRAME_H, FRAME_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(xc, LEG_H + FRAME_H / 2, 0);
            m.userData.role = 'frame_rail';
            root.add(m);
        }
        // Short rails (along X, head + foot)
        for (const sign of [-1, 1] as const) {
            const zc = sign * (FRAME_L / 2 - RAIL_THICK / 2);
            const geo = new THREE.BoxGeometry(
                FRAME_W - 2 * RAIL_THICK, FRAME_H, RAIL_THICK,
            );
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, LEG_H + FRAME_H / 2, zc);
            m.userData.role = 'frame_rail';
            root.add(m);
        }
        // Thin slat deck inside the frame (recessed slightly under mattress)
        {
            const deckT = 0.015;
            const geo = new THREE.BoxGeometry(
                MATTRESS_W, deckT, MATTRESS_L,
            );
            const m = new THREE.Mesh(geo, oakDark);
            m.position.set(0, frameTopY - deckT / 2, 0);
            m.userData.role = 'slat_deck';
            root.add(m);
        }

        // ── 3. Mattress (queen) ─────────────────────────────────────────
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W, MATTRESS_H, MATTRESS_L);
            const m = new THREE.Mesh(geo, matMat);
            m.position.set(0, frameTopY + MATTRESS_H / 2, 0);
            m.userData.role = 'mattress';
            root.add(m);
        }

        // ── 4. White fitted sheet — wraps full mattress top + side drape
        const sheetT = 0.018;
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W - 0.005, sheetT, MATTRESS_L - 0.005);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(0, mattressTopY + sheetT / 2, 0);
            m.userData.role = 'sheet';
            root.add(m);
        }
        // Front (foot) sheet drape down the side of the mattress
        {
            const drapeH = MATTRESS_H * 0.85;
            const drapeT = 0.015;
            const geo = new THREE.BoxGeometry(MATTRESS_W - 0.01, drapeH, drapeT);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(
                0,
                frameTopY + MATTRESS_H - drapeH / 2,
                MATTRESS_L / 2 + drapeT / 2,
            );
            m.userData.role = 'sheet_drape';
            root.add(m);
        }

        // ── 5. Camel throw blanket — covers the foot ~45% with stripes ──
        const throwT = 0.018;
        const throwL = MATTRESS_L * 0.45;
        const throwZ = MATTRESS_L / 2 - throwL / 2;
        const throwTopY = mattressTopY + sheetT + throwT / 2;
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W - 0.005, throwT, throwL);
            const m = new THREE.Mesh(geo, throwMat);
            m.position.set(0, throwTopY, throwZ);
            m.userData.role = 'throw';
            root.add(m);
        }
        // Two darker stripes across the throw
        {
            const stripeT = 0.004;
            const stripeW = 0.04;
            for (const offset of [-0.10, 0.12] as const) {
                const geo = new THREE.BoxGeometry(MATTRESS_W - 0.01, stripeT, stripeW);
                const m = new THREE.Mesh(geo, stripeMat);
                m.position.set(0, throwTopY + throwT / 2 + stripeT / 2, throwZ + offset);
                m.userData.role = 'throw_stripe';
                root.add(m);
            }
        }
        // Throw drape — hangs over the left edge with a tassel-like fringe
        {
            const drapeH = 0.55;
            const drapeT = 0.018;
            const drapeW = 0.55;
            const xEdge = -MATTRESS_W / 2;
            const geo = new THREE.BoxGeometry(drapeT, drapeH, drapeW);
            const m = new THREE.Mesh(geo, throwMat);
            m.position.set(
                xEdge - drapeT / 2,
                throwTopY - drapeH / 2 + throwT / 2,
                throwZ - 0.05,
            );
            m.userData.role = 'throw_drape';
            root.add(m);
        }

        // ── 6. Two pillows (off-white linen + camel) leaning back ───────
        {
            const pillowW = (MATTRESS_W - 0.10) / 2;
            const pillowH = 0.16;
            const pillowL = 0.50;
            const yc = mattressTopY + sheetT + pillowH / 2 - 0.015;
            const zc = -MATTRESS_L / 2 + pillowL / 2 + 0.06;
            const tiltBack = -0.22;
            // Two off-white linen pillows at the back, leaning against the
            // headboard (both white per reference photo).
            for (const sign of [-1, 1] as const) {
                const xc = sign * (pillowW / 2 + 0.03);
                const geo = BedEngine.makePillowGeometry(pillowW, pillowH, pillowL);
                const m = new THREE.Mesh(geo, pillowOff);
                m.position.set(xc, yc, zc);
                m.rotation.x = tiltBack;
                m.userData.role = 'pillow';
                root.add(m);
            }
            // Two camel pillows stacked in front of the white ones.
            const frontZ = zc + 0.08;
            for (const sign of [-1, 1] as const) {
                const xc = sign * (pillowW / 2 + 0.03);
                const geo = BedEngine.makePillowGeometry(pillowW * 0.85, pillowH * 0.95, pillowL * 0.85);
                const m = new THREE.Mesh(geo, pillowTan);
                m.position.set(xc, yc - 0.005, frontZ);
                m.rotation.x = tiltBack * 0.6;
                m.userData.role = 'pillow';
                root.add(m);
            }
        }

        // ── 7. Tall headboard with rounded top corners ──────────────────
        if (cfg.hasHeadboard ?? true) {
            const shape = new THREE.Shape();
            const w  = HB_WIDTH;
            const h  = HB_HEIGHT;
            const r  = Math.min(HB_RADIUS, h * 0.4, w * 0.4);
            const x0 = -w / 2;
            const y0 = 0;
            shape.moveTo(x0, y0);
            shape.lineTo(x0 + w, y0);
            shape.lineTo(x0 + w, y0 + h - r);
            shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
            shape.lineTo(x0 + r, y0 + h);
            shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
            shape.lineTo(x0, y0);

            const geo = new THREE.ExtrudeGeometry(shape, {
                depth:        HB_THICKNESS,
                bevelEnabled: false,
                steps:        1,
            });
            // Default extrusion is along +Z; we want it along Z so rotate so
            // the panel stands upright with its face pointing down +Z (foot).
            geo.rotateX(0);
            const m = new THREE.Mesh(geo, oak);
            // Position so bottom of headboard sits at frame top and back
            // face touches headboard line.
            m.position.set(0, frameTopY, headZ - HB_THICKNESS);
            m.userData.role = 'headboard';
            root.add(m);
        }

        // ── 8. Floating cantilevered bedside shelves (BOTH sides, head end)
        for (const sign of [-1, 1] as const) {
            const xc = sign * (FRAME_W / 2 + SHELF_W / 2);
            const zc = headZ + SHELF_D / 2 + 0.05;
            const geo = new THREE.BoxGeometry(SHELF_W, SHELF_H, SHELF_D);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(xc, frameTopY - SHELF_H / 2, zc);
            m.userData.role = 'bedside_shelf';
            root.add(m);
            // Thin support bracket back to the frame rail
            const bracketGeo = new THREE.BoxGeometry(0.04, SHELF_H * 0.6, SHELF_D * 0.6);
            const bracket = new THREE.Mesh(bracketGeo, oakDark);
            bracket.position.set(
                sign * (FRAME_W / 2 + 0.02),
                frameTopY - SHELF_H * 0.8,
                zc,
            );
            bracket.userData.role = 'bedside_bracket';
            root.add(bracket);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SOLID WOOD — mid-century walnut bed with paneled headboard
    // ──────────────────────────────────────────────────────────────────────
    //
    //  Reference photo build:
    //    • Solid walnut perimeter rail frame around a queen mattress.
    //    • Four splayed mid-century tapered legs (rounded square section,
    //      angled outwards at ~10°).
    //    • Tall paneled headboard: three flat walnut panels separated by
    //      thin darker grooves, with two side posts framing the headboard.
    //    • Quilted white duvet covering the full mattress with a side drape.
    //    • Two stacked white pillows leaning against the headboard.
    //
    private buildSolidWood(root: THREE.Group, cfg: BedEngineConfig): void {
        const p = cfg.palette;

        // ── Geometry constants (Queen, metres) ──────────────────────────
        const MATTRESS_W = 1.55;
        const MATTRESS_L = 2.05;
        const MATTRESS_H = 0.24;

        const RAIL_THICK = 0.05;
        const FRAME_W = MATTRESS_W + 2 * RAIL_THICK;        // 1.65
        const FRAME_L = MATTRESS_L + 2 * RAIL_THICK;        // 2.15
        const FRAME_H = 0.18;                               // tall side rails

        // Splayed legs — tapered round-square section
        const LEG_TOP    = 0.06;
        const LEG_BOTTOM = 0.04;
        const LEG_H      = 0.20;
        const LEG_INSET  = 0.10;
        const LEG_TILT   = 0.18;                            // rad (~10°)

        // Paneled headboard
        const HB_THICKNESS = 0.05;
        const HB_HEIGHT    = cfg.headboardHeight ?? 0.95;
        const HB_WIDTH     = FRAME_W + 0.20;                // overhang sides
        const POST_W       = 0.10;                          // side framing posts

        const frameTopY    = LEG_H + FRAME_H;
        const mattressTopY = frameTopY + MATTRESS_H;
        const headZ        = -FRAME_L / 2;

        // ── Materials ───────────────────────────────────────────────────
        const oak       = this.woodMat(p.wood);
        const oakDark   = this.woodMat(this.shade(p.wood, -0.25));
        const oakBand   = this.woodMat(p.accent ?? this.shade(p.wood, -0.30));
        const sheetMat  = this.softMat(p.sheet, 0.92);
        const matMat    = this.softMat(p.mattress, 0.90);
        const pillowMat = this.softMat(p.pillow, 0.88);

        // ── 1. Four splayed mid-century legs ────────────────────────────
        for (const sx of [-1, 1] as const) {
            for (const sz of [-1, 1] as const) {
                const xc = sx * (FRAME_W / 2 - LEG_INSET);
                const zc = sz * (FRAME_L / 2 - LEG_INSET);
                const geo = new THREE.CylinderGeometry(LEG_BOTTOM, LEG_TOP, LEG_H, 8);
                const m = new THREE.Mesh(geo, oak);
                m.position.set(xc, LEG_H / 2, zc);
                // Splay outwards: tilt around the diagonal so the bottom
                // moves away from the bed centre.
                m.rotation.z =  sx * LEG_TILT;
                m.rotation.x = -sz * LEG_TILT;
                m.userData.role = 'leg';
                root.add(m);
            }
        }

        // ── 2. Frame perimeter rails ────────────────────────────────────
        // Long side rails
        for (const sign of [-1, 1] as const) {
            const xc = sign * (FRAME_W / 2 - RAIL_THICK / 2);
            const geo = new THREE.BoxGeometry(RAIL_THICK, FRAME_H, FRAME_L);
            const m = new THREE.Mesh(geo, oak);
            m.position.set(xc, LEG_H + FRAME_H / 2, 0);
            m.userData.role = 'frame_rail';
            root.add(m);
        }
        // Foot rail (short)
        {
            const geo = new THREE.BoxGeometry(
                FRAME_W - 2 * RAIL_THICK, FRAME_H, RAIL_THICK,
            );
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, LEG_H + FRAME_H / 2, FRAME_L / 2 - RAIL_THICK / 2);
            m.userData.role = 'frame_rail';
            root.add(m);
        }
        // Head rail (short, hidden behind headboard)
        {
            const geo = new THREE.BoxGeometry(
                FRAME_W - 2 * RAIL_THICK, FRAME_H, RAIL_THICK,
            );
            const m = new THREE.Mesh(geo, oak);
            m.position.set(0, LEG_H + FRAME_H / 2, headZ + RAIL_THICK / 2);
            m.userData.role = 'frame_rail';
            root.add(m);
        }
        // Slat deck inside frame
        {
            const deckT = 0.015;
            const geo = new THREE.BoxGeometry(MATTRESS_W, deckT, MATTRESS_L);
            const m = new THREE.Mesh(geo, oakDark);
            m.position.set(0, frameTopY - deckT / 2, 0);
            m.userData.role = 'slat_deck';
            root.add(m);
        }

        // ── 3. Mattress (queen) ─────────────────────────────────────────
        {
            const geo = new THREE.BoxGeometry(MATTRESS_W, MATTRESS_H, MATTRESS_L);
            const m = new THREE.Mesh(geo, matMat);
            m.position.set(0, frameTopY + MATTRESS_H / 2, 0);
            m.userData.role = 'mattress';
            root.add(m);
        }

        // ── 4. Quilted white duvet covering full mattress + side drape ──
        const sheetT = 0.025;
        {
            const geo = new THREE.BoxGeometry(
                MATTRESS_W + 0.02, sheetT, MATTRESS_L - 0.005,
            );
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(0, mattressTopY + sheetT / 2, 0);
            m.userData.role = 'sheet';
            root.add(m);
        }
        // Side drape down both long sides
        for (const sign of [-1, 1] as const) {
            const drapeH = MATTRESS_H * 0.85;
            const drapeT = 0.015;
            const geo = new THREE.BoxGeometry(drapeT, drapeH, MATTRESS_L - 0.01);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(
                sign * (MATTRESS_W / 2 + drapeT / 2),
                frameTopY + MATTRESS_H - drapeH / 2,
                0,
            );
            m.userData.role = 'sheet_drape';
            root.add(m);
        }
        // Foot drape
        {
            const drapeH = MATTRESS_H * 0.85;
            const drapeT = 0.015;
            const geo = new THREE.BoxGeometry(MATTRESS_W + 0.02, drapeH, drapeT);
            const m = new THREE.Mesh(geo, sheetMat);
            m.position.set(
                0,
                frameTopY + MATTRESS_H - drapeH / 2,
                MATTRESS_L / 2 + drapeT / 2,
            );
            m.userData.role = 'sheet_drape';
            root.add(m);
        }

        // ── 5. Two white pillows leaning back against the headboard ─────
        {
            const pillowW = (MATTRESS_W - 0.10) / 2;
            const pillowH = 0.18;
            const pillowL = 0.55;
            const yc = mattressTopY + sheetT + pillowH / 2 - 0.015;
            const zc = -MATTRESS_L / 2 + pillowL / 2 + 0.05;
            const tiltBack = -0.22;
            for (const sign of [-1, 1] as const) {
                const xc = sign * (pillowW / 2 + 0.03);
                const geo = BedEngine.makePillowGeometry(pillowW, pillowH, pillowL);
                const m = new THREE.Mesh(geo, pillowMat);
                m.position.set(xc, yc, zc);
                m.rotation.x = tiltBack;
                m.userData.role = 'pillow';
                root.add(m);
            }
        }

        // ── 6. Tall paneled headboard ───────────────────────────────────
        if (cfg.hasHeadboard ?? true) {
            const baseY = LEG_H;            // headboard sits on top of legs
            const totalH = HB_HEIGHT;
            const panelH = totalH - 0.06;   // small top + bottom rail
            const innerW = HB_WIDTH - 2 * POST_W;

            // Two side posts (slightly thicker than centre panels)
            for (const sign of [-1, 1] as const) {
                const xc = sign * (HB_WIDTH / 2 - POST_W / 2);
                const geo = new THREE.BoxGeometry(POST_W, totalH, HB_THICKNESS + 0.02);
                const m = new THREE.Mesh(geo, oak);
                m.position.set(xc, baseY + totalH / 2, headZ - HB_THICKNESS / 2);
                m.userData.role = 'headboard_post';
                root.add(m);
            }

            // Three centre panels separated by thin grooves
            const panelCount = 3;
            const grooveW = 0.02;
            const panelW = (innerW - (panelCount - 1) * grooveW) / panelCount;
            const x0 = -innerW / 2 + panelW / 2;
            for (let i = 0; i < panelCount; i++) {
                const xc = x0 + i * (panelW + grooveW);
                const geo = new THREE.BoxGeometry(panelW, panelH, HB_THICKNESS);
                const m = new THREE.Mesh(geo, oak);
                m.position.set(xc, baseY + 0.03 + panelH / 2, headZ - HB_THICKNESS / 2);
                m.userData.role = 'headboard_panel';
                root.add(m);
            }
            // Vertical groove fillers (darker walnut showing through)
            for (let i = 0; i < panelCount - 1; i++) {
                const xc = x0 + i * (panelW + grooveW) + panelW / 2 + grooveW / 2;
                const geo = new THREE.BoxGeometry(grooveW, panelH, HB_THICKNESS * 0.6);
                const m = new THREE.Mesh(geo, oakBand);
                m.position.set(xc, baseY + 0.03 + panelH / 2, headZ - HB_THICKNESS / 2 - 0.005);
                m.userData.role = 'headboard_groove';
                root.add(m);
            }
            // Top + bottom horizontal rails across the centre
            for (const yOff of [0.015, totalH - 0.045] as const) {
                const geo = new THREE.BoxGeometry(innerW, 0.03, HB_THICKNESS + 0.005);
                const m = new THREE.Mesh(geo, oak);
                m.position.set(0, baseY + yOff + 0.015, headZ - HB_THICKNESS / 2);
                m.userData.role = 'headboard_rail';
                root.add(m);
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  Fallback simple base (used by any unhandled future variant)
    // ──────────────────────────────────────────────────────────────────────

    private buildSimpleBase(root: THREE.Group, cfg: BedEngineConfig): void {
        const v = cfg.variant;
        const p = cfg.palette;

        const plinthH = v === 'walnut' ? 0.16 : 0.12;
        const matH    = v === 'walnut' ? 0.20 : 0.18;
        const matInset = cfg.mattressInset ?? 0.08;
        const hbH     = cfg.headboardHeight ?? (v === 'walnut' ? 0.55 : 0.25);

        // Plinth
        {
            const geo = new THREE.BoxGeometry(cfg.width, plinthH, cfg.length);
            const m = new THREE.Mesh(geo, this.woodMat(p.wood));
            m.position.set(0, plinthH / 2, 0);
            m.userData.role = 'plinth';
            root.add(m);
        }
        // Mattress
        {
            const mw = Math.max(0.40, cfg.width  - 2 * matInset);
            const ml = Math.max(0.40, cfg.length - 2 * matInset);
            const geo = new THREE.BoxGeometry(mw, matH, ml);
            const m = new THREE.Mesh(geo, this.softMat(p.mattress));
            m.position.set(0, plinthH + matH / 2, 0);
            m.userData.role = 'mattress';
            root.add(m);
        }
        // Headboard
        if (cfg.hasHeadboard ?? true) {
            const hbT = 0.05;
            const geo = new THREE.BoxGeometry(cfg.width, hbH, hbT);
            const m = new THREE.Mesh(geo, this.woodMat(p.wood));
            m.position.set(0, plinthH + hbH / 2, -cfg.length / 2 + hbT / 2);
            m.userData.role = 'headboard';
            root.add(m);
        }
    }

    // ── Material helpers ─────────────────────────────────────────────────

    private woodMat(hex: number): THREE.MeshStandardMaterial {
        return this.material(hex, 0.62, 0.05);
    }

    private softMat(hex: number, roughness = 0.92): THREE.MeshStandardMaterial {
        return this.material(hex, roughness, 0.0);
    }

    private material(hex: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
        if (this.materialService) {
            const m = this.materialService.getMaterial(hex, 'standard') as THREE.MeshStandardMaterial;
            if (Math.abs(m.roughness - roughness) < 0.01 && Math.abs(m.metalness - metalness) < 0.01) {
                return m;
            }
        }
        return new THREE.MeshStandardMaterial({
            color: hex,
            roughness,
            metalness,
        });
    }

    /**
     * Build a realistic stuffed-pillow geometry: a superquadric ellipsoid
     * with a rectangular footprint (rounded edges from `e2 < 1`), a plump
     * vertical bulge (controlled by `e1`), and a gentle dip across the top
     * centre to simulate the sag of a filled cushion.
     *
     * Static so it can be reused for any variant without holding engine
     * state.  Returns a non-indexed-friendly indexed BufferGeometry with
     * computed vertex normals — drop-in replacement for SphereGeometry.
     */
    static makePillowGeometry(
        width: number,
        height: number,
        length: number,
        e1 = 0.65,    // y-axis bulge (1 = ellipsoid, lower = plumper top/bottom)
        e2 = 0.35,    // xz-plane roundness (1 = ellipse, lower = rectangular)
    ): THREE.BufferGeometry {
        const segU = 36;            // around equator
        const segV = 18;            // pole to pole
        const a = width  / 2;
        const b = height / 2;
        const c = length / 2;

        const sgn = (x: number): number => (x < 0 ? -1 : x > 0 ? 1 : 0);
        const pw  = (x: number, e: number): number =>
            sgn(x) * Math.pow(Math.abs(x), e);

        const positions: number[] = [];
        const indices:   number[] = [];

        for (let j = 0; j <= segV; j++) {
            const v = -Math.PI / 2 + (j / segV) * Math.PI;
            const cosV = Math.cos(v);
            const sinV = Math.sin(v);

            for (let i = 0; i <= segU; i++) {
                const u = -Math.PI + (i / segU) * 2 * Math.PI;
                const cosU = Math.cos(u);
                const sinU = Math.sin(u);

                let x = a * pw(cosV, e1) * pw(cosU, e2);
                let y = b * pw(sinV, e1);
                const z = c * pw(cosV, e1) * pw(sinU, e2);

                // Top-centre dip: pull the upper surface down toward the
                // middle, scaled by how close (x,z) is to the centre.
                if (y > 0) {
                    const nx = x / a;
                    const nz = z / c;
                    const central = (1 - nx * nx) * (1 - nz * nz);
                    y -= central * 0.10 * b;
                    // Slight side bulge so edges remain plump
                    x *= 1 + (1 - central) * 0.04;
                }

                positions.push(x, y, z);
            }
        }

        const stride = segU + 1;
        for (let j = 0; j < segV; j++) {
            for (let i = 0; i < segU; i++) {
                const i0 = j * stride + i;
                const i1 = i0 + 1;
                const i2 = i0 + stride;
                const i3 = i2 + 1;
                indices.push(i0, i2, i1);
                indices.push(i1, i2, i3);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position',
            new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }

    /** Shade a hex colour by a fractional amount (-1..+1). Negative = darker. */
    private shade(hex: number, amount: number): number {
        const r = (hex >> 16) & 0xff;
        const g = (hex >>  8) & 0xff;
        const b =  hex        & 0xff;
        const adj = (c: number): number => {
            const t = amount < 0 ? 0 : 255;
            const k = Math.abs(amount);
            return Math.max(0, Math.min(255, Math.round((t - c) * k + c)));
        };
        return (adj(r) << 16) | (adj(g) << 8) | adj(b);
    }
}
