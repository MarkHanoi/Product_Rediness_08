/**
 * @file KitchenCabinetEngine.ts
 *
 * THREE.js geometry builder for parametric kitchen cabinet runs.
 *
 * Geometry per unit:
 *   - Carcass:    BoxGeometry (full body)
 *   - Front panel: door / glass_door / framed_glass / drawers / shelf / none
 *   - Bar handle on door/drawer fronts
 *
 * Front direction convention (fixed):
 *   - All base cabinet units face local +Z (front panel at +depth/2).
 *   - Main arm: no rotation — front faces world +Z.
 *   - Left arm: unit rotationY = +PI/2 — front maps to world +X (inward).
 *   - Right arm: unit rotationY = -PI/2 — front maps to world -X (inward).
 *
 * Countertop strategy (unified per-arm slabs, no per-unit overlap):
 *   - One countertop slab per arm, built in ROOT LOCAL space after all units.
 *   - Island: single slab with 10 cm overhang on all four sides.
 *   - L / U arms: the MAIN arm's slab covers the corner junction fully;
 *     arm slabs start after the corner (no double-counting).
 *
 * Tall layouts (kitchen_*_tall):
 *   - Same base cabinets as the matching standard layout.
 *   - Additional upper wall cabinet row above, with configurable height/depth/gap.
 *   - Upper units share the same unitFront config as base for simplicity.
 *
 * Unit meshes carry:
 *   userData.kitchenUnitIndex — zero-based index within its arm
 *   userData.kitchenArm       — 'main' | 'left' | 'right'
 *   userData.kitchenFront     — current front type
 *   userData.elementType      — 'kitchen_unit'
 *
 * Contract:
 *   - No store mutations. Returns THREE.Group.
 *   - Does NOT reference any store. Data passed in as config.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    KitchenCabinetConfig,
    KitchenHandleStyle,
    KitchenLayoutType,
    KitchenApplianceType,
    KITCHEN_DEFAULTS,
    isTallKitchenLayout,
    baseKitchenLayout,
} from '../KitchenTypes';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

// ── Shared material cache ─────────────────────────────────────────────────────

const _matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const key = hex + JSON.stringify(opts);
    if (!_matCache.has(key)) _matCache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), ...opts }));
    return _matCache.get(key)!;
}

function materialFromId(
    materialId: string | undefined,
    fallbackHex: string,
    opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
    const def = materialId ? STANDARD_MATERIAL_LIBRARY.find(m => m.id === materialId) : undefined;
    if (!def) return mat(fallbackHex, opts);
    const params = { ...def.params, ...opts };
    const color = params.color instanceof THREE.Color ? `#${params.color.getHexString()}` : String(params.color ?? fallbackHex);
    const key = `lib:${materialId}:${color}:${JSON.stringify({ ...params, color })}`;
    if (!_matCache.has(key)) _matCache.set(key, new THREE.MeshStandardMaterial(params));
    return _matCache.get(key)!;
}

// ── KitchenCabinetEngine ──────────────────────────────────────────────────────

export class KitchenCabinetEngine {

    /**
     * Build the full THREE.Group for the entire kitchen cabinet run.
     * The group origin is centred on the main-arm mid-point at floor level (Y = 0).
     */
    create(config: KitchenCabinetConfig): THREE.Group {
        const root = new THREE.Group();

        const isTall      = isTallKitchenLayout(config.layoutType);
        const baseLayout  = baseKitchenLayout(config.layoutType);

        const d = {
            depth:            config.depth            ?? KITCHEN_DEFAULTS.depth,
            length:           config.length           ?? KITCHEN_DEFAULTS.length,
            height:           config.height           ?? KITCHEN_DEFAULTS.height,
            numUnits:         config.numUnits         ?? KITCHEN_DEFAULTS.numUnits,
            carcassColor:     config.carcassColor     ?? KITCHEN_DEFAULTS.carcassColor,
            carcassMaterialId: config.carcassMaterialId,
            frontColor:       config.frontColor       ?? KITCHEN_DEFAULTS.frontColor,
            frontMaterialId:  config.frontMaterialId,
            countertopColor:  config.countertopColor  ?? KITCHEN_DEFAULTS.countertopColor,
            countertopMaterialId: config.countertopMaterialId,
            handleColor:      config.handleColor      ?? KITCHEN_DEFAULTS.handleColor,
            countertopHeight: KITCHEN_DEFAULTS.countertopHeight,
            upperCabinetHeight: config.upperCabinetHeight ?? KITCHEN_DEFAULTS.upperCabinetHeight,
            upperCabinetDepth:  config.upperCabinetDepth  ?? KITCHEN_DEFAULTS.upperCabinetDepth,
            upperCabinetGap:    config.upperCabinetGap    ?? KITCHEN_DEFAULTS.upperCabinetGap,
        };

        const units      = config.units ?? [];
        const mainUnits  = units.filter(u => u.arm === 'main');
        const leftUnits  = units.filter(u => u.arm === 'left');
        const rightUnits = units.filter(u => u.arm === 'right');

        const mainUnitW  = d.length / d.numUnits;
        const leftLen    = config.lengthLeft   ?? 0;
        const rightLen   = config.lengthRight  ?? 0;
        const numLeft    = config.numUnitsLeft  ?? 0;
        const numRight   = config.numUnitsRight ?? 0;
        const leftUnitW  = numLeft  > 0 ? leftLen  / numLeft  : 0;
        const rightUnitW = numRight > 0 ? rightLen / numRight : 0;

        const bodyH = d.height - d.countertopHeight;
        const ctH   = d.countertopHeight;

        // ── Upper cabinet dimensions (tall layouts) ─────────────────────────
        const upperH      = d.upperCabinetHeight;
        const upperDep    = d.upperCabinetDepth;
        const upperGap    = d.upperCabinetGap;
        const upperBaseY  = d.height + upperGap;  // Y at bottom of upper cabinet

        // ── Materials (resolved once for the whole run) ────────────────────────
        const carcassMat    = materialFromId(d.carcassMaterialId, d.carcassColor, { roughness: 0.7, metalness: 0.05 });
        const countertopMat = materialFromId(d.countertopMaterialId, d.countertopColor, { roughness: 0.3, metalness: 0.1 });

        // Upper carcass: slightly lighter shade for wall cabinets
        const upperCarcassMat = materialFromId(d.carcassMaterialId, d.carcassColor, { roughness: 0.65, metalness: 0.05 });

        // Island uses marble by default when no material is set
        const islandCtMat = materialFromId(
            d.countertopMaterialId ?? KITCHEN_DEFAULTS.islandCountertopMaterialId,
            d.countertopColor,
            { roughness: 0.15, metalness: 0.05 },
        );

        // ── ISLAND layout (double-sided: cabinets on both faces) ───────────────
        if (config.layoutType === 'kitchen_island') {
            const cabDepth = d.depth; // per-cabinet-row depth

            // Front row — faces -Z (outward), group centered at Z = -cabDepth/2
            for (let i = 0; i < d.numUnits; i++) {
                const unitCfg = mainUnits[i] ?? { index: i, arm: 'main' as const, front: 'door' };
                const uw = unitCfg.width ?? mainUnitW;
                const cx = i * mainUnitW + mainUnitW / 2;
                const grp = this._buildUnit(unitCfg, uw, cabDepth, d.height, d, Math.PI, carcassMat);
                grp.position.set(cx, 0, -cabDepth / 2);
                root.add(grp);
            }

            // Back row — faces +Z (outward), group centered at Z = +cabDepth/2
            // Uses 'left' arm unit configs if defined, otherwise mirrors front row
            const backUnits = leftUnits.length > 0 ? leftUnits : mainUnits;
            for (let i = 0; i < d.numUnits; i++) {
                const unitCfg = backUnits[i] ?? { index: i, arm: 'main' as const, front: 'door' };
                const uw = unitCfg.width ?? mainUnitW;
                const cx = i * mainUnitW + mainUnitW / 2;
                const grp = this._buildUnit(unitCfg, uw, cabDepth, d.height, d, 0, carcassMat);
                grp.position.set(cx, 0, cabDepth / 2);
                root.add(grp);
            }

            // Countertop spans both rows with 10 cm overhang on all sides
            const ov = KITCHEN_DEFAULTS.islandCountertopOverhang;
            const islandTotalDepth = cabDepth * 2;
            const ctGeo = new THREE.BoxGeometry(d.length + ov * 2, ctH, islandTotalDepth + ov * 2);
            const ctMesh = new THREE.Mesh(ctGeo, islandCtMat);
            ctMesh.position.set(d.length / 2, bodyH + ctH / 2, 0);
            ctMesh.castShadow = true;
            ctMesh.userData.elementType = 'KitchenCountertop';
            ctMesh.userData.isKitchenCountertop = true;
            ctMesh.userData.kitchenArm = 'main';
            root.add(ctMesh);

            // Centre the island on the placement origin
            root.position.set(-d.length / 2, 0, 0);
            this._tagForPlanView(root);
            return root;
        }

        // ── Resolve effective base layout (strips _tall suffix) ───────────────
        const effectiveLayout: KitchenLayoutType = baseLayout;

        // ── STRAIGHT / L / U layouts ───────────────────────────────────────────

        // Main arm (along +X): units from cx=0 to cx=length in root local
        // Units face +Z (no rotation). Front panel is at local +depth/2.
        for (let i = 0; i < d.numUnits; i++) {
            const unitCfg = mainUnits[i] ?? { index: i, arm: 'main' as const, front: 'door' };
            const uw = unitCfg.width ?? mainUnitW;
            const cx = i * mainUnitW + mainUnitW / 2;
            const group = this._buildUnit(unitCfg, uw, d.depth, d.height, d, 0, carcassMat);
            group.position.set(cx, 0, 0);
            root.add(group);
        }

        // ── Unified MAIN ARM countertop (segmented with cutouts for appliances) ──
        // Front (kitchen user-facing side) is at +Z; overhang extends in +Z.
        const mainCtFrontOv = 0.02;
        this._buildArmCountertop({
            root,
            armName:      'main',
            units:        mainUnits,
            numUnits:     d.numUnits,
            unitW:        mainUnitW,
            armLength:    d.length,
            cabinetDepth: d.depth,
            frontOv:      mainCtFrontOv,
            alongAxis:    'X',
            alongStart:   0,
            perpBack:     -d.depth / 2,
            perpFrontDir: 1,
            ctTopY:       bodyH + ctH / 2,
            ctH,
            mat:          countertopMat,
        });

        // ── Tall: Main arm UPPER cabinets ──────────────────────────────────────
        if (isTall) {
            this._buildUpperRow(
                root, mainUnits, d.numUnits, mainUnitW, d.length,
                upperH, upperDep, d, 0,
                upperBaseY, upperCarcassMat,
            );
        }

        // ── Left arm (along +Z from X=0 end) ──────────────────────────────────
        if (effectiveLayout !== 'kitchen_straight' && numLeft > 0 && leftLen > 0) {
            const armGroup = new THREE.Group();
            for (let i = 0; i < numLeft; i++) {
                const unitCfg = leftUnits[i] ?? { index: i, arm: 'left' as const, front: 'door' };
                const uw = unitCfg.width ?? leftUnitW;
                const cz = i * leftUnitW + leftUnitW / 2;
                // rotationY = +PI/2: local +Z → parent +X (faces inward toward kitchen center)
                const group = this._buildUnit(unitCfg, uw, d.depth, d.height, d, Math.PI / 2, carcassMat);
                group.position.set(0, 0, cz);
                armGroup.add(group);
            }
            // armGroup at X = depth/2 (center of left arm depth block), Z = depth/2
            armGroup.position.set(d.depth / 2, 0, d.depth / 2);
            root.add(armGroup);

            // Left arm unified countertop (segmented with appliance cutouts).
            // Units occupy: root-X [0 → depth], root-Z [depth/2 → depth/2 + leftLen].
            // Front overhang (2 cm) is in +X direction (toward kitchen interior).
            const leftCtFrontOv = 0.02;
            this._buildArmCountertop({
                root,
                armName:      'left',
                units:        leftUnits,
                numUnits:     numLeft,
                unitW:        leftUnitW,
                armLength:    leftLen,
                cabinetDepth: d.depth,
                frontOv:      leftCtFrontOv,
                alongAxis:    'Z',
                alongStart:   d.depth / 2,
                perpBack:     0,
                perpFrontDir: 1,
                ctTopY:       bodyH + ctH / 2,
                ctH,
                mat:          countertopMat,
            });

            // Tall: Left arm upper cabinets
            if (isTall) {
                const upperArmGroup = new THREE.Group();
                this._buildUpperRow(
                    upperArmGroup, leftUnits, numLeft, leftUnitW, leftLen,
                    upperH, upperDep, d, Math.PI / 2,
                    upperBaseY, upperCarcassMat,
                );
                upperArmGroup.position.set(d.depth / 2, 0, d.depth / 2);
                root.add(upperArmGroup);
            }
        }

        // ── Right arm (along +Z from X=length end) ─────────────────────────────
        if (effectiveLayout === 'kitchen_u_shape' && numRight > 0 && rightLen > 0) {
            const armGroup = new THREE.Group();
            for (let i = 0; i < numRight; i++) {
                const unitCfg = rightUnits[i] ?? { index: i, arm: 'right' as const, front: 'door' };
                const uw = unitCfg.width ?? rightUnitW;
                const cz = i * rightUnitW + rightUnitW / 2;
                // rotationY = -PI/2: local +Z → parent -X (faces inward toward kitchen center)
                const group = this._buildUnit(unitCfg, uw, d.depth, d.height, d, -Math.PI / 2, carcassMat);
                group.position.set(0, 0, cz);
                armGroup.add(group);
            }
            // armGroup at X = length - depth/2 (center of right arm depth block), Z = depth/2
            armGroup.position.set(d.length - d.depth / 2, 0, d.depth / 2);
            root.add(armGroup);

            // Right arm unified countertop (segmented with appliance cutouts).
            // Units occupy: root-X [length-depth → length], root-Z [depth/2 → depth/2 + rightLen].
            // Front overhang (2 cm) is in -X direction (toward kitchen interior).
            const rightCtFrontOv = 0.02;
            this._buildArmCountertop({
                root,
                armName:      'right',
                units:        rightUnits,
                numUnits:     numRight,
                unitW:        rightUnitW,
                armLength:    rightLen,
                cabinetDepth: d.depth,
                frontOv:      rightCtFrontOv,
                alongAxis:    'Z',
                alongStart:   d.depth / 2,
                perpBack:     d.length,
                perpFrontDir: -1,
                ctTopY:       bodyH + ctH / 2,
                ctH,
                mat:          countertopMat,
            });

            // Tall: Right arm upper cabinets
            if (isTall) {
                const upperArmGroup = new THREE.Group();
                this._buildUpperRow(
                    upperArmGroup, rightUnits, numRight, rightUnitW, rightLen,
                    upperH, upperDep, d, -Math.PI / 2,
                    upperBaseY, upperCarcassMat,
                );
                upperArmGroup.position.set(d.length - d.depth / 2, 0, d.depth / 2);
                root.add(upperArmGroup);
            }
        }

        // Centre the whole cabinet run on the placement origin
        root.position.set(-d.length / 2, 0, 0);

        this._tagForPlanView(root);
        return root;
    }

    /**
     * §36-KITCHEN-CABINET-ELEMENT-CONTRACT §4 + §02-BIM-SPATIAL-PROJECTION:
     * Mark every kitchen sub-mesh so EdgeProjectorService skips it in plan
     * view (KitchenPlanSymbolBuilder injects a clean 2D symbol instead) and
     * uses a 30° edge-angle threshold for elevation/section views to suppress
     * coplanar panel-seam ladders.  Section/elevation views still see the
     * meshes; only plan-view native edge projection is skipped.
     */
    private _tagForPlanView(root: THREE.Group): void {
        root.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                obj.userData.skipInPlan   = true;
                obj.userData.edgeAngleDeg = 30;
            }
        });
    }

    // ── Upper cabinet row builder ─────────────────────────────────────────────

    /**
     * Build a segmented countertop for one arm of the kitchen, omitting tops
     * over fridge / washing-machine units and cutting a precise basin-sized
     * opening above each sink unit.
     *
     * Local arm coords:
     *   u-axis  -> along the run of units (length of the arm)
     *   v-axis  -> from cabinet back (v=0) to front edge incl. overhang
     *              (v = cabinetDepth + frontOv)
     * These are converted to root (X, Z) using `alongAxis`, `alongStart`,
     * `perpBack` and `perpFrontDir`.
     */
    private _buildArmCountertop(opts: {
        root:         THREE.Group;
        armName:      'main' | 'left' | 'right';
        units:        ReadonlyArray<{ front?: string; appliance?: string; width?: number } | undefined>;
        numUnits:     number;
        unitW:        number;
        armLength:    number;
        cabinetDepth: number;
        frontOv:      number;
        alongAxis:    'X' | 'Z';
        alongStart:   number;
        perpBack:     number;
        perpFrontDir: 1 | -1;
        ctTopY:       number;
        ctH:          number;
        mat:          THREE.Material;
    }): void {
        const {
            root, armName, units, numUnits, unitW, cabinetDepth, frontOv,
            alongAxis, alongStart, perpBack, perpFrontDir, ctTopY, ctH, mat,
        } = opts;

        const CUTOUT_APPLIANCES = new Set([
            'sink_inox', 'sink_dark',
            'fridge_compact_silver', 'fridge_compact_dark',
            'fridge_combi_silver',   'fridge_combi_dark',
            'fridge_side_silver',    'fridge_side_dark',
            'washing_machine_dark',  'washing_machine_white',
        ]);
        const SINK_APPLIANCES = new Set(['sink_inox', 'sink_dark']);

        // Total perpendicular span (back of cabinet to front edge incl overhang)
        const vMax = cabinetDepth + frontOv;

        // Build a single rectangular slab in arm-local (u, v) coords.
        const addSlab = (uMin: number, uMax: number, vMin: number, vMax_: number) => {
            const uLen = uMax - uMin;
            const vLen = vMax_ - vMin;
            if (uLen < 0.001 || vLen < 0.001) return;

            const uMid = (uMin + uMax) / 2;
            const vMid = (vMin + vMax_) / 2;

            // Convert (u, v) -> (rootX, rootZ).
            const xLen = alongAxis === 'X' ? uLen : vLen;
            const zLen = alongAxis === 'X' ? vLen : uLen;
            const rootX = alongAxis === 'X'
                ? alongStart + uMid
                : perpBack   + vMid * perpFrontDir;
            const rootZ = alongAxis === 'X'
                ? perpBack   + vMid * perpFrontDir
                : alongStart + uMid;

            const geo  = new THREE.BoxGeometry(xLen, ctH, zLen);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(rootX, ctTopY, rootZ);
            mesh.castShadow = true;
            mesh.userData.elementType        = 'KitchenCountertop';
            mesh.userData.isKitchenCountertop = true;
            mesh.userData.kitchenArm         = armName;
            root.add(mesh);
        };

        let segStart = 0;
        for (let i = 0; i <= numUnits; i++) {
            const unit      = i < numUnits ? units[i] : undefined;
            const appliance = unit?.appliance;
            const hasCutout = !!appliance && CUTOUT_APPLIANCES.has(appliance);

            if (hasCutout || i === numUnits) {
                // Solid slab from previous boundary up to this unit's left edge
                addSlab(segStart * unitW, i * unitW, 0, vMax);

                if (hasCutout && unit) {
                    const uw     = unit.width ?? unitW;
                    const unitU0 = i * unitW;
                    const unitUc = unitU0 + uw / 2;

                    if (SINK_APPLIANCES.has(appliance!)) {
                        // Basin footprint — must match the basin geometry built
                        // in _addSink() AND the carcass-top opening built in
                        // _buildUnit(). Centralised in _sinkBasinFootprint so
                        // the three sites cannot drift apart.
                        const { basinW, basinD } = this._sinkBasinFootprint(uw, cabinetDepth);

                        // Basin centre on the perp axis = cabinet centre = depth/2
                        // (basin in unit-local space is at z = 0).
                        const basinVCtr = cabinetDepth / 2;
                        const basinVMin = basinVCtr - basinD / 2;
                        const basinVMax = basinVCtr + basinD / 2;
                        const basinUMin = unitUc - basinW / 2;
                        const basinUMax = unitUc + basinW / 2;

                        // Side strips (full perp depth, beside the opening)
                        addSlab(unitU0,    basinUMin, 0, vMax);
                        addSlab(basinUMax, unitU0 + uw, 0, vMax);
                        // Back strip (between cabinet back and basin)
                        addSlab(basinUMin, basinUMax, 0,         basinVMin);
                        // Front strip (between basin and front edge incl overhang)
                        addSlab(basinUMin, basinUMax, basinVMax, vMax);
                    }
                    // Fridges / washing machines: countertop fully omitted above.
                }
                segStart = i + 1;
            }
        }
    }

    /**
     * Build a row of wall/upper cabinets and add them to `parent`.
     * The row shares the same arm layout (number of units, unit widths) as the base cabinets.
     * Units face the same direction as base (determined by `rotationY`).
     */
    private _buildUpperRow(
        parent:       THREE.Group,
        unitConfigs:  { arm: string; front: string; width?: number }[],
        numUnits:     number,
        _unitW:       number,
        totalLen:     number,
        upperH:       number,
        upperDep:     number,
        d: {
            depth: number; length: number; height: number; numUnits: number;
            countertopHeight: number;
            carcassColor: string; carcassMaterialId?: string;
            frontColor: string; frontMaterialId?: string;
            countertopColor: string; countertopMaterialId?: string;
            handleColor: string;
        },
        rotationY:    number,
        upperBaseY:   number,
        upperMat:     THREE.MeshStandardMaterial,
    ): void {
        const upperUnitW = totalLen / numUnits;

        for (let i = 0; i < numUnits; i++) {
            const cfg = unitConfigs[i] as any ?? { index: i, arm: 'main', front: 'door' };
            const uw  = cfg.width ?? upperUnitW;
            const cz  = i * upperUnitW + upperUnitW / 2;

            const upperUnit = this._buildUnit(cfg, uw, upperDep, upperH, {
                ...d,
                depth: upperDep,
                height: upperH,
                countertopHeight: 0,
            }, rotationY, upperMat);

            // Position along local Z axis (same axis used for left/right arms);
            // for main arm (rotationY = 0) we place along X directly.
            if (rotationY === 0) {
                upperUnit.position.set(cz, upperBaseY, 0);
            } else {
                upperUnit.position.set(0, upperBaseY, cz);
            }
            upperUnit.userData.isUpperCabinet = true;
            parent.add(upperUnit);
        }
    }

    // ── Unit builder ──────────────────────────────────────────────────────────

    /**
     * Build one cabinet unit group. No countertop is generated here;
     * countertops are built as unified arm slabs in create().
     *
     * @param rotationY  Y-axis rotation for the unit:
     *                   0         = main arm (front at local +Z → world +Z)
     *                   +PI/2     = left arm  (front at local +Z → world +X, inward)
     *                   -PI/2     = right arm (front at local +Z → world -X, inward)
     * @param carcassMat resolved carcass material (passed in to avoid re-resolving)
     */
    /**
     * Single source of truth for the sink-basin footprint inside a unit.
     *
     * Three places need the same numbers and they must never drift:
     *   1. {@link _buildArmCountertop} — strips a rectangular hole in the
     *      countertop above the basin.
     *   2. {@link _addSink} — sizes the basin walls / rim so the rim sits
     *      flush in that hole.
     *   3. {@link _buildUnit} — strips the carcass TOP panel so the basin
     *      can drop INTO the cabinet (otherwise the solid top panel blocks
     *      it and the sink looks like it sits on a closed surface).
     *
     * @param uw    Unit width along the run.
     * @param depth Cabinet depth (front-to-back).
     */
    private _sinkBasinFootprint(uw: number, depth: number): { basinW: number; basinD: number } {
        return {
            basinW: Math.min(uw    - 0.08, 0.50),
            basinD: Math.min(depth - 0.10, 0.44),
        };
    }

    private _buildUnit(
        cfg:        { index?: number; arm?: string; front?: string; width?: number; doorMaterialId?: string; doorColor?: string; handleStyle?: string; numDrawers?: number; numShelves?: number; appliance?: string },
        unitW:      number,
        depth:      number,
        height:     number,
        d: {
            depth: number; length: number; height: number; numUnits: number;
            countertopHeight: number;
            carcassColor: string; carcassMaterialId?: string;
            frontColor: string; frontMaterialId?: string;
            countertopColor: string; countertopMaterialId?: string;
            handleColor: string;
        },
        rotationY   = 0,
        carcassMat?: THREE.MeshStandardMaterial,
    ): THREE.Group {
        const group = new THREE.Group();
        group.userData.kitchenUnitIndex = cfg.index ?? 0;
        group.userData.kitchenArm       = cfg.arm   ?? 'main';
        group.userData.kitchenFront     = cfg.front ?? 'door';
        group.userData.elementType      = 'KitchenCabinetUnit';

        const appliance = cfg.appliance as KitchenApplianceType | undefined;

        // Washing machines and fridges fully replace the carcass/front
        const isReplacementAppliance = !!appliance && (
            appliance.startsWith('washing_machine') ||
            appliance.startsWith('fridge')
        );

        const resolvedCarcassMat = carcassMat ?? materialFromId(d.carcassMaterialId, d.carcassColor, { roughness: 0.7, metalness: 0.05 });

        const frontMat = materialFromId(
            (cfg.doorMaterialId as string | undefined) ?? d.frontMaterialId,
            (cfg.doorColor as string | undefined) ?? d.frontColor,
            { roughness: 0.5, metalness: 0.0 },
        );
        const handleMat = mat(d.handleColor, { roughness: 0.2, metalness: 0.8 });
        const glassMat  = new THREE.MeshStandardMaterial({
            color: 0xccddee,
            transparent: true, opacity: 0.30,
            roughness: 0.05, metalness: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const ctH   = d.countertopHeight;
        const bodyH = height - ctH;

        if (!isReplacementAppliance) {
            // ── Carcass (body) ─────────────────────────────────────────────────
            // Built as a 5-panel shell (back + 2 sides + top + bottom) with the
            // FRONT FACE OPEN, so glass / framed-glass doors reveal the interior
            // and shelves sit inside a properly-formed box. Opaque doors and
            // drawers still hide the interior because the door panel covers the
            // open front.
            const carcassW = unitW - 0.002;
            const carcassD = depth - 0.002;
            const PT       = 0.018;                       // panel thickness (~18 mm board)
            const halfW    = carcassW / 2;
            const halfD    = carcassD / 2;

            const addPanel = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
                const m = new THREE.Mesh(
                    new THREE.BoxGeometry(sx, sy, sz),
                    resolvedCarcassMat,
                );
                m.position.set(x, y, z);
                m.castShadow    = true;
                m.receiveShadow = true;
                m.userData.isKitchenPart = true;
                m.userData.elementType   = 'KitchenCabinetPart';
                group.add(m);
            };

            // Bottom panel spans the full inner footprint.
            addPanel(carcassW, PT, carcassD, 0, PT / 2, 0);

            // Top panel — full slab UNLESS the unit hosts a sink, in which
            // case we strip a rectangular opening that exactly matches the
            // basin footprint so the basin can drop INTO the cabinet (the
            // countertop above is already cut to match — see
            // _buildArmCountertop). Without this the solid top blocks the
            // basin and the sink looks like it sits on a closed surface.
            const topY      = bodyH - PT / 2;
            const isSinkUnit = appliance === 'sink_inox' || appliance === 'sink_dark';
            if (isSinkUnit) {
                const { basinW, basinD } = this._sinkBasinFootprint(unitW, depth);
                // Local unit coords: x along width, z along depth (front at +z).
                // Basin is centred at (0, 0).
                const bxMin = -basinW / 2;
                const bxMax =  basinW / 2;
                const bzMin = -basinD / 2;
                const bzMax =  basinD / 2;

                const cxMin = -carcassW / 2;
                const cxMax =  carcassW / 2;
                const czMin = -carcassD / 2;
                const czMax =  carcassD / 2;

                // Strip layout (4 rectangles around the opening):
                //   left strip  — full depth, cabinet left edge → basin left
                //   right strip — full depth, basin right       → cabinet right
                //   back strip  — basin width only, cabinet back → basin back
                //   front strip — basin width only, basin front  → cabinet front
                const addTopStrip = (xMin: number, xMax: number, zMin: number, zMax: number) => {
                    const sx = xMax - xMin;
                    const sz = zMax - zMin;
                    if (sx < 0.001 || sz < 0.001) return;
                    addPanel(sx, PT, sz, (xMin + xMax) / 2, topY, (zMin + zMax) / 2);
                };
                addTopStrip(cxMin, bxMin, czMin, czMax);     // left
                addTopStrip(bxMax, cxMax, czMin, czMax);     // right
                addTopStrip(bxMin, bxMax, czMin, bzMin);     // back
                addTopStrip(bxMin, bxMax, bzMax, czMax);     // front
            } else {
                addPanel(carcassW, PT, carcassD, 0, topY, 0);
            }
            // Back panel (closes the rear)
            addPanel(carcassW, bodyH,      PT,       0, bodyH / 2,      -halfD + PT / 2);
            // Left / right side panels (between top & bottom, in front of back)
            const sideH = bodyH - 2 * PT;
            const sideD = carcassD - PT;
            const sideY = PT + sideH / 2;
            const sideZ = PT / 2;
            addPanel(PT, sideH, sideD, -halfW + PT / 2, sideY, sideZ);
            addPanel(PT, sideH, sideD,  halfW - PT / 2, sideY, sideZ);

            // Front Z offset: front face of carcass is at +Z side (user-facing)
            const frontZ = (depth / 2) - 0.002;

            // ── Front panel ────────────────────────────────────────────────────
            const front       = cfg.front ?? 'door';
            const handleStyle = (cfg.handleStyle as KitchenHandleStyle | undefined) ?? 'bar';
            const numDrawers  = cfg.numDrawers ?? 2;
            const numShelves  = cfg.numShelves ?? 2;

            switch (front) {
                case 'door':
                    this._addDoor(group, unitW, bodyH, frontZ, frontMat, handleMat, handleStyle);
                    break;
                case 'glass_door':
                    this._addDoor(group, unitW, bodyH, frontZ, glassMat, handleMat, handleStyle);
                    this._addInteriorShelf(group, unitW, bodyH, depth, resolvedCarcassMat, 1);
                    break;
                case 'framed_glass_door':
                    this._addFramedGlassDoor(group, unitW, bodyH, frontZ, frontMat, glassMat, handleMat, handleStyle);
                    this._addInteriorShelf(group, unitW, bodyH, depth, resolvedCarcassMat, 1);
                    break;
                case 'drawers':
                    this._addDrawers(group, unitW, bodyH, frontZ, frontMat, handleMat, handleStyle as KitchenHandleStyle ?? 'line', numDrawers);
                    break;
                case 'shelf':
                    this._addOpenShelf(group, unitW, bodyH, depth, resolvedCarcassMat, numShelves);
                    break;
                case 'none':
                default:
                    break;
            }
        }

        // ── Appliance overlay ──────────────────────────────────────────────────
        if (appliance) {
            this._buildAppliance(group, appliance, unitW, depth, height, ctH);
        }

        // Apply Y-axis rotation to face the correct direction
        if (rotationY !== 0) {
            group.rotation.y = rotationY;
        }

        return group;
    }

    // ── Appliance builder ─────────────────────────────────────────────────────

    private _buildAppliance(
        group:     THREE.Group,
        appliance: KitchenApplianceType,
        unitW:     number,
        depth:     number,
        height:    number,
        ctH:       number,
    ): void {
        const bodyH  = height - ctH;
        const ctTopY = bodyH + ctH; // Y at top surface of countertop

        switch (appliance) {
            case 'hob':
                this._addHob(group, unitW, depth, ctTopY);
                break;
            case 'sink_inox':
                this._addSink(group, unitW, depth, bodyH, ctH, false);
                break;
            case 'sink_dark':
                this._addSink(group, unitW, depth, bodyH, ctH, true);
                break;
            case 'washing_machine_dark':
                this._addWashingMachine(group, unitW, depth, height, ctH, '#3e3e3e');
                break;
            case 'washing_machine_white':
                this._addWashingMachine(group, unitW, depth, height, ctH, '#f2f2f2');
                break;
            case 'fridge_compact_silver':
                this._addFridgeCompact(group, unitW, depth, '#c8c8c8', false);
                break;
            case 'fridge_compact_dark':
                this._addFridgeCompact(group, unitW, depth, '#1e1e1e', false);
                break;
            case 'fridge_combi_silver':
                this._addFridgeCompact(group, unitW, depth, '#c4c4c4', true);
                break;
            case 'fridge_combi_dark':
                this._addFridgeCompact(group, unitW, depth, '#1a1a1a', true);
                break;
            case 'fridge_side_silver':
                this._addFridgeSideBySide(group, unitW, depth, '#b8b8b8');
                break;
            case 'fridge_side_dark':
                this._addFridgeSideBySide(group, unitW, depth, '#111111');
                break;
        }
    }

    // ── HOB ─────────────────────────────────────────────────────────────────

    private _addHob(group: THREE.Group, unitW: number, _depth: number, ctTopY: number): void {
        const hobW = Math.min(unitW - 0.04, 0.80);
        const hobD = 0.52;
        const hobT = 0.012;

        // Black glass surface
        const glassMat = mat('#080808', { roughness: 0.05, metalness: 0.3 });
        const hobGeo = new THREE.BoxGeometry(hobW, hobT, hobD);
        const hob    = new THREE.Mesh(hobGeo, glassMat);
        hob.position.set(0, ctTopY + hobT / 2, -0.02);
        hob.castShadow = true;
        hob.userData.isKitchenPart = true;
        group.add(hob);

        // Silver trim frame
        const trimMat = mat('#9a9a9a', { roughness: 0.2, metalness: 0.85 });
        const trimT   = 0.008;
        const frames  = [
            { x: 0, z: -0.02 + hobD / 2,  sx: hobW, sz: trimT },
            { x: 0, z: -0.02 - hobD / 2,  sx: hobW, sz: trimT },
            { x:  hobW / 2, z: -0.02, sx: trimT, sz: hobD },
            { x: -hobW / 2, z: -0.02, sx: trimT, sz: hobD },
        ];
        for (const f of frames) {
            const fm = new THREE.Mesh(new THREE.BoxGeometry(f.sx, 0.004, f.sz), trimMat);
            fm.position.set(f.x, ctTopY + hobT + 0.002, f.z);
            fm.userData.isKitchenPart = true;
            group.add(fm);
        }

        // Four induction cooking zones (rectangular glow areas)
        const zoneMat = mat('#141414', { roughness: 0.04, metalness: 0.1 });
        const zoneRingMat = mat('#555555', { roughness: 0.1, metalness: 0.4 });
        const zones = [
            { x: -hobW * 0.26, z: -0.02 - 0.12 },
            { x:  hobW * 0.26, z: -0.02 - 0.12 },
            { x: -hobW * 0.26, z: -0.02 + 0.12 },
            { x:  hobW * 0.26, z: -0.02 + 0.12 },
        ];
        for (const z of zones) {
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.090, 0.002, 32), zoneRingMat);
            ring.position.set(z.x, ctTopY + hobT + 0.001, z.z);
            ring.userData.isKitchenPart = true;
            group.add(ring);
            const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.080, 0.002, 32), zoneMat);
            inner.position.set(z.x, ctTopY + hobT + 0.002, z.z);
            inner.userData.isKitchenPart = true;
            group.add(inner);
        }

        // Integrated extractor — central silver duct strip
        const ductMat = mat('#888888', { roughness: 0.25, metalness: 0.75 });
        const duct    = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, hobD * 0.5), ductMat);
        duct.position.set(0, ctTopY + hobT + 0.04, -0.02);
        duct.userData.isKitchenPart = true;
        group.add(duct);

        // Red/orange touch control strip at front edge
        const ctrlMat = mat('#cc2200', { roughness: 0.3, metalness: 0.0, emissive: new THREE.Color('#440800'), emissiveIntensity: 0.4 } as any);
        const ctrl    = new THREE.Mesh(new THREE.BoxGeometry(hobW * 0.7, 0.003, 0.020), ctrlMat);
        ctrl.position.set(0, ctTopY + hobT + 0.001, -0.02 + hobD / 2 - 0.025);
        ctrl.userData.isKitchenPart = true;
        group.add(ctrl);

        // BOSCH logo silver strip
        const logoMat = mat('#aaaaaa', { roughness: 0.2, metalness: 0.6 });
        const logo    = new THREE.Mesh(new THREE.BoxGeometry(hobW * 0.15, 0.003, 0.008), logoMat);
        logo.position.set(-hobW * 0.3, ctTopY + hobT + 0.001, -0.02 + hobD / 2 - 0.018);
        logo.userData.isKitchenPart = true;
        group.add(logo);
    }

    // ── SINK ──────────────────────────────────────────────────────────────────

    private _addSink(
        group: THREE.Group,
        unitW: number,
        depth: number,
        bodyH: number,
        ctH:   number,
        isDark: boolean,
    ): void {
        const sinkColor    = isDark ? '#2a2a2a' : '#c0c0c0';
        const sinkMetal    = isDark ? 0.4 : 0.75;
        const tapColor     = isDark ? '#1a1a1a' : '#c8c8c8';
        const sinkMat      = mat(sinkColor, { roughness: isDark ? 0.3 : 0.2, metalness: sinkMetal });
        const tapMat       = mat(tapColor,  { roughness: 0.1, metalness: 0.9 });
        const drainMat     = mat('#555555', { roughness: 0.3, metalness: 0.6 });
        const innerSinkMat = mat(isDark ? '#141414' : '#a8a8a8', { roughness: 0.15, metalness: sinkMetal + 0.1 });

        // Footprint is centralised — must match _buildArmCountertop() and the
        // carcass-top opening built in _buildUnit().
        const { basinW, basinD } = this._sinkBasinFootprint(unitW, depth);
        const basinH = ctH + 0.10;
        const ctTopY = bodyH + ctH;
        const rimT   = 0.012;

        // Outer sink rim (sits level with countertop top)
        const rimGeo = new THREE.BoxGeometry(basinW + rimT * 2, rimT, basinD + rimT * 2);
        const rim    = new THREE.Mesh(rimGeo, sinkMat);
        rim.position.set(0, ctTopY - rimT / 2, 0);
        rim.castShadow = true;
        rim.userData.isKitchenPart = true;
        group.add(rim);

        // Basin walls (4 sides + bottom)
        const wallT = 0.010;
        const wallParts = [
            { x: 0,              y: ctTopY - basinH / 2, sx: basinW, sy: basinH, sz: wallT,  z:  basinD / 2 },
            { x: 0,              y: ctTopY - basinH / 2, sx: basinW, sy: basinH, sz: wallT,  z: -basinD / 2 },
            { x:  basinW / 2,   y: ctTopY - basinH / 2, sx: wallT,  sy: basinH, sz: basinD, z: 0 },
            { x: -basinW / 2,   y: ctTopY - basinH / 2, sx: wallT,  sy: basinH, sz: basinD, z: 0 },
            { x: 0,              y: ctTopY - basinH,     sx: basinW, sy: wallT,  sz: basinD, z: 0 },
        ];
        for (const p of wallParts) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, p.sz), sinkMat);
            wall.position.set(p.x, p.y, p.z);
            wall.userData.isKitchenPart = true;
            group.add(wall);
        }

        // Inner basin reflective surface
        const innerGeo = new THREE.BoxGeometry(basinW - wallT, basinH - wallT, basinD - wallT);
        const inner    = new THREE.Mesh(innerGeo, innerSinkMat);
        inner.position.set(0, ctTopY - basinH / 2, 0);
        inner.userData.isKitchenPart = true;
        group.add(inner);

        // Drain
        const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 16), drainMat);
        drain.position.set(0, ctTopY - basinH + 0.004, 0);
        drain.userData.isKitchenPart = true;
        group.add(drain);

        // Tap column
        const tapNeckH = 0.19;
        const tapNeck  = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, tapNeckH, 12), tapMat);
        tapNeck.position.set(0.04, ctTopY + tapNeckH / 2, -basinD * 0.30);
        tapNeck.userData.isKitchenPart = true;
        group.add(tapNeck);

        // Tap spout (slightly angled horizontal tube)
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 10), tapMat);
        spout.rotation.z = Math.PI / 2;
        spout.position.set(0, ctTopY + tapNeckH - 0.01, -basinD * 0.30);
        spout.userData.isKitchenPart = true;
        group.add(spout);

        // Spring coil on tap for inox variant
        if (!isDark) {
            const coilMat = mat('#aaaaaa', { roughness: 0.15, metalness: 0.85 });
            for (let i = 0; i < 8; i++) {
                const coilRing = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 12), coilMat);
                coilRing.rotation.x = Math.PI / 2;
                coilRing.position.set(0.04, ctTopY + 0.04 + i * 0.016, -basinD * 0.30);
                coilRing.userData.isKitchenPart = true;
                group.add(coilRing);
            }
        }

        // Tap handle button (side)
        const tapBtn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.035), tapMat);
        tapBtn.position.set(0.04 + 0.018, ctTopY + tapNeckH - 0.03, -basinD * 0.30);
        tapBtn.userData.isKitchenPart = true;
        group.add(tapBtn);
    }

    // ── WASHING MACHINE ──────────────────────────────────────────────────────

    private _addWashingMachine(
        group: THREE.Group,
        unitW: number,
        depth: number,
        height: number,
        ctH: number,
        bodyHex: string,
    ): void {
        const isWhite = bodyHex.startsWith('#f');
        const bodyMat    = mat(bodyHex,   { roughness: 0.4, metalness: isWhite ? 0.0 : 0.2 });
        const ctrlMat    = mat('#111111', { roughness: 0.3, metalness: 0.1 });
        const chromeMat  = mat('#aaaaaa', { roughness: 0.1, metalness: 0.9 });
        const glassMat   = new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.3 });
        const drumMat    = mat('#c8c8c8', { roughness: 0.2, metalness: 0.75 });

        const mW = Math.min(unitW - 0.015, 0.598);
        const mD = Math.min(depth  - 0.015, 0.598);
        // Machine must fit under the countertop: height - ctH is the cabinet body height
        const mH = height - ctH - 0.01;

        // Main body
        const body = new THREE.Mesh(new THREE.BoxGeometry(mW, mH, mD), bodyMat);
        body.position.set(0, mH / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData.isKitchenPart = true;
        group.add(body);

        // Control panel top strip
        const panelH = mH * 0.13;
        const panel  = new THREE.Mesh(new THREE.BoxGeometry(mW - 0.002, panelH, 0.015), ctrlMat);
        panel.position.set(0, mH - panelH / 2, mD / 2 - 0.007);
        panel.userData.isKitchenPart = true;
        group.add(panel);

        // BOSCH logo strip on panel
        const logoMat = mat('#cc0000', { roughness: 0.3, metalness: 0.0 });
        const logo = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.003), logoMat);
        logo.position.set(-mW * 0.28, mH - panelH * 0.5, mD / 2 - 0.005);
        logo.userData.isKitchenPart = true;
        group.add(logo);

        // Dial (circular knob)
        const dialBase = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.018, 20), chromeMat);
        dialBase.rotation.x = Math.PI / 2;
        dialBase.position.set(mW * 0.28, mH - panelH * 0.5, mD / 2 - 0.004);
        dialBase.userData.isKitchenPart = true;
        group.add(dialBase);

        // Display rectangle
        const display = new THREE.Mesh(new THREE.BoxGeometry(0.075, panelH * 0.55, 0.003), mat('#002244', { roughness: 0.3, metalness: 0.0 }));
        display.position.set(0.02, mH - panelH * 0.5, mD / 2 - 0.004);
        display.userData.isKitchenPart = true;
        group.add(display);

        // Porthole chrome ring
        const portholeY = mH * 0.45;
        const portholeZ = mD / 2 - 0.002;
        const ringR = Math.min(mW, mD) * 0.33;

        const outerRing = new THREE.Mesh(new THREE.TorusGeometry(ringR + 0.018, 0.012, 16, 40), chromeMat);
        outerRing.rotation.x = Math.PI / 2;
        outerRing.position.set(0, portholeY, portholeZ + 0.002);
        outerRing.castShadow = true;
        outerRing.userData.isKitchenPart = true;
        group.add(outerRing);

        // Bosch-style concentric ring grooves (characteristic wave pattern)
        for (let i = 0; i < 3; i++) {
            const rr = ringR - 0.02 - i * 0.015;
            if (rr <= 0.02) continue;
            const rGroove = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.004, 8, 30), bodyMat);
            rGroove.rotation.x = Math.PI / 2;
            rGroove.position.set(-mW * 0.28 + (i * 0.012), portholeY, portholeZ + 0.008 + i * 0.003);
            rGroove.userData.isKitchenPart = true;
            group.add(rGroove);
        }

        // Porthole glass
        const portGlass = new THREE.Mesh(new THREE.CylinderGeometry(ringR, ringR, 0.018, 32), glassMat);
        portGlass.rotation.x = Math.PI / 2;
        portGlass.position.set(0, portholeY, portholeZ + 0.004);
        portGlass.userData.isKitchenPart = true;
        group.add(portGlass);

        // Drum (visible through glass)
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(ringR - 0.02, ringR - 0.02, 0.010, 32), drumMat);
        drum.rotation.x = Math.PI / 2;
        drum.position.set(0, portholeY, portholeZ - 0.002);
        drum.userData.isKitchenPart = true;
        group.add(drum);

        // Drum paddles (3 fins)
        const paddleMat = mat('#888888', { roughness: 0.3, metalness: 0.5 });
        for (let i = 0; i < 3; i++) {
            const angle  = (i / 3) * Math.PI * 2;
            const pr     = ringR * 0.55;
            const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.012, ringR * 0.30, 0.008), paddleMat);
            paddle.rotation.z = angle;
            paddle.position.set(
                Math.sin(angle) * pr * 0.5,
                portholeY + Math.cos(angle) * pr * 0.5,
                portholeZ - 0.003,
            );
            paddle.userData.isKitchenPart = true;
            group.add(paddle);
        }

        // Detergent drawer (top-left)
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(mW * 0.30, panelH * 0.55, 0.020), bodyMat);
        drawer.position.set(-mW * 0.29, mH - panelH * 0.5, mD / 2 - 0.005);
        drawer.userData.isKitchenPart = true;
        group.add(drawer);

        // Filter cap (bottom right)
        const filterCap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 12), bodyMat);
        filterCap.rotation.x = Math.PI / 2;
        filterCap.position.set(mW * 0.33, mH * 0.04, mD / 2 - 0.004);
        filterCap.userData.isKitchenPart = true;
        group.add(filterCap);

        // Feet (4 small cylinders)
        const footMat = mat('#666666', { roughness: 0.6, metalness: 0.3 });
        const feet = [[-mW * 0.35, mD * 0.38], [mW * 0.35, mD * 0.38], [-mW * 0.35, -mD * 0.38], [mW * 0.35, -mD * 0.38]];
        for (const [fx, fz] of feet) {
            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.025, 8), footMat);
            foot.position.set(fx, 0.012, fz);
            foot.userData.isKitchenPart = true;
            group.add(foot);
        }
    }

    // ── FRIDGE — COMPACT / COMBI ──────────────────────────────────────────────

    private _addFridgeCompact(
        group:    THREE.Group,
        unitW:    number,
        depth:    number,
        bodyHex:  string,
        hasDispenser: boolean,
    ): void {
        const fridgeH = 1.85;
        const mW      = Math.min(unitW - 0.015, 0.595);
        const mD      = Math.min(depth  - 0.015, 0.595);

        const isLight   = bodyHex.startsWith('#c') || bodyHex.startsWith('#b');
        const bodyMat   = mat(bodyHex, { roughness: isLight ? 0.25 : 0.2, metalness: isLight ? 0.7 : 0.4 });
        const seamMat   = mat('#222222', { roughness: 0.5, metalness: 0.1 });
        const handleMat = mat('#888888', { roughness: 0.15, metalness: 0.85 });

        // Main fridge body
        const body = new THREE.Mesh(new THREE.BoxGeometry(mW, fridgeH, mD), bodyMat);
        body.position.set(0, fridgeH / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData.isKitchenPart = true;
        group.add(body);

        // Fridge/freezer seam (freezer at bottom 30%)
        const seamY    = fridgeH * 0.30;
        const seam     = new THREE.Mesh(new THREE.BoxGeometry(mW + 0.002, 0.008, mD + 0.002), seamMat);
        seam.position.set(0, seamY, 0);
        seam.userData.isKitchenPart = true;
        group.add(seam);

        // Vertical handle — right side, on upper door
        const handleH  = (fridgeH - seamY) * 0.65;
        const handleY  = seamY + (fridgeH - seamY) * 0.5;
        const handle   = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, handleH, 10), handleMat);
        handle.position.set(mW / 2 - 0.025, handleY, mD / 2 - 0.015);
        handle.userData.isKitchenPart = true;
        group.add(handle);

        // Freezer handle
        const frzHandleH = seamY * 0.55;
        const frzHandle  = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, frzHandleH, 10), handleMat);
        frzHandle.position.set(mW / 2 - 0.025, seamY * 0.5, mD / 2 - 0.015);
        frzHandle.userData.isKitchenPart = true;
        group.add(frzHandle);

        // Water / ice dispenser niche (for combi variant)
        if (hasDispenser) {
            const nicheMat  = mat('#111111', { roughness: 0.5, metalness: 0.1 });
            const niche     = new THREE.Mesh(new THREE.BoxGeometry(mW * 0.28, (fridgeH - seamY) * 0.40, 0.030), nicheMat);
            niche.position.set(-mW * 0.22, seamY + (fridgeH - seamY) * 0.65, mD / 2 - 0.010);
            niche.userData.isKitchenPart = true;
            group.add(niche);

            // Dispenser nozzle
            const nozzleMat = mat('#555555', { roughness: 0.3, metalness: 0.6 });
            const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.008, 0.028, 8), nozzleMat);
            nozzle.rotation.x = Math.PI / 2;
            nozzle.position.set(-mW * 0.22, seamY + (fridgeH - seamY) * 0.62, mD / 2 - 0.005);
            nozzle.userData.isKitchenPart = true;
            group.add(nozzle);

            // Small display above niche
            const dispMat = mat('#001133', { roughness: 0.3, metalness: 0.0 });
            const disp = new THREE.Mesh(new THREE.BoxGeometry(mW * 0.18, (fridgeH - seamY) * 0.10, 0.010), dispMat);
            disp.position.set(-mW * 0.22, seamY + (fridgeH - seamY) * 0.87, mD / 2 - 0.008);
            disp.userData.isKitchenPart = true;
            group.add(disp);
        }
    }

    // ── FRIDGE — SIDE BY SIDE ────────────────────────────────────────────────

    private _addFridgeSideBySide(
        group:   THREE.Group,
        unitW:   number,
        depth:   number,
        bodyHex: string,
    ): void {
        const fridgeH = 1.78;
        const mW      = Math.min(unitW - 0.015, 0.875); // Respects unit width, caps at 90cm
        const mD      = Math.min(depth  - 0.015, 0.700);

        const isLight   = bodyHex.startsWith('#b') || bodyHex.startsWith('#c');
        const bodyMat   = mat(bodyHex, { roughness: isLight ? 0.20 : 0.15, metalness: isLight ? 0.75 : 0.50 });
        const seamMat   = mat('#111111', { roughness: 0.5, metalness: 0.1 });
        const handleMat = mat('#777777', { roughness: 0.12, metalness: 0.88 });
        const glassMat  = new THREE.MeshStandardMaterial({
            color: 0x224466,
            transparent: true, opacity: 0.5,
            roughness: 0.05, metalness: 0.3,
        });
        const darkMat   = mat('#080808', { roughness: 0.4, metalness: 0.1 });

        // Main body
        const body = new THREE.Mesh(new THREE.BoxGeometry(mW, fridgeH, mD), bodyMat);
        body.position.set(0, fridgeH / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        body.userData.isKitchenPart = true;
        group.add(body);

        // Vertical centre seam (left=freezer, right=fridge)
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, fridgeH + 0.002, mD + 0.002), seamMat);
        seam.position.set(0, fridgeH / 2, 0);
        seam.userData.isKitchenPart = true;
        group.add(seam);

        // Horizontal seam at mid height (separates upper glass panel from lower doors)
        const hSeamY = fridgeH * 0.54;
        const hSeam  = new THREE.Mesh(new THREE.BoxGeometry(mW + 0.002, 0.010, mD + 0.002), seamMat);
        hSeam.position.set(0, hSeamY, 0);
        hSeam.userData.isKitchenPart = true;
        group.add(hSeam);

        // Upper-right glass panel (InstaView window)
        const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(mW * 0.48, fridgeH - hSeamY - 0.02, 0.012), glassMat);
        glassPanel.position.set(mW * 0.26, hSeamY + (fridgeH - hSeamY) / 2, mD / 2 - 0.004);
        glassPanel.userData.isKitchenPart = true;
        group.add(glassPanel);

        // Black frame for glass panel
        const frameInset = 0.012;
        const glPW = mW * 0.48;
        const glPH = fridgeH - hSeamY - 0.02;
        const glPY = hSeamY + glPH / 2;
        const glassBorderParts = [
            { x: 0,                z: 0,             sx: glPW,              sy: frameInset },
            { x: 0,                z: 0,             sx: glPW,              sy: frameInset,  oy: glPH - frameInset },
            { x: -glPW / 2 + frameInset / 2, z: 0,  sx: frameInset,        sy: glPH },
            { x:  glPW / 2 - frameInset / 2, z: 0,  sx: frameInset,        sy: glPH },
        ];
        for (const p of glassBorderParts) {
            const border = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, 0.014), darkMat);
            border.position.set(mW * 0.26 + p.x, glPY + (p.oy ?? 0) - glPH / 2, mD / 2 - 0.003);
            border.userData.isKitchenPart = true;
            group.add(border);
        }

        // Water/ice dispenser on left side (upper portion)
        const dispNicheMat = mat('#111111', { roughness: 0.5, metalness: 0.1 });
        const dispNiche = new THREE.Mesh(new THREE.BoxGeometry(mW * 0.22, fridgeH * 0.22, 0.035), dispNicheMat);
        dispNiche.position.set(-mW * 0.26, fridgeH * 0.65, mD / 2 - 0.012);
        dispNiche.userData.isKitchenPart = true;
        group.add(dispNiche);

        // Dispenser nozzle
        const nozzleMat = mat('#555555', { roughness: 0.3, metalness: 0.6 });
        const nozzle    = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.030, 8), nozzleMat);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(-mW * 0.26, fridgeH * 0.60, mD / 2 - 0.008);
        nozzle.userData.isKitchenPart = true;
        group.add(nozzle);

        // Handles — left (freezer) and right (fridge), horizontal bars in upper half
        const handleParts = [
            { x: -mW / 4, y: fridgeH * 0.82, s: mW * 0.35 },
            { x:  mW / 4, y: fridgeH * 0.82, s: mW * 0.35 },
        ];
        for (const hp of handleParts) {
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, hp.s, 0.018), handleMat);
            handle.position.set(hp.x, hp.y, mD / 2 - 0.018);
            handle.userData.isKitchenPart = true;
            group.add(handle);
        }

        // Brand LG logo area (top right)
        const lgMat = mat('#cccccc', { roughness: 0.2, metalness: 0.7 });
        const lgLogo = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.012, 0.003), lgMat);
        lgLogo.position.set(mW * 0.30, fridgeH - 0.035, mD / 2 - 0.005);
        lgLogo.userData.isKitchenPart = true;
        group.add(lgLogo);

        // SmallDisplay (LG ThinQ panel top of freezer door)
        const thinqMat = mat('#001122', { roughness: 0.3, metalness: 0.0 });
        const thinq = new THREE.Mesh(new THREE.BoxGeometry(mW * 0.15, fridgeH * 0.055, 0.008), thinqMat);
        thinq.position.set(-mW * 0.26, fridgeH * 0.93, mD / 2 - 0.008);
        thinq.userData.isKitchenPart = true;
        group.add(thinq);
    }

    // ── Front variants ────────────────────────────────────────────────────────

    private _addDoor(
        group: THREE.Group,
        w: number, h: number, frontZ: number,
        doorMat: THREE.Material, handleMat: THREE.Material, handleStyle: KitchenHandleStyle,
    ): void {
        const inset  = 0.008;
        const doorGeo = new THREE.BoxGeometry(w - inset * 2, h - inset * 2, 0.018);
        const door    = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, h / 2, frontZ + 0.009);
        door.castShadow = true;
        door.userData.isKitchenPart = true;
        door.userData.elementType = 'KitchenCabinetPart';
        group.add(door);

        this._addHandle(group, w, h, frontZ, handleMat, handleStyle, h * 0.80);
    }

    private _addFramedGlassDoor(
        group: THREE.Group,
        w: number, h: number, frontZ: number,
        frameMat: THREE.Material, glassMat: THREE.Material, handleMat: THREE.Material,
        handleStyle: KitchenHandleStyle,
    ): void {
        const inset  = 0.008;
        const frameT = Math.max(0.028, w * 0.055);
        const outerW = w - inset * 2;
        const outerH = h - inset * 2;
        const z      = frontZ + 0.010;
        const parts  = [
            { x: 0, y: h / 2 + outerH / 2 - frameT / 2, sx: outerW, sy: frameT },
            { x: 0, y: h / 2 - outerH / 2 + frameT / 2, sx: outerW, sy: frameT },
            { x: -outerW / 2 + frameT / 2, y: h / 2, sx: frameT, sy: outerH },
            { x:  outerW / 2 - frameT / 2, y: h / 2, sx: frameT, sy: outerH },
        ];
        for (const p of parts) {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, 0.020), frameMat);
            frame.position.set(p.x, p.y, z);
            frame.castShadow = true;
            frame.userData.isKitchenPart = true;
            frame.userData.elementType = 'KitchenCabinetPart';
            group.add(frame);
        }
        const pane = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(0.01, outerW - frameT * 2), Math.max(0.01, outerH - frameT * 2), 0.010),
            glassMat,
        );
        pane.position.set(0, h / 2, frontZ + 0.016);
        pane.userData.isKitchenPart = true;
        pane.userData.elementType = 'KitchenCabinetPart';
        group.add(pane);
        this._addHandle(group, w, h, frontZ, handleMat, handleStyle, h * 0.80);
    }

    private _addDrawers(
        group: THREE.Group,
        w: number, h: number, frontZ: number,
        frontMat: THREE.Material, handleMat: THREE.Material,
        handleStyle: KitchenHandleStyle, drawerCount: number,
    ): void {
        const numDrawers = Math.max(1, Math.min(6, Math.round(drawerCount)));
        const drawerH    = (h - 0.016) / numDrawers;
        const inset      = 0.008;

        for (let i = 0; i < numDrawers; i++) {
            const drawerGeo = new THREE.BoxGeometry(w - inset * 2, drawerH - inset, 0.018);
            const drawer    = new THREE.Mesh(drawerGeo, frontMat);
            drawer.position.set(0, drawerH * i + drawerH / 2 + inset / 2, frontZ + 0.009);
            drawer.castShadow = true;
            drawer.userData.isKitchenPart = true;
            drawer.userData.elementType = 'KitchenCabinetPart';
            group.add(drawer);

            this._addHandle(group, w, drawerH, frontZ, handleMat, handleStyle, drawerH * i + drawerH * 0.75);
        }
    }

    private _addHandle(
        group: THREE.Group,
        w: number, _h: number, frontZ: number,
        handleMat: THREE.Material,
        style: KitchenHandleStyle,
        y: number,
    ): void {
        if (style === 'none') return;
        let handle: THREE.Mesh;
        if (style === 'knob') {
            handle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), handleMat);
            handle.position.set(w * 0.30, y, frontZ + 0.028);
        } else if (style === 'recessed') {
            handle = new THREE.Mesh(new THREE.BoxGeometry(w * 0.50, 0.020, 0.012), mat('#222222', { roughness: 0.7, metalness: 0.1 }));
            handle.position.set(0, y, frontZ + 0.020);
        } else if (style === 'line') {
            handle = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.007, 0.012), handleMat);
            handle.position.set(0, y, frontZ + 0.024);
        } else {
            handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, w * 0.45, 8), handleMat);
            handle.rotation.z = Math.PI / 2;
            handle.position.set(0, y, frontZ + 0.026);
        }
        handle.userData.isKitchenPart = true;
        handle.userData.elementType = 'KitchenCabinetPart';
        group.add(handle);
    }

    private _addOpenShelf(
        group: THREE.Group,
        w: number, h: number, depth: number,
        shelfMat: THREE.Material,
        numShelves: number,
    ): void {
        const count  = Math.max(1, Math.min(6, Math.round(numShelves)));
        const shelfT = 0.018;

        for (let i = 1; i <= count; i++) {
            const y        = (h / (count + 1)) * i;
            const shelfGeo = new THREE.BoxGeometry(w - 0.004, shelfT, depth - 0.020);
            const shelf    = new THREE.Mesh(shelfGeo, shelfMat);
            shelf.position.set(0, y, 0);
            shelf.userData.isKitchenPart = true;
            shelf.userData.elementType = 'KitchenCabinetPart';
            group.add(shelf);
        }
    }

    /**
     * Add interior shelf(ves) visible through glass doors.
     * Places `count` evenly-spaced horizontal shelves inside the carcass body.
     */
    private _addInteriorShelf(
        group:    THREE.Group,
        w:        number,
        h:        number,
        depth:    number,
        shelfMat: THREE.Material,
        count:    number,
    ): void {
        const shelfT  = 0.016;
        const inset   = 0.014; // slight gap from carcass walls
        const shelfW  = w - inset * 2;
        const shelfD  = depth - inset * 2;

        for (let i = 1; i <= count; i++) {
            const y = (h / (count + 1)) * i;
            const geo   = new THREE.BoxGeometry(shelfW, shelfT, shelfD);
            const mesh  = new THREE.Mesh(geo, shelfMat);
            mesh.position.set(0, y, 0);
            mesh.castShadow = true;
            mesh.userData.isKitchenPart = true;
            mesh.userData.elementType   = 'KitchenCabinetPart';
            group.add(mesh);
        }
    }
}
