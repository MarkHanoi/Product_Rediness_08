import * as THREE from '@pryzm/renderer-three/three';
import { WardrobeConfig, WardrobeSection } from '../WardrobeTypes';
import { WardrobeLayoutEngine } from './WardrobeLayoutEngine';

const ENABLE_LAYOUT_ENGINE = true;

export class WardrobeEngine {
    // §01 §3.4 — DI flows through builder constructors. The previous static
    // `materialService` field was set by FurnitureFactory but never read inside
    // this engine (sections build their own MeshStandardMaterials), so it has
    // been removed to eliminate hidden global state.

    /**
     * Sanitise a (possibly legacy / partially-saved) WardrobeConfig so that
     * downstream geometry math never receives undefined / NaN.
     * Returns a *new* config object (does not mutate input). Emits a single
     * structured warning per item if any field had to be defaulted.
     *
     * Defaults chosen to roughly match a typical wardrobe so the user can
     * see something on screen and then fix the parameters in the inspector.
     */
    private _sanitiseConfig(config: WardrobeConfig): WardrobeConfig {
        const cfg: any = { ...(config as any) };
        const fallbacks: string[] = [];
        const numOr = (v: any, d: number, label: string): number => {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
            fallbacks.push(label);
            return d;
        };
        cfg.width  = numOr(cfg.width,  1.0, 'width');
        cfg.height = numOr(cfg.height, 2.4, 'height');
        cfg.depth  = numOr(cfg.depth,  0.6, 'depth');
        if (cfg.widthBranchTwo !== undefined) {
            cfg.widthBranchTwo = numOr(cfg.widthBranchTwo, cfg.depth, 'widthBranchTwo');
        }
        if (cfg.lengthBranchTwo !== undefined) {
            cfg.lengthBranchTwo = numOr(cfg.lengthBranchTwo, cfg.width, 'lengthBranchTwo');
        }
        if (!Array.isArray(cfg.sections) || cfg.sections.length === 0) {
            cfg.sections = [{ width: cfg.width, doorType: 'double-hinged', components: [] }];
            fallbacks.push('sections');
        } else {
            cfg.sections = cfg.sections.map((s: any) => ({
                ...s,
                width: numOr(s?.width, cfg.width / cfg.sections.length, 'section.width'),
                doorType: s?.doorType ?? 'double-hinged',
                components: Array.isArray(s?.components) ? s.components : [],
            }));
        }
        if (Array.isArray(cfg.sideSections)) {
            cfg.sideSections = cfg.sideSections.map((s: any) => ({
                ...s,
                width: numOr(s?.width, cfg.depth, 'sideSection.width'),
                doorType: s?.doorType ?? 'double-hinged',
                components: Array.isArray(s?.components) ? s.components : [],
            }));
        }
        if (fallbacks.length > 0) {
            console.warn('[WardrobeEngine] Legacy/incomplete wardrobe config — using defaults for:',
                fallbacks.join(', '), '| id=', cfg.id);
        }
        return cfg as WardrobeConfig;
    }

    /** True if a {x,z}-like point has finite coordinates. */
    private _isFinitePoint(p: any): boolean {
        return p != null
            && typeof p.x === 'number' && Number.isFinite(p.x)
            && typeof p.z === 'number' && Number.isFinite(p.z);
    }

    create(config: WardrobeConfig, color?: string): THREE.Group {
        // Harden against legacy / partially-saved configs (old projects predate
        // some of the schema fields). Never throw — emit a warning and fall
        // back so the load can complete.
        config = this._sanitiseConfig(config);

        if (config.isCorner && config.cornerPoint) {
            return this.createCornerWardrobe(config, color);
        }

        console.log("Config Received:", config);
        console.log("Width Used:", config.width);
        console.log("First Point:", (config as any).firstPoint);
        console.log("Second Point:", (config as any).secondPoint);

        // 🔥 FIX: Ensure total sections width equals global width for visual consistency
        // If we have sections, we should redistribute their widths to match the total width
        if (config.sections && config.sections.length > 0) {
            const currentTotalSectionsWidth = config.sections.reduce((sum, s) => sum + s.width, 0);
            if (Math.abs(currentTotalSectionsWidth - config.width) > 0.001) {
                console.log(`[WIDTH DEBUG] Redistributing section widths. Total sections: ${currentTotalSectionsWidth}, Global width: ${config.width}`);
                const scaleFactor = config.width / currentTotalSectionsWidth;
                config.sections.forEach(s => {
                    s.width *= scaleFactor;
                });
            }
        }

        const root = new THREE.Group();
        const configAny = config as any;
        root.userData = {
            id: configAny.id, // Ensure ID is preserved if present
            type: 'wardrobe',
            config: structuredClone(config),
            color: color,
            // Mirror config properties to userData for Inspector
            width: config.width,
            height: config.height,
            length: config.depth,
            // Explicitly set furnitureType so Inspector knows what it is
            furnitureType: 'wardrobe'
        };

        // Ensure color is persisted in config for deep merge safety
        (root.userData.config as any).color = color;

        let offsetX = -config.width / 2;

        const mainColor = color ? new THREE.Color(color) : new THREE.Color(0x8b4513);

        // 🔥 Add first/last section flags for proper panel sizing
        // §16 §2.6 — wrap each section in a tagged group so SelectionManager
        // can Tab-cycle through individual wardrobe units (parity with kitchen).
        for (let i = 0; i < config.sections.length; i++) {
            const section = config.sections[i];
            section.isFirst = (i === 0);
            section.isLast = (i === config.sections.length - 1);

            const centerX = offsetX + section.width / 2;

            const sectionGroup = new THREE.Group();
            sectionGroup.userData.wardrobeUnitIndex = i;
            sectionGroup.userData.wardrobeArm       = 'main';
            sectionGroup.userData.elementType       = 'wardrobe_unit';

            this.buildCarcass(sectionGroup, section, config, 0, mainColor);
            this.buildInterior(sectionGroup, section, config, 0);
            this.buildDoors(sectionGroup, section, config, 0);

            sectionGroup.position.x = centerX;
            root.add(sectionGroup);

            offsetX += section.width;
        }

        // §09 F-08: trace logging removed (was orphaned after the matching
        // console.group call at the top of create() was deleted).
        // §07-WARDROBE-VIEW-CONTRACT §5 — tag all meshes for plan/elevation.
        this._tagForViews(root);
        return root;
    }

    private createCornerWardrobe(config: WardrobeConfig, color?: string): THREE.Group {
        const root = new THREE.Group();
        const mainColor = color ? new THREE.Color(color) : new THREE.Color(0x8b4513);

        const startPoint = (config as any).startPoint;
        const cornerPoint = config.cornerPoint;
        const endPoint = (config as any).endPoint;

        // Legacy guard: any of the three pivot points may be missing or have
        // NaN/undefined coords on old saved data. Bail out cleanly rather
        // than feeding NaN into THREE geometry constructors.
        if (!this._isFinitePoint(startPoint)
            || !this._isFinitePoint(cornerPoint)
            || !this._isFinitePoint(endPoint)) {
            console.warn('[WardrobeEngine] Corner wardrobe missing/invalid pivot points — skipping geometry build. id=',
                (config as any).id);
            return root;
        }

        const behavior = config.cornerBehavior || 'branch1-dominant';
        const d1 = config.depth;
        const d2 = config.widthBranchTwo ?? config.depth;

        const showDebug = (config as any).showDebug === true;

        // _isFinitePoint() above proves cornerPoint is defined; the `!` is a
        // narrow assertion (the helper isn't a TS type-guard predicate).
        const start = new THREE.Vector3(startPoint.x, 0, startPoint.z);
        const corner = new THREE.Vector3(cornerPoint!.x, 0, cornerPoint!.z);
        const end = new THREE.Vector3(endPoint.x, 0, endPoint.z);

        const dir1 = new THREE.Vector3().subVectors(corner, start).normalize();
        const dir2 = new THREE.Vector3().subVectors(end, corner).normalize();

        // --- DEBUG VISUALIZATION ---
        if (showDebug) {
            const createSphere = (pos: THREE.Vector3, color: number) => {
                const s = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
                s.position.copy(pos).sub(start);
                s.renderOrder = 999;
                root.add(s);
            };
            const createLine = (p1: THREE.Vector3, p2: THREE.Vector3, color: number) => {
                const points = [p1.clone().sub(start), p2.clone().sub(start)];
                const geo = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }));
                line.renderOrder = 998;
                root.add(line);
            };
            const createArrow = (dir: THREE.Vector3, origin: THREE.Vector3, color: number) => {
                const arrow = new THREE.ArrowHelper(dir, origin.clone().sub(start), 0.3, color);
                arrow.renderOrder = 997;
                root.add(arrow);
            };

            console.log("We are fixing a structural geometric issue in the Corner Connection system.");
            console.log("--- CORNER WARDROBE GEOMETRY AUDIT ---");
            console.log("Start:", start);
            console.log("Corner:", corner);
            console.log("End:", end);
            console.log("Dir1 (Normalized):", dir1, "Length:", dir1.length());
            console.log("Dir2 (Normalized):", dir2, "Length:", dir2.length());

            createSphere(start, 0x00ff00); // Green: Start
            createSphere(corner, 0xffffff); // White: Corner/Pivot
            createSphere(end, 0xff0000);   // Red: End
            createLine(start, corner, 0x0000ff); // Blue: Centerline 1
            createLine(corner, end, 0x0000ff);   // Blue: Centerline 2
            createArrow(dir1, start, 0xffff00);  // Yellow: Dir 1
            createArrow(dir2, corner, 0xffff00); // Yellow: Dir 2
        }

        const _safePos = (v: number, fallback: number): number =>
            (typeof v === 'number' && Number.isFinite(v) && v > 0) ? v : fallback;
        const dist1 = _safePos(
            (config as any).mainBranch?.width ?? start.distanceTo(corner),
            Math.max(d1 * 2, 1.0)
        );
        const dist2 = _safePos(
            (config as any).sideBranch?.width ?? config.lengthBranchTwo ?? corner.distanceTo(end),
            Math.max(d2 * 2, 1.0)
        );

        // Log distances for debugging
        console.log(`Corner distances - dist1: ${dist1.toFixed(3)} (source: ${(config as any).mainBranch ? 'config' : 'geo'}), dist2: ${dist2.toFixed(3)} (source: ${(config as any).sideBranch || config.lengthBranchTwo ? 'config' : 'geo'})`);

        // Calculate resolved endpoints and lengths based on behavior
        let resolvedEnd1 = corner.clone();
        let resolvedStart2 = corner.clone();

        // --- GEOMETRIC ADJUSTMENT ---
        // If config specifies 7m but geometric is 9m, we need to respect 7m while maintaining direction.
        const startToCornerDir = dir1.clone();
        const cornerToEndDir = dir2.clone();
        
        const configCorner = start.clone().add(startToCornerDir.multiplyScalar(dist1));
        const configEnd = configCorner.clone().add(cornerToEndDir.multiplyScalar(dist2));

        // Update effective references
        const currentCorner = configCorner;
        const currentEnd = configEnd;

        if (behavior === 'branch1-dominant') {
            resolvedEnd1 = currentCorner.clone().add(dir1.clone().multiplyScalar(d2 / 2));
            resolvedStart2 = currentCorner.clone().sub(dir2.clone().multiplyScalar(d1 / 2));
        } else if (behavior === 'branch2-dominant') {
            resolvedStart2 = currentCorner.clone().sub(dir2.clone().multiplyScalar(d1 / 2));
            resolvedEnd1 = currentCorner.clone().sub(dir1.clone().multiplyScalar(d2 / 2));
        } else if (behavior === 'corner-module') {
            resolvedEnd1 = currentCorner.clone().sub(dir1.clone().multiplyScalar(d2 / 2));
            resolvedStart2 = currentCorner.clone().add(dir2.clone().multiplyScalar(d1 / 2));
        }

        const effectiveDist1 = start.distanceTo(resolvedEnd1);
        const effectiveDist2 = resolvedStart2.distanceTo(currentEnd);

        // Build Branch 1
        const branch1 = new THREE.Group();
        const branch1Config = (config as any).mainBranch || { width: dist1, depth: d1, sections: config.sections || [] };
        const sections1 = branch1Config.sections && branch1Config.sections.length > 0 ? branch1Config.sections : [{ width: effectiveDist1, doorType: 'double-hinged', components: [] }];
        const currentTotal1 = sections1.reduce((sum: number, s: any) => sum + s.width, 0);
        const factor1 = effectiveDist1 / (currentTotal1 || 1);
        sections1.forEach((s: any) => s.width *= factor1);

        let offsetX1 = 0;
        for (let i = 0; i < sections1.length; i++) {
            const section = sections1[i];
            section.isFirst = (i === 0);
            section.isLast = (i === sections1.length - 1);
            const centerX = offsetX1 + section.width / 2 - effectiveDist1 / 2;
            const buildConfig1 = { ...config, width: effectiveDist1, depth: d1, isBranch1: true };
            const sg1 = new THREE.Group();
            sg1.userData.wardrobeUnitIndex = i;
            sg1.userData.wardrobeArm       = 'left';
            sg1.userData.elementType       = 'wardrobe_unit';
            this.buildCarcass(sg1, section, buildConfig1 as any, 0, mainColor);
            this.buildInterior(sg1, section, buildConfig1 as any, 0);
            this.buildDoors(sg1, section, buildConfig1 as any, 0);
            sg1.position.x = centerX;
            branch1.add(sg1);
            offsetX1 += section.width;
        }
        branch1.rotation.y = Math.atan2(dir1.x, dir1.z) + Math.PI / 2;
        const pos1 = new THREE.Vector3().addVectors(start, resolvedEnd1).multiplyScalar(0.5);
        branch1.position.set(pos1.x - start.x, 0, pos1.z - start.z);
        root.add(branch1);

        // Build Branch 2
        const branch2 = new THREE.Group();
        const branch2Config = (config as any).sideBranch || { width: dist2, depth: d2, sections: config.sideSections || [] };
        const sections2 = branch2Config.sections && branch2Config.sections.length > 0 ? branch2Config.sections : [{ width: effectiveDist2, doorType: 'double-hinged', components: [] }];
        const currentTotal2 = sections2.reduce((sum: number, s: any) => sum + s.width, 0);
        const factor2 = effectiveDist2 / (currentTotal2 || 1);

        const resolvedSections2 = sections2.map((s: any) => ({...s, width: s.width * factor2}));

        let offsetX2 = 0;
        for (let i = 0; i < resolvedSections2.length; i++) {
            const section = resolvedSections2[i];
            section.isFirst = (i === 0);
            section.isLast = (i === resolvedSections2.length - 1);
            const centerX = offsetX2 + section.width / 2 - effectiveDist2 / 2;
            const buildConfig2 = { ...config, width: effectiveDist2, depth: d2, isBranch2: true };
            const sg2 = new THREE.Group();
            sg2.userData.wardrobeUnitIndex = i;
            sg2.userData.wardrobeArm       = 'right';
            sg2.userData.elementType       = 'wardrobe_unit';
            this.buildCarcass(sg2, section as any, buildConfig2 as any, 0, mainColor);
            this.buildInterior(sg2, section as any, buildConfig2 as any, 0);
            this.buildDoors(sg2, section as any, buildConfig2 as any, 0);
            sg2.position.x = centerX;
            branch2.add(sg2);
            offsetX2 += section.width;
        }
        branch2.rotation.y = Math.atan2(dir2.x, dir2.z) + Math.PI / 2;
        const pos2 = new THREE.Vector3().addVectors(resolvedStart2, currentEnd).multiplyScalar(0.5);
        branch2.position.set(pos2.x - start.x, 0, pos2.z - start.z);
        root.add(branch2);

        // Corner Module (only if mode selected)
        if (behavior === 'corner-module') {
            const cornerMod = new THREE.Group();
            const h = config.height;
            const thickness = 0.02;
            const mat = new THREE.MeshStandardMaterial({ color: mainColor });

            // Back panels
            const back1 = new THREE.Mesh(new THREE.BoxGeometry(d2, h, thickness), mat);
            back1.position.set(0, h/2, -d1/2 + thickness/2);
            cornerMod.add(back1);

            const back2 = new THREE.Mesh(new THREE.BoxGeometry(thickness, h, d1), mat);
            back2.position.set(-d2/2 + thickness/2, h/2, 0);
            cornerMod.add(back2);

            // Top/Bottom
            const top = new THREE.Mesh(new THREE.BoxGeometry(d2, thickness, d1), mat);
            top.position.set(0, h - thickness/2, 0);
            cornerMod.add(top);

            const bot = new THREE.Mesh(new THREE.BoxGeometry(d2, thickness, d1), mat);
            bot.position.set(0, thickness/2, 0);
            cornerMod.add(bot);

            cornerMod.rotation.y = Math.atan2(dir1.x, dir1.z) + Math.PI / 2;
            cornerMod.position.set(corner.x - start.x, 0, corner.z - start.z);

            // No visual offset nudges - Corner Module center is aligned with pivot
            root.add(cornerMod);
        }

        const configAny = config as any;
        root.userData = {
            id: configAny.id,
            type: 'Furniture',
            selectable: true,
            furnitureType: 'corner_wardrobe',
            config: structuredClone(config),
            color: color,
            width: config.width,
            height: config.height,
            length: config.depth,
            widthBranchTwo: (config as any).widthBranchTwo,
            lengthBranchTwo: (config as any).lengthBranchTwo,
            cornerBehavior: behavior,
            startPoint: configAny.startPoint,
            cornerPoint: configAny.cornerPoint,
            endPoint: configAny.endPoint
        };

        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);

        // §07-WARDROBE-VIEW-CONTRACT §5 — tag all meshes for plan/elevation.
        this._tagForViews(root);
        return root;
    }

    /**
     * §07-WARDROBE-VIEW-CONTRACT §5 — tag every Mesh under `root` so that:
     *   - skipInPlan: true   → EdgeProjectorService excludes the mesh from
     *     plan-view edge projection. WardrobePlanSymbolBuilder injects a
     *     clean architectural footprint instead.
     *   - edgeAngleDeg: 30   → in elevation/section, soft creases below 30°
     *     are collapsed so flat carcass panel-to-panel seams don't render
     *     as parallel ladder lines.
     */
    private _tagForViews(root: THREE.Group): void {
        root.traverse(o => {
            if (o instanceof THREE.Mesh) {
                o.userData = { ...o.userData, skipInPlan: true, edgeAngleDeg: 30 };
            }
        });
    }

    private buildCarcass(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number, color: THREE.Color | number) {
        const thickness = 0.02;
        const mat = new THREE.MeshStandardMaterial({ color: color }); 

        // 🔥 Use config dimensions for all panels
        const totalWidth = config.width;
        const height = config.height;
        const depth = config.depth;

        // Left panel - section specific
        // Only add left panel if it's the first section OR if we explicitly want it
        const isCornerBranch1 = (config as any).isBranch1;
        const isCornerBranch2 = (config as any).isBranch2;

        // Side Cap logic:
        // Branch 1: Side cap at start (isFirst)
        // Branch 2: Side cap at end (isLast)
        // Standard: Side caps at both ends

        const isFirstSection = section.isFirst;
        const isLastSection = section.isLast;

        let shouldAddLeftPanel = isFirstSection;
        let shouldAddRightPanel = isLastSection;

        if (isCornerBranch1) {
            // Branch 1: Left panel at start (Red Area), NO right panel at corner
            shouldAddLeftPanel = isFirstSection;
            shouldAddRightPanel = false; 
        } else if (isCornerBranch2) {
            // Branch 2: NO left panel at corner, Right panel at end (Blue Area)
            shouldAddLeftPanel = false;
            shouldAddRightPanel = isLastSection;
        }

        // 🔥 FIX: Ensure side caps are ALWAYS added for Corner Wardrobe endpoints
        // Red Area (Branch 1 Start) and Blue Area (Branch 2 End)
        if (config.isCorner) {
            if (isCornerBranch1 && isFirstSection) shouldAddLeftPanel = true;
            if (isCornerBranch2 && isLastSection) shouldAddRightPanel = true;
        }

        if (shouldAddLeftPanel) {
            const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, depth), mat);
            leftPanel.position.set(centerX - section.width / 2 + thickness / 2, height / 2, 0);
            root.add(leftPanel);
        }

        if (shouldAddRightPanel) {
            const rightPanel = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, depth), mat);
            rightPanel.position.set(centerX + section.width / 2 - thickness / 2, height / 2, 0);
            root.add(rightPanel);
        }

        // 🔥 IMPROVED: Use full width for top/bottom panels to ensure complete coverage
        // Only add top/bottom/back panels once per branch (e.g., at first section)
        if (isFirstSection) {
            const topPanel = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, thickness, depth), mat);
            topPanel.position.set(0, height - thickness / 2, 0);
            root.add(topPanel);

            const bottomPanel = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, thickness, depth), mat);
            bottomPanel.position.set(0, thickness / 2, 0);
            root.add(bottomPanel);

            const backPanel = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, height, thickness), mat);
            backPanel.position.set(0, height / 2, -depth / 2 + thickness / 2);
            root.add(backPanel);
        }
    }

    private buildInterior(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number) {
        let components = section.components;
        if (ENABLE_LAYOUT_ENGINE) {
            components = WardrobeLayoutEngine.calculateLayout(section, config);
        }

        if (!components || components.length === 0) {
            // Fallback for legacy data or empty
            return;
        }

        for (const comp of components) {
            switch (comp.type) {
                case 'shelf':
                    this.addShelf(root, section, config, centerX, comp);
                    break;
                case 'drawer':
                    this.addDrawers(root, section, config, centerX, comp);
                    break;
                case 'hanger-rod':
                    this.addHangerRod(root, section, centerX, comp);
                    break;
                case 'lighting-strip':
                    this.addLighting(root, section, config, centerX, comp);
                    break;
                case 'mirror-panel':
                    this.addMirrorPanel(root, section, config, centerX, comp);
                    break;
            }
        }
    }

    private addMirrorPanel(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number, comp: any) {
        const thickness = 0.01;
        const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0 });
        const mirrorGeo = new THREE.BoxGeometry(section.width - 0.04, config.height * 0.8, thickness);
        const mirror = new THREE.Mesh(mirrorGeo, mat);
        mirror.position.set(centerX, comp.positionY || config.height / 2, -config.depth / 2 + 0.03);
        root.add(mirror);
    }

    private addShelf(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number, comp: any) {
        const thickness = 0.02;
        const mat = new THREE.MeshStandardMaterial({ color: 0xa0522d });
        // 🔥 Use section width for shelf
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(section.width - thickness * 2, thickness, config.depth - thickness), mat);
        shelf.position.set(centerX, comp.positionY, 0);
        root.add(shelf);
    }

    private addDrawers(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number, comp: any) {
        const thickness = 0.02;
        const mat = new THREE.MeshStandardMaterial({ color: 0xa0522d });
        const count = comp.count || 1;
        const drawerHeight = comp.properties?.height || 0.15;
        for (let i = 0; i < count; i++) {
            // 🔥 Use section width for drawers
            const drawerGeo = new THREE.BoxGeometry(section.width - thickness * 2, drawerHeight - 0.01, config.depth - thickness);
            const drawer = new THREE.Mesh(drawerGeo, mat);
            drawer.position.set(centerX, comp.positionY + i * drawerHeight, 0);
            root.add(drawer);
        }
    }

    private addHangerRod(root: THREE.Group, section: WardrobeSection, centerX: number, comp: any) {
        const thickness = 0.02;
        // 🔥 Use section width for rod
        const rodGeo = new THREE.CylinderGeometry(0.01, 0.01, section.width - thickness * 2);
        const rod = new THREE.Mesh(rodGeo, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 }));
        rod.rotation.z = Math.PI / 2;
        rod.position.set(centerX, comp.positionY, 0);
        root.add(rod);
    }

    private addLighting(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number, comp: any) {
        // 🔥 Use section width for lighting
        const lightGeo = new THREE.BoxGeometry(section.width - 0.04, 0.01, 0.01);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
        const lightMesh = new THREE.Mesh(lightGeo, lightMat);
        lightMesh.position.set(centerX, comp.positionY, config.depth / 2 - 0.02);
        root.add(lightMesh);
    }

    private buildDoors(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number) {
        if (config.showDoors === false) return;
        if (section.doorType === 'none') return;

        const thickness = 0.02;
        const doorZ = config.depth / 2 + thickness / 2;

        if (section.doorType === 'glass' || section.doorType === 'translucent-glass') {
            this.buildGlassDoor(root, section, config, centerX, doorZ);
            return;
        }

        let mat: THREE.Material = new THREE.MeshStandardMaterial({ color: 0xdeb887 });

        if (section.doorType === 'mirror') {
            mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0 });
        }

        if (section.doorType === 'double-hinged') {
            // 🔥 Use section width for doors
            const doorGeo = new THREE.BoxGeometry(section.width / 2 - 0.005, config.height - 0.02, thickness);
            const doorLeft = new THREE.Mesh(doorGeo, mat);
            doorLeft.position.set(centerX - section.width / 4, config.height / 2, doorZ);
            root.add(doorLeft);

            const doorRight = new THREE.Mesh(doorGeo, mat);
            doorRight.position.set(centerX + section.width / 4, config.height / 2, doorZ);
            root.add(doorRight);
        } else if (section.doorType === 'sliding') {
            // 🔥 IMPROVED: Use more precise sliding door offsets based on door thickness
            // Standard overlap for sliding doors is typically 10-20mm (0.01-0.02 in meters)
            const overlap = 0.015; // 15mm overlap for better coverage
            const doorWidth = section.width / 2 + overlap;

            console.log("[DOOR DEBUG] Sliding door dimensions:", {
                sectionWidth: section.width,
                doorWidth: doorWidth,
                overlap: overlap,
                zOffset1: overlap * 0.67,
                zOffset2: overlap * 1.33
            });

            const doorGeo = new THREE.BoxGeometry(doorWidth, config.height - 0.02, thickness);

            // Front door (overlaps on left side)
            const door1 = new THREE.Mesh(doorGeo, mat);
            door1.position.set(centerX - section.width / 4 + overlap/2, config.height / 2, doorZ + thickness * 0.5);
            root.add(door1);

            // Back door (overlaps on right side)
            const door2 = new THREE.Mesh(doorGeo, mat);
            door2.position.set(centerX + section.width / 4 - overlap/2, config.height / 2, doorZ - thickness * 0.5);
            root.add(door2);
        } else {
            // hinged-left, hinged-right, mirror (as single door)
            // 🔥 Use section width for door
            const doorGeo = new THREE.BoxGeometry(section.width - 0.01, config.height - 0.02, thickness);
            const door = new THREE.Mesh(doorGeo, mat);
            door.position.set(centerX, config.height / 2, doorZ);
            root.add(door);
        }
    }

    private buildGlassDoor(root: THREE.Group, section: WardrobeSection, config: WardrobeConfig, centerX: number, doorZ: number) {
        const frameWidth = 0.06; // 6cm as requested
        const thickness = 0.02;
        const doorWidth = section.width - 0.01;
        const doorHeight = config.height - 0.02;

        const frameMat = new THREE.MeshStandardMaterial({ color: 0xdeb887 }); // Wooden frame

        const isTranslucent = section.doorType === 'translucent-glass';

        const glassMat = new THREE.MeshPhysicalMaterial({ 
            color: 0xffffff,
            transmission: isTranslucent ? 0.5 : 1,
            opacity: isTranslucent ? 0.8 : 0.3,
            transparent: true,
            roughness: isTranslucent ? 0.4 : 0.05,
            metalness: 0,
            thickness: 0.01,
            ior: 1.5
        });

        const doorGroup = new THREE.Group();
        doorGroup.position.set(centerX, doorHeight / 2, doorZ);

        // Frame
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, frameWidth, thickness), frameMat);
        topFrame.position.set(0, doorHeight / 2 - frameWidth / 2, 0);
        doorGroup.add(topFrame);

        const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, frameWidth, thickness), frameMat);
        bottomFrame.position.set(0, -doorHeight / 2 + frameWidth / 2, 0);
        doorGroup.add(bottomFrame);

        const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, doorHeight - frameWidth * 2, thickness), frameMat);
        leftFrame.position.set(-doorWidth / 2 + frameWidth / 2, 0, 0);
        doorGroup.add(leftFrame);

        const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, doorHeight - frameWidth * 2, thickness), frameMat);
        rightFrame.position.set(doorWidth / 2 - frameWidth / 2, 0, 0);
        doorGroup.add(rightFrame);

        // Glass Panel
        const glassWidth = doorWidth - frameWidth * 2;
        const glassHeight = doorHeight - frameWidth * 2;
        // Use slightly thinner geometry for glass and ensure it's centered in the frame
        const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(glassWidth, glassHeight, thickness * 0.4), glassMat);
        glassPanel.position.set(0, 0, 0);
        doorGroup.add(glassPanel);

        root.add(doorGroup);
    }
}