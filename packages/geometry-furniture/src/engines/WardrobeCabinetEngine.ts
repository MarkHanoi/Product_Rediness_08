/**
 * @file WardrobeCabinetEngine.ts
 *
 * Parametric geometry engine for wardrobe cabinet layouts.
 * Supports Straight (I), L-shape, and U-shape (walk-in) configurations,
 * plus tall variants with a top storage module.
 *
 * Geometry conventions:
 *   - Main arm: centred at local origin, runs along local X axis.
 *   - Left arm: rotated PI/2 around Y, extending along world +Z from main arm left end.
 *   - Right arm: rotated -PI/2 around Y, extending along world +Z from main arm right end.
 *   - Back panels face world -Z (against wall). Door faces world +Z (or inward for side arms).
 *   - All dimensions in metres.
 *
 * Per-section sub-units:
 *   Each section is wrapped in its own THREE.Group tagged with
 *   `wardrobeUnitIndex`, `wardrobeArm`, `elementType: 'WardrobeSection'` so
 *   SelectionManager Tab-cycling and the WardrobeSectionInspector can locate
 *   them (mirrors KitchenCabinetEngine.kitchenUnitIndex pattern).
 *
 * Materials:
 *   Resolved via STANDARD_MATERIAL_LIBRARY (config.carcassMaterialId,
 *   config.frontMaterialId, plus per-section section.doorMaterialId override).
 *   Falls back to colour hex when no material id is set.
 *
 * Tall layouts add a top storage module above the main wardrobe:
 *   - Same footprint (width × depth), fixed height (topModuleHeight, default 0.40m).
 *   - Solid compartment with a simple front panel.
 */

import * as THREE from '@pryzm/renderer-three/three';
// §GPU-RESOURCE-LIFETIME (ADR-0281, INVARIANT L1) — this module hands out
// CACHE-OWNED materials/textures shared across many live elements. Stamping them
// makes that ownership visible to every disposer, so no element teardown
// (furniture type swap, delete, rebuild) can destroy a resource its siblings
// still draw with. Replaces the unknowable "is it in MY cache?" test.
import { markSharedGpuResource } from '@pryzm/renderer-three';
import {
    WardrobeCabinetConfig,
    WardrobeSectionConfig,
    WardrobeSectionDoorType,
    WardrobeSectionInterior,
    WARDROBE_CABINET_DEFAULTS,
    isTallWardrobeLayout,
    // §WARD118 — the ONE authority for carcass constants and the interior /
    // handle decisions at a given height. This engine RENDERS what it decides.
    WARDROBE_CARCASS_T,
    WARDROBE_ROD_RADIUS,
    resolveWardrobeInteriorLayout,
    wardrobeHandleGeometry,
} from '../WardrobeCabinetTypes';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

// §WARD118 — these used to be private literals here (0.018 / 0.012). The physical
// height floor is DERIVED from the panel thickness, so the constant must have one
// home that both the validator and this engine read.
const T   = WARDROBE_CARCASS_T;   // carcass panel thickness
const ROD = WARDROBE_ROD_RADIUS;  // hanger rod radius

// ── Shared material cache ─────────────────────────────────────────────────────

const _matCache = new Map<string, THREE.MeshStandardMaterial>();

function mat(hex: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const key = hex + JSON.stringify(opts);
    if (!_matCache.has(key)) _matCache.set(key, markSharedGpuResource(new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), ...opts })));
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
    // §ADR-0297-L1 (L-2151) — STAMP IT. This branch fed the SAME `_matCache` as `mat()`
    // twelve lines above, which does stamp, so one cache handed out both owned and
    // unowned materials depending on whether the caller passed a `materialId`. An
    // unstamped material is not no-op'd by `safeDispose*`, so tearing down ONE wardrobe
    // could dispose a material every other wardrobe still references — and the cache
    // would go on handing back the dead handle for the rest of the session. The
    // verbatim-identical `materialFromId` in the sibling `KitchenCabinetEngine` already
    // stamps; this one was the odd branch out, not a deliberate exception.
    if (!_matCache.has(key)) _matCache.set(key, markSharedGpuResource(new THREE.MeshStandardMaterial(params)));
    return _matCache.get(key)!;
}

export class WardrobeCabinetEngine {

    create(config: WardrobeCabinetConfig): THREE.Group {
        const root = new THREE.Group();

        const isTall = isTallWardrobeLayout(config.layoutType);
        const topModH = config.topModuleHeight ?? WARDROBE_CABINET_DEFAULTS.topModuleHeight;

        const carcassHex = config.carcassColor ?? WARDROBE_CABINET_DEFAULTS.carcassColor;
        const frontHex   = config.frontColor   ?? WARDROBE_CABINET_DEFAULTS.frontColor;
        const handleHex  = config.handleColor  ?? WARDROBE_CABINET_DEFAULTS.handleColor;

        const carcassMat = materialFromId(config.carcassMaterialId, carcassHex, { roughness: 0.6, metalness: 0.0 });
        const frontMat   = materialFromId(config.frontMaterialId,   frontHex,   { roughness: 0.45, metalness: 0.0 });
        const handleMat  = mat(handleHex, { roughness: 0.2, metalness: 0.9 });

        const sections      = config.sections ?? [];
        const mainSections  = sections.filter(s => s.arm === 'main');
        const leftSections  = sections.filter(s => s.arm === 'left');
        const rightSections = sections.filter(s => s.arm === 'right');

        const dep = config.depth;
        const len = config.length;

        const hasLeft  = config.layoutType === 'wardrobe_l_shape' || config.layoutType === 'wardrobe_u_shape'
                      || config.layoutType === 'wardrobe_l_shape_tall' || config.layoutType === 'wardrobe_u_shape_tall';
        const hasRight = config.layoutType === 'wardrobe_u_shape' || config.layoutType === 'wardrobe_u_shape_tall';

        // ── Main arm ─────────────────────────────────────────────────────────
        const mainArm = this._buildArm(
            len, config.height, dep,
            mainSections, config.numSections, 'main',
            carcassMat, frontMat, handleMat,
            config,
            true, true,
        );
        root.add(mainArm);

        // Tall: main arm top module
        if (isTall) {
            const topMod = this._buildTopModule(len, topModH, dep, carcassMat, frontMat);
            topMod.position.set(0, config.height, 0);
            root.add(topMod);
        }

        // ── Left arm ─────────────────────────────────────────────────────────
        if (hasLeft && config.lengthLeft) {
            const numLeft  = config.numSectionsLeft ?? 2;
            const leftLen  = config.lengthLeft;
            const leftArm  = this._buildArm(
                leftLen, config.height, dep,
                leftSections, numLeft, 'left',
                carcassMat, frontMat, handleMat,
                config,
                false, true,
            );
            leftArm.rotation.y = Math.PI / 2;
            leftArm.position.set(-len / 2 + dep / 2, 0, dep / 2 + leftLen / 2);
            root.add(leftArm);

            if (isTall) {
                const leftTopMod = this._buildTopModule(leftLen, topModH, dep, carcassMat, frontMat);
                leftTopMod.rotation.y = Math.PI / 2;
                leftTopMod.position.set(-len / 2 + dep / 2, config.height, dep / 2 + leftLen / 2);
                root.add(leftTopMod);
            }
        }

        // ── Right arm ────────────────────────────────────────────────────────
        if (hasRight && config.lengthRight) {
            const numRight  = config.numSectionsRight ?? 2;
            const rightLen  = config.lengthRight;
            const rightArm  = this._buildArm(
                rightLen, config.height, dep,
                rightSections, numRight, 'right',
                carcassMat, frontMat, handleMat,
                config,
                true, false,
            );
            rightArm.rotation.y = -Math.PI / 2;
            rightArm.position.set(len / 2 - dep / 2, 0, dep / 2 + rightLen / 2);
            root.add(rightArm);

            if (isTall) {
                const rightTopMod = this._buildTopModule(rightLen, topModH, dep, carcassMat, frontMat);
                rightTopMod.rotation.y = -Math.PI / 2;
                rightTopMod.position.set(len / 2 - dep / 2, config.height, dep / 2 + rightLen / 2);
                root.add(rightTopMod);
            }
        }

        // §07-WARDROBE-VIEW-CONTRACT §5 — tag every mesh so the plan-view
        // projector skips this element's 3D edges (WardrobePlanSymbolBuilder
        // injects the clean architectural symbol instead) and elevation /
        // section views collapse soft creases below 30° to avoid
        // ladder-line bevel artefacts on flat carcass panels.
        root.traverse(o => {
            if (o instanceof THREE.Mesh) {
                o.userData = { ...o.userData, skipInPlan: true, edgeAngleDeg: 30 };
            }
        });

        return root;
    }

    // ── Top storage module ─────────────────────────────────────────────────────

    private _buildTopModule(
        width:     number,
        height:    number,
        depth:     number,
        cMat:      THREE.Material,
        fMat:      THREE.Material,
    ): THREE.Group {
        const g = new THREE.Group();

        const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, T), cMat);
        back.position.set(0, height / 2, -depth / 2 + T / 2);
        g.add(back);

        const top = new THREE.Mesh(new THREE.BoxGeometry(width, T, depth), cMat);
        top.position.set(0, height - T / 2, 0);
        g.add(top);

        const bot = new THREE.Mesh(new THREE.BoxGeometry(width, T, depth), cMat);
        bot.position.set(0, T / 2, 0);
        g.add(bot);

        const lp = new THREE.Mesh(new THREE.BoxGeometry(T, height, depth), cMat);
        lp.position.set(-width / 2 + T / 2, height / 2, 0);
        g.add(lp);

        const rp = new THREE.Mesh(new THREE.BoxGeometry(T, height, depth), cMat);
        rp.position.set(width / 2 - T / 2, height / 2, 0);
        g.add(rp);

        const front = new THREE.Mesh(
            new THREE.BoxGeometry(width - T * 2, height - T * 2, T),
            fMat,
        );
        front.position.set(0, height / 2, depth / 2 + T / 2);
        front.castShadow = true;
        g.add(front);

        g.userData.isWardrobeTopModule = true;
        g.userData.elementType = 'WardrobeTopModule';
        return g;
    }

    // ── Arm builder ───────────────────────────────────────────────────────────

    private _buildArm(
        totalWidth:   number,
        height:       number,
        depth:        number,
        sections:     WardrobeSectionConfig[],
        numSections:  number,
        arm:          'main' | 'left' | 'right',
        carcassMat:   THREE.Material,
        frontMat:     THREE.Material,
        handleMat:    THREE.Material,
        config:       WardrobeCabinetConfig,
        sideCapLeft:  boolean,
        sideCapRight: boolean,
    ): THREE.Group {
        const armGroup = new THREE.Group();

        // ── Structural panels ─────────────────────────────────────────────────

        const backPanel = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, height, T), carcassMat);
        backPanel.position.set(0, height / 2, -depth / 2 + T / 2);
        armGroup.add(backPanel);

        const topPanel = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, T, depth), carcassMat);
        topPanel.position.set(0, height - T / 2, 0);
        armGroup.add(topPanel);

        const bottomPanel = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, T, depth), carcassMat);
        bottomPanel.position.set(0, T / 2, 0);
        armGroup.add(bottomPanel);

        if (sideCapLeft) {
            const lp = new THREE.Mesh(new THREE.BoxGeometry(T, height, depth), carcassMat);
            lp.position.set(-totalWidth / 2 + T / 2, height / 2, 0);
            armGroup.add(lp);
        }
        if (sideCapRight) {
            const rp = new THREE.Mesh(new THREE.BoxGeometry(T, height, depth), carcassMat);
            rp.position.set(totalWidth / 2 - T / 2, height / 2, 0);
            armGroup.add(rp);
        }

        // ── Sections (each wrapped in its own group for Tab cycling) ──────────

        const sectionWidth = totalWidth / numSections;

        for (let i = 0; i < numSections; i++) {
            const centerX = -totalWidth / 2 + (i + 0.5) * sectionWidth;
            const section: WardrobeSectionConfig = sections[i] ?? {
                index:    i,
                arm,
                doorType: 'double-hinged' as WardrobeSectionDoorType,
                interior: (i % 2 === 0 ? 'hanger' : 'shelves') as WardrobeSectionInterior,
            };

            const sectionGroup = new THREE.Group();
            sectionGroup.userData.wardrobeUnitIndex = i;
            sectionGroup.userData.wardrobeArm       = arm;
            sectionGroup.userData.elementType       = 'WardrobeSection';

            // Divider between sections (vertical panel, skip at leftmost)
            if (i > 0) {
                const div = new THREE.Mesh(
                    new THREE.BoxGeometry(T, height - T * 2, depth - T),
                    carcassMat,
                );
                div.position.set(centerX - sectionWidth / 2, height / 2, -T / 2);
                sectionGroup.add(div);
            }

            this._buildInterior(sectionGroup, section, centerX, sectionWidth, height, depth);
            this._buildDoor(sectionGroup, section, centerX, sectionWidth, height, depth, frontMat, handleMat, config);

            armGroup.add(sectionGroup);
        }

        return armGroup;
    }

    // ── Interior ──────────────────────────────────────────────────────────────

    private _buildInterior(
        host:         THREE.Group,
        section:      WardrobeSectionConfig,
        centerX:      number,
        sectionWidth: number,
        height:       number,
        depth:        number,
    ): void {
        const innerW    = sectionWidth - T * 3;
        const innerD    = depth - T * 2;
        const shelfMat  = mat('#c8aa80', { roughness: 0.7, metalness: 0 });
        const rodMat    = mat('#b0b0b0', { roughness: 0.2, metalness: 0.9 });

        // §WARD118 — the interior is DECIDED by the one authority and RENDERED here.
        // Before: `hanger` put a rod at 0.85 × height whatever the height (a rail at
        // 0.85 m on a 1.0 m unit), `shelves` stretched a fixed count across whatever
        // was left, drawers thinned without limit. Now a rail that lacks its clear
        // drop drops out (the section builds as shelves), shelf count follows the
        // constant pitch (a resize adds / removes shelves, never stretches them),
        // and drawer count is capped by the smallest drawer front. At the 2.40 m
        // default this renders byte-identically to before (pinned).
        const layout = resolveWardrobeInteriorLayout(section.interior, height, {
            numShelves: section.numShelves,
            numDrawers: section.numDrawers,
        });

        if (layout.rodY !== null) {
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD, ROD, innerW, 8), rodMat);
            rod.rotation.z = Math.PI / 2;
            rod.position.set(centerX, layout.rodY, 0);
            rod.userData.wardrobeRod = true;
            host.add(rod);
        }

        for (const yPos of layout.shelfYs) {
            const s = new THREE.Mesh(new THREE.BoxGeometry(innerW, T, innerD), shelfMat);
            s.position.set(centerX, yPos, 0);
            s.userData.wardrobeShelf = true;
            host.add(s);
        }

        if (layout.drawers) {
            const { count: n, height: drawerH } = layout.drawers;
            const frontMat = mat('#d4c4a0', { roughness: 0.5, metalness: 0 });
            const handleM  = mat('#888888', { roughness: 0.2, metalness: 0.9 });
            for (let i = 0; i < n; i++) {
                const cx  = centerX;
                const cy  = T + (i + 0.5) * drawerH;
                const dr  = new THREE.Mesh(
                    new THREE.BoxGeometry(innerW, drawerH - 0.012, depth * 0.42),
                    frontMat,
                );
                dr.position.set(cx, cy, depth * 0.29);
                dr.userData.wardrobeDrawer = true;
                host.add(dr);

                const hr = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.006, 0.006, innerW * 0.28, 8),
                    handleM,
                );
                hr.rotation.z = Math.PI / 2;
                hr.position.set(cx, cy, depth / 2 + 0.01);
                hr.userData.wardrobeDrawerHandle = true;
                host.add(hr);
            }
        }
    }

    // ── Doors ─────────────────────────────────────────────────────────────────

    private _buildDoor(
        host:         THREE.Group,
        section:      WardrobeSectionConfig,
        centerX:      number,
        sectionWidth: number,
        height:       number,
        depth:        number,
        defaultFrontMat: THREE.Material,
        handleMat:    THREE.Material,
        config:       WardrobeCabinetConfig,
    ): void {
        if (section.doorType === 'none') return;

        const doorH  = height - T * 2;
        const doorZ  = depth / 2 + T / 2;
        const innerW = sectionWidth - T;

        let doorMat: THREE.Material;

        switch (section.doorType) {
            case 'glass':
                doorMat = new THREE.MeshStandardMaterial({
                    color: 0xaaddff, transparent: true, opacity: 0.30,
                    roughness: 0.0, metalness: 0.15,
                });
                break;
            case 'mirror':
                doorMat = new THREE.MeshStandardMaterial({
                    color: 0xeeeeee, metalness: 1.0, roughness: 0.04,
                });
                break;
            default: {
                // Per-section override of material id or colour wins over global front material
                if (section.doorMaterialId) {
                    doorMat = materialFromId(
                        section.doorMaterialId,
                        section.doorColor ?? config.frontColor ?? WARDROBE_CABINET_DEFAULTS.frontColor,
                        { roughness: 0.45, metalness: 0.0 },
                    );
                } else if (section.doorColor) {
                    doorMat = mat(section.doorColor, { roughness: 0.45, metalness: 0.0 });
                } else {
                    doorMat = defaultFrontMat;
                }
                break;
            }
        }

        if (section.doorType === 'sliding' || section.doorType === 'mirror') {
            const panelW = innerW / 2 + 0.015;
            const dGeo   = new THREE.BoxGeometry(panelW, doorH, T);

            const d1 = new THREE.Mesh(dGeo, doorMat);
            d1.position.set(centerX - innerW / 4, height / 2, doorZ);
            host.add(d1);

            const d2 = new THREE.Mesh(dGeo, doorMat);
            d2.position.set(centerX + innerW / 4, height / 2, doorZ - T * 1.4);
            host.add(d2);

        } else if (section.doorType === 'double-hinged') {
            const halfW = innerW / 2 - 0.004;
            const dGeo  = new THREE.BoxGeometry(halfW, doorH, T);

            const dL = new THREE.Mesh(dGeo, doorMat);
            dL.position.set(centerX - halfW / 2 - 0.003, height / 2, doorZ);
            host.add(dL);

            const dR = new THREE.Mesh(dGeo, doorMat);
            dR.position.set(centerX + halfW / 2 + 0.003, height / 2, doorZ);
            host.add(dR);

            // §WARD118 — handle length and height come from the authority: was
            // `doorH * 0.22` at `height * 0.50`, which stretched the handle with the
            // door and put it at 1.40 m on a 2.80 m unit / vanished it on a low one.
            // Unchanged at the 2.40 m default (0.520 m at 1.20 m).
            const { length: handleH, centreY: handleY } = wardrobeHandleGeometry(height);
            const hGeo    = new THREE.CylinderGeometry(0.007, 0.007, handleH, 8);

            const hL = new THREE.Mesh(hGeo, handleMat);
            hL.position.set(centerX - 0.012, handleY, doorZ + 0.022);
            hL.userData.wardrobeHandle = true;
            host.add(hL);

            const hR = new THREE.Mesh(hGeo, handleMat);
            hR.position.set(centerX + 0.012, handleY, doorZ + 0.022);
            hR.userData.wardrobeHandle = true;
            host.add(hR);

        } else {
            // glass — single panel
            const dGeo = new THREE.BoxGeometry(innerW, doorH, T);
            const d    = new THREE.Mesh(dGeo, doorMat);
            d.position.set(centerX, height / 2, doorZ);
            host.add(d);
        }
    }
}
