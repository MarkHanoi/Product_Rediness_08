/**
 * FurnitureGeometryBuildersA.ts
 *
 * Furniture thumbnail geometry builders (Part A):
 * Corner sofas, dining chairs, oak chairs, Barcelona range,
 * coffee/dining/desk tables, and related variants.
 * Extracted from FurnitureGeometryFactory.ts (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure geometry module — no engine, store, or UI imports.
 *  - All builders exported so FurnitureGeometryFactory can call them.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { mat, mk, addBox, addCyl } from './FurnitureGeometryHelpers';


// ─── Furniture builders ───────────────────────────────────────────────────────

/**
 * L-shaped corner sofa thumbnail — mirrors CornerSofaBuilder geometry
 * (plinths, back panels, arms, seat + back cushions) at carousel scale.
 * `fabricHex` controls the upholstery colour (e.g. cream for "Sofa L White").
 */
export function buildCornerSofa(g: THREE.Group, fabricHex: number): void {
    const fabric  = new THREE.MeshStandardMaterial({ color: fabricHex, roughness: 0.85 });
    const cushC   = new THREE.Color(fabricHex).multiplyScalar(1.08).getHex();
    const cushion = new THREE.MeshStandardMaterial({ color: cushC, roughness: 0.9 });
    const legMat  = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.5 });

    // Build the L with inside corner at (0,0,0), like the real CornerSofaBuilder.
    const inner = new THREE.Group();

    const W = 1.50;   // main run length along +X
    const L = 1.10;   // side run length along +Z
    const D = 0.55;   // seat depth (and side run width)
    const plinthH = 0.16;
    const cushThk = 0.14;
    const backH   = 0.28;  // back panel above plinth (halved for low silhouette)
    const backThk = 0.10;
    const armW    = 0.12;
    const legH    = 0.08;
    // Arms span from atop the legs to the top of the back panel, matching the
    // real CornerSofaBuilder so the silhouette reads as a single solid shell
    // rather than fragmented blocks at the top.
    const armH    = plinthH + backH;

    // Plinths: main runs along X (0..W), side runs along Z (0..L)
    addBox(inner, fabric, W, plinthH, D, W / 2,         legH + plinthH / 2, D / 2);
    addBox(inner, fabric, D, plinthH, L, D / 2,         legH + plinthH / 2, L / 2);

    // Back panels: main at Z=0, side at X=0. Extended down to the top of the
    // legs (overlapping the plinth) so the rear silhouette reads as one solid
    // shell and the panels don't appear to float above the seat.
    const backTotalH = plinthH + backH;
    const backY      = legH + backTotalH / 2;
    addBox(inner, fabric, W, backTotalH, backThk, W / 2,       backY, backThk / 2);
    addBox(inner, fabric, backThk, backTotalH, L, backThk / 2, backY, L / 2);

    // Seat cushions — main run (2 cushions, skipping the corner zone)
    const seatY = legH + plinthH + cushThk / 2;
    const seatZmain = backThk + (D - backThk) / 2;
    const seatDmain = D - backThk - 0.03;
    const mainCount = 2;
    const mainSeatStart = D;            // start past the corner overlap
    const mainSeatLen   = (W - mainSeatStart - armW) / mainCount;
    for (let i = 0; i < mainCount; i++) {
        const cx = mainSeatStart + mainSeatLen * (i + 0.5);
        addBox(inner, cushion, mainSeatLen * 0.92, cushThk, seatDmain, cx, seatY, seatZmain);
    }
    // Side run (1 cushion + corner cushion)
    const seatXside = backThk + (D - backThk) / 2;
    const seatDside = D - backThk - 0.03;
    addBox(inner, cushion, seatDside, cushThk, D * 0.92, seatXside, seatY, D / 2);          // corner seat
    addBox(inner, cushion, seatDside, cushThk, (L - D - armW) * 0.92,
        seatXside, seatY, D + (L - D - armW) / 2);

    // Back cushions — main run, aligned to seat seams
    const backCushY = legH + plinthH + cushThk + backH * 0.45;
    const backCushThk = backThk * 1.5;
    const backCushZmain = backThk + 0.04 + backCushThk / 2;
    for (let i = 0; i < mainCount; i++) {
        const cx = mainSeatStart + mainSeatLen * (i + 0.5);
        addBox(inner, cushion, mainSeatLen * 0.90, backH * 0.85, backCushThk,
            cx, backCushY, backCushZmain);
    }
    // Side run back cushion (single, absorbs corner)
    const backCushXside = backThk + 0.04 + backCushThk / 2;
    addBox(inner, cushion, backCushThk, backH * 0.85, (L - armW - 0.05) * 0.95,
        backCushXside, backCushY, (L - armW) / 2);

    // Arms — end of main run, end of side run. Sit on top of the legs and
    // rise to the back-panel top so the L silhouette reads as one shell.
    const armY = legH + armH / 2;
    addBox(inner, fabric, armW, armH, D,
        W - armW / 2, armY, D / 2);
    addBox(inner, fabric, D, armH, armW,
        D / 2, armY, L - armW / 2);

    // Legs (six, matching the real builder)
    const inset = 0.05;
    const legPositions: [number, number][] = [
        [inset,         inset],
        [W - inset,     inset],
        [W - inset,     D - inset],
        [inset,         L - inset],
        [D - inset,     L - inset],
        [D - inset,     D - inset],
    ];
    for (const [lx, lz] of legPositions) {
        addBox(inner, legMat, 0.05, legH, 0.05, lx, legH / 2, lz);
    }

    // Centre the L group at origin so the carousel framing is balanced.
    inner.position.set(-W / 2, 0, -L / 2);
    g.add(inner);
}

export function buildDiningChair(g: THREE.Group): void {
    const M   = mat();
    const legs = [[-0.19, -0.19], [-0.19, 0.19], [0.19, -0.19], [0.19, 0.19]] as [number, number][];
    legs.forEach(([x, z]) => addCyl(g, M.wood, 0.022, 0.022, 0.45, x, 0, z, 8));
    addBox(g, M.wood, 0.48, 0.05, 0.48, 0, 0.45, 0);
    addBox(g, M.wood, 0.48, 0.52, 0.04, 0, 0.50, -0.22);
}

/**
 * Slim oak chair — rounded oval seat, gently curved trapezoidal back panel,
 * splayed tapered legs. Mirrors ChairBuilder.buildOakChairSlim.
 */
export function buildOakChairSlimThumb(g: THREE.Group): void {
    const W = 0.52, L = 0.55, H = 0.90;
    const seatY = H * 0.50;
    const oak = new THREE.MeshStandardMaterial({ color: 0xc89058, roughness: 0.52, metalness: 0.0 });
    const oakDS = new THREE.MeshStandardMaterial({ color: 0xc89058, roughness: 0.52, metalness: 0.0, side: THREE.DoubleSide });

    // Rounded oval seat
    const seat = mk(new THREE.CylinderGeometry(W * 0.50, W * 0.50, 0.034, 24, 1), oak);
    seat.position.set(0, seatY, L * 0.02);
    seat.scale.set(1.0, 1.0, (L * 0.92) / W);
    g.add(seat);

    // Two tapered rear posts
    const postBaseY = seatY - 0.015;
    const postTopY  = H - 0.14;
    const postLen   = postTopY - postBaseY;
    const postLean  = -0.08;
    const postGeo   = new THREE.CylinderGeometry(0.013, 0.020, postLen, 12);
    [-1, 1].forEach(side => {
        const post = mk(postGeo, oak);
        post.position.set(
            side * W * 0.42,
            (postBaseY + postTopY) * 0.5,
            -L * 0.40 + Math.tan(-postLean) * (postLen * 0.5),
        );
        post.rotation.x = postLean;
        g.add(post);
    });

    // Curved back panel (chord along X, bows -Z)
    const panelW = W * 0.92;
    const panelH = H * 0.18;
    const panelArcR = W * 1.0;
    const panelTheta = panelW / panelArcR;
    // Arc centered at θ = π puts the open strip on the −Z side of the cylinder
    // (chord runs LEFT↔RIGHT between the rear posts, panel bows backward).
    // The previous −π/2 placed it on the −X side → panel floated to the LEFT.
    const panel = mk(new THREE.CylinderGeometry(
        panelArcR, panelArcR, panelH, 18, 1, true,
        Math.PI - panelTheta * 0.5, panelTheta,
    ), oakDS);
    panel.position.set(
        0,
        H - 0.14 + panelH * 0.5,
        -L * 0.40 + panelArcR * Math.cos(panelTheta * 0.5),
    );
    g.add(panel);

    // Splayed tapered legs — centered under the elliptical seat
    const legH = seatY;
    const legGeo = new THREE.CylinderGeometry(0.012, 0.022, legH, 12);
    ([[ W * 0.34,  L * 0.30], [-W * 0.34,  L * 0.30],
      [ W * 0.34, -L * 0.30], [-W * 0.34, -L * 0.30]] as [number, number][]
    ).forEach(([x, z]) => {
        const leg = mk(legGeo, oak);
        leg.position.set(x, legH * 0.5, z);
        leg.rotation.z = x > 0 ? -0.10 : 0.10;
        leg.rotation.x = z > 0 ?  0.08 : -0.08;
        g.add(leg);
    });
}

/**
 * Oak chair with curved backrest and splayed legs — Carl Hansen-style silhouette.
 * Mirrors ChairBuilder.buildOakChair so thumbnails match the placed geometry.
 * `variant` toggles the leg/post thickness and oak tint (solid vs slim).
 */
export function buildOakChairThumb(g: THREE.Group, variant: 'solid' | 'slim'): void {
    const W = 0.54, L = 0.56, H = 0.86;
    const seatY = H * 0.50;
    const oak = new THREE.MeshStandardMaterial({
        color: variant === 'solid' ? 0xc8954a : 0xd4a35e,
        roughness: 0.55, metalness: 0.0,
    });
    const legR  = variant === 'solid' ? 0.020 : 0.016;
    const postR = variant === 'solid' ? 0.020 : 0.016;
    const seatThk = variant === 'solid' ? 0.038 : 0.030;

    // Seat — slight back-tilt
    const seat = mk(new THREE.BoxGeometry(W, seatThk, L * 0.92), oak);
    seat.position.set(0, seatY, L * 0.02);
    seat.rotation.x = 0.04;
    g.add(seat);

    // Back posts (leaning back)
    const postLen = (H - seatY) + 0.04;
    const postLean = -0.10;
    [-1, 1].forEach(side => {
        const post = mk(new THREE.CylinderGeometry(postR * 0.85, postR, postLen, 12), oak);
        const baseZ = -L * 0.42;
        post.position.set(
            side * W * 0.44,
            seatY + postLen * 0.5 - 0.02,
            baseZ + Math.tan(-postLean) * (postLen * 0.5),
        );
        post.rotation.x = postLean;
        g.add(post);
    });

    // Curved back panel — taller, wider, arched (chord along X, bows -Z)
    const panelW = W * 0.96;
    const panelH = H * 0.26;
    const panelTopY = H - 0.02;
    const panelArcR = W * 1.0;
    const panelTheta = panelW / panelArcR;
    const panelMat = new THREE.MeshStandardMaterial({
        color: variant === 'solid' ? 0xc8954a : 0xd4a35e,
        roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide,
    });
    // See slim-chair comment above — arc centered at θ = π places it on the
    // −Z side (behind the chair) instead of the −X side (off to the LEFT).
    const panel = mk(new THREE.CylinderGeometry(
        panelArcR, panelArcR, panelH, 20, 1, true,
        Math.PI - panelTheta * 0.5, panelTheta,
    ), panelMat);
    panel.position.set(
        0,
        panelTopY - panelH * 0.5,
        -L * 0.42 + panelArcR * Math.cos(panelTheta * 0.5),
    );
    g.add(panel);

    // Splayed tapered legs
    const legH = seatY;
    const legGeo = new THREE.CylinderGeometry(legR * 0.65, legR, legH, 12);
    ([[ W * 0.42,  L * 0.38], [-W * 0.42,  L * 0.38],
      [ W * 0.42, -L * 0.38], [-W * 0.42, -L * 0.38]] as [number, number][]
    ).forEach(([x, z]) => {
        const leg = mk(legGeo, oak);
        leg.position.set(x, legH * 0.5, z);
        leg.rotation.z = x > 0 ? -0.09 : 0.09;
        leg.rotation.x = z > 0 ?  0.07 : -0.07;
        g.add(leg);
    });

    // Side stretchers + front cross-stretcher
    const sR = legR * 0.55;
    const sY = legH * 0.42;
    const sideGeo = new THREE.CylinderGeometry(sR, sR, L * 0.74, 10);
    [-1, 1].forEach(side => {
        const s = mk(sideGeo, oak);
        s.rotation.x = Math.PI / 2;
        s.position.set(side * W * 0.40, sY, 0);
        g.add(s);
    });
    const cross = mk(new THREE.CylinderGeometry(sR, sR, W * 0.78, 10), oak);
    cross.rotation.z = Math.PI / 2;
    cross.position.set(0, sY, 0);
    g.add(cross);
}

/**
 * Oak chair with curved upholstered back band, plump oval boucle seat, and
 * four straight tapered oak legs. Mirrors ChairBuilder.buildOakCurvedUpholsteredChair.
 */
export function buildOakCurvedUphThumb(g: THREE.Group): void {
    const W = 0.54, L = 0.56, H = 0.84;
    const seatY = H * 0.50;
    const oak = new THREE.MeshStandardMaterial({ color: 0xc89058, roughness: 0.55 });
    const textile = new THREE.MeshStandardMaterial({
        color: 0xe6e1d6, roughness: 0.95, side: THREE.DoubleSide,
    });

    // Plump oval seat (squashed cylinder for the thumb — cheap stand-in for the
    // bevelled cushion used at runtime).
    const seat = mk(new THREE.CylinderGeometry(W * 0.48, W * 0.48, 0.08, 24), textile);
    seat.position.set(0, seatY + 0.04, L * 0.02);
    seat.scale.set(1.0, 1.0, (L * 0.92) / (W * 0.96));
    g.add(seat);

    // Curved back band (single arc strip in textile)
    const backH    = H * 0.28;
    const backR    = W * 0.95;
    const backTh   = (W * 0.92) / backR;
    const backCY   = H - 0.10 + backH * 0.5 - 0.05;
    const backCZ   = -L * 0.40 + backR * Math.cos(backTh * 0.5);
    const back = mk(new THREE.CylinderGeometry(
        backR, backR, backH, 22, 1, true,
        Math.PI - backTh * 0.5, backTh,
    ), textile);
    back.position.set(0, backCY, backCZ);
    g.add(back);

    // Two side oak posts (tapered cylinders, like the legs)
    const postBaseY = seatY - 0.02;
    const postTopY  = backCY + backH * 0.5 + 0.005;
    const postH     = postTopY - postBaseY;
    [-1, 1].forEach(side => {
        const post = mk(new THREE.CylinderGeometry(0.020, 0.024, postH, 14), oak);
        post.position.set(
            side * backR * Math.sin(backTh * 0.5) * 0.92,
            (postBaseY + postTopY) * 0.5,
            -L * 0.40,
        );
        g.add(post);
    });

    // Four straight tapered oak legs
    const legH = seatY;
    const legGeo = new THREE.CylinderGeometry(0.020, 0.030, legH, 12);
    ([[ W * 0.38,  L * 0.34], [-W * 0.38,  L * 0.34],
      [ W * 0.38, -L * 0.34], [-W * 0.38, -L * 0.34]] as [number, number][]
    ).forEach(([x, z]) => {
        const leg = mk(legGeo, oak);
        leg.position.set(x, legH * 0.5, z);
        g.add(leg);
    });
}

/**
 * Three-legged terracotta tub chair with horseshoe back and elliptical seat.
 * Mirrors ChairBuilder.buildThreeLegTerracottaChair.
 */
export function buildThreeLegTerracottaThumb(g: THREE.Group): void {
    const W = 0.62, H = 0.80;
    const seatY = H * 0.46;
    const wood = new THREE.MeshStandardMaterial({ color: 0xd6b58a, roughness: 0.55 });
    const textile = new THREE.MeshStandardMaterial({
        color: 0xb85c4a, roughness: 0.95, side: THREE.DoubleSide,
    });

    // Elliptical seat cushion (squashed cylinder stand-in)
    const seatR = W * 0.42;
    const seat = mk(new THREE.CylinderGeometry(seatR, seatR, 0.06, 28), textile);
    seat.position.set(0, seatY + 0.03, 0);
    seat.scale.set(1.10, 1.0, 0.92);
    g.add(seat);

    // Horseshoe back band (open-cylinder strip wrapping ~210°)
    const backH     = H * 0.20;
    const backArcR  = seatR + 0.04;
    const backTheta = Math.PI * 1.17;
    const backCY    = H * 0.86;
    const back = mk(new THREE.CylinderGeometry(
        backArcR, backArcR, backH, 32, 1, true,
        Math.PI - backTheta * 0.5, backTheta,
    ), textile);
    back.position.set(0, backCY, 0);
    g.add(back);

    // Three light-oak rectangular posts (two front at horseshoe ends, one rear)
    const postTopY  = backCY - backH * 0.5 + 0.03;
    const postH     = postTopY;
    const postGeo   = new THREE.BoxGeometry(0.075, postH, 0.045);
    const halfTh    = backTheta * 0.5;
    const endX      = backArcR * Math.sin(halfTh);
    const endZ      = -backArcR * Math.cos(halfTh);
    ([[ endX, endZ], [-endX, endZ], [0, -backArcR]] as [number, number][])
        .forEach(([x, z]) => {
            const post = mk(postGeo, wood);
            post.position.set(x, postH * 0.5, z);
            post.rotation.y = Math.atan2(x, z);
            g.add(post);
        });
}

/**
 * Obejita 3-leg curved chair — same horseshoe + elliptical seat as terracotta,
 * but in matte black metal posts and obejita off-white boucle. Mirrors
 * ChairBuilder.buildThreeLegObejitaBlackChair at low fidelity.
 */
export function buildThreeLegObejitaBlackThumb(g: THREE.Group): void {
    const W = 0.62, H = 0.80;
    const seatY = H * 0.46;
    const metal = new THREE.MeshStandardMaterial({
        color: 0x141414, roughness: 0.55, metalness: 0.55,
    });
    const textile = new THREE.MeshStandardMaterial({
        color: 0xf2ece1, roughness: 0.95, side: THREE.DoubleSide,
    });

    const seatR = W * 0.42;
    const seat = mk(new THREE.CylinderGeometry(seatR, seatR, 0.06, 28), textile);
    seat.position.set(0, seatY + 0.03, 0);
    seat.scale.set(1.10, 1.0, 0.92);
    g.add(seat);

    const backH     = H * 0.20;
    const backArcR  = seatR + 0.04;
    const backTheta = Math.PI * 1.17;
    const backCY    = H * 0.86;
    const back = mk(new THREE.CylinderGeometry(
        backArcR, backArcR, backH, 32, 1, true,
        Math.PI - backTheta * 0.5, backTheta,
    ), textile);
    back.position.set(0, backCY, 0);
    g.add(back);

    const postTopY = backCY - backH * 0.5 + 0.03;
    const postH    = postTopY;
    const postGeo  = new THREE.BoxGeometry(0.085, postH, 0.060);
    const halfTh   = backTheta * 0.5;
    const endX     = backArcR * Math.sin(halfTh);
    const endZ     = -backArcR * Math.cos(halfTh);
    ([[ endX, endZ], [-endX, endZ], [0, -backArcR]] as [number, number][])
        .forEach(([x, z]) => {
            const post = mk(postGeo, metal);
            post.position.set(x, postH * 0.5, z);
            post.rotation.y = Math.atan2(x, z);
            g.add(post);
        });
}

/**
 * Obejita 4-leg wood tub chair — mirrors
 * ChairBuilder.buildFourLegObejitaWoodChair at low fidelity.
 */
export function buildFourLegObejitaWoodThumb(g: THREE.Group): void {
    const W = 0.78, L = 0.78, H = 0.78;
    const wood = new THREE.MeshStandardMaterial({ color: 0xc59668, roughness: 0.55 });
    const textile = new THREE.MeshStandardMaterial({
        color: 0xf2ece1, roughness: 0.95, side: THREE.DoubleSide,
    });

    // Plump cushion (deep tub seat)
    const seatBotY = H * 0.24, seatTopY = H * 0.46;
    const seatThk  = seatTopY - seatBotY;
    const seatCY   = (seatTopY + seatBotY) * 0.5;
    const cushion  = mk(new THREE.BoxGeometry(W * 0.84, seatThk, L * 0.84), textile);
    cushion.position.y = seatCY;
    g.add(cushion);

    // Curved back band (open cylinder strip ≈ 189°)
    const backH     = H * 0.22;
    const backArcR  = Math.max(W, L) * 0.42;
    const backTheta = Math.PI * 1.05;
    const backCY    = H * 0.78;
    const back = mk(new THREE.CylinderGeometry(
        backArcR, backArcR, backH, 32, 1, true,
        Math.PI - backTheta * 0.5, backTheta,
    ), textile);
    back.position.set(0, backCY, 0);
    g.add(back);

    // 4 wood corner posts: front pair short (to seat-top), back pair tall.
    const postT = 0.06;
    const halfX = W * 0.42, halfZ = L * 0.42;
    const frontH = seatTopY + 0.04;
    const backPH = backCY + backH * 0.5 + 0.005;

    ([[-halfX, +halfZ], [+halfX, +halfZ]] as [number, number][]).forEach(([x, z]) => {
        const leg = mk(new THREE.BoxGeometry(postT, frontH, postT), wood);
        leg.position.set(x, frontH * 0.5, z);
        g.add(leg);
    });
    ([[-halfX, -halfZ], [+halfX, -halfZ]] as [number, number][]).forEach(([x, z]) => {
        const leg = mk(new THREE.BoxGeometry(postT, backPH, postT), wood);
        leg.position.set(x, backPH * 0.5, z);
        g.add(leg);
    });
}

/**
 * Barcelona-style lounge chair — mirrors ChairBuilder.buildBarcelonaBlackChair
 * at low fidelity. Uses two leather pads and per-side TubeGeometry along
 * quadratic Béziers for the chrome X-frame.
 */
export function buildBarcelonaBlackThumb(g: THREE.Group): void {
    const W = 0.78, L = 0.78, H = 0.76;
    const leather = new THREE.MeshStandardMaterial({
        color: 0x121212, roughness: 0.42, metalness: 0.05,
    });
    const chrome = new THREE.MeshStandardMaterial({
        color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
    });

    // Seat pad — pivot around its rear edge so the front lifts (~14°).
    const seatTopY = H * 0.38, seatThk = 0.10;
    const seatL = L * 0.78;
    const hingeZ = -L * 0.18;
    const seatGeo = new THREE.BoxGeometry(W * 0.84, seatThk, seatL);
    seatGeo.translate(0, -seatThk * 0.5, seatL * 0.5);
    const seat = mk(seatGeo, leather);
    seat.position.set(0, seatTopY, hingeZ);
    seat.rotation.x = -THREE.MathUtils.degToRad(14);
    g.add(seat);

    // Back pad (tilted back ~14°)
    const backLen = H * 0.74, backThk = 0.10;
    const back = mk(new THREE.BoxGeometry(W * 0.84, backThk, backLen), leather);
    back.rotation.x = Math.PI / 2;
    const backG = new THREE.Group();
    backG.add(back);
    backG.position.set(0, seatTopY + backLen * 0.5 - 0.02, hingeZ);
    backG.rotation.x = -THREE.MathUtils.degToRad(14);
    g.add(backG);

    // X-frame: 2 arcs per side
    const sideX = W * 0.46, halfL = L * 0.50, tubeR = 0.022;
    const arc = (
        from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3, sx: number,
    ) => {
        const c = new THREE.QuadraticBezierCurve3(
            from.clone().setX(sx * Math.abs(from.x)),
            ctrl.clone().setX(sx * Math.abs(ctrl.x)),
            to.clone()  .setX(sx * Math.abs(to.x)),
        );
        return mk(new THREE.TubeGeometry(c, 24, tubeR, 10, false), chrome);
    };
    const aF = new THREE.Vector3(sideX, 0,                +halfL);
    const aC = new THREE.Vector3(sideX, seatTopY * 0.55,  0);
    const aT = new THREE.Vector3(sideX, seatTopY + 0.02,  hingeZ + 0.02);
    const bF = new THREE.Vector3(sideX, 0,                -halfL);
    const bC = new THREE.Vector3(sideX, seatTopY * 0.55,  0);
    const bT = new THREE.Vector3(sideX, seatTopY - 0.01, +halfL * 0.85);
    [-1, +1].forEach(sx => {
        g.add(arc(aF, aC, aT, sx));
        g.add(arc(bF, bC, bT, sx));
    });

    // Cross rails
    const railGeo = new THREE.CylinderGeometry(tubeR, tubeR, sideX * 2, 12);
    railGeo.rotateZ(Math.PI / 2);
    const railTop = mk(railGeo, chrome);
    railTop.position.set(0, aT.y, aT.z);
    g.add(railTop);
    const railFront = mk(railGeo.clone(), chrome);
    railFront.position.set(0, bT.y, bT.z);
    g.add(railFront);
}

/**
 * Barcelona ottoman — mirrors ChairBuilder.buildBarcelonaOttoman at low
 * fidelity. Same chrome X-frame, single flat tufted leather pad, no back.
 */
export function buildBarcelonaOttomanThumb(g: THREE.Group): void {
    const W = 0.62, L = 0.55, H = 0.40;
    const leather = new THREE.MeshStandardMaterial({
        color: 0x121212, roughness: 0.42, metalness: 0.05,
    });
    const chrome = new THREE.MeshStandardMaterial({
        color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
    });

    const seatTopY = H * 0.92, seatThk = 0.10;
    const pad = mk(new THREE.BoxGeometry(W * 0.86, seatThk, L * 0.86), leather);
    pad.position.set(0, seatTopY - seatThk * 0.5, 0);
    g.add(pad);

    const sideX = W * 0.46, halfL = L * 0.50, tubeR = 0.022;
    const arc = (
        from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3, sx: number,
    ) => {
        const c = new THREE.QuadraticBezierCurve3(
            from.clone().setX(sx * Math.abs(from.x)),
            ctrl.clone().setX(sx * Math.abs(ctrl.x)),
            to.clone()  .setX(sx * Math.abs(to.x)),
        );
        return mk(new THREE.TubeGeometry(c, 24, tubeR, 10, false), chrome);
    };
    const aF = new THREE.Vector3(sideX, 0,                +halfL);
    const aC = new THREE.Vector3(sideX, seatTopY * 0.55,  0);
    const aT = new THREE.Vector3(sideX, seatTopY - 0.005, -halfL * 0.85);
    const bF = new THREE.Vector3(sideX, 0,                -halfL);
    const bC = new THREE.Vector3(sideX, seatTopY * 0.55,  0);
    const bT = new THREE.Vector3(sideX, seatTopY - 0.005, +halfL * 0.85);
    [-1, +1].forEach(sx => {
        g.add(arc(aF, aC, aT, sx));
        g.add(arc(bF, bC, bT, sx));
    });

    const railGeo = new THREE.CylinderGeometry(tubeR, tubeR, sideX * 2, 12);
    railGeo.rotateZ(Math.PI / 2);
    const r1 = mk(railGeo, chrome);            r1.position.set(0, aT.y, aT.z); g.add(r1);
    const r2 = mk(railGeo.clone(), chrome);    r2.position.set(0, bT.y, bT.z); g.add(r2);
}

/**
 * Cesca cantilever chair thumbnail — chrome U-frame, tan tufted leather seat,
 * wood-framed cane back. Mirrors ChairBuilder.buildCescaTanChair.
 */
export function buildCescaTanThumb(g: THREE.Group): void {
    const W = 0.50, L = 0.55, H = 0.85;
    const chrome = new THREE.MeshStandardMaterial({
        color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
    });
    const leather = new THREE.MeshStandardMaterial({
        color: 0xa9683a, roughness: 0.45, metalness: 0.05,
    });
    const walnut = new THREE.MeshStandardMaterial({
        color: 0x4a2a18, roughness: 0.55, metalness: 0.05,
    });
    const cane = new THREE.MeshStandardMaterial({
        color: 0xc9994f, roughness: 0.7, metalness: 0.0,
    });

    const seatTopY = H * 0.52, seatThk = 0.075;
    const sideX = W * 0.42, halfL = L * 0.50, tubeR = 0.018;
    const backTopY = H, frameW = W * 0.92;
    const backH = backTopY - (seatTopY + 0.18);

    // Cantilever frame (per side: skid + rear vert + top rail + back post)
    [-1, +1].forEach(sx => {
        const x = sx * sideX;
        const skid = mk(new THREE.CylinderGeometry(tubeR, tubeR, L * 0.92, 12), chrome);
        skid.rotation.x = Math.PI / 2;
        skid.position.set(x, tubeR, 0);
        g.add(skid);
        const rear = mk(new THREE.CylinderGeometry(tubeR, tubeR, seatTopY - tubeR, 12), chrome);
        rear.position.set(x, (seatTopY - tubeR) / 2 + tubeR, -halfL + 0.02);
        g.add(rear);
        const top = mk(new THREE.CylinderGeometry(tubeR, tubeR, L * 0.88, 12), chrome);
        top.rotation.x = Math.PI / 2;
        top.position.set(x, seatTopY - 0.02, 0.02);
        g.add(top);
        const front = mk(new THREE.CylinderGeometry(tubeR, tubeR, seatTopY - tubeR, 12), chrome);
        front.position.set(x, (seatTopY - tubeR) / 2 + tubeR, +halfL - 0.02);
        g.add(front);
        const post = mk(new THREE.CylinderGeometry(tubeR, tubeR, backTopY - seatTopY, 12), chrome);
        post.position.set(x, seatTopY + (backTopY - seatTopY) / 2, -halfL + 0.02);
        g.add(post);
    });

    // Tan leather seat
    const seat = mk(
        new THREE.BoxGeometry(W * 0.92, seatThk, L * 0.84),
        leather,
    );
    seat.position.set(0, seatTopY + seatThk * 0.5, 0);
    g.add(seat);

    // Cane back panel + walnut frame
    const backZ = -halfL + 0.04;
    const railH = 0.06, frameDepth = 0.04;
    const top = mk(new THREE.BoxGeometry(frameW, railH, frameDepth), walnut);
    top.position.set(0, backTopY - railH * 0.5, backZ);
    g.add(top);
    const bot = top.clone();
    bot.position.y = backTopY - backH + railH * 0.5;
    g.add(bot);
    const stileH = backH - railH * 2;
    [-1, +1].forEach(sx => {
        const stile = mk(new THREE.BoxGeometry(railH, stileH, frameDepth), walnut);
        stile.position.set(
            sx * (frameW * 0.5 - railH * 0.5),
            backTopY - railH - stileH * 0.5,
            backZ,
        );
        g.add(stile);
    });
    const innerW = frameW - railH * 2 - 0.01;
    const innerH = stileH - 0.01;
    const innerCy = backTopY - railH - stileH * 0.5;
    const panel = mk(new THREE.BoxGeometry(innerW, innerH, 0.01), cane);
    panel.position.set(0, innerCy, backZ + frameDepth * 0.5 - 0.005);
    g.add(panel);
}

/**
 * Barcelona-style sofa thumbnail (1, 2 or 3-seat). Stretched chair geometry
 * with one chrome X-frame at every seat boundary plus two long transverse
 * cross-rails. Mirrors ChairBuilder.buildBarcelonaSofa at low fidelity.
 */
export function buildBarcelonaSofaThumb(g: THREE.Group, seats: 1 | 2 | 3): void {
    const W = seats === 1 ? 1.10 : seats === 2 ? 1.85 : 2.60;
    const L = 0.85, H = 0.76;
    const leather = new THREE.MeshStandardMaterial({
        color: 0x121212, roughness: 0.42, metalness: 0.05,
    });
    const chrome = new THREE.MeshStandardMaterial({
        color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
    });

    const seatTopY = H * 0.38, seatThk = 0.10;
    const hingeY = seatTopY, hingeZ = -L * 0.18;
    const halfL = L * 0.50, tubeR = 0.022;
    const sideInset = W * 0.04;
    const seatHalfW = W * 0.50 - sideInset;
    const seatW = seatHalfW * 2;
    const seatL = L * 0.78;

    // Seat (single tilted pad)
    const seatGeo = new THREE.BoxGeometry(seatW, seatThk, seatL);
    seatGeo.translate(0, -seatThk * 0.5, seatL * 0.5);
    const seat = mk(seatGeo, leather);
    seat.position.set(0, seatTopY, hingeZ);
    seat.rotation.x = -THREE.MathUtils.degToRad(14);
    g.add(seat);

    // Back (single upright tilted pad)
    const backLen = H * 0.74, backThk = 0.10;
    const backGeo = new THREE.BoxGeometry(seatW, backThk, backLen);
    const back = mk(backGeo, leather);
    back.rotation.x = Math.PI / 2;
    const backWrap = new THREE.Group();
    backWrap.add(back);
    backWrap.position.set(0, hingeY + backLen * 0.5 - 0.02, hingeZ);
    backWrap.rotation.x = -THREE.MathUtils.degToRad(14);
    g.add(backWrap);

    // X-frames at each seat boundary
    const arc = (
        from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3,
    ) => mk(
        new THREE.TubeGeometry(
            new THREE.QuadraticBezierCurve3(from, ctrl, to),
            22, tubeR, 10, false,
        ),
        chrome,
    );
    let topZ = 0, topY = 0, frontZ = 0, frontY = 0;
    for (let i = 0; i <= seats; i++) {
        const x = -seatHalfW + (i / seats) * (2 * seatHalfW);
        const aT = new THREE.Vector3(x, hingeY + 0.02, hingeZ + 0.02);
        const bT = new THREE.Vector3(x, seatTopY - 0.01, +halfL * 0.85);
        g.add(arc(
            new THREE.Vector3(x, 0, +halfL),
            new THREE.Vector3(x, seatTopY * 0.55, 0),
            aT,
        ));
        g.add(arc(
            new THREE.Vector3(x, 0, -halfL),
            new THREE.Vector3(x, seatTopY * 0.55, 0),
            bT,
        ));
        topZ = aT.z; topY = aT.y; frontZ = bT.z; frontY = bT.y;
    }

    // Cross-rails
    const railLen = 2 * seatHalfW + tubeR * 2;
    const railGeo = new THREE.CylinderGeometry(tubeR, tubeR, railLen, 12);
    railGeo.rotateZ(Math.PI / 2);
    const r1 = mk(railGeo, chrome);          r1.position.set(0, topY, topZ);     g.add(r1);
    const r2 = mk(railGeo.clone(), chrome);  r2.position.set(0, frontY, frontZ); g.add(r2);
}

/**
 * Barcelona-style L-shape corner sofa thumbnail. Two perpendicular sub-sofas
 * (3-seat main row + 2-seat wing) sharing the inside corner. Mirrors
 * ChairBuilder.buildBarcelonaCornerSofa at low fidelity.
 */
export function buildBarcelonaCornerSofaThumb(g: THREE.Group): void {
    const W = 2.60, L = 1.85;
    const legDepth = 0.85;

    const main = new THREE.Group();
    buildBarcelonaSofaThumb(main, 3);
    main.position.set(0, 0, L * 0.5 - legDepth * 0.5);
    main.rotation.y = Math.PI;
    g.add(main);

    const wing = new THREE.Group();
    // Wing renders as a 2-seat with default 1.85 width — scale to fit wing length
    buildBarcelonaSofaThumb(wing, 2);
    const wingW = L - legDepth;
    wing.scale.x = wingW / 1.85;
    wing.position.set(W * 0.5 - legDepth * 0.5, 0, -legDepth * 0.5);
    wing.rotation.y = -Math.PI / 2;
    g.add(wing);
}

/**
 * Textile-seat wood-frame armchair — mirrors ChairBuilder.buildTextileWoodArmchair.
 */
export function buildTextileWoodArmchairThumb(g: THREE.Group): void {
    const W = 0.68, L = 0.62, H = 0.82;
    const seatY = H * 0.47;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8c5a2e, roughness: 0.54 });
    const textile = new THREE.MeshStandardMaterial({ color: 0xbab6ae, roughness: 0.86 });
    const thread = new THREE.MeshStandardMaterial({ color: 0x6f6b65, roughness: 0.92 });

    const seat = mk(new THREE.BoxGeometry(W * 0.9, 0.105, L * 0.78), textile);
    seat.position.y = seatY;
    g.add(seat);

    const back = mk(new THREE.BoxGeometry(W * 0.82, 0.32, 0.08), textile);
    back.position.set(0, H * 0.74, -L * 0.42);
    back.rotation.x = -0.10;
    g.add(back);

    for (let i = 0; i < 8; i++) {
        const t = mk(new THREE.BoxGeometry(W * 0.75, 0.004, 0.006), thread);
        t.position.set(0, H * 0.63 + i * 0.028, -L * 0.465);
        g.add(t);
    }

    const railFront = mk(new THREE.BoxGeometry(W, 0.08, 0.055), wood);
    railFront.position.set(0, seatY - 0.08, L * 0.39);
    g.add(railFront);

    [-1, 1].forEach(side => {
        const arm = mk(new THREE.BoxGeometry(0.07, 0.065, L * 0.9), wood);
        arm.position.set(side * W * 0.54, H * 0.62, -L * 0.02);
        g.add(arm);

        const post = mk(new THREE.CylinderGeometry(0.03, 0.045, H * 0.62, 12), wood);
        post.position.set(side * W * 0.5, H * 0.31, -L * 0.42);
        post.rotation.z = side * -0.08;
        g.add(post);
    });

    const legGeo = new THREE.CylinderGeometry(0.026, 0.043, seatY, 12);
    ([[ W * 0.42, seatY * 0.5,  L * 0.34], [-W * 0.42, seatY * 0.5,  L * 0.34],
      [ W * 0.42, seatY * 0.5, -L * 0.34], [-W * 0.42, seatY * 0.5, -L * 0.34]] as [number, number, number][]
    ).forEach(([x, y, z]) => {
        const leg = mk(legGeo, wood);
        leg.position.set(x, y, z);
        leg.rotation.z = x > 0 ? -0.08 : 0.08;
        leg.rotation.x = z > 0 ? -0.08 : 0.08;
        g.add(leg);
    });
}


export function buildCoffeeTable(g: THREE.Group): void {
    const M   = mat();
    const legs = [[-0.50, -0.26], [-0.50, 0.26], [0.50, -0.26], [0.50, 0.26]] as [number, number][];
    legs.forEach(([x, z]) => addBox(g, M.wood, 0.05, 0.40, 0.05, x, 0, z));
    addBox(g, M.wood, 1.10, 0.04, 0.60, 0, 0.40, 0);
}

export function buildDiningTable(g: THREE.Group): void {
    const M   = mat();
    const legs = [[-0.80, -0.38], [-0.80, 0.38], [0.80, -0.38], [0.80, 0.38]] as [number, number][];
    legs.forEach(([x, z]) => addCyl(g, M.wood, 0.04, 0.04, 0.73, x, 0, z, 8));
    addBox(g, M.wood, 1.80, 0.045, 0.90, 0, 0.73, 0);
}

export function buildDesk(g: THREE.Group): void {
    const M = mat();
    addBox(g, M.wood, 0.04, 0.73, 0.70, -0.78, 0, 0);
    addBox(g, M.wood, 0.04, 0.73, 0.70,  0.78, 0, 0);
    addBox(g, M.wood, 1.60, 0.04, 0.75,  0, 0.73, 0);
}

