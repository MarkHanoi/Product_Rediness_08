/**
 * @file ParametricTreeEngine.ts
 *
 * 3D mesh builder for the 25-species outdoor tree library.  Each species
 * resolves to one of 12 archetypes via `TREE_SPECIES_TABLE` and is built
 * by the matching `_build*` method below.  No GLBs, no async loads — pure
 * THREE.js procedural geometry that scales with `treeConfig` parameters.
 *
 * Aesthetic target: matches the existing soft-rounded white "Tree" item
 * (icosahedron clusters), but with per-species silhouette, crown density
 * and palette.
 *
 * Plan-view contract (§02-BIM-SPATIAL-PROJECTION + §07-WARDROBE-VIEW
 * style precedent): every mesh is tagged with `userData.skipInPlan = true`
 * and `userData.edgeAngleDeg = 30`.  TreePlanSymbolBuilder injects the
 * clean architectural plan symbol instead of a noisy mesh-edge dump.
 *
 * Contract:
 *  - No store reads/writes.  Returns a THREE.Group rooted at (0, 0, 0)
 *    with the trunk base at Y=0 and the canopy extending upward.
 *  - Pre-computes pseudo-random offsets via a deterministic PRNG so a
 *    given species id always produces an identical mesh between sessions
 *    (project save/load parity, §13).
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    TreeSpeciesDef,
    TreeSpeciesId,
    TREE_SPECIES_TABLE,
} from '../TreeTypes';
// §TREE-HIFI 2026-06-24 — Spacemaker/Forma-style cross-billboard canopy.
import { buildCrossBillboardCanopy } from './foliageCards';

// ── Shared material cache (per species + role) ───────────────────────────

const _matCache = new Map<string, THREE.MeshStandardMaterial>();
function _mat(
    key: string,
    hex: string,
    opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
    if (!_matCache.has(key)) {
        _matCache.set(key, new THREE.MeshStandardMaterial({
            color: new THREE.Color(hex),
            ...opts,
        }));
    }
    return _matCache.get(key)!;
}

// ── Deterministic PRNG (mulberry32) for stable canopy clusters ───────────

function _seedFromString(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

function _makePRNG(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── ParametricTreeEngine ─────────────────────────────────────────────────

export class ParametricTreeEngine {

    /**
     * Build a tree's THREE.Group for the given species id.  The group's
     * origin is at the trunk base; +Y is up.  The group is tagged for
     * plan-view substitution by TreePlanSymbolBuilder.
     */
    create(speciesId: TreeSpeciesId): THREE.Group {
        const def = TREE_SPECIES_TABLE[speciesId];
        if (!def) {
            // Defensive fallback — return an empty group so the scene doesn't
            // crash if a stale species id arrives from an old project file.
            return new THREE.Group();
        }
        const root = this._buildArchetype(def);
        root.userData.elementType  = 'ParametricTree';
        root.userData.treeSpeciesId = def.id;
        this._tagForPlanView(root);
        return root;
    }

    // ── Archetype dispatch ────────────────────────────────────────────────

    private _buildArchetype(def: TreeSpeciesDef): THREE.Group {
        switch (def.archetype) {
            case 'round_dense':       return this._buildRoundDense(def);
            case 'round_open':        return this._buildRoundOpen(def);
            case 'round_dotted':      return this._buildRoundDotted(def);
            case 'topiary':           return this._buildTopiary(def);
            case 'branchy':           return this._buildBranchy(def);
            case 'conifer_columnar':  return this._buildConiferColumnar(def);
            case 'conifer_pyramid':   return this._buildConiferPyramid(def);
            case 'conifer_starburst': return this._buildConiferStarburst(def);
            case 'palm':              return this._buildPalm(def);
            case 'willow':            return this._buildWillow(def);
            case 'flowering':         return this._buildFlowering(def);
            case 'multi_lobed':       return this._buildMultiLobed(def);
            default:                  return this._buildRoundDense(def);
        }
    }

    // ── Shared sub-builders ───────────────────────────────────────────────

    /**
     * Build a tapered cylinder trunk from y=0 to y=top with radii
     * (radiusBase, radiusBase * 0.65), plus a flared root collar at the base
     * and 2–3 deterministic upward branch stubs near the crown so the trunk
     * reads as a real tree rather than a plain stick.  §TREE-HIFI 2026-06-24.
     *
     * Returns a small Group (trunk + collar + stubs) — all sharing one
     * bark-toned material so it stays at 1 draw call.
     */
    private _buildTrunk(def: TreeSpeciesDef, top: number): THREE.Group {
        const grp   = new THREE.Group();
        const baseR = def.trunkRadius;
        const topR  = baseR * 0.65;
        const mat   = _mat(`trunk:${def.id}`, def.trunkColor, { roughness: 0.9, metalness: 0.0 });

        // Main tapered shaft.
        const geo = new THREE.CylinderGeometry(topR, baseR, top, 10);
        const m   = new THREE.Mesh(geo, mat);
        m.position.y = top / 2;
        m.castShadow = true;
        m.userData.elementType = 'TreeTrunk';
        grp.add(m);

        // Flared root collar — a short wider cone at the ground line so the
        // trunk visually "grows out" of the soil instead of being a cut pipe.
        const collar = new THREE.Mesh(
            new THREE.ConeGeometry(baseR * 1.5, baseR * 2.0, 10, 1, true),
            mat,
        );
        collar.position.y = baseR * 0.9;
        collar.castShadow = true;
        collar.userData.elementType = 'TreeTrunk';
        grp.add(collar);

        // 2–3 short branch stubs angling up-and-out near the top of the trunk,
        // deterministically placed from the species seed.
        const rng = _makePRNG(_seedFromString(def.id + ':stubs'));
        const stubs = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < stubs; i++) {
            const a    = (i / stubs) * Math.PI * 2 + rng() * 0.6;
            const len  = top * (0.18 + rng() * 0.12);
            const sGeo = new THREE.CylinderGeometry(topR * 0.35, topR * 0.6, len, 6);
            const sm   = new THREE.Mesh(sGeo, mat);
            const tilt = Math.PI / 4 + rng() * 0.3;
            sm.position.set(
                Math.cos(a) * topR * 0.8,
                top * (0.72 + rng() * 0.12) + Math.sin(tilt) * len * 0.4,
                Math.sin(a) * topR * 0.8,
            );
            sm.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
            sm.castShadow = true;
            sm.userData.elementType = 'TreeBranch';
            grp.add(sm);
        }

        return grp;
    }

    /**
     * Scatter `count` icosahedron foliage clusters around the canopy
     * centre at world y=canopyCenterY, within the spherical envelope of
     * radius `crownR`.  Returns a child Group containing all clusters.
     */
    private _scatterFoliageClusters(
        def:           TreeSpeciesDef,
        count:         number,
        crownR:        number,
        canopyCenterY: number,
        clusterR:      number,
        squashY:       number = 1.0,
        material?:     THREE.Material,
    ): THREE.Group {
        const grp  = new THREE.Group();
        const mat  = material ?? _mat(`foliage:${def.id}`, def.foliageColor, { roughness: 0.85, metalness: 0.0 });
        const rng  = _makePRNG(_seedFromString(def.id));
        for (let i = 0; i < count; i++) {
            const a   = rng() * Math.PI * 2;
            // Bias clusters slightly outward to fill the silhouette
            const r   = crownR * (0.45 + rng() * 0.55);
            const y   = canopyCenterY + (rng() - 0.5) * crownR * 1.2 * squashY;
            const cs  = new THREE.IcosahedronGeometry(clusterR * (0.7 + rng() * 0.6), 1);
            const cm  = new THREE.Mesh(cs, mat);
            cm.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
            cm.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
            cm.castShadow = true;
            cm.userData.elementType = 'TreeFoliageCluster';
            grp.add(cm);
        }
        return grp;
    }

    /**
     * §TREE-HIFI 2026-06-24 — build a cross-billboard canopy for `def` using a
     * deterministic per-species PRNG so the result is identical between
     * sessions (save/load parity).  Thin wrapper over `buildCrossBillboardCanopy`.
     */
    private _canopy(
        def:        TreeSpeciesDef,
        crownR:     number,
        centerY:    number,
        squashY:    number = 0.9,
        cards:      number = 5,
        innerShell: boolean = true,
    ): THREE.Group {
        const rng = _makePRNG(_seedFromString(def.id + ':canopy'));
        return buildCrossBillboardCanopy({
            crownR, centerY, foliageHex: def.foliageColor,
            squashY, cards, rng, innerShell,
        });
    }

    // ── Archetype builders ────────────────────────────────────────────────

    private _buildRoundDense(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.40;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH + canopyH * 0.3));
        const cy      = trunkH + canopyH * 0.55;
        // §TREE-HIFI — dense broadleaf: 6 crossed alpha cards + inner shell.
        g.add(this._canopy(def, def.crownRadius, cy, 0.92, 6));
        return g;
    }

    private _buildRoundOpen(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.45;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH + canopyH * 0.4));
        const cy      = trunkH + canopyH * 0.55;
        // §TREE-HIFI — open/airy crown: fewer cards, no solid shell so light
        // reads through the canopy.
        g.add(this._canopy(def, def.crownRadius, cy, 0.9, 4, /* innerShell */ false));
        if (def.accentColor) {
            const acc = _mat(`foliageAccent:${def.id}`, def.accentColor, { roughness: 0.85, metalness: 0.0 });
            const cnt = Math.round(8 * (def.density ?? 1));
            g.add(this._scatterFoliageClusters(def, cnt, def.crownRadius * 1.05, cy, def.crownRadius * 0.18, 0.85, acc));
        }
        return g;
    }

    private _buildRoundDotted(def: TreeSpeciesDef): THREE.Group {
        // §TREE-HIFI — smooth round canopy via crossed cards (fuller card count).
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.40;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH + canopyH * 0.3));
        const cy = trunkH + canopyH * 0.55;
        g.add(this._canopy(def, def.crownRadius, cy, 0.92, 6));
        return g;
    }

    private _buildTopiary(def: TreeSpeciesDef): THREE.Group {
        // Formal topiary: clear trunk, perfect rounded canopy with a top knob
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.45;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH));

        const cy = trunkH + canopyH * 0.55;
        const sphereGeo = new THREE.SphereGeometry(def.crownRadius * 0.95, 24, 18);
        const sphereMat = _mat(`foliageTopiary:${def.id}`, def.foliageColor, { roughness: 0.7 });
        const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.y = cy;
        sphere.castShadow = true;
        sphere.userData.elementType = 'TreeFoliageBlob';
        g.add(sphere);

        // Inner accent ring (formal concentric look in 3D — top hemisphere knob)
        if (def.accentColor) {
            const knobMat = _mat(`foliageAccent:${def.id}`, def.accentColor, { roughness: 0.7 });
            const knobGeo = new THREE.SphereGeometry(def.crownRadius * 0.45, 20, 14);
            const knob    = new THREE.Mesh(knobGeo, knobMat);
            knob.position.y = cy + def.crownRadius * 0.55;
            knob.castShadow = true;
            knob.userData.elementType = 'TreeFoliageBlob';
            g.add(knob);
        }
        return g;
    }

    private _buildBranchy(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.40;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH));

        // Main upward branches
        const branchMat = _mat(`branch:${def.id}`, def.trunkColor, { roughness: 0.85 });
        const cy        = trunkH + canopyH * 0.4;
        const N         = 5;
        for (let i = 0; i < N; i++) {
            const a   = (i / N) * Math.PI * 2;
            const len = canopyH * 0.7;
            const geo = new THREE.CylinderGeometry(def.trunkRadius * 0.4, def.trunkRadius * 0.6, len, 6);
            const m   = new THREE.Mesh(geo, branchMat);
            // Tilt outward by ~25°
            const tilt = Math.PI / 6;
            m.position.set(
                Math.cos(a) * def.crownRadius * 0.25,
                trunkH + len * 0.45,
                Math.sin(a) * def.crownRadius * 0.25,
            );
            m.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
            m.castShadow = true;
            m.userData.elementType = 'TreeBranch';
            g.add(m);
        }

        // §TREE-HIFI — canopy cards riding above the visible branch structure.
        g.add(this._canopy(def, def.crownRadius, cy + canopyH * 0.3, 0.9, 5));
        return g;
    }

    private _buildConiferColumnar(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.10;
        g.add(this._buildTrunk(def, trunkH));

        // Stacked elongated cones — pencil-shape
        const mat   = _mat(`foliage:${def.id}`, def.foliageColor, { roughness: 0.85 });
        const total = def.height - trunkH;
        const yTop  = trunkH + total;
        const N     = 4;
        const segH  = total / N;
        for (let i = 0; i < N; i++) {
            const r0  = def.crownRadius * (1 - i * 0.12);
            const cone = new THREE.ConeGeometry(r0, segH * 1.4, 16);
            const m    = new THREE.Mesh(cone, mat);
            m.position.y = trunkH + i * segH + segH * 0.7;
            m.castShadow = true;
            m.userData.elementType = 'TreeFoliageBlob';
            g.add(m);
        }
        // Top point
        const tip = new THREE.Mesh(
            new THREE.ConeGeometry(def.crownRadius * 0.3, segH * 1.0, 12),
            mat,
        );
        tip.position.y = yTop - segH * 0.3;
        tip.castShadow = true;
        tip.userData.elementType = 'TreeFoliageBlob';
        g.add(tip);
        return g;
    }

    private _buildConiferPyramid(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.15;
        g.add(this._buildTrunk(def, trunkH));

        const mat   = _mat(`foliage:${def.id}`, def.foliageColor, { roughness: 0.85 });
        const total = def.height - trunkH;
        // Three stacked tiers of decreasing radius
        const tiers = 3;
        for (let i = 0; i < tiers; i++) {
            const t   = i / tiers;
            const r   = def.crownRadius * (1 - t * 0.55);
            const h   = total * 0.55;
            const cone = new THREE.ConeGeometry(r, h, 18);
            const m    = new THREE.Mesh(cone, mat);
            m.position.y = trunkH + total * (0.25 + t * 0.32);
            m.castShadow = true;
            m.userData.elementType = 'TreeFoliageBlob';
            g.add(m);
        }
        return g;
    }

    private _buildConiferStarburst(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.20;
        g.add(this._buildTrunk(def, trunkH));

        // Single tall narrow cone for the silhouette
        const mat   = _mat(`foliage:${def.id}`, def.foliageColor, { roughness: 0.85 });
        const total = def.height - trunkH;
        const cone  = new THREE.ConeGeometry(def.crownRadius, total, 20);
        const m     = new THREE.Mesh(cone, mat);
        m.position.y = trunkH + total / 2;
        m.castShadow = true;
        m.userData.elementType = 'TreeFoliageBlob';
        g.add(m);

        // Sparse needle tufts on the surface
        const tuftMat = _mat(`needle:${def.id}`, def.foliageColor, { roughness: 0.95 });
        const rng     = _makePRNG(_seedFromString(def.id + ':needles'));
        const N       = Math.round(40 * (def.density ?? 1));
        for (let i = 0; i < N; i++) {
            const yT  = rng();
            const y   = trunkH + total * (0.05 + yT * 0.95);
            const r0  = def.crownRadius * (1 - yT) * (0.7 + rng() * 0.4);
            const a   = rng() * Math.PI * 2;
            const tuft = new THREE.IcosahedronGeometry(0.10 + rng() * 0.06, 0);
            const tm   = new THREE.Mesh(tuft, tuftMat);
            tm.position.set(Math.cos(a) * r0, y, Math.sin(a) * r0);
            tm.castShadow = true;
            tm.userData.elementType = 'TreeFoliageCluster';
            g.add(tm);
        }
        return g;
    }

    private _buildPalm(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.80;
        g.add(this._buildTrunk(def, trunkH));

        // Palm fronds — flattened ellipsoids radiating around a centre
        const mat = _mat(`foliage:${def.id}`, def.foliageColor, { roughness: 0.85 });
        const N   = 9;
        const fronds = new THREE.Group();
        for (let i = 0; i < N; i++) {
            const a   = (i / N) * Math.PI * 2;
            const len = def.crownRadius * 1.05;
            const geo = new THREE.SphereGeometry(0.22, 8, 6);
            const m   = new THREE.Mesh(geo, mat);
            m.scale.set(len / 0.22, 0.10, 0.20);
            // Place frond mid-point along its direction at half-length out from centre
            m.position.set(Math.cos(a) * len * 0.5, 0, Math.sin(a) * len * 0.5);
            m.rotation.y = -a;
            // Slight downward droop
            m.rotation.z = -Math.PI * 0.06;
            m.castShadow = true;
            m.userData.elementType = 'TreeFoliageBlob';
            fronds.add(m);
        }
        fronds.position.y = trunkH;
        g.add(fronds);

        // Crown bulb at the meeting point
        const crownGeo = new THREE.SphereGeometry(def.crownRadius * 0.18, 12, 10);
        const crown    = new THREE.Mesh(crownGeo, mat);
        crown.position.y = trunkH;
        crown.castShadow = true;
        crown.userData.elementType = 'TreeFoliageBlob';
        g.add(crown);
        return g;
    }

    private _buildWillow(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.40;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH));

        // §TREE-HIFI — main rounded canopy as crossed cards (flattened).
        const cy = trunkH + canopyH * 0.55;
        g.add(this._canopy(def, def.crownRadius * 0.92, cy, 0.7, 5));
        const blobMat = _mat(`foliage:${def.id}`, def.foliageColor, { roughness: 0.85 });

        // Drooping streamer clusters around the perimeter
        const rng = _makePRNG(_seedFromString(def.id + ':drape'));
        const N   = 14;
        for (let i = 0; i < N; i++) {
            const a   = (i / N) * Math.PI * 2 + rng() * 0.2;
            const r   = def.crownRadius * (0.85 + rng() * 0.15);
            const len = canopyH * (0.4 + rng() * 0.4);
            const geo = new THREE.SphereGeometry(0.22, 8, 6);
            const m   = new THREE.Mesh(geo, blobMat);
            m.scale.set(0.18, len / 0.22, 0.18);
            m.position.set(Math.cos(a) * r, cy - canopyH * 0.2 - len * 0.3, Math.sin(a) * r);
            m.castShadow = true;
            m.userData.elementType = 'TreeFoliageBlob';
            g.add(m);
        }
        return g;
    }

    private _buildFlowering(def: TreeSpeciesDef): THREE.Group {
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.40;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH));

        const cy = trunkH + canopyH * 0.55;
        // §TREE-HIFI — green canopy cards, then sprinkle colour-flecked flowers
        // (kept as small clusters so the bloom colour pops against the cards).
        g.add(this._canopy(def, def.crownRadius, cy, 0.9, 5));

        if (def.accentColor) {
            const flowerMat = _mat(`flower:${def.id}`, def.accentColor, { roughness: 0.65 });
            const cnt = Math.round(16 * (def.density ?? 1));
            g.add(this._scatterFoliageClusters(def, cnt, def.crownRadius * 1.02, cy, def.crownRadius * 0.16, 0.9, flowerMat));
        }
        return g;
    }

    private _buildMultiLobed(def: TreeSpeciesDef): THREE.Group {
        // §TREE-HIFI — multi-lobed organic canopy: 3 offset cross-billboard
        // sub-canopies at different heights so the silhouette reads as several
        // overlapping foliage masses (cherry-tree character).
        const g       = new THREE.Group();
        const trunkH  = def.height * 0.35;
        const canopyH = def.height - trunkH;
        g.add(this._buildTrunk(def, trunkH));

        const cy = trunkH + canopyH * 0.55;
        const lobes: Array<[number, number, number]> = [
            [-def.crownRadius * 0.40, cy - canopyH * 0.08, def.crownRadius * 0.62],
            [ def.crownRadius * 0.40, cy + canopyH * 0.10, def.crownRadius * 0.62],
            [ 0,                       cy + canopyH * 0.28, def.crownRadius * 0.58],
        ];
        let li = 0;
        for (const [x, y, r] of lobes) {
            const rng = _makePRNG(_seedFromString(def.id + ':lobe' + li++));
            const lobe = buildCrossBillboardCanopy({
                crownR: r, centerY: y, foliageHex: def.foliageColor,
                squashY: 0.85, cards: 4, rng, innerShell: true,
            });
            lobe.position.x = x;
            lobe.position.z = (li % 2 === 0 ? 1 : -1) * def.crownRadius * 0.18;
            g.add(lobe);
        }
        return g;
    }

    // ── Plan-view tagging ─────────────────────────────────────────────────

    /**
     * §02-BIM-SPATIAL-PROJECTION + §07-WARDROBE-VIEW-CONTRACT precedent.
     * Mark every mesh so EdgeProjectorService skips raw 3D-edge projection
     * in plan view (TreePlanSymbolBuilder injects the architectural symbol
     * instead).
     *
     * edgeAngleDeg=50 chosen specifically for the foliage families:
     *  - Icosahedron interior face creases are ≈42° → culled by 50° threshold,
     *    so elevation/section views render only the outer silhouette of each
     *    cluster (matching the clean silhouette style on the Arbol T-NN
     *    elevation icons in the reference plate) instead of a hair-ball of
     *    triangle edges.
     *  - Cone seam edges along the side are ≈22° (16-segment cones) → culled.
     *  - The trunk-to-foliage colour transition still reads because cone
     *    base / sphere bottom are >90° silhouette features and survive.
     */
    private _tagForPlanView(root: THREE.Group): void {
        root.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                obj.userData.skipInPlan   = true;
                obj.userData.edgeAngleDeg = 50;
            }
        });
    }
}

