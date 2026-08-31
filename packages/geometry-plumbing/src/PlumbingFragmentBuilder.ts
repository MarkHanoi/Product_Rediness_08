import * as THREE from '@pryzm/renderer-three/three';
// §FIX-PLUMB-DISPOSE (L-11961) — the canonical ELEMENT-MUTATION teardown. See
// RoofFragmentBuilder._disposeChildren, whose comment names the inversion this
// helper corrects (dispose-then-detach destroys GPU buffers while the meshes are
// still parented to the scene).
import { detachAndReleaseChildren } from '@pryzm/renderer-three';
import { PlumbingFixtureData, PlumbingFixtureType } from './PlumbingTypes';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { createToiletGeometry, DEFAULT_TOILET_VARIANT, ToiletVariant } from './ToiletGeometry';
import { createShowerGeometry, DEFAULT_SHOWER_VARIANT, ShowerVariant } from './ShowerGeometry';
import { createAccessoryGeometry, DEFAULT_ACCESSORY_VARIANT, BathroomAccessoryVariant } from './BathroomAccessoryGeometry';

/**
 * §FIX-PLUMB-SUBSTITUTION (L-11960) — what this builder ACTUALLY drew for one
 * fixture, as opposed to what the record asked for.
 *
 *   · 'exact'       — the authored fixtureType has a geometry factory of its own
 *                     and that factory built the mesh.
 *   · 'substituted' — the authored fixtureType has NO factory in this builder, so
 *                     a NAMED stand-in was drawn. Both values are carried, because
 *                     a substitution reported without the requested value is the
 *                     same silence it replaces (C74 / CA-18).
 *
 * `refusals` names every AUTHORED FIELD this build could not honour, one line per
 * field, each carrying the authored value and the value actually used. An empty
 * array means every field the record carried reached the geometry.
 */
export type PlumbingBuildOutcome = 'exact' | 'substituted';

export interface PlumbingBuildVerdict {
    fixtureId: string;
    drew: PlumbingBuildOutcome;
    /** what the record asked for — NOT narrowed to PlumbingFixtureType, because a
     *  persisted record can carry a value this build of the app has never heard of,
     *  and that case is precisely the one worth naming. */
    requestedFixtureType: string;
    /** the factory that actually ran. */
    drawnGeometry: PlumbingFixtureType;
    refusals: string[];
    at: number;
}

/**
 * §FIX-PLUMB-SUBSTITUTION — the fixture families that have a geometry factory of
 * their own in THIS builder. `PlumbingFixtureType` is wider: 'urinal' and 'bidet'
 * are authored, persisted and schedulable, and have no LOD400 factory here. They
 * are drawn as a toilet AND SAID SO, rather than becoming one silently.
 */
const FIXTURE_TYPES_WITH_A_FACTORY: ReadonlySet<string> = new Set<PlumbingFixtureType>([
    'sink', 'bath', 'shower', 'accessory', 'toilet',
]);

/** §FIX-PLUMB-DEGENERATE — catalogue defaults for the bath, named once so the
 *  refusal lines below can quote the number they fell back to. */
const BATH_DEFAULTS = { width: 1.7, length: 0.75, height: 0.6 } as const;

/**
 * §FIX-PLUMB-DEGENERATE — resolve one authored dimension.
 *
 * WAS: `data.width || 1.7`. That is silent substitution three ways over — an
 * authored 0, an authored negative and an authored NaN all became 1.7 with no
 * trace, and a negative that survived (`-1 || 1.7` is -1) reached BoxGeometry and
 * produced inside-out geometry that reads as an invisible bath. This returns the
 * authored value when it is usable and PUSHES A NAMED REFUSAL when it is not.
 */
function resolveDimension(
    field: 'width' | 'length' | 'height',
    authored: number | undefined,
    fallback: number,
    refusals: string[],
): number {
    if (authored === undefined || authored === null) return fallback;
    if (!Number.isFinite(authored) || authored <= 0) {
        refusals.push(
            `${field}: authored ${String(authored)} is not a positive finite length — drew ${fallback} m instead`,
        );
        return fallback;
    }
    return authored;
}

/**
 * §FIX-PLUMB-DEGENERATE — parse an authored hex colour.
 *
 * WAS: `data.color ? parseInt(data.color.replace('#','0x')) : 0xffffff`. An
 * authored colour that is not hex ('red', 'rgb(1,2,3)', a material id) yields NaN,
 * and THREE.Color built from NaN is not white — it is undefined behaviour that
 * renders black. The authored value is either used or REFUSED BY NAME.
 */
function resolveColor(authored: string | undefined, refusals: string[]): number {
    if (authored === undefined || authored === null || authored === '') return 0xffffff;
    const hex = authored.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
        refusals.push(`color: authored "${authored}" is not a 6-digit hex colour — drew #ffffff instead`);
        return 0xffffff;
    }
    const parsed = Number.parseInt(hex, 16);
    if (!Number.isFinite(parsed)) {
        refusals.push(`color: authored "${authored}" did not parse — drew #ffffff instead`);
        return 0xffffff;
    }
    return parsed;
}

export class PlumbingFragmentBuilder {
    private scene: THREE.Scene;
    public fixtureRoots = new Map<string, THREE.Group>();

    /**
     * §FIX-PLUMB-SUBSTITUTION — the LAST build outcome per fixture id, cleared on
     * removeFixture so a verdict can never outlive the element it describes. Same
     * channel shape as SlabFragmentBuilder._buildVerdict / getBuildReport(): read
     * from the console via the builder handle, with NO new global (P4).
     */
    private _buildVerdict = new Map<string, PlumbingBuildVerdict>();

    /** The last build outcome for one fixture, or undefined if this builder has
     *  never been asked to build it — which is itself the answer: the record never
     *  reached the builder, so look UPSTREAM (store, bridge or command). */
    getBuildVerdict(id: string): PlumbingBuildVerdict | undefined {
        return this._buildVerdict.get(id);
    }

    /** Every fixture this builder has an opinion about, substitutions and refusals
     *  first. `hasRoot` is measured from the live scene-graph map, not from the
     *  verdict, so a verdict claiming a build with no root is itself visible. */
    getBuildReport(): Array<PlumbingBuildVerdict & { hasRoot: boolean }> {
        return [...this._buildVerdict.values()]
            .map(v => ({ ...v, hasRoot: this.fixtureRoots.has(v.fixtureId) }))
            .sort((a, b) => {
                const rank = (r: PlumbingBuildVerdict) =>
                    (r.drew === 'substituted' ? 0 : 1) + (r.refusals.length > 0 ? 0 : 1);
                return rank(a) - rank(b);
            });
    }

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    updateFixture(data: PlumbingFixtureData): void {
        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture prior version
        // to bump monotonically on every update. PlumbingFragmentBuilder uses
        // a REUSABLE root (keeps the same THREE.Group across updates and
        // rebuilds children only). Mirrors FurnitureFragmentBuilder pattern
        // (Round 33). Defaults to 0 for first build.
        let root = this.fixtureRoots.get(data.id);
        const _priorVersion: number = (root?.userData?.version as number | undefined) ?? 0;
        if (!root) {
            root = new THREE.Group();
            root.userData = {
                id: data.id,
                elementType: 'PlumbingFixture',
                fixtureType: data.fixtureType,
                selectable: true,
                levelId: data.levelId,
                levelName: data.levelName,
                levelElevation: data.levelElevation,
                baseOffset: data.baseOffset,
                // §57 Day 5 — monotonic per-update counter for cache invalidation.
                version: _priorVersion + 1,
            };
            this.scene.add(root);
            this.fixtureRoots.set(data.id, root);
        } else {
            // §57 Day 5 — bump version on every reused-root update so the
            // NMEexporter proxy cache invalidates after each architect edit.
            root.userData.version = _priorVersion + 1;
        }
        elementRegistry.registerRoot(data.id, root);

        // §FIX-PLUMB-DISPOSE (L-11961) — WAS `root.clear()`, which detached every
        // child THREE.Mesh and freed NOTHING. updateFixture runs on every architect
        // edit, so each edit leaked one fixture's geometry and materials. This is the
        // same call RoofFragmentBuilder._disposeChildren makes, in the order
        // §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) requires: detach now,
        // release at the frame boundary.
        detachAndReleaseChildren(root);

        // §FIX-PLUMB-SUBSTITUTION (L-11960, C84 EI-2a / C100) — the dispatch WAS an
        // if/else chain whose FINAL ELSE was createToiletMesh. PlumbingFixtureType
        // carries seven members; five have a factory here. So an authored 'urinal' or
        // 'bidet' — and any fixtureType a newer document carries that this build has
        // never heard of — drew a TOILET and announced nothing, which is the silent
        // substitution C84/C100 prohibit. The stand-in is UNCHANGED (removing it would
        // make a fixture that draws today draw nothing); what is added is that the
        // substitution is named, with both values, on the mesh and in the verdict.
        const requestedFixtureType: string = data.fixtureType;
        const refusals: string[] = [];
        let mesh: THREE.Group;
        let drawnGeometry: PlumbingFixtureType;
        if (data.fixtureType === 'sink') {
            mesh = this.createSinkMesh(data);
            drawnGeometry = 'sink';
        } else if (data.fixtureType === 'bath') {
            mesh = this.createBathMesh(data, refusals);
            drawnGeometry = 'bath';
        } else if (data.fixtureType === 'shower') {
            mesh = this.createShowerMesh(data);
            drawnGeometry = 'shower';
        } else if (data.fixtureType === 'accessory') {
            mesh = this.createAccessoryMesh(data);
            drawnGeometry = 'accessory';
        } else {
            mesh = this.createToiletMesh(data);
            drawnGeometry = 'toilet';
        }
        const drew: PlumbingBuildOutcome =
            FIXTURE_TYPES_WITH_A_FACTORY.has(requestedFixtureType) ? 'exact' : 'substituted';
        if (drew === 'substituted') {
            refusals.push(
                `fixtureType: authored "${requestedFixtureType}" has no LOD400 factory in ` +
                `PlumbingFragmentBuilder — drew "${drawnGeometry}" geometry instead`,
            );
        }
        // updateFixture runs on EVERY architect edit, so announce on a CHANGE of
        // outcome, not on every rebuild. A drag that moves a bidet must not print
        // sixty identical lines — a warning nobody reads is silence with extra steps.
        // Computed AFTER the push above, so the two refusal lists are comparable.
        const _prior = this._buildVerdict.get(data.id);
        const _isNews =
            _prior === undefined ||
            _prior.drew !== drew ||
            _prior.requestedFixtureType !== requestedFixtureType ||
            _prior.refusals.join('|') !== refusals.join('|');
        if (drew === 'substituted' && _isNews) {
            console.warn(
                '[PlumbingFragmentBuilder] §FIX-PLUMB-SUBSTITUTION — fixture ' + data.id +
                ': authored fixtureType "' + requestedFixtureType + '" has no geometry factory; ' +
                'drew "' + drawnGeometry + '" instead. The plan/elevation symbol and the schedule ' +
                'still read the authored type, so the 3-D view and the drawing disagree.',
            );
        }
        this._buildVerdict.set(data.id, {
            fixtureId: data.id,
            drew,
            requestedFixtureType,
            drawnGeometry,
            refusals,
            at: Date.now(),
        });
        if (refusals.length > 0 && drew === 'exact' && _isNews) {
            console.warn(
                '[PlumbingFragmentBuilder] §FIX-PLUMB-DEGENERATE — fixture ' + data.id +
                ' drew with ' + refusals.length + ' refused field(s): ' + refusals.join(' | '),
            );
        }
        // §FIX-PLUMB-SUBSTITUTION — the root's fixtureType WAS stamped only on the
        // first build (inside the `if (!root)` arm above) and never refreshed, so a
        // fixture whose type changed kept the OLD type in userData for every reader
        // that goes through elementRegistry. Re-stamped on every update, alongside the
        // verdict, so the substitution is readable from the built geometry itself.
        root.userData.fixtureType = requestedFixtureType;
        root.userData.drawnGeometry = drawnGeometry;
        // Primitives only on userData: the NMEexporter proxy cache and the IFC
        // readers walk this bag, so the RICH verdict stays in _buildVerdict and only
        // the human-readable lines are stamped — and the key is REMOVED, not set to
        // undefined, when a rebuild has nothing to refuse.
        if (refusals.length > 0) root.userData.buildRefusals = refusals.join(' | ');
        else delete root.userData.buildRefusals;

        // Ensure the mesh itself is selectable and carries the ID
        mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.userData = {
                    id: data.id,
                    elementType: 'PlumbingFixture',
                    selectable: true,
                    levelId: data.levelId,
                    levelName: data.levelName,
                    levelElevation: data.levelElevation,
                    baseOffset: data.baseOffset,
                    // §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221 P2) — suppress the generic
                    // true-edge projection of the LOD400 fixture mesh in the 2D views.
                    // Without this, EdgeProjectorService projects every triangulation
                    // edge (~55 ms + ~10.8 k HLR segments for ONE toilet). The dedicated
                    // Plumbing{Plan,Elevation}SymbolBuilder injects a clean architectural
                    // symbol instead. `skipInPlan` is the existing plan-only mechanism
                    // (doors/sofas/kitchens use it); `skipInElevation` is its new
                    // elevation sibling added for L-221.
                    skipInPlan: true,
                    skipInElevation: true,
                };
            }
        });
        
        root.add(mesh);

        root.position.copy(data.position);
        root.quaternion.setFromEuler(data.rotation);
        
        root.visible = true;
        console.log(`PlumbingFragmentBuilder: Updated fixture ${data.id}, visible: ${root.visible}`);
    }

    private createSinkMesh(data: PlumbingFixtureData): THREE.Group {
        const group = new THREE.Group();
        const ceramicMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            roughness: 0.1,
            metalness: 0.1
        });
        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.2,
            metalness: 0.8
        });

        // 1. Main Basin Body (Rectangular with rounded corners feel)
        const basinShape = new THREE.BoxGeometry(0.6, 0.2, 0.45);
        const basin = new THREE.Mesh(basinShape, ceramicMat);
        basin.position.set(0, 0.8, -0.225);
        group.add(basin);

        // 2. Interior Bowl (Carved out look using a semi-ellipsoid)
        const bowlGeo = new THREE.SphereGeometry(0.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const bowl = new THREE.Mesh(bowlGeo, ceramicMat);
        bowl.scale.set(1.1, 0.7, 0.8);
        bowl.rotation.x = Math.PI; // Invert to be a bowl
        bowl.position.set(0, 0.89, -0.25);
        group.add(bowl);

        // 3. Countertop / Rim
        const rimGeo = new THREE.BoxGeometry(0.65, 0.05, 0.5);
        const rim = new THREE.Mesh(rimGeo, ceramicMat);
        rim.position.set(0, 0.9, -0.25);
        group.add(rim);

        // 4. Backsplash / Mounting Plate
        const backsplashGeo = new THREE.BoxGeometry(0.65, 0.3, 0.05);
        const backsplash = new THREE.Mesh(backsplashGeo, ceramicMat);
        backsplash.position.set(0, 1.0, -0.025);
        group.add(backsplash);

        // 5. Faucet Base
        const faucetBaseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16);
        const faucetBase = new THREE.Mesh(faucetBaseGeo, chromeMat);
        faucetBase.position.set(0, 0.95, -0.1);
        group.add(faucetBase);

        // 6. Faucet Spout (L-shaped)
        const spoutVerticalGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 16);
        const spoutVertical = new THREE.Mesh(spoutVerticalGeo, chromeMat);
        spoutVertical.position.set(0, 1.05, -0.1);
        group.add(spoutVertical);

        const spoutHorizontalGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 16);
        const spoutHorizontal = new THREE.Mesh(spoutHorizontalGeo, chromeMat);
        spoutHorizontal.rotation.x = Math.PI / 2;
        spoutHorizontal.rotation.y = Math.PI;
        spoutHorizontal.position.set(0, 1.125, -0.16);
        group.add(spoutHorizontal);

        // 7. Drain
        const drainGeo = new THREE.CircleGeometry(0.04, 32);
        const drain = new THREE.Mesh(drainGeo, chromeMat);
        drain.rotation.x = -Math.PI / 2;
        drain.position.set(0, 0.72, -0.25);
        group.add(drain);

        // 8. Pedestal / Trap Cover
        const pedestalGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.7, 32);
        const pedestal = new THREE.Mesh(pedestalGeo, ceramicMat);
        pedestal.position.set(0, 0.35, -0.15);
        group.add(pedestal);

        // §PLUMBFRAME (founder, 2026-08-26 · L-11488) — THE SINK WAS BUILT ENTIRELY ON
        // −Z, 180° FROM ITS OWN PLAN SYMBOL.
        //
        // ⛔ MEASURED: every part above is authored at a NEGATIVE z — basin −0.225, rim
        // and drain −0.25, backsplash −0.025, pedestal −0.15 — while
        // `buildPlanLinework`'s `sink` arm draws `planRect(-hw, 0, hw, fp.length)`, i.e.
        // the body on +Z. Two readers of one record, half a turn apart, in the same
        // family. `PlumbingTool` was compensating for exactly this at WRITE time
        // (`if (fixtureType === 'sink' || 'toilet') rotateY(π)`), which is why the 3-D
        // tool and the plan tool stored different angles for the same wall.
        //
        // ⭐ ONE HALF-TURN ABOUT THE FIXTURE'S OWN ORIGIN, rather than negating nine
        // hand-written literals: it is a proper rotation (normals and winding rotate
        // with it), the basin, rim and pedestal are symmetric in x, and the faucet is on
        // the centreline — so the silhouette is untouched and only the FACING moves. The
        // convention it now obeys is `PlumbingFixtureFrame.ts`: origin at the
        // wall-contact edge, local +Z into the room.
        group.rotation.y = Math.PI;

        group.userData = {
            id: data.id,
            type: data.type,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset
        };
        return group;
    }

    private createToiletMesh(data: PlumbingFixtureData): THREE.Group {
        // LOD400: build the requested variant via the shared ToiletGeometry
        // factory. Preview (PlumbingTool) calls the same factory so geometry
        // parity is guaranteed (Contract 36 §5).
        const variant: ToiletVariant = data.toiletVariant ?? DEFAULT_TOILET_VARIANT;
        const group = createToiletGeometry(variant);

        group.userData = {
            id: data.id,
            type: data.type,
            toiletVariant: variant,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset
        };
        return group;
    }

    /**
     * Build a shower group from the persisted DTO. LOD400 — geometry is
     * deterministically rebuilt from `data.showerVariant` via the shared
     * `createShowerGeometry` factory (Contracts 36 §5 / 39 §5 parity).
     */
    private createShowerMesh(data: PlumbingFixtureData): THREE.Group {
        const variant: ShowerVariant = data.showerVariant ?? DEFAULT_SHOWER_VARIANT;
        const group = createShowerGeometry(variant);
        group.userData = {
            id: data.id,
            type: data.type,
            showerVariant: variant,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset,
        };
        return group;
    }

    /**
     * Build a bathroom accessory group (washing machine, toilet brush, etc.)
     * from the persisted DTO. LOD400 — geometry is deterministically rebuilt
     * from `data.accessoryVariant` via the shared `createAccessoryGeometry`
     * factory (Contracts 36 §5 / 39 §5 parity).
     */
    private createAccessoryMesh(data: PlumbingFixtureData): THREE.Group {
        const variant: BathroomAccessoryVariant = data.accessoryVariant ?? DEFAULT_ACCESSORY_VARIANT;
        const group = createAccessoryGeometry(variant);
        group.userData = {
            id: data.id,
            type: data.type,
            accessoryVariant: variant,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset,
        };
        return group;
    }

    private createBathMesh(data: PlumbingFixtureData, refusals: string[] = []): THREE.Group {
        const group = new THREE.Group();
        // §FIX-PLUMB-DEGENERATE (L-11962) — the four authored fields this factory reads
        // are the only ones in the whole builder that come from the record rather than
        // from a variant enum, and all four were read with `||` / a bare parseInt. See
        // resolveDimension / resolveColor for the exact substitutions that were silent.
        const authoredWidth = resolveDimension('width', data.width, BATH_DEFAULTS.width, refusals);
        const authoredLength = resolveDimension('length', data.length, BATH_DEFAULTS.length, refusals);
        const authoredHeight = resolveDimension('height', data.height, BATH_DEFAULTS.height, refusals);
        const color = resolveColor(data.color, refusals);
        // A bath shorter than its own 0.05 m rim has no interior to extrude: the tub
        // walls would come out with a negative internal height and the mesh would be
        // inside-out — present in the scene graph, invisible on screen. Refuse the
        // authored height by name and draw the catalogue depth.
        const rimThickness = 0.05;
        const height = authoredHeight - rimThickness > 0 ? authoredHeight : BATH_DEFAULTS.height;
        if (authoredHeight - rimThickness <= 0) {
            refusals.push(
                `height: authored ${authoredHeight} m leaves no interior above the ${rimThickness} m rim ` +
                `— drew ${BATH_DEFAULTS.height} m instead`,
            );
        }
        // Likewise a bath narrower than twice the wall thickness: the short-wall span
        // (length - 2 * 0.05) and the rim hole (half - 0.05) both go negative.
        const minPlan = rimThickness * 2 + 0.01;
        const width = authoredWidth > minPlan ? authoredWidth : BATH_DEFAULTS.width;
        const length = authoredLength > minPlan ? authoredLength : BATH_DEFAULTS.length;
        if (authoredWidth <= minPlan) {
            refusals.push(
                `width: authored ${authoredWidth} m is not wider than the ${minPlan} m rim pair ` +
                `— drew ${BATH_DEFAULTS.width} m instead`,
            );
        }
        if (authoredLength <= minPlan) {
            refusals.push(
                `length: authored ${authoredLength} m is not wider than the ${minPlan} m rim pair ` +
                `— drew ${BATH_DEFAULTS.length} m instead`,
            );
        }

        const mat = new THREE.MeshStandardMaterial({ 
            color: color,
            roughness: 0.1,
            metalness: 0.1,
            side: THREE.DoubleSide
        });

        // 1. Create the outer shape
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, -length / 2);
        shape.lineTo(width / 2, -length / 2);
        shape.lineTo(width / 2, length / 2);
        shape.lineTo(-width / 2, length / 2);
        shape.lineTo(-width / 2, -length / 2);

        // 2. Create the inner hole (rim thickness = 0.05)
        const hole = new THREE.Path();
        const rw = width / 2 - 0.05;
        const rl = length / 2 - 0.05;
        hole.moveTo(-rw, -rl);
        hole.lineTo(rw, -rl);
        hole.lineTo(rw, rl);
        hole.lineTo(-rw, rl);
        hole.lineTo(-rw, -rl);
        shape.holes.push(hole);

        // 3. Extrude the rim
        const extrudeSettings = { depth: 0.05, bevelEnabled: false };
        const rimGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const rim = new THREE.Mesh(rimGeo, mat);
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = height;
        group.add(rim);

        // 4. Create the tub walls (4 boxes)
        const wallThickness = 0.05;
        const internalHeight = height - 0.05;

        // Long walls
        const longWallGeo = new THREE.BoxGeometry(width, internalHeight, wallThickness);
        const frontWall = new THREE.Mesh(longWallGeo, mat);
        frontWall.position.set(0, internalHeight / 2, length / 2 - wallThickness / 2);
        group.add(frontWall);

        const backWall = new THREE.Mesh(longWallGeo, mat);
        backWall.position.set(0, internalHeight / 2, -length / 2 + wallThickness / 2);
        group.add(backWall);

        // Short walls
        const shortWallGeo = new THREE.BoxGeometry(wallThickness, internalHeight, length - wallThickness * 2);
        const leftWall = new THREE.Mesh(shortWallGeo, mat);
        leftWall.position.set(-width / 2 + wallThickness / 2, internalHeight / 2, 0);
        group.add(leftWall);

        const rightWall = new THREE.Mesh(shortWallGeo, mat);
        rightWall.position.set(width / 2 - wallThickness / 2, internalHeight / 2, 0);
        group.add(rightWall);

        // 5. Bottom
        const bottomGeo = new THREE.BoxGeometry(width, wallThickness, length);
        const bottom = new THREE.Mesh(bottomGeo, mat);
        bottom.position.y = wallThickness / 2;
        group.add(bottom);

        group.userData = { 
            id: data.id,
            type: data.type,
            levelId: data.levelId,
            levelName: data.levelName,
            levelElevation: data.levelElevation,
            baseOffset: data.baseOffset
        };
        return group;
    }

    removeFixture(id: string): void {
        const root = this.fixtureRoots.get(id);
        if (root) {
            // §FIX-PLUMB-DISPOSE (L-11961) — the DELETE leg freed nothing: it removed
            // the root from the scene, dropped the map entry and unregistered the id,
            // leaving every child geometry and material resident on the GPU for the
            // life of the session. Detach the children (which schedules their release
            // at the frame boundary) BEFORE the root leaves the scene graph, exactly as
            // RoofFragmentBuilder does. clearProjectGeometry() routes through here, so
            // the project sweep is fixed by the same line.
            detachAndReleaseChildren(root);
            this.scene.remove(root);
            this.fixtureRoots.delete(id);
            elementRegistry.unregisterRoot(id);
            // A verdict must never outlive the element it describes.
            this._buildVerdict.delete(id);
        }
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY fixture root from the scene without
     * tearing the builder down. See `BeamFragmentBuilder.clearProjectGeometry`
     * (C13 §3.8/§3.10). Invoked by the `bim-project-cleared` sweep.
     */
    clearProjectGeometry(): void {
        for (const id of [...this.fixtureRoots.keys()]) this.removeFixture(id);
    }
}
