import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { CHAIR_PLAN_TYPES } from './ChairPlanSymbolBuilder';

export class ChairBuilder implements IFurnitureBuilder {

    constructor(private materialService: MaterialService) {}

    /**
     * Public entry point. Routes to a per-type private builder, then — for
     * chair types only — tags every mesh with `userData.skipInPlan = true`
     * so EdgeProjectorService excludes its dense 3D-edge projection from
     * plan view. ChairPlanSymbolBuilder injects a clean 2D symbol instead.
     *
     * NOTE: The Barcelona sofa types (`barcelona_sofa_*seat`,
     * `barcelona_corner_sofa`) also route through this builder but are NOT
     * chairs — they are sofas. They deliberately keep their default native
     * edge projection until a sofa-style symbol is added for them.
     */
    build(data: FurnitureData): THREE.Group {
        const group = this._buildInner(data);

        if (CHAIR_PLAN_TYPES.has(data.furnitureType)) {
            group.traverse(o => {
                if ((o as THREE.Mesh).isMesh) {
                    o.userData = { ...o.userData, skipInPlan: true, edgeAngleDeg: 30 };
                }
            });
        }

        return group;
    }

    private _buildInner(data: FurnitureData): THREE.Group {
        if (data.furnitureType === 'chair_oak_solid') return this.buildOakChair(data, 'solid');
        if (data.furnitureType === 'chair_oak_slim') return this.buildOakChairSlim(data);
        if (data.furnitureType === 'chair_oak_curved_uph') return this.buildOakCurvedUpholsteredChair(data);
        if (data.furnitureType === 'chair_3leg_terracotta') return this.buildThreeLegTerracottaChair(data);
        if (data.furnitureType === 'chair_3leg_obejita_black') return this.buildThreeLegObejitaBlackChair(data);
        if (data.furnitureType === 'chair_4leg_obejita_wood') return this.buildFourLegObejitaWoodChair(data);
        if (data.furnitureType === 'chair_barcelona_black') return this.buildBarcelonaBlackChair(data);
        // F1.13 (2026-05-30) — `lounge_chair` is the semantic alias used by
        // archetypes; renders as the Barcelona-black lounge silhouette.
        if (data.furnitureType === 'lounge_chair') return this.buildBarcelonaBlackChair(data);
        if (data.furnitureType === 'chair_barcelona_ottoman_black') return this.buildBarcelonaOttoman(data);
        if (data.furnitureType === 'barcelona_sofa_1seat')  return this.buildBarcelonaSofa(data, 1);
        if (data.furnitureType === 'barcelona_sofa_2seat')  return this.buildBarcelonaSofa(data, 2);
        if (data.furnitureType === 'barcelona_sofa_3seat')  return this.buildBarcelonaSofa(data, 3);
        if (data.furnitureType === 'barcelona_corner_sofa') return this.buildBarcelonaCornerSofa(data);
        if (data.furnitureType === 'chair_cesca_tan')       return this.buildCescaTanChair(data);
        if (data.furnitureType === 'chair_textile_wood_arm') return this.buildTextileWoodArmchair(data);

        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;
        const height = data.height;

        let color = data.color ? parseInt(data.color.replace('#', '0x')) : 0x8b4513;
        if (!data.color) {
            if (data.material === 'metal') color = 0x707070;
            if (data.material === 'fabric') color = 0x4a4a4a;
        }

        // Use cached material via materialService
        const mat = this.materialService.getMaterial(color, 'standard') as THREE.MeshStandardMaterial;

        const seatHeight = height * 0.45;

        // Seat
        const seatGeo = new THREE.BoxGeometry(width, 0.05, length);
        const seat = new THREE.Mesh(seatGeo, mat);
        seat.position.set(0, seatHeight, 0);
        group.add(seat);

        // Backrest
        const backGeo = new THREE.BoxGeometry(width, height * 0.5, 0.05);
        const back = new THREE.Mesh(backGeo, mat);
        back.position.set(0, seatHeight + height * 0.25, -length / 2 + 0.025);
        group.add(back);

        // Legs
        const legSize = 0.03;
        const legGeo = new THREE.BoxGeometry(legSize, seatHeight, legSize);
        const legPositions = [
            [width / 2 - 0.05, seatHeight / 2, length / 2 - 0.05], 
            [-width / 2 + 0.05, seatHeight / 2, length / 2 - 0.05], 
            [width / 2 - 0.05, seatHeight / 2, -length / 2 + 0.05], 
            [-width / 2 + 0.05, seatHeight / 2, -length / 2 + 0.05]
        ];
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, mat);
            leg.position.set(pos[0], pos[1], pos[2]);
            group.add(leg);
        });
        return group;
    }

    private buildOakChair(data: FurnitureData, variant: 'solid' | 'slim'): THREE.Group {
        const group = new THREE.Group();
        const width = data.width;
        const length = data.length;
        const height = data.height;
        const seatY = height * 0.50;
        const oakMat = new THREE.MeshStandardMaterial({
            color: variant === 'solid' ? 0xc8954a : 0xd4a35e,
            roughness: 0.55,
            metalness: 0.0,
        });
        const legR = variant === 'solid' ? 0.020 : 0.016;
        const postR = variant === 'solid' ? 0.020 : 0.016;
        const seatThk = variant === 'solid' ? 0.038 : 0.030;

        // ── Seat: thin slab, slight back-tilt for ergonomic look ──────────────
        const seatGeo = new THREE.BoxGeometry(width, seatThk, length * 0.92);
        const seat = new THREE.Mesh(seatGeo, oakMat);
        seat.position.set(0, seatY, length * 0.02);
        seat.rotation.x = 0.04;
        group.add(seat);

        // ── Two back posts: rear seat to backrest, slight backward lean ──────
        const postLen = (height - seatY) + 0.04;
        const postGeo = new THREE.CylinderGeometry(postR * 0.85, postR, postLen, 12);
        const postLean = -0.10;
        [-1, 1].forEach(side => {
            const post = new THREE.Mesh(postGeo, oakMat);
            const baseZ = -length * 0.42;
            post.position.set(
                side * width * 0.44,
                seatY + postLen * 0.5 - 0.02,
                baseZ + Math.tan(-postLean) * (postLen * 0.5),
            );
            post.rotation.x = postLean;
            group.add(post);
        });

        // ── Curved back panel — taller, wider, arched (CylinderGeometry slice) ──
        // Strip wraps around the -Z side of a vertical cylinder so the chord
        // sits along X (post-to-post) and the panel bows backward (-Z) at centre.
        const panelW = width * 0.96;
        const panelH = height * 0.26;
        const panelTopY = height - 0.02;
        const panelArcR = width * 1.0;
        const panelTheta = panelW / panelArcR;
        const panelMat = new THREE.MeshStandardMaterial({
            color: variant === 'solid' ? 0xc8954a : 0xd4a35e,
            roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide,
        });
        // Three.js CylinderGeometry: a surface point at angle θ has position
        // (r·sinθ, y, r·cosθ). To put the open arc on the −Z side of the
        // cylinder (so the chord runs LEFT–RIGHT between the two posts and
        // the panel bows backward), the arc must be centered at θ = π.
        // (The previous value, −π/2, placed the arc on the −X side, which
        // made the panel float to the LEFT of the chair — see screenshot.)
        const panelGeo = new THREE.CylinderGeometry(
            panelArcR, panelArcR, panelH, 20, 1, true,
            Math.PI - panelTheta * 0.5, panelTheta,
        );
        const panel = new THREE.Mesh(panelGeo, panelMat);
        // Cylinder axis sits IN FRONT of the chord by r·cos(θ/2) so the
        // chord ends (at z = −r·cos(θ/2) relative to axis) sit exactly on
        // the rear-post line at world z ≈ −length·0.42, and the arc midpoint
        // (at z = −r relative to axis) bows backward by r·(1 − cos(θ/2)).
        panel.position.set(
            0,
            panelTopY - panelH * 0.5,
            -length * 0.42 + panelArcR * Math.cos(panelTheta * 0.5),
        );
        group.add(panel);

        // ── Four splayed tapered legs ────────────────────────────────────────
        const legH = seatY;
        const legGeo = new THREE.CylinderGeometry(legR * 0.65, legR, legH, 12);
        const legPositions: ReadonlyArray<[number, number]> = [
            [ width * 0.42,  length * 0.38],
            [-width * 0.42,  length * 0.38],
            [ width * 0.42, -length * 0.38],
            [-width * 0.42, -length * 0.38],
        ];
        legPositions.forEach(([x, z]) => {
            const leg = new THREE.Mesh(legGeo, oakMat);
            leg.position.set(x, legH * 0.5, z);
            leg.rotation.z = x > 0 ? -0.09 : 0.09;
            leg.rotation.x = z > 0 ?  0.07 : -0.07;
            group.add(leg);
        });

        // ── Side stretchers (between front & back legs) ──────────────────────
        const stretcherR = legR * 0.55;
        const stretcherY = legH * 0.42;
        const stretcherLen = length * 0.74;
        const sideStretcherGeo = new THREE.CylinderGeometry(stretcherR, stretcherR, stretcherLen, 10);
        [-1, 1].forEach(side => {
            const s = new THREE.Mesh(sideStretcherGeo, oakMat);
            s.rotation.x = Math.PI / 2;
            s.position.set(side * width * 0.40, stretcherY, 0);
            group.add(s);
        });

        // ── H-stretcher: cross-piece connecting the two side stretchers ──────
        const crossGeo = new THREE.CylinderGeometry(stretcherR, stretcherR, width * 0.78, 10);
        const cross = new THREE.Mesh(crossGeo, oakMat);
        cross.rotation.z = Math.PI / 2;
        cross.position.set(0, stretcherY, 0);
        group.add(cross);

        return group;
    }

    /**
     * Slim oak chair — organic, rounded silhouette.
     * Reference: Japanese-style cherry wood chair with rounded oval seat,
     * gently curved trapezoidal back panel, splayed tapered legs.
     * Kept low-poly for performance: ~24 segments on the seat, 12 on legs.
     */
    private buildOakChairSlim(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;
        const seatY = H * 0.50;
        const oak = new THREE.MeshStandardMaterial({ color: 0xc89058, roughness: 0.52, metalness: 0.0 });

        // ── Rounded oval seat (flattened cylinder, oriented horizontally) ────
        const seatGeo = new THREE.CylinderGeometry(W * 0.50, W * 0.50, 0.034, 24, 1);
        const seat = new THREE.Mesh(seatGeo, oak);
        seat.position.set(0, seatY, L * 0.02);
        seat.scale.set(1.0, 1.0, (L * 0.92) / W); // squash to oval (X stays full width, Z compressed)
        group.add(seat);

        // ── Two rear posts that taper up into the back panel ─────────────────
        const postBaseY = seatY - 0.015;
        const postTopY = H - 0.14;
        const postLen = postTopY - postBaseY;
        const postLean = -0.08;
        const postGeo = new THREE.CylinderGeometry(0.013, 0.020, postLen, 12);
        [-1, 1].forEach(side => {
            const post = new THREE.Mesh(postGeo, oak);
            post.position.set(
                side * W * 0.42,
                (postBaseY + postTopY) * 0.5,
                -L * 0.40 + Math.tan(-postLean) * (postLen * 0.5),
            );
            post.rotation.x = postLean;
            group.add(post);
        });

        // ── Curved back panel (chord along X, bows -Z) ───────────────────────
        const panelW = W * 0.92;
        const panelH = H * 0.18;
        const panelArcR = W * 1.0;
        const panelTheta = panelW / panelArcR;
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0xc89058, roughness: 0.52, metalness: 0.0, side: THREE.DoubleSide,
        });
        // See solid-chair comment above: arc must be centered at θ = π so the
        // open strip lies on the −Z side of the cylinder (chord left↔right,
        // bow backward). −π/2 placed it on the −X side (panel floats LEFT).
        const panelGeo = new THREE.CylinderGeometry(
            panelArcR, panelArcR, panelH, 18, 1, true,
            Math.PI - panelTheta * 0.5, panelTheta,
        );
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(
            0,
            H - 0.14 + panelH * 0.5,
            -L * 0.40 + panelArcR * Math.cos(panelTheta * 0.5),
        );
        group.add(panel);

        // ── Four splayed tapered legs (centered under elliptical seat) ───────
        // Seat ellipse extends to x=±W*0.5, z=±L*0.46. Legs sit safely inside:
        // x=±W*0.34, z=±L*0.30 keeps them well within the seat footprint.
        const legH = seatY;
        const legGeo = new THREE.CylinderGeometry(0.012, 0.022, legH, 12);
        const legPositions: ReadonlyArray<[number, number]> = [
            [ W * 0.34,  L * 0.30],
            [-W * 0.34,  L * 0.30],
            [ W * 0.34, -L * 0.30],
            [-W * 0.34, -L * 0.30],
        ];
        legPositions.forEach(([x, z]) => {
            const leg = new THREE.Mesh(legGeo, oak);
            leg.position.set(x, legH * 0.5, z);
            leg.rotation.z = x > 0 ? -0.10 : 0.10;
            leg.rotation.x = z > 0 ?  0.08 : -0.08;
            group.add(leg);
        });

        return group;
    }

    /**
     * Mid-century oak chair with upholstered curved back and plump seat.
     *
     * Reference: a light-oak dining chair with four splayed tapered legs,
     * an oval boucle seat cushion, and a curved upholstered back band held
     * by two rear oak posts that rise from the seat to wrap behind the back.
     */
    private buildOakCurvedUpholsteredChair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;
        const seatY = H * 0.50;

        const oak = new THREE.MeshStandardMaterial({
            color: 0xc89058, roughness: 0.55, metalness: 0.0,
        });
        const textile = new THREE.MeshStandardMaterial({
            color: 0xe6e1d6, roughness: 0.95, metalness: 0.0,
        });

        // ── Plump oval boucle seat (rounded cushion, squashed to oval) ──────
        const seatThk = 0.08;
        const seatGeo = ChairBuilder._plumpCushion(W * 0.96, seatThk, W * 0.96);
        const seat = new THREE.Mesh(seatGeo, textile);
        seat.position.set(0, seatY + seatThk * 0.5, L * 0.02);
        seat.scale.set(1.0, 1.0, (L * 0.92) / (W * 0.96)); // squash to oval
        group.add(seat);

        // ── Curved upholstered back band — one extruded, bevelled annulus ───
        // Single watertight mesh: an annular sector in XY (bowing +Y), extruded
        // along +Z with a uniform bevel, then rotated so depth becomes height.
        // After rotation, +Y → −Z (the band bows behind the chair) and the
        // bevel rounds all 12 edges including the top/bottom and front/back.
        const backH       = H * 0.28;
        const backArcR    = W * 0.95;
        const backTheta   = (W * 0.92) / backArcR;
        const backThk     = 0.05;
        const backCY      = H - 0.10 + backH * 0.5 - 0.05;
        const backCZ      = -L * 0.40 + backArcR * Math.cos(backTheta * 0.5);

        const halfTheta   = backTheta * 0.5;
        const innerR      = backArcR - backThk * 0.5;
        const outerR      = backArcR + backThk * 0.5;
        const backShape   = new THREE.Shape();
        backShape.absarc(0, 0, outerR, Math.PI / 2 - halfTheta, Math.PI / 2 + halfTheta, false);
        backShape.absarc(0, 0, innerR, Math.PI / 2 + halfTheta, Math.PI / 2 - halfTheta, true);

        const backBevel = Math.min(0.025, backThk * 0.4, backH * 0.4);
        const backGeo   = new THREE.ExtrudeGeometry(backShape, {
            depth:          Math.max(backH - backBevel * 2, 0.001),
            bevelEnabled:   true,
            bevelSegments:  4,
            bevelSize:      backBevel,
            bevelThickness: backBevel,
            curveSegments:  24,
        });
        // Centre the extrusion in its local Z and lay it on its side so the
        // extrusion axis becomes vertical Y.
        backGeo.translate(0, 0, -(backH / 2 - backBevel));
        backGeo.rotateX(-Math.PI / 2);
        backGeo.computeVertexNormals();
        const back = new THREE.Mesh(backGeo, textile);
        back.position.set(0, backCY, backCZ);
        group.add(back);

        // ── Two oak side posts (one continuous piece per side) ──────────────
        // Replaces the previous separate "rear post + small back cap" pair.
        // Each post is one rectangular oak block running from just under the
        // seat up to the top of the back band, hugging the band's outer edge.
        const sidePostBaseY = seatY - 0.02;
        const sidePostTopY  = backCY + backH * 0.5 + 0.005;
        const sidePostH     = sidePostTopY - sidePostBaseY;
        // Cylindrical posts in the same tapered profile as the legs.
        const sidePostGeo   = new THREE.CylinderGeometry(0.020, 0.024, sidePostH, 14);
        [-1, 1].forEach(side => {
            const post = new THREE.Mesh(sidePostGeo, oak);
            post.position.set(
                side * backArcR * Math.sin(halfTheta) * 0.92,
                (sidePostBaseY + sidePostTopY) * 0.5,
                -L * 0.40,
            );
            group.add(post);
        });

        // ── Four nearly-straight tapered oak legs ───────────────────────────
        const legH = seatY;
        const legGeo = new THREE.CylinderGeometry(0.020, 0.030, legH, 12);
        const legPositions: ReadonlyArray<[number, number]> = [
            [ W * 0.38,  L * 0.34],
            [-W * 0.38,  L * 0.34],
            [ W * 0.38, -L * 0.34],
            [-W * 0.38, -L * 0.34],
        ];
        legPositions.forEach(([x, z]) => {
            const leg = new THREE.Mesh(legGeo, oak);
            leg.position.set(x, legH * 0.5, z);
            leg.rotation.z = 0;
            leg.rotation.x = 0;
            group.add(leg);
        });

        return group;
    }

    /**
     * Three-legged terracotta tub chair.
     *
     * Reference: a chunky, rounded tub-style armchair with a circular boucle
     * seat cushion, a curved horseshoe textile back wrapping ~270°, and three
     * thick rectangular light-oak legs that rise straight from the floor up
     * past the seat to support the back cushion (two front, one rear-centre).
     */
    private buildThreeLegTerracottaChair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const H = data.height;
        void data.length;

        const seatY     = H * 0.46;          // top of the seat cushion's wood support
        const backCY    = H * 0.86;          // vertical centre of the back band

        // Light ash/oak wood (slightly cooler than the curved-uph chair's oak)
        const wood = new THREE.MeshStandardMaterial({
            color: 0xd6b58a, roughness: 0.55, metalness: 0.0,
        });
        // Warm terracotta boucle textile
        const textile = new THREE.MeshStandardMaterial({
            color: 0xb85c4a, roughness: 0.95, metalness: 0.0,
        });

        // ── Plump elliptical boucle seat cushion ─────────────────────────────
        // Slightly wider side-to-side than front-to-back so it visually fits
        // inside the horseshoe back without crowding the front posts.
        const seatThk    = 0.06;
        const seatRadius = W * 0.42;
        const seatGeo = ChairBuilder._plumpCushion(seatRadius * 2, seatThk, seatRadius * 2);
        const seat = new THREE.Mesh(seatGeo, textile);
        seat.position.set(0, seatY + seatThk * 0.5, 0);
        seat.scale.set(1.10, 1.0, 0.92); // ellipse: wider + slightly squashed
        group.add(seat);

        // ── Curved horseshoe back band (extruded annulus, opens forward) ─────
        // Wraps ~210° around the back so it has visible "arm-like" ends curving
        // forward, like the reference. Single watertight bevelled mesh.
        const backH      = H * 0.20;
        const backArcR   = seatRadius + 0.04;
        const backTheta  = Math.PI * 1.17;        // ≈ 210° arc
        const backThk    = 0.035;

        const halfTheta  = backTheta * 0.5;
        const innerR     = backArcR - backThk * 0.5;
        const outerR     = backArcR + backThk * 0.5;

        // Extend the band's two open ends with short straight tangent stubs
        // so the back arc continues forward a touch past the curve, like the
        // small straight returns visible in the reference photo.
        const extLen   = 0.09;
        const angStart = Math.PI / 2 - halfTheta;
        const angEnd   = Math.PI / 2 + halfTheta;

        // End points on outer + inner arcs
        const cosE = Math.cos(angEnd),   sinE = Math.sin(angEnd);
        const cosS = Math.cos(angStart), sinS = Math.sin(angStart);
        const oE = [outerR * cosE, outerR * sinE];
        const iE = [innerR * cosE, innerR * sinE];
        const oS = [outerR * cosS, outerR * sinS];
        const iS = [innerR * cosS, innerR * sinS];

        // Tangent extension vectors (CCW tangent at each end, pointing forward
        // out of the arc's open mouth).
        const tEx = -sinE, tEy = cosE;          // tangent at angEnd
        const tSx =  sinS, tSy = -cosS;         // backward-tangent at angStart
        const oExtE = [oE[0] + tEx * extLen, oE[1] + tEy * extLen];
        const iExtE = [iE[0] + tEx * extLen, iE[1] + tEy * extLen];
        const oExtS = [oS[0] + tSx * extLen, oS[1] + tSy * extLen];
        const iExtS = [iS[0] + tSx * extLen, iS[1] + tSy * extLen];

        const backShape  = new THREE.Shape();
        backShape.moveTo(oExtS[0], oExtS[1]);
        backShape.lineTo(oS[0], oS[1]);
        backShape.absarc(0, 0, outerR, angStart, angEnd, false);
        backShape.lineTo(oExtE[0], oExtE[1]);
        backShape.lineTo(iExtE[0], iExtE[1]);
        backShape.lineTo(iE[0], iE[1]);
        backShape.absarc(0, 0, innerR, angEnd, angStart, true);
        backShape.lineTo(iExtS[0], iExtS[1]);
        backShape.closePath();

        const backBevel  = Math.min(0.04, backThk * 0.45, backH * 0.45);
        const backGeo    = new THREE.ExtrudeGeometry(backShape, {
            depth:          Math.max(backH - backBevel * 2, 0.001),
            bevelEnabled:   true,
            bevelSegments:  5,
            bevelSize:      backBevel,
            bevelThickness: backBevel,
            curveSegments:  28,
        });
        backGeo.translate(0, 0, -(backH / 2 - backBevel));
        backGeo.rotateX(-Math.PI / 2);
        backGeo.computeVertexNormals();
        const back = new THREE.Mesh(backGeo, textile);
        back.position.set(0, backCY, 0);
        group.add(back);

        // ── Three rectangular light-oak posts (floor → back cushion) ─────────
        // Two front (at the ends of the horseshoe, where it curves forward) and
        // one rear-centre. Each post is a tapered rounded box that rises from
        // the floor right up to the underside of the back band.
        const postTopY  = backCY - backH * 0.5 + 0.03;
        const postH     = postTopY;
        const postW     = 0.075;       // tangential width (kept)
        const postD     = 0.045;       // radial thickness (slimmed)
        const postR     = 0.018;       // edge bevel for slightly curved corners
        const postGeo   = ChairBuilder._roundedBox(postW, postH, postD, postR, 3);

        // Back band is centred on −Z and spans ±halfTheta around it. Its two
        // open ends therefore sit at world (±R·sin(halfTheta), 0, +R·|cos|),
        // i.e. forward of origin. Rear-centre post sits behind, at (0, 0, −R).
        const endX = backArcR * Math.sin(halfTheta);
        const endZ = -backArcR * Math.cos(halfTheta);
        const postPositions: ReadonlyArray<[number, number]> = [
            [ endX, endZ],
            [-endX, endZ],
            [    0, -backArcR],
        ];
        postPositions.forEach(([x, z]) => {
            const post = new THREE.Mesh(postGeo, wood);
            post.position.set(x, postH * 0.5, z);
            // Rotate post so its broad face points radially outward.
            post.rotation.y = Math.atan2(x, z);
            group.add(post);
        });

        return group;
    }

    /**
     * Obejita 3-leg curved chair — same horseshoe-back / elliptical-seat
     * silhouette as the terracotta version, but in matte black metal posts and
     * "obejita" off-white boucle textile (warm-cream sherpa look). Defined as
     * its own private build so future style tweaks (post profile, sheen,
     * cushion plumpness) don't bleed back into the terracotta variant.
     */
    private buildThreeLegObejitaBlackChair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const H = data.height;
        void data.length;

        const seatY  = H * 0.46;
        const backCY = H * 0.86;

        // Matte black-metal posts — slight metalness for a satin sheen, not chrome.
        const metal = new THREE.MeshStandardMaterial({
            color: 0x141414, roughness: 0.55, metalness: 0.55,
        });
        // Obejita boucle — warm off-white with the same matte fabric profile
        // used for white sofas and the terracotta cushions.
        const textile = new THREE.MeshStandardMaterial({
            color: 0xf2ece1, roughness: 0.95, metalness: 0.0,
        });

        // ── Plump elliptical boucle seat cushion ─────────────────────────────
        const seatThk    = 0.06;
        const seatRadius = W * 0.42;
        const seatGeo = ChairBuilder._plumpCushion(seatRadius * 2, seatThk, seatRadius * 2);
        const seat = new THREE.Mesh(seatGeo, textile);
        seat.position.set(0, seatY + seatThk * 0.5, 0);
        seat.scale.set(1.10, 1.0, 0.92);
        group.add(seat);

        // ── Curved horseshoe back band (extruded annulus, opens forward) ─────
        const backH      = H * 0.20;
        const backArcR   = seatRadius + 0.04;
        const backTheta  = Math.PI * 1.17;
        const backThk    = 0.035;

        const halfTheta  = backTheta * 0.5;
        const innerR     = backArcR - backThk * 0.5;
        const outerR     = backArcR + backThk * 0.5;

        const extLen   = 0.09;
        const angStart = Math.PI / 2 - halfTheta;
        const angEnd   = Math.PI / 2 + halfTheta;
        const cosE = Math.cos(angEnd),   sinE = Math.sin(angEnd);
        const cosS = Math.cos(angStart), sinS = Math.sin(angStart);
        const oE = [outerR * cosE, outerR * sinE];
        const iE = [innerR * cosE, innerR * sinE];
        const oS = [outerR * cosS, outerR * sinS];
        const iS = [innerR * cosS, innerR * sinS];
        const tEx = -sinE, tEy = cosE;
        const tSx =  sinS, tSy = -cosS;
        const oExtE = [oE[0] + tEx * extLen, oE[1] + tEy * extLen];
        const iExtE = [iE[0] + tEx * extLen, iE[1] + tEy * extLen];
        const oExtS = [oS[0] + tSx * extLen, oS[1] + tSy * extLen];
        const iExtS = [iS[0] + tSx * extLen, iS[1] + tSy * extLen];

        const backShape  = new THREE.Shape();
        backShape.moveTo(oExtS[0], oExtS[1]);
        backShape.lineTo(oS[0], oS[1]);
        backShape.absarc(0, 0, outerR, angStart, angEnd, false);
        backShape.lineTo(oExtE[0], oExtE[1]);
        backShape.lineTo(iExtE[0], iExtE[1]);
        backShape.lineTo(iE[0], iE[1]);
        backShape.absarc(0, 0, innerR, angEnd, angStart, true);
        backShape.lineTo(iExtS[0], iExtS[1]);
        backShape.closePath();

        const backBevel  = Math.min(0.04, backThk * 0.45, backH * 0.45);
        const backGeo    = new THREE.ExtrudeGeometry(backShape, {
            depth:          Math.max(backH - backBevel * 2, 0.001),
            bevelEnabled:   true,
            bevelSegments:  5,
            bevelSize:      backBevel,
            bevelThickness: backBevel,
            curveSegments:  28,
        });
        backGeo.translate(0, 0, -(backH / 2 - backBevel));
        backGeo.rotateX(-Math.PI / 2);
        backGeo.computeVertexNormals();
        const back = new THREE.Mesh(backGeo, textile);
        back.position.set(0, backCY, 0);
        group.add(back);

        // ── Three rectangular black-metal posts (floor → underside of back) ──
        // The reference photo shows chunkier, almost square posts with sharp
        // edges — bumped slightly up and the radial thickness widened to read
        // as solid metal, not slim oak.
        const postTopY  = backCY - backH * 0.5 + 0.03;
        const postH     = postTopY;
        const postW     = 0.085;       // tangential width
        const postD     = 0.060;       // radial thickness (chunkier than terracotta)
        const postR     = 0.010;       // tighter bevel — metal reads with sharper edges
        const postGeo   = ChairBuilder._roundedBox(postW, postH, postD, postR, 3);

        const endX = backArcR * Math.sin(halfTheta);
        const endZ = -backArcR * Math.cos(halfTheta);
        const postPositions: ReadonlyArray<[number, number]> = [
            [ endX, endZ],
            [-endX, endZ],
            [    0, -backArcR],
        ];
        postPositions.forEach(([x, z]) => {
            const post = new THREE.Mesh(postGeo, metal);
            post.position.set(x, postH * 0.5, z);
            post.rotation.y = Math.atan2(x, z);
            group.add(post);
        });

        return group;
    }

    /**
     * Obejita 4-leg wood tub chair — companion to the 3-leg obejita-black
     * variant but with the wood-frame tub-chair anatomy from the reference
     * photo: four warm-oak posts at the corners (front pair short, back pair
     * tall continuing up to support the back band), one thick deep boucle
     * cushion that drops below seat-top to read as a generous tub seat, and a
     * curved horseshoe back band that wraps from one tall back post around to
     * the other. Cushion is intentionally taller than the 3-leg variant so
     * the silhouette reads "armchair" rather than "dining chair".
     */
    private buildFourLegObejitaWoodChair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;

        // ── Materials ────────────────────────────────────────────────────────
        // Warm light-oak — matches the reference photo's frame tone.
        const wood = new THREE.MeshStandardMaterial({
            color: 0xc59668, roughness: 0.55, metalness: 0.0,
        });
        // Same obejita off-white boucle as the 3-leg sibling.
        const textile = new THREE.MeshStandardMaterial({
            color: 0xf2ece1, roughness: 0.95, metalness: 0.0,
        });

        // ── Heights & footprint ─────────────────────────────────────────────
        // Cushion bottom sits LOW (≈ 24% of H) so the seat reads as a deep
        // tub-chair pad, not a thin pancake. Cushion top is the conventional
        // 46% — i.e. cushion thickness ≈ 22% of H ≈ 17 cm at default scale.
        const seatBotY = H * 0.24;
        const seatTopY = H * 0.46;
        const seatThk  = seatTopY - seatBotY;
        const seatCY   = (seatTopY + seatBotY) * 0.5;

        const backH    = H * 0.22;        // back band slightly thicker than 3-leg
        const backCY   = H * 0.78;        // sits comfortably above seat top

        // Footprint: legs land at ±X, ±Z near the chair's outer envelope.
        const halfX    = W * 0.42;
        const halfZ    = L * 0.42;

        // ── Plump rectangular boucle cushion (fills the footprint) ──────────
        const cushW = W * 0.84;
        const cushL = L * 0.84;
        const cushGeo = ChairBuilder._plumpCushion(cushW, seatThk, cushL);
        const cushion = new THREE.Mesh(cushGeo, textile);
        cushion.position.set(0, seatCY, 0);
        group.add(cushion);

        // ── Curved horseshoe back band (extruded annulus, opens forward) ────
        // Slightly tighter wrap than the 3-leg chair so the band terminates
        // at the back-post line instead of curving forward past it.
        const backArcR  = Math.max(W, L) * 0.42;
        const backTheta = Math.PI * 1.05;        // ≈ 189°, wraps mostly around back

        const halfTheta = backTheta * 0.5;
        const backThk   = 0.06;                  // chunkier than 3-leg's 0.035
        const innerR    = backArcR - backThk * 0.5;
        const outerR    = backArcR + backThk * 0.5;

        const angStart  = Math.PI / 2 - halfTheta;
        const angEnd    = Math.PI / 2 + halfTheta;

        const backShape = new THREE.Shape();
        backShape.absarc(0, 0, outerR, angStart, angEnd, false);
        backShape.absarc(0, 0, innerR, angEnd,   angStart, true);

        const backBevel = Math.min(0.05, backThk * 0.45, backH * 0.40);
        const backGeo   = new THREE.ExtrudeGeometry(backShape, {
            depth:          Math.max(backH - backBevel * 2, 0.001),
            bevelEnabled:   true,
            bevelSegments:  5,
            bevelSize:      backBevel,
            bevelThickness: backBevel,
            curveSegments:  28,
        });
        backGeo.translate(0, 0, -(backH / 2 - backBevel));
        backGeo.rotateX(-Math.PI / 2);
        backGeo.computeVertexNormals();
        const back = new THREE.Mesh(backGeo, textile);
        back.position.set(0, backCY, 0);
        group.add(back);

        // ── 4 wooden corner posts ───────────────────────────────────────────
        // Front pair (positive Z): stop at seat-top + small reveal so the
        //   cushion appears to sit between them.
        // Back pair (negative Z): rise all the way up to the back-band centre
        //   so the boucle horseshoe visually rests on them.
        // Posts are square-section in the reference photo — 60 mm × 60 mm
        // with a tiny bevel for a softened-but-crisp wood edge.
        const postT = 0.06;
        const postR = 0.008;

        const frontPostH = seatTopY + 0.04;          // small reveal above cushion
        const backPostH  = backCY + backH * 0.5 + 0.005; // up to top edge of back band

        const frontGeo = ChairBuilder._roundedBox(postT, frontPostH, postT, postR, 3);
        const backGeo2 = ChairBuilder._roundedBox(postT, backPostH,  postT, postR, 3);

        // Front-left, front-right
        ([[-halfX, +halfZ], [+halfX, +halfZ]] as [number, number][]).forEach(([x, z]) => {
            const leg = new THREE.Mesh(frontGeo, wood);
            leg.position.set(x, frontPostH * 0.5, z);
            group.add(leg);
        });
        // Back-left, back-right
        ([[-halfX, -halfZ], [+halfX, -halfZ]] as [number, number][]).forEach(([x, z]) => {
            const leg = new THREE.Mesh(backGeo2, wood);
            leg.position.set(x, backPostH * 0.5, z);
            group.add(leg);
        });

        return group;
    }

    /**
     * Barcelona-style lounge chair — black leather seat & back on a chrome
     * cantilevered X-frame.
     *
     * Anatomy (matches the reference photo):
     *  • Two thick leather pads — seat (slightly tilted back, toward −Z) and
     *    back (also tilted back from vertical), built as plump cushions with a
     *    tufting grid of small dimples to read as the iconic Barcelona quilt.
     *  • Per side, a chrome X-frame: two crossed flat-steel arcs, modelled as
     *    `THREE.TubeGeometry` along quadratic Bézier curves. One arc supports
     *    the seat (front-floor → behind seat); the other supports the back
     *    (back-floor → above seat front). They cross under the seat.
     *  • Two transverse chrome rails connect the left/right frames at the
     *    points where the cushions meet them.
     *
     * Origin: floor centre. +Z = front of chair.
     */
    private buildBarcelonaBlackChair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;

        // ── Materials ────────────────────────────────────────────────────────
        // Black leather — low-roughness for a slight specular highlight that
        // reads as polished hide rather than matte fabric.
        const leather = new THREE.MeshStandardMaterial({
            color: 0x121212, roughness: 0.42, metalness: 0.05,
        });
        // Slightly darker dimples for the tufting pattern.
        const tuft = new THREE.MeshStandardMaterial({
            color: 0x050505, roughness: 0.45, metalness: 0.05,
        });
        // Polished stainless-steel chrome.
        const chrome = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
        });

        // ── Layout constants ─────────────────────────────────────────────────
        // Seat plane: low (≈ 38% H at the front edge), tilts ~14° back so its
        // front edge sits noticeably higher than its rear edge — the classic
        // Barcelona "scoop" where the seat slopes down into the backrest.
        const seatTopY  = H * 0.38;
        const seatThk   = 0.10;
        const seatTilt  = THREE.MathUtils.degToRad(14);  // recline back

        // Back plane: rises from behind the seat, tilts ~14° back from vertical.
        const backTilt   = THREE.MathUtils.degToRad(14);
        const backH      = H * 0.74;                     // tall back, lounge proportions
        const backThk    = 0.10;
        // Hinge point where seat back meets the back-rest base.
        const hingeY     = seatTopY;
        const hingeZ     = -L * 0.18;                    // recessed behind seat centre

        // Frame side offset and ground footprint.
        const sideX      = W * 0.46;                     // outboard of cushions
        const halfL      = L * 0.50;
        const tubeR      = 0.022;                        // chrome rod thickness

        // ── Seat cushion (plump tufted pad, tilted back) ─────────────────────
        // Pivot the seat around its REAR edge (not its centre) so increasing
        // `seatTilt` rotates the front edge upward while keeping the rear edge
        // anchored at the hinge where it meets the backrest. Without this the
        // seat would simply rock around its centre and the rear edge would
        // float above the hinge.
        const seatW = W * 0.84;
        const seatL = L * 0.78;
        const seatGroup = new THREE.Group();
        const seatGeo = ChairBuilder._roundedBox(seatW, seatThk, seatL, 0.025, 3);
        // Translate the geometry so the rear edge of its top face sits at the
        // local origin: top face at y=0, rear edge at z=0.
        seatGeo.translate(0, -seatThk * 0.5, seatL * 0.5);
        const seatMesh = new THREE.Mesh(seatGeo, leather);
        seatGroup.add(seatMesh);
        // Tufting grid: 4 (X) × 3 (Z) dimples sitting on the top face. Local
        // frame after the geometry translate: top face = y 0, rear edge = z 0,
        // front edge = z +seatL.
        const dimpleR = Math.min(seatW, seatL) * 0.04;
        for (let ix = 0; ix < 4; ix++) {
            for (let iz = 0; iz < 3; iz++) {
                const x = (ix - 1.5) * (seatW * 0.22);
                const z = seatL * 0.5 + (iz - 1) * (seatL * 0.26);
                const d = new THREE.Mesh(
                    new THREE.SphereGeometry(dimpleR, 10, 8),
                    tuft,
                );
                d.position.set(x, -dimpleR * 0.35, z);
                d.scale.set(1, 0.45, 1);
                seatGroup.add(d);
            }
        }
        // Anchor the rear-edge top of the seat at the hinge point and tilt
        // around that axis — the front edge DROPS while the rear stays put,
        // so the seat slopes down toward the front (Barcelona "scoop" — rear
        // sits high at the backrest, front lowers toward the floor).
        seatGroup.position.set(0, hingeY, hingeZ);
        seatGroup.rotation.x = -seatTilt;
        group.add(seatGroup);

        // ── Backrest cushion (plump tufted pad, tilted backward) ─────────────
        const backW   = W * 0.84;
        const backLen = backH;               // height along its own local axis
        const backGroup = new THREE.Group();
        const backGeo = ChairBuilder._roundedBox(backW, backThk, backLen, 0.025, 3);
        const backMesh = new THREE.Mesh(backGeo, leather);
        backMesh.rotation.x = Math.PI / 2;   // stand the pad upright
        backGroup.add(backMesh);
        // Tufting grid on its front face: 4 × 5 dimples
        for (let ix = 0; ix < 4; ix++) {
            for (let iy = 0; iy < 5; iy++) {
                const x = (ix - 1.5) * (backW * 0.22);
                const y = (iy - 2)   * (backLen * 0.18);
                const d = new THREE.Mesh(
                    new THREE.SphereGeometry(dimpleR, 10, 8),
                    tuft,
                );
                // Front face of the upright pad faces +Z (before group tilt).
                d.position.set(x, y, backThk * 0.5 - dimpleR * 0.35);
                d.scale.set(1, 1, 0.45);
                backGroup.add(d);
            }
        }
        // Position so its base is at the hinge, then tilt.
        backGroup.position.set(0, hingeY + backLen * 0.5 - 0.02, hingeZ);
        backGroup.rotation.x = -backTilt;    // top leans backward (toward −Z)
        group.add(backGroup);

        // ── Chrome X-frame (two curved arcs per side + two transverse rails) ─
        // Arc A — seat support: front-floor up and back to under the seat-back
        // hinge area. Arc B — back support: back-floor up and forward to under
        // the front edge of the seat. The two arcs visually cross under the
        // cushion.
        const buildArc = (
            from: THREE.Vector3,
            ctrl: THREE.Vector3,
            to: THREE.Vector3,
            sx: number,
        ) => {
            const curve = new THREE.QuadraticBezierCurve3(
                from.clone().setX(sx * Math.abs(from.x)),
                ctrl.clone().setX(sx * Math.abs(ctrl.x)),
                to  .clone().setX(sx * Math.abs(to.x)),
            );
            const tube = new THREE.TubeGeometry(curve, 28, tubeR, 12, false);
            return new THREE.Mesh(tube, chrome);
        };

        // Anchor heights / depths chosen to mirror the Barcelona silhouette.
        const arcAFrom = new THREE.Vector3(sideX, 0.0,            +halfL);            // front floor
        const arcACtrl = new THREE.Vector3(sideX, seatTopY * 0.55, 0.0);              // mid, low
        const arcATo   = new THREE.Vector3(sideX, hingeY + 0.02,   hingeZ + 0.02);    // hinge area

        const arcBFrom = new THREE.Vector3(sideX, 0.0,             -halfL);           // back floor
        const arcBCtrl = new THREE.Vector3(sideX, seatTopY * 0.55,  0.0);             // mid, low
        const arcBTo   = new THREE.Vector3(sideX, seatTopY - 0.01, +halfL * 0.85);    // front-of-seat

        [-1, +1].forEach(sx => {
            group.add(buildArc(arcAFrom, arcACtrl, arcATo, sx));
            group.add(buildArc(arcBFrom, arcBCtrl, arcBTo, sx));
        });

        // Transverse cross-rails connecting the two side frames at the two
        // top anchor points (under hinge, and at front-of-seat).
        const railGeo1 = new THREE.CylinderGeometry(tubeR, tubeR, sideX * 2, 16);
        railGeo1.rotateZ(Math.PI / 2);                       // align along X
        const railTop = new THREE.Mesh(railGeo1, chrome);
        railTop.position.set(0, arcATo.y, arcATo.z);
        group.add(railTop);

        const railFront = new THREE.Mesh(railGeo1.clone(), chrome);
        railFront.position.set(0, arcBTo.y, arcBTo.z);
        group.add(railFront);

        return group;
    }

    /**
     * Barcelona ottoman / footstool — companion piece for the Barcelona
     * lounge chair. Same chrome cantilevered X-frame and tufted black-leather
     * pad, but lower (≈ 40 cm tall), no backrest, and the seat is flat (not
     * scooped) so it can double as a stool or footrest.
     */
    private buildBarcelonaOttoman(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;

        // ── Materials (shared palette with the lounge chair) ─────────────────
        const leather = new THREE.MeshStandardMaterial({
            color: 0x121212, roughness: 0.42, metalness: 0.05,
        });
        const tuft = new THREE.MeshStandardMaterial({
            color: 0x050505, roughness: 0.45, metalness: 0.05,
        });
        const chrome = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
        });

        // ── Layout constants ─────────────────────────────────────────────────
        // Stool height — top of pad sits at ≈ 92 % of overall H so the
        // remaining 8 % is the chrome reveal under the cushion.
        const seatTopY = H * 0.92;
        const seatThk  = 0.10;
        const sideX    = W * 0.46;
        const halfL    = L * 0.50;
        const tubeR    = 0.022;

        // ── Tufted leather pad (flat, 4×3 dimples) ───────────────────────────
        const padW = W * 0.86;
        const padL = L * 0.86;
        const padGroup = new THREE.Group();
        const padGeo = ChairBuilder._roundedBox(padW, seatThk, padL, 0.025, 3);
        padGroup.add(new THREE.Mesh(padGeo, leather));
        const dimpleR = Math.min(padW, padL) * 0.045;
        for (let ix = 0; ix < 4; ix++) {
            for (let iz = 0; iz < 3; iz++) {
                const x = (ix - 1.5) * (padW * 0.22);
                const z = (iz - 1)   * (padL * 0.26);
                const d = new THREE.Mesh(
                    new THREE.SphereGeometry(dimpleR, 10, 8),
                    tuft,
                );
                d.position.set(x, seatThk * 0.5 - dimpleR * 0.35, z);
                d.scale.set(1, 0.45, 1);
                padGroup.add(d);
            }
        }
        padGroup.position.set(0, seatTopY - seatThk * 0.5, 0);
        group.add(padGroup);

        // ── Chrome X-frame (per side: two crossed Bézier arcs) ───────────────
        const buildArc = (
            from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3, sx: number,
        ) => {
            const curve = new THREE.QuadraticBezierCurve3(
                from.clone().setX(sx * Math.abs(from.x)),
                ctrl.clone().setX(sx * Math.abs(ctrl.x)),
                to.clone()  .setX(sx * Math.abs(to.x)),
            );
            return new THREE.Mesh(
                new THREE.TubeGeometry(curve, 24, tubeR, 12, false),
                chrome,
            );
        };

        // Arc A — front-floor → rear-top of pad
        const aF = new THREE.Vector3(sideX, 0,                +halfL);
        const aC = new THREE.Vector3(sideX, seatTopY * 0.55,  0);
        const aT = new THREE.Vector3(sideX, seatTopY - 0.005, -halfL * 0.85);
        // Arc B — back-floor → front-top of pad
        const bF = new THREE.Vector3(sideX, 0,                -halfL);
        const bC = new THREE.Vector3(sideX, seatTopY * 0.55,  0);
        const bT = new THREE.Vector3(sideX, seatTopY - 0.005, +halfL * 0.85);

        [-1, +1].forEach(sx => {
            group.add(buildArc(aF, aC, aT, sx));
            group.add(buildArc(bF, bC, bT, sx));
        });

        // Two transverse cross-rails connecting left/right frames at the
        // pad anchor points.
        const railGeo = new THREE.CylinderGeometry(tubeR, tubeR, sideX * 2, 16);
        railGeo.rotateZ(Math.PI / 2);
        const railRear = new THREE.Mesh(railGeo, chrome);
        railRear.position.set(0, aT.y, aT.z);
        group.add(railRear);
        const railFront = new THREE.Mesh(railGeo.clone(), chrome);
        railFront.position.set(0, bT.y, bT.z);
        group.add(railFront);

        return group;
    }

    /**
     * Shared Barcelona-style materials & geometry helpers used by the sofa
     * variants below. Returns the canonical leather / tuft / chrome trio so
     * every Barcelona piece reads as the same family.
     */
    private _barcelonaMaterials() {
        return {
            leather: new THREE.MeshStandardMaterial({
                color: 0x121212, roughness: 0.42, metalness: 0.05,
            }),
            tuft: new THREE.MeshStandardMaterial({
                color: 0x050505, roughness: 0.45, metalness: 0.05,
            }),
            chrome: new THREE.MeshStandardMaterial({
                color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
            }),
        };
    }

    /**
     * Build one X-frame side panel (two crossing chrome arcs) at a given
     * X-offset, oriented along the local +Z = front axis. Used by both the
     * straight Barcelona sofa and the corner unit so every divider/arm
     * shares the same silhouette as the lounge chair.
     */
    private _barcelonaXFrame(
        group: THREE.Group,
        chrome: THREE.MeshStandardMaterial,
        x: number,
        seatTopY: number,
        hingeY: number,
        hingeZ: number,
        halfL: number,
        tubeR: number,
    ): { topZ: number; topY: number; frontZ: number; frontY: number } {
        const buildArc = (
            from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3,
        ) => {
            const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to);
            return new THREE.Mesh(
                new THREE.TubeGeometry(curve, 28, tubeR, 12, false),
                chrome,
            );
        };
        // Arc A — front-floor → just under the seat-back hinge
        const aF = new THREE.Vector3(x, 0.0,             +halfL);
        const aC = new THREE.Vector3(x, seatTopY * 0.55,  0.0);
        const aT = new THREE.Vector3(x, hingeY + 0.02,    hingeZ + 0.02);
        // Arc B — back-floor → just under the front edge of the seat
        const bF = new THREE.Vector3(x, 0.0,             -halfL);
        const bC = new THREE.Vector3(x, seatTopY * 0.55,  0.0);
        const bT = new THREE.Vector3(x, seatTopY - 0.01,  +halfL * 0.85);
        group.add(buildArc(aF, aC, aT));
        group.add(buildArc(bF, bC, bT));
        return { topZ: aT.z, topY: aT.y, frontZ: bT.z, frontY: bT.y };
    }

    /**
     * Barcelona-style sofa (1, 2 or 3-seat). Same scoop-tilted leather seat
     * and tilted backrest as the lounge chair, but stretched along X with
     * one chrome X-frame per outer side plus an additional X-frame between
     * each seat unit so the piece reads as a row of joined Barcelona seats.
     *
     * Origin: floor centre. +Z = front of sofa.
     */
    private buildBarcelonaSofa(data: FurnitureData, seats: 1 | 2 | 3): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;
        const { leather, tuft, chrome } = this._barcelonaMaterials();

        // ── Layout constants ─────────────────────────────────────────────────
        const seatTopY = H * 0.38;
        const seatThk  = 0.10;
        const seatTilt = THREE.MathUtils.degToRad(14);
        const backTilt = THREE.MathUtils.degToRad(14);
        const backH    = H * 0.74;
        const backThk  = 0.10;
        const hingeY   = seatTopY;
        const hingeZ   = -L * 0.18;
        const halfL    = L * 0.50;
        const tubeR    = 0.022;
        // Inset from outer edge to first frame plane.
        const sideInset = W * 0.04;
        const seatHalfW = W * 0.50 - sideInset;

        // ── Seat cushion: one continuous tilted pad spanning all seats ───────
        const seatW = seatHalfW * 2;
        const seatL = L * 0.78;
        const seatGroup = new THREE.Group();
        const seatGeo = ChairBuilder._roundedBox(seatW, seatThk, seatL, 0.025, 3);
        seatGeo.translate(0, -seatThk * 0.5, seatL * 0.5);
        seatGroup.add(new THREE.Mesh(seatGeo, leather));
        // Tufting: 4 dimples per seat unit along X, 3 along Z
        const dimpleR = Math.min(L, W / seats) * 0.04;
        const seatDimX = 4 * seats;
        for (let ix = 0; ix < seatDimX; ix++) {
            for (let iz = 0; iz < 3; iz++) {
                const x = (ix - (seatDimX - 1) / 2) * (seatW / (seatDimX + 1));
                const z = seatL * 0.5 + (iz - 1) * (seatL * 0.26);
                const d = new THREE.Mesh(
                    new THREE.SphereGeometry(dimpleR, 10, 8),
                    tuft,
                );
                d.position.set(x, -dimpleR * 0.35, z);
                d.scale.set(1, 0.45, 1);
                seatGroup.add(d);
            }
        }
        seatGroup.position.set(0, hingeY, hingeZ);
        seatGroup.rotation.x = -seatTilt;
        group.add(seatGroup);

        // ── Backrest cushion (one continuous upright tilted pad) ─────────────
        const backW   = seatW;
        const backLen = backH;
        const backGroup = new THREE.Group();
        const backGeo = ChairBuilder._roundedBox(backW, backThk, backLen, 0.025, 3);
        const backMesh = new THREE.Mesh(backGeo, leather);
        backMesh.rotation.x = Math.PI / 2;
        backGroup.add(backMesh);
        const backDimX = 4 * seats;
        for (let ix = 0; ix < backDimX; ix++) {
            for (let iy = 0; iy < 5; iy++) {
                const x = (ix - (backDimX - 1) / 2) * (backW / (backDimX + 1));
                const y = (iy - 2) * (backLen * 0.18);
                const d = new THREE.Mesh(
                    new THREE.SphereGeometry(dimpleR, 10, 8),
                    tuft,
                );
                d.position.set(x, y, backThk * 0.5 - dimpleR * 0.35);
                d.scale.set(1, 1, 0.45);
                backGroup.add(d);
            }
        }
        backGroup.position.set(0, hingeY + backLen * 0.5 - 0.02, hingeZ);
        backGroup.rotation.x = -backTilt;
        group.add(backGroup);

        // ── Chrome X-frames: ONLY at the two outer arms ──────────────────────
        // Intermediate frames between seats would pierce up through the long
        // continuous cushion, so we omit them. Long transverse rails plus
        // floor-level transverse skids tie the two outer frames together for
        // structural read.
        let topZ = 0, topY = 0, frontZ = 0, frontY = 0;
        for (const sx of [-1, +1]) {
            const x = sx * seatHalfW;
            const a = this._barcelonaXFrame(
                group, chrome, x, seatTopY, hingeY, hingeZ, halfL, tubeR,
            );
            topZ = a.topZ; topY = a.topY;
            frontZ = a.frontZ; frontY = a.frontY;
        }
        // Suppress unused-on-1seat warning
        void seats;

        // Long transverse rails connecting the two outer frames (top hinge
        // anchor + front-of-seat anchor).
        const railLen = 2 * seatHalfW + tubeR * 2;
        const railGeo = new THREE.CylinderGeometry(tubeR, tubeR, railLen, 16);
        railGeo.rotateZ(Math.PI / 2);
        const railTop = new THREE.Mesh(railGeo, chrome);
        railTop.position.set(0, topY, topZ);
        group.add(railTop);
        const railFront = new THREE.Mesh(railGeo.clone(), chrome);
        railFront.position.set(0, frontY, frontZ);
        group.add(railFront);

        // Two floor-level transverse skids — sit just above the floor,
        // running between the two outer arm bases at front and back.
        const skidGeo = new THREE.CylinderGeometry(tubeR, tubeR, railLen, 16);
        skidGeo.rotateZ(Math.PI / 2);
        const skidFront = new THREE.Mesh(skidGeo, chrome);
        skidFront.position.set(0, tubeR, +halfL);
        group.add(skidFront);
        const skidRear = new THREE.Mesh(skidGeo.clone(), chrome);
        skidRear.position.set(0, tubeR, -halfL);
        group.add(skidRear);

        return group;
    }

    /**
     * L-shaped Barcelona corner sofa: one main row (along +X) and a
     * perpendicular wing (along −Z) sharing the inside corner. Each leg is
     * built by reusing buildBarcelonaSofa as a sub-group, then translated
     * and rotated so they meet cleanly at the inside corner.
     *
     * Bounding-box convention: data.width = X extent of the main row,
     * data.length = Z extent including the perpendicular wing.
     */
    private buildBarcelonaCornerSofa(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;       // main row total X
        const L = data.length;      // corner total Z
        const H = data.height;
        // Each leg is one "sofa" of fixed depth, sized so the two legs
        // overlap by exactly one square corner cushion.
        const legDepth = 0.85;
        const mainW    = W;                 // along X
        const wingW    = L - legDepth;      // along Z (after subtracting corner overlap)

        // Main row (3 seats), centred on its own group at origin
        const mainData: FurnitureData = {
            ...data, width: mainW, length: legDepth, height: H,
        };
        const main = this.buildBarcelonaSofa(mainData, 3);
        // Place so the back of the main row sits at the back wall (−Z extreme)
        main.position.set(0, 0, L * 0.5 - legDepth * 0.5);
        // Flip 180° so the seat faces +Z (out of the corner, into the room).
        // Without this the main row would face into the wing — for an L-sofa
        // both legs must face the open quadrant.
        main.rotation.y = Math.PI;
        group.add(main);

        // Perpendicular wing (2 seats), built along its own +X then rotated
        // 90° so its +X aligns with the room's +Z.
        const wingData: FurnitureData = {
            ...data, width: wingW, length: legDepth, height: H,
        };
        const wing = this.buildBarcelonaSofa(wingData, 2);
        // Centre the wing along Z so its left end sits at the inside corner
        // and its right end runs to +X edge of the bounding box.
        wing.position.set(W * 0.5 - legDepth * 0.5, 0, -legDepth * 0.5);
        wing.rotation.y = -Math.PI / 2;
        group.add(wing);

        return group;
    }

    /**
     * Cesca-style cantilever chair (Marcel Breuer, 1928 lineage). Three
     * material zones:
     *  • Polished chrome cantilever tube — one continuous bent rod per side
     *    forming a J/U: front-floor → rear-floor (skid base) → up rear leg →
     *    forward over the seat → forward-then-down to support seat front,
     *    then up the back to anchor the wood frame.
     *  • Tan tufted leather seat cushion (4 dimples, 2×2 grid).
     *  • Wood-framed cane/rattan back panel (vertical rectangle with woven
     *    cross-hatch suggesting cane mesh).
     *
     * Origin: floor centre. +Z = front of chair.
     */
    private buildCescaTanChair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;

        // ── Materials ────────────────────────────────────────────────────────
        const chrome = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8, roughness: 0.18, metalness: 0.95,
        });
        // Tan / cognac leather — slightly warm, low roughness for sheen.
        const leather = new THREE.MeshStandardMaterial({
            color: 0xa9683a, roughness: 0.45, metalness: 0.05,
        });
        const tuft = new THREE.MeshStandardMaterial({
            color: 0x6f3f1f, roughness: 0.5, metalness: 0.05,
        });
        // Walnut frame around the cane back.
        const walnut = new THREE.MeshStandardMaterial({
            color: 0x4a2a18, roughness: 0.55, metalness: 0.05,
        });
        // Woven rattan / cane — warm straw colour.
        const cane = new THREE.MeshStandardMaterial({
            color: 0xc9994f, roughness: 0.7, metalness: 0.0,
        });

        // ── Layout constants ─────────────────────────────────────────────────
        const seatTopY = H * 0.52;            // seat top
        const seatThk  = 0.075;               // cushion thickness
        const seatW    = W * 0.92;
        const seatL    = L * 0.84;
        const sideX    = W * 0.42;            // cantilever tube outer offset
        const halfL    = L * 0.50;
        const tubeR    = 0.018;               // chrome rod thickness
        const bendR    = 0.04;                // shared corner bend radius
        const backTopY = H * 1.0;
        const backThk  = 0.045;               // wood frame thickness
        // Lift the cane-back panel well above the seat cushion so the chrome
        // back-posts aren't visible behind a low-sitting panel — the panel
        // bottom now sits ~13 cm above the seat top, top stays flush with the
        // post tips (backTopY = H).
        const backH    = backTopY - (seatTopY + 0.18);
        const frameW   = W * 0.92;

        // ── Cantilever frame: build per-side as a chain of arcs/segments ─────
        // Side path (in local +Z = front coordinate space) for one side at x=sideX:
        //   floor: front (+halfL) → back (−halfL)             (skid)
        //   rear:  back-floor → back-upper just under seat   (rear vertical)
        //   over:  back-upper → forward to under-seat front  (seat support)
        //   up-back: from rear-upper continuing up to the back-frame anchor
        // We use straight cylinders + small toroidal corners for the bends.
        const rearY  = seatTopY - 0.02;       // tube top before bending forward over seat
        // Build one side as a SINGLE continuous tube swept along a CurvePath.
        // The path is a closed rectangle in the YZ plane (constant x) with
        // four straight segments and four quadratic-bezier corners — so the
        // skid, rear leg, top rail and front leg are visibly joined by smooth
        // chrome bends rather than abutting cylinder ends.
        const buildSideFrame = (xSign: number) => {
            const x = xSign * sideX;
            const groupSide = new THREE.Group();
            const v = (y: number, z: number) => new THREE.Vector3(x, y, z);

            const path = new THREE.CurvePath<THREE.Vector3>();
            // 1. Skid (back → front along floor)
            path.add(new THREE.LineCurve3(
                v(tubeR, -halfL + bendR),
                v(tubeR, +halfL - bendR),
            ));
            // 2. Front-floor corner (curves up the front leg)
            path.add(new THREE.QuadraticBezierCurve3(
                v(tubeR, +halfL - bendR),
                v(tubeR, +halfL),
                v(tubeR + bendR, +halfL),
            ));
            // 3. Front vertical (floor → just under top rail)
            path.add(new THREE.LineCurve3(
                v(tubeR + bendR, +halfL),
                v(rearY - bendR, +halfL),
            ));
            // 4. Front-top corner (curves rearward over the seat)
            path.add(new THREE.QuadraticBezierCurve3(
                v(rearY - bendR, +halfL),
                v(rearY, +halfL),
                v(rearY, +halfL - bendR),
            ));
            // 5. Top rail (front → rear, supporting the seat cushion)
            path.add(new THREE.LineCurve3(
                v(rearY, +halfL - bendR),
                v(rearY, -halfL + bendR),
            ));
            // 6. Rear-top corner (curves down the rear leg)
            path.add(new THREE.QuadraticBezierCurve3(
                v(rearY, -halfL + bendR),
                v(rearY, -halfL),
                v(rearY - bendR, -halfL),
            ));
            // 7. Rear vertical (down to the floor)
            path.add(new THREE.LineCurve3(
                v(rearY - bendR, -halfL),
                v(tubeR + bendR, -halfL),
            ));
            // 8. Rear-floor corner (closes the loop back into the skid)
            path.add(new THREE.QuadraticBezierCurve3(
                v(tubeR + bendR, -halfL),
                v(tubeR, -halfL),
                v(tubeR, -halfL + bendR),
            ));
            const tube = new THREE.Mesh(
                new THREE.TubeGeometry(path, 220, tubeR, 12, true),
                chrome,
            );
            groupSide.add(tube);

            // Backrest post — separate continuation up from the rear-top
            // corner to anchor the wooden back-frame. (Drawn as its own short
            // tube; it visually emerges from the bend.)
            const postLen = backTopY - rearY;
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(tubeR, tubeR, postLen, 16),
                chrome,
            );
            post.position.set(x, rearY + postLen * 0.5, -halfL + bendR);
            groupSide.add(post);

            return groupSide;
        };
        group.add(buildSideFrame(+1));
        group.add(buildSideFrame(-1));

        // Transverse cross-tube under the seat (front edge of seat support)
        const crossGeo = new THREE.CylinderGeometry(tubeR, tubeR, sideX * 2, 16);
        crossGeo.rotateZ(Math.PI / 2);
        const crossFront = new THREE.Mesh(crossGeo, chrome);
        crossFront.position.set(0, seatTopY - 0.02, +halfL * 0.78);
        group.add(crossFront);
        const crossRear = new THREE.Mesh(crossGeo.clone(), chrome);
        crossRear.position.set(0, seatTopY - 0.02, -halfL * 0.55);
        group.add(crossRear);

        // ── Tan tufted leather seat cushion ──────────────────────────────────
        const seatGeo = ChairBuilder._roundedBox(seatW, seatThk, seatL, 0.025, 3);
        const seat = new THREE.Mesh(seatGeo, leather);
        seat.position.set(0, seatTopY + seatThk * 0.5, 0);
        group.add(seat);
        // 2×2 tufting dimples
        const dimpleR = Math.min(seatW, seatL) * 0.05;
        for (let ix = 0; ix < 2; ix++) {
            for (let iz = 0; iz < 2; iz++) {
                const x = (ix - 0.5) * (seatW * 0.42);
                const z = (iz - 0.5) * (seatL * 0.42);
                const d = new THREE.Mesh(
                    new THREE.SphereGeometry(dimpleR, 12, 8),
                    tuft,
                );
                d.position.set(x, seatTopY + seatThk - dimpleR * 0.4, z);
                d.scale.set(1, 0.45, 1);
                group.add(d);
            }
        }

        // ── Wood-framed cane back ────────────────────────────────────────────
        // Outer rectangular walnut frame
        void backThk;
        const frameDepth = 0.04;
        const railH = 0.06;
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(frameW, railH, frameDepth),
            walnut,
        );
        top.position.set(0, backTopY - railH * 0.5, -halfL + bendR);
        group.add(top);
        const bottom = top.clone();
        bottom.position.y = backTopY - backH + railH * 0.5;
        group.add(bottom);
        const stileH = backH - railH * 2;
        for (const sx of [-1, +1]) {
            const stile = new THREE.Mesh(
                new THREE.BoxGeometry(railH, stileH, frameDepth),
                walnut,
            );
            stile.position.set(
                sx * (frameW * 0.5 - railH * 0.5),
                backTopY - railH - stileH * 0.5,
                -halfL + bendR,
            );
            group.add(stile);
        }
        // Inner cane panel — thin grid of crossing tubes for the weave look
        const innerW = frameW - railH * 2 - 0.01;
        const innerH = stileH - 0.01;
        const innerCx = 0;
        const innerCy = backTopY - railH - stileH * 0.5;
        const innerZ = -halfL + bendR + frameDepth * 0.5 - 0.005;
        // Backing panel (slight tan tint behind weave for opacity)
        const backPanel = new THREE.Mesh(
            new THREE.BoxGeometry(innerW, innerH, 0.005),
            cane,
        );
        backPanel.position.set(innerCx, innerCy, innerZ - 0.006);
        group.add(backPanel);
        // Vertical strands
        const strandR = 0.0035;
        const vCount = 18;
        for (let i = 0; i < vCount; i++) {
            const x = innerCx - innerW * 0.5 + (i + 0.5) * (innerW / vCount);
            const v = new THREE.Mesh(
                new THREE.CylinderGeometry(strandR, strandR, innerH, 6),
                cane,
            );
            v.position.set(x, innerCy, innerZ);
            group.add(v);
        }
        // Horizontal strands
        const hCount = 12;
        for (let i = 0; i < hCount; i++) {
            const y = innerCy - innerH * 0.5 + (i + 0.5) * (innerH / hCount);
            const h = new THREE.Mesh(
                new THREE.CylinderGeometry(strandR, strandR, innerW, 6),
                cane,
            );
            h.rotation.z = Math.PI / 2;
            h.position.set(innerCx, y, innerZ + 0.002);
            group.add(h);
        }

        return group;
    }

    /**
     * Mid-century walnut & boucle armchair.
     *
     * Reference: the "A-frame" walnut armchair with thick boucle seat and
     * back cushions, square-section wood arms cantilevered from a triangular
     * leg frame on each side, and slanted rear posts supporting the back.
     */
    private buildTextileWoodArmchair(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const W = data.width;
        const L = data.length;
        const H = data.height;

        const seatY    = H * 0.44;          // top of seat cushion's wood support
        const armY     = H * 0.74;          // top of armrest (raised so it clears the cushion)
        const backTopY = H * 0.98;          // top of backrest
        const sideX    = W * 0.58;          // half-width to outer face of frame (offset past cushion)

        // ── Materials ─────────────────────────────────────────────────────────

        // Warm walnut, slightly satin
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x6b4528,
            roughness: 0.55,
            metalness: 0.0,
        });

        // Boucle textile — warm off-white
        const textileMat = new THREE.MeshStandardMaterial({
            color: 0xe6e0d2,
            roughness: 0.94,
            metalness: 0.0,
        });

        // ── A-Frame Wood Side Panels ──────────────────────────────────────────
        // Each side: two square-section legs forming an inverted V whose apex
        // sits at armrest height. Front leg splays forward, rear leg splays
        // back, both meeting where the armrest crosses.

        const legT       = 0.055;            // square-section leg thickness
        const legLen     = armY * 1.05;      // long enough to reach apex with splay
        const splayAngle = 0.34;             // ~19.5° outward splay (front/back)

        // Apex sits inset from the outer side so the armrest can cap it
        const apexInsetZ = -L * 0.05;        // slightly behind seat centre
        const footHalfZ  = L * 0.42;         // legs land at this z

        [-1, 1].forEach(side => {
            // Front leg: apex at (sideX*0.92, armY, apexInsetZ); foot at +Z
            const frontLeg = new THREE.Mesh(
                new THREE.BoxGeometry(legT, legLen, legT),
                woodMat,
            );
            frontLeg.position.set(side * sideX * 0.92, legLen * 0.5 - 0.005, footHalfZ - 0.05);
            frontLeg.rotation.x = -splayAngle;       // tilt foot forward
            group.add(frontLeg);

            // Rear leg: apex at same point; foot at -Z
            const rearLeg = new THREE.Mesh(
                new THREE.BoxGeometry(legT, legLen, legT),
                woodMat,
            );
            rearLeg.position.set(side * sideX * 0.92, legLen * 0.5 - 0.005, -footHalfZ + 0.05);
            rearLeg.rotation.x = splayAngle;         // tilt foot backward
            group.add(rearLeg);
        });

        // ── Wooden Armrests (square beams capping each A-frame) ──────────────
        const armLen = L * 0.78;
        const armGeo = new THREE.BoxGeometry(legT * 1.05, legT * 0.95, armLen);
        [-1, 1].forEach(side => {
            const arm = new THREE.Mesh(armGeo, woodMat);
            arm.position.set(side * sideX * 0.92, armY, apexInsetZ);
            group.add(arm);
        });

        // ── Hidden Wood Seat Support Beams (front + back rails) ──────────────
        // Carry the cushion. Tucked under the cushion so they read as part
        // of the frame, not visible from the front.
        const railGeo = new THREE.BoxGeometry(W * 0.84, 0.035, 0.045);
        const railFront = new THREE.Mesh(railGeo, woodMat);
        railFront.position.set(0, seatY - 0.02, L * 0.30);
        group.add(railFront);
        const railBack = new THREE.Mesh(railGeo, woodMat);
        railBack.position.set(0, seatY - 0.02, -L * 0.30);
        group.add(railBack);

        // ── Plump Boucle Seat Cushion (rounded corners, sofa-style) ──────────
        const seatThk = 0.16;
        const seat = new THREE.Mesh(
            ChairBuilder._plumpCushion(W * 0.88, seatThk, L * 0.78),
            textileMat,
        );
        seat.position.set(0, seatY + seatThk * 0.5, 0);
        group.add(seat);

        // ── Plump Boucle Backrest (rounded corners, tilted) ──────────────────
        // No rear wood posts — the textile back sits on the seat and leans
        // back, "connected" to the seat as a continuous upholstered set.
        const backLean = -0.16;
        const backH    = backTopY - (seatY + seatThk) + 0.04;
        const backThk  = 0.16;
        const back = new THREE.Mesh(
            ChairBuilder._plumpCushion(W * 0.84, backH, backThk),
            textileMat,
        );
        const backCentreY = seatY + seatThk + backH * 0.5 - 0.02;
        back.position.set(
            0,
            backCentreY,
            -L * 0.30 + Math.tan(-backLean) * (backCentreY - armY) - backThk * 0.5,
        );
        back.rotation.x = backLean;
        group.add(back);

        return group;
    }

    /**
     * Box with all 12 edges rounded — ExtrudeGeometry of a rounded-rectangle
     * shape with a matching bevel on the third axis. Centred at origin.
     * Mirrors CornerSofaBuilder.roundedBox / plumpCushion so chair cushions
     * read with the same plump silhouette as the sofa cushions.
     */
    private static _roundedBox(
        w: number, h: number, d: number, r: number, segs: number,
    ): THREE.BufferGeometry {
        const radius = Math.min(r, Math.min(w, h, d) * 0.49);
        const shape  = new THREE.Shape();
        const wH = w / 2, hH = h / 2;
        shape.moveTo(-wH + radius, -hH);
        shape.lineTo( wH - radius, -hH);
        shape.quadraticCurveTo( wH, -hH,  wH, -hH + radius);
        shape.lineTo( wH,  hH - radius);
        shape.quadraticCurveTo( wH,  hH,  wH - radius,  hH);
        shape.lineTo(-wH + radius,  hH);
        shape.quadraticCurveTo(-wH,  hH, -wH,  hH - radius);
        shape.lineTo(-wH, -hH + radius);
        shape.quadraticCurveTo(-wH, -hH, -wH + radius, -hH);

        const bevel = Math.min(radius * 0.9, d * 0.45);
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth:          Math.max(d - bevel * 2, 0.001),
            bevelEnabled:   true,
            bevelSegments:  segs,
            bevelSize:      bevel,
            bevelThickness: bevel,
            curveSegments:  segs * 2,
        });
        geo.translate(0, 0, -(d / 2 - bevel));
        geo.computeVertexNormals();
        return geo;
    }

    /** Plump cushion — 30 % bevel ratio gives a soft, filled look. */
    private static _plumpCushion(w: number, h: number, d: number): THREE.BufferGeometry {
        const r = Math.min(w, h, d) * 0.30;
        return ChairBuilder._roundedBox(w, h, d, r, 5);
    }
}
