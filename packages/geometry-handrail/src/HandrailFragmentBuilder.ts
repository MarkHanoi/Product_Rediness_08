import * as THREE from '@pryzm/renderer-three/three';
import { postStations, DEFAULT_HANDRAIL_END_CONDITION } from './postStations';
// §FIX-BUILDER-ISOLATION-LEAK (L-320) / §I2 — WebGPU-safe deep-dispose so the
// `usedTimes` device-loss throw (L-303 family) can never abort a handrail
// teardown mid-traverse and leak the root into the next project.
// §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — DETACH now, RELEASE at the
// next frame boundary. The queue drains through `safeDisposeObject3D`, so §I2
// throw-tolerance and INVARIANT L1 ownership are preserved.
import { detachAndReleaseChildren } from '@pryzm/renderer-three';
import { HandrailData } from '@pryzm/core-app-model/stores';
import { BimManager } from '@pryzm/core-app-model';
// §FIX-HANDRAIL-MATERIAL-ID (ADR-0332 §7) — the EXISTING Materials Repository, the
// only id→colour lookup this builder may honour today. See `resolveColour`.
import { resolveMaterialColour } from '@pryzm/core-app-model';
import { elementRegistry, StoreType } from '@pryzm/core-app-model/element-registry';
// ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-RAIL-INSTANCING) — optional
// GPU-instancing bridge. Mirrors ColumnFragmentBuilder / BeamFragmentBuilder: when
// injected AND the `__pryzmElementInstancingV1` flag is on, the REPEATED vertical
// balusters + posts (the per-handrail mesh-count multiplier — the spike measured
// ~500-1000 baluster meshes in a real building, each its own draw call) are
// registered as GPU instances instead of N individual meshes. The single swept
// top-rail / glass infill stay on the fragment path. Default-off: null bridge OR
// flag-off keeps every sub-mesh on the fragment path (identical to before).
import {
    ElementInstanceBridge,
    isElementInstancingEnabled,
} from '@pryzm/core-app-model/rendering';

export class HandrailFragmentBuilder {
    private scene: THREE.Scene;
    private bimManager: BimManager;
    private handrailRoots: Map<string, THREE.Group> = new Map();
    /**
     * ADR-0076 Axis 3 (§PERF-RAIL-INSTANCING) — optional GPU-instancing bridge.
     * When injected AND `__pryzmElementInstancingV1` is on, the repeated balusters
     * + posts of a handrail are registered as GPU instances (one InstancedMesh per
     * geo×mat×level) instead of individual THREE.Mesh draw calls. Default-off.
     */
    private _instanceBridge: ElementInstanceBridge | null = null;
    /**
     * §PERF-RAIL-INSTANCING — per-handrail set of the synthetic instance ids
     * (`${handrailId}#bal-${i}` / `${handrailId}#post-${i}`) currently registered
     * on the bridge, so a rebuild/remove releases EVERY slot (a handrail is 1:N on
     * the bridge, unlike the 1:1 column/beam). Keyed by handrail id.
     */
    private _instanceIds: Map<string, string[]> = new Map();
    /**
     * §C100-HANDRAIL-MATERIAL-ID — handrail ids already reported as having an
     * unresolvable material, so the warning is emitted once per element rather
     * than once per rail + infill + post + baluster.
     */
    private _unresolvedReported: Set<string> = new Set();

    constructor(scene: THREE.Scene, bimManager: BimManager) {
        this.scene = scene;
        this.bimManager = bimManager;
    }

    /**
     * ADR-0076 Axis 3 — inject the GPU-instancing bridge (the SAME one walls +
     * columns + beams use, constructed over the shared `instancedElementRenderer`).
     * Until this is injected AND `globalThis.__pryzmElementInstancingV1 === true`,
     * handrails build exactly as before. Mirrors ColumnFragmentBuilder.setInstanceBridge.
     */
    setInstanceBridge(bridge: ElementInstanceBridge): void {
        this._instanceBridge = bridge;
        console.log('[HandrailFragmentBuilder] §PERF-RAIL-INSTANCING ElementInstanceBridge injected (gated by __pryzmElementInstancingV1).');
    }

    /**
     * Eligibility: the repeated baluster/post primitives may use the instanced path
     * only when the bridge is present AND the flag is on. The balusters/posts are
     * always simple vertical box/cylinder primitives, so there is no per-element
     * geometry exclusion (unlike steel-LOD columns). Returns true → instanced path
     * for the repeated members; false → fragment path. Bridge null / flag off → false.
     */
    private _instancingActive(): boolean {
        return !!this._instanceBridge && isElementInstancingEnabled();
    }

    /**
     * §PERF-RAIL-INSTANCING — release every instance slot this handrail registered
     * on the bridge (no-op when none / bridge absent). Called before each rebuild
     * and on removeHandrail.
     */
    private _unregisterInstances(handrailId: string): void {
        const ids = this._instanceIds.get(handrailId);
        if (ids && this._instanceBridge) {
            for (const id of ids) this._instanceBridge.unregister(id);
        }
        this._instanceIds.delete(handrailId);
    }

    updateHandrail(handrail: Readonly<HandrailData>): void {
        this.buildHandrail(handrail);
    }

    removeHandrail(id: string): void {
        // §PERF-RAIL-INSTANCING — release any GPU instance slots first (no-op when
        // the handrail was on the pure fragment path).
        this._unregisterInstances(id);
        const root = this.handrailRoots.get(id);
        if (root) {
            // §GPU-RESOURCE-LIFETIME (ADR-0297, L2 (a)) — DETACH before anything is
            // released. The previous order (disposeRoot then scene.remove) destroyed
            // the GPU buffers while the root was still a live descendant of the scene.
            this.scene.remove(root);
            root.parent = null;
            this.disposeRoot(root);
            this.handrailRoots.delete(id);
        }
        elementRegistry.unregisterRoot(id);
        elementRegistry.unregister(id);
    }

    /**
     * §FIX-BUILDER-ISOLATION-LEAK (L-320) — dispose EVERY handrail root this builder
     * owns and clear its registry, so a project switch cannot leave stale handrail
     * geometry in the scene. Called from the project-isolation teardown
     * (`bim-project-cleared` in initTools) alongside the WallFragmentBuilder.
     *
     * This is the C13 GEOMETRY-side isolation, complementing the data-side
     * ProjectIsolationAudit: the per-element `bim-handrail-removed` path can abort
     * mid-teardown on the WebGPU `usedTimes` device-loss throw (L-303 family),
     * leaving roots behind — this sweep cleans up whatever survived, WebGPU-safe
     * (disposeRoot routes through safeDisposeObject3D, so it never re-throws).
     */
    dispose(): void {
        for (const id of Array.from(this.handrailRoots.keys())) {
            this.removeHandrail(id);
        }
        this.handrailRoots.clear();
        this._instanceIds.clear();
        this._unresolvedReported.clear();
    }

    private disposeRoot(root: THREE.Group): void {
        // §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — L-691 migration.
        // WAS: `safeDisposeObject3D(root); root.clear();` — dispose BEFORE detach.
        // `removeHandrail()` compounded it by calling this BEFORE `scene.remove(root)`,
        // so the buffers were destroyed with the root still in the scene graph.
        // `detachAndReleaseChildren` detaches first and releases at the frame boundary.
        detachAndReleaseChildren(root);
    }

    /**
     * §FIX-HANDRAIL-MATERIAL-ID (ADR-0332 §7) — the colour this handrail can
     * actually be drawn in TODAY.
     *
     * `materialColor` is an explicit tint and always wins. `materialId` was
     * WRITTEN by three paths (the IFC importer, `initTools`' bus bridge, the
     * update command) and read by NONE of them for rendering — it surfaced only
     * in the Handrail schedule's Material column (`ScheduleExtractor.ts:496`), so
     * a railing assigned a material showed that material in a table and stayed
     * grey on screen.
     *
     * ⚠ NO NEW VOCABULARY IS INVENTED HERE. This resolves through
     * `userMaterialStore` — the existing Materials Repository, whose `color` is
     * already a plain hex string — and nothing else. The rival material
     * vocabularies in this repo (including `HandrailTypeDefinition.materialName`,
     * which this lane is barred from touching) are LANE ZA's to unify. When ZA
     * lands, this is the ONLY place a handrail resolves a colour, so it is the
     * only place ZA has to re-point.
     */
    private resolveColour(handrail: Readonly<HandrailData>, fallback: string): string {
        // §C100-HANDRAIL-MATERIAL-ID — the ladder is NOT re-implemented here.
        // `resolveMaterialColour` (C100 §2.1) is the ONE place the two tiers are
        // chained; a private chain here is how a sixth material vocabulary gets
        // written (C100 §1.1 traces four of the existing five to exactly that).
        const r = resolveMaterialColour(handrail.materialId, handrail.materialColor);
        if (r.state !== 'unresolved') return r.hex;

        // ⚠ STEP 3, AND IT IS THE HALF THAT IS ALWAYS SKIPPED. C100 §5 forbids a
        // SILENT fallback: rendering grey makes "the material was deleted", "the
        // id is stale" and "this rail names no material" the same pixel. A mesh
        // must still be built, so the fallback is used AND the reason is said —
        // once per handrail, not once per member, so a balustrade with 30
        // balusters does not print 30 lines.
        if (!this._unresolvedReported.has(handrail.id)) {
            this._unresolvedReported.add(handrail.id);
            console.warn(
                `[HandrailFragmentBuilder] §C100-HANDRAIL-MATERIAL-ID handrail ${handrail.id} ` +
                `has NO RESOLVABLE MATERIAL — ${r.reason}. Falling back to ${fallback}; ` +
                'the colour on screen is NOT this element’s material.',
            );
        }
        return fallback;
    }

    private buildHandrail(handrail: Readonly<HandrailData>): void {
        const [start, end] = handrail.baseLine;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dz, dx);

        // ── §FEAT-HANDRAIL-SLOPE (ADR-0332 Tier 2 / §4.1) ────────────────────
        //
        // `HandrailData.baseLine` has ALWAYS carried a `y` on both endpoints and
        // this builder has never read either — every rail was forced horizontal by
        // `length = hypot(dx, dz)` and one `worldY` for the whole root. A handrail
        // that climbs a stair or a ramp was therefore unrepresentable even though
        // the model already held the data for it. That is why SLOPE needs no new
        // field and no migration: the field was there all along.
        //
        // The construction is `StairRailingBuilder`'s, not a new derivation — that
        // builder has drawn correct sloping railings for as long as it has existed
        // (`StairRailingBuilder.ts:1127-1131`, endpoint-to-endpoint orientation).
        // Its two structural rules are reproduced here:
        //
        //   • the RAIL and the INFILL follow the slope — rotated about the run's
        //     local Z by the pitch, and lengthened from PLAN length to SLOPE
        //     length. A rail that kept its plan length would fall short of the
        //     top post.
        //   • the POSTS and BALUSTERS stay PLUMB and equal-length, with their
        //     BASES riding the incline. That is what a real balustrade does, and
        //     it is why their tops trace a line parallel to the rail and meet it.
        //
        // ⚠ SCOPE, STATED DELIBERATELY: only the RELATIVE rise between the two
        // endpoints is honoured. The ABSOLUTE `start.y` stays ignored, exactly as
        // before, because `baseOffset` is this element's vertical control and
        // consuming `start.y` would silently relocate every IFC-imported rail
        // carrying a non-zero absolute y. A rail with y = [0, 0] — which is what
        // `CreateHandrailCommand` writes, and therefore what every existing
        // project holds — has `rise === 0` and takes a bit-identical path through
        // everything below.
        const rise = (end.y ?? 0) - (start.y ?? 0);
        const isSloped = Math.abs(rise) > 1e-9;
        /** Pitch of the run, radians. Exactly 0 for every existing handrail. */
        const slopeAngle = isSloped ? Math.atan2(rise, length) : 0;
        /** True length along the incline. Equals `length` when flat. */
        const slopeLength = isSloped ? Math.hypot(length, rise) : length;
        /** Height gained at plan-distance `lx` along the run. 0 when flat. */
        const riseAt = (lx: number): number =>
            isSloped && length > 1e-12 ? (lx / length) * rise : 0;

        const levelId = handrail.levelId;
        const level = this.bimManager.getLevelById(levelId);
        const elevation = level ? level.elevation : 0;
        const baseOffset = handrail.baseOffset ?? 0;
        const worldY = elevation + baseOffset;

        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture _priorVersion
        // BEFORE the disposeRoot path nukes the userData. Mirrors Round 19
        // column pattern. Defaults to 0 for first build.
        let root = this.handrailRoots.get(handrail.id);
        const _priorVersion: number = (root?.userData?.version as number | undefined) ?? 0;

        // §PERF-RAIL-INSTANCING — a rebuild reallocates the sub-meshes/instances;
        // release any prior instance slots up-front so a shrinking handrail does not
        // leave stale balusters on the GPU. (disposeRoot below drops the fragment
        // sub-meshes; this drops the instanced ones.)
        this._unregisterInstances(handrail.id);
        // A rebuild re-evaluates the material, so the element becomes eligible to
        // report again — otherwise BREAKING a material after first build would be
        // silent, which is the same defect one layer along.
        this._unresolvedReported.delete(handrail.id);

        if (!root) {
            root = new THREE.Group();
            this.scene.add(root);
            this.handrailRoots.set(handrail.id, root);
            // §3.5 FIX: elementRegistry.registerSemantic() moved here from HandrailStore.add().
            // Builders may register in ElementRegistry (§4.3). Stores may not.
            elementRegistry.registerSemantic(handrail.id, 'handrail' as StoreType);
        } else {
            this.disposeRoot(root);
        }
        elementRegistry.registerRoot(handrail.id, root);

        root.userData = {
            id: handrail.id,
            type: 'Handrail',
            elementType: 'Handrail',
            levelId: handrail.levelId,
            modelId: 'model-default',
            selectable: true,
            pathStart: { x: start.x, z: start.z },
            pathEnd:   { x: end.x,   z: end.z   },
            totalLength: length,
            height: handrail.height,
            // §57 Day 5 — monotonic per-build counter. Enables NMEexporter
            // proxy cache invalidation after every rebuild.
            version: _priorVersion + 1,
        };

        root.position.set(start.x, worldY, start.z);
        root.rotation.y = -angle;

        // §PERF-RAIL-INSTANCING — collect the synthetic instance ids registered for
        // this handrail (1:N). Instancing is active only when the bridge is injected
        // AND the flag is on; otherwise every member stays a real fragment mesh.
        const instancingActive = this._instancingActive();
        const registeredIds: string[] = [];

        // World-space transform of a LOCAL handrail-frame point (the root group is
        // at (start.x, worldY, start.z) rotated by -angle about Y). Used to express
        // each baluster/post CENTRE in world space for the bridge (which renders in
        // world space, not the parented group's local space).
        //
        //   root.rotation.y = -angle, so a local (lx, ly, lz) maps to world =
        //   pos + R_y(-angle)·local. R_y(-angle) on (x,0,z): x' = x·cosθ − z·sinθ,
        //   z' = x·sinθ + z·cosθ with θ = angle. (Verified against THREE.Group's
        //   matrixWorld to <1e-9 for all 8 baluster/post corners.) Every baluster/
        //   post has lz = 0, but the lz term is kept correct for generality.
        const toWorld = (lx: number, ly: number, lz: number): { x: number; y: number; z: number } => ({
            x: start.x + lx * Math.cos(angle) - lz * Math.sin(angle),
            y: worldY + ly,
            z: start.z + lx * Math.sin(angle) + lz * Math.cos(angle),
        });

        const railProfile = handrail.railProfile ?? 'rectangular';

        // ── Top rail (single swept body — stays a fragment) ───────────────────────
        //
        // §FEAT-HANDRAIL-SLOPE — the rail spans `slopeLength` (not the plan length),
        // sits at the MID height of the run, and is pitched about local Z. All three
        // reduce to today's values when the run is flat.
        const railColour = this.resolveColour(handrail, '#cccccc');
        if (railProfile === 'round') {
            const radius = (handrail.railDiameter ?? 0.04) / 2;
            const railGeo = new THREE.CylinderGeometry(radius, radius, slopeLength, 8);
            railGeo.rotateZ(Math.PI / 2);
            const railMat = new THREE.MeshStandardMaterial({ color: railColour });
            const railMesh = new THREE.Mesh(railGeo, railMat);
            railMesh.position.set(length / 2, handrail.height + rise / 2, 0);
            if (isSloped) railMesh.rotation.z = slopeAngle;
            railMesh.userData = { role: 'geometry', selectable: false, member: 'rail' };
            root.add(railMesh);
        } else {
            const geo = new THREE.BoxGeometry(slopeLength, 0.05, handrail.thickness);
            const mat = new THREE.MeshStandardMaterial({ color: railColour });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(length / 2, handrail.height + rise / 2, 0);
            if (isSloped) mesh.rotation.z = slopeAngle;
            mesh.userData = { role: 'geometry', selectable: false, member: 'rail' };
            root.add(mesh);
        }

        // ── Infill ────────────────────────────────────────────────────────────────
        //
        // §FIX-HANDRAIL-FILLTYPE-PANEL (ADR-0332 §7) — `HandrailFillType` declares
        // FOUR members and this block implemented TWO. 'panel' was selectable in
        // the type picker and built NOTHING — an affordance with no implementation
        // (C65 §3.9), and silent, which is the worst form of it. It is implemented
        // below: a panel is a solid infill board, i.e. the glass panel's geometry
        // without the transparency, so refusing it would have been refusing
        // something two lines already draw.
        //
        // 'open' also builds no infill — and that is CORRECT, not a gap: an open
        // railing is posts and a rail with nothing between them (the built-in
        // "Stainless Steel Handrail" and "Steel Guardrail" types are exactly that).
        // It is given an explicit, named branch below so that the absence of
        // geometry is a DECISION a reader can see, rather than an `else` nobody
        // wrote. That distinction — deliberate emptiness vs forgotten case — is the
        // whole point of §CONTEXT-DATA-HONESTY.
        const fill = handrail.fillType;
        if (fill === 'glass' || fill === 'panel') {
            // A single swept infill sheet — one fragment, not a repeated primitive.
            // §FEAT-HANDRAIL-SLOPE — spans the incline and is pitched with the rail.
            const infillGeo = new THREE.BoxGeometry(
                slopeLength,
                handrail.height - 0.1,
                fill === 'glass' ? 0.01 : Math.max(0.01, handrail.thickness * 0.4),
            );
            const infillMat = fill === 'glass'
                ? new THREE.MeshStandardMaterial({
                    color: '#88ccff',
                    transparent: true,
                    opacity: 0.3,
                    metalness: 0.1,
                    roughness: 0.1,
                })
                : new THREE.MeshStandardMaterial({
                    // A solid panel is made of the railing's own material, unlike
                    // glass which has an appearance of its own.
                    color: this.resolveColour(handrail, '#b8b8b8'),
                    roughness: 0.8,
                    metalness: 0.0,
                });
            const infillMesh = new THREE.Mesh(infillGeo, infillMat);
            infillMesh.position.set(length / 2, handrail.height / 2 + rise / 2, 0);
            if (isSloped) infillMesh.rotation.z = slopeAngle;
            infillMesh.userData = { role: 'geometry', selectable: false, member: 'infill' };
            root.add(infillMesh);
        } else if (fill === 'open') {
            // Deliberately empty — see the note above. No infill is the definition
            // of an open railing, so there is nothing to build and nothing missing.
        } else if (fill === 'baluster') {
            // §FEAT-HANDRAIL-INFILL-MAX-GAP (C95 D5) -- the CODE constraint, honoured.
            //
            // An authored PITCH always wins: `balusterSpacing`, then `postSpacing`,
            // exactly as before, so no existing handrail changes shape. Only when
            // NEITHER is present does `infillMaxGap` derive one, and the derivation
            // is the definition of the rule rather than a guess:
            //
            //     clear gap = pitch - balusterWidth   =>   pitch = maxGap + width
            //
            // i.e. a 0.099 m "100 mm sphere" limit with 0.016 m bars gives a
            // 0.115 m centre pitch, whose CLEAR opening is exactly 0.099 m. Falling
            // through to the historical 0.11 m literal when nothing at all is
            // declared keeps the previous default intact.
            const _authoredPitch = handrail.balusterSpacing ?? handrail.postSpacing;
            const _bWidthForPitch = handrail.balusterWidth ?? 0.02;
            const balusterSpacing = _authoredPitch
                ?? (handrail.infillMaxGap !== undefined && handrail.infillMaxGap > 0
                    ? handrail.infillMaxGap + _bWidthForPitch
                    : 0.11);
            if (balusterSpacing > 0 && length > balusterSpacing) {
                const bHeight = handrail.height - 0.05;
                const bShape = handrail.balusterShape ?? 'rectangular';
                const bWidth = handrail.balusterWidth ?? 0.02;
                const bMat = new THREE.MeshStandardMaterial({ color: this.resolveColour(handrail, '#888888') });
                const isRound = bShape === 'round';
                // Local extents → bridge size. Round baluster: X/Z = diameter (= bWidth),
                // matching CylinderGeometry(bWidth/2, bWidth/2, bHeight). Box baluster:
                // X = Z = bWidth, Y = bHeight, matching BoxGeometry(bWidth, bHeight, bWidth).
                // §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5) — the stations
                // come from the ONE pure function. The `Math.floor(...) - 1` that
                // stood here left a final bay of up to TWICE the authored pitch
                // (a 4.001 m run at 1.0 m got the same three balusters a 4.000 m
                // run got), which for a guard is the one gap a 100 mm sphere
                // passes through. See `postStations.ts` for the decision.
                const _endCondition = (handrail as { postEndCondition?: typeof DEFAULT_HANDRAIL_END_CONDITION }).postEndCondition
                    ?? DEFAULT_HANDRAIL_END_CONDITION;
                const _balStations = postStations(length, balusterSpacing, _endCondition);
                const count = _balStations.length;
                // Fragment-path geometry shared across this handrail's balusters.
                const bGeo = !instancingActive
                    ? (isRound
                        ? new THREE.CylinderGeometry(bWidth / 2, bWidth / 2, bHeight, 6)
                        : new THREE.BoxGeometry(bWidth, bHeight, bWidth))
                    : null;
                for (let i = 1; i <= count; i++) {
                    const lx = _balStations[i - 1];     // along the rail (PLAN distance)
                    // §FEAT-HANDRAIL-SLOPE — the baluster stays PLUMB and keeps its
                    // full length; only its BASE rides the incline, so its top meets
                    // the pitched rail. `riseAt` is 0 on a flat run, which restores
                    // the previous `bHeight / 2` exactly.
                    const lyCentre = riseAt(lx) + bHeight / 2;
                    if (instancingActive) {
                        const instId = `${handrail.id}#bal-${i}`;
                        this._instanceBridge!.register(
                            instId,
                            handrail.levelId,
                            'Handrail',
                            {
                                // CENTRE of the baluster in WORLD space.
                                centre: toWorld(lx, lyCentre, 0),
                                // Vertical member: rotateY = -angle keeps a SQUARE box
                                // baluster oriented identically to the parented fragment
                                // group (round cylinders are Y-symmetric → harmless).
                                rotationY: -angle,
                                size: { x: bWidth, y: bHeight, z: bWidth },
                            },
                            bMat,
                            isRound ? 'cylinder' : 'box',
                        );
                        registeredIds.push(instId);
                    } else {
                        const bMesh = new THREE.Mesh(bGeo!, bMat);
                        bMesh.position.set(lx, lyCentre, 0);
                        bMesh.userData = { role: 'geometry', selectable: false, member: 'baluster' };
                        root.add(bMesh);
                    }
                }
            }
        }

        // ── Posts (repeated vertical cylinders) ───────────────────────────────────
        const postRadius = 0.02;
        const postHeight = handrail.height;
        const postMat = new THREE.MeshStandardMaterial({ color: '#333333' });
        const postGeo = !instancingActive
            ? new THREE.CylinderGeometry(postRadius, postRadius, postHeight)
            : null;

        const emitPost = (lx: number, suffix: string): void => {
            // §FEAT-HANDRAIL-SLOPE — posts stay PLUMB, full height, bases on the
            // incline. `riseAt` is 0 on a flat run → previous behaviour exactly.
            const lyCentre = riseAt(lx) + postHeight / 2;
            if (instancingActive) {
                const instId = `${handrail.id}#post-${suffix}`;
                this._instanceBridge!.register(
                    instId,
                    handrail.levelId,
                    'Handrail',
                    {
                        centre: toWorld(lx, lyCentre, 0),
                        rotationY: -angle, // cylinder is Y-symmetric; -angle kept for exactness
                        // CylinderGeometry default radial diameter = 2·radius along X/Z.
                        size: { x: postRadius * 2, y: postHeight, z: postRadius * 2 },
                    },
                    postMat,
                    'cylinder',
                );
                registeredIds.push(instId);
            } else {
                const post = new THREE.Mesh(postGeo!, postMat);
                post.position.set(lx, lyCentre, 0);
                post.userData = { role: 'geometry', selectable: false, member: 'post' };
                root.add(post);
            }
        };

        // ---- End posts, and the RUN JOIN --------------------------------------
        //
        // §FEAT-HANDRAIL-RUN-JOIN (C95 D4). A multi-segment run -- an L-shaped
        // rail, or a closed square / circular / elliptical guard -- is stored as N
        // two-point handrails that SHARE their interior vertices. Emitting an end
        // post at both ends of every segment therefore put TWO coincident posts on
        // every shared vertex: visibly thickened, z-fighting, and double-counted in
        // any schedule.
        //
        // The generator makes each vertex the responsibility of exactly ONE
        // segment (see `handrailRunGenerators.ts`): every segment after the first
        // suppresses its START post, and in a CLOSED loop the first suppresses its
        // too because the last segment's END post already stands there. So the run
        // has exactly one post per vertex, no gap and no doubling.
        //
        // Absent / false -- which is every handrail that existed before this
        // field -- takes the identical path it always did.
        if (!handrail.suppressStartPost) emitPost(0, 'start');
        emitPost(length, 'end');

        // Intermediate posts.
        // §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5) — same pure function,
        // same end condition, so posts and balusters can never disagree about
        // where the run divides.
        const spacing = handrail.postSpacing ?? 0;
        const postEndCondition = (handrail as { postEndCondition?: typeof DEFAULT_HANDRAIL_END_CONDITION }).postEndCondition
            ?? DEFAULT_HANDRAIL_END_CONDITION;
        const stations = postStations(length, spacing, postEndCondition);
        stations.forEach((x, i) => emitPost(x, `mid-${i + 1}`));

        if (registeredIds.length > 0) {
            this._instanceIds.set(handrail.id, registeredIds);
        }
    }
}
