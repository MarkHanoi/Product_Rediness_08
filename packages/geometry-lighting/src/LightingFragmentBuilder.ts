/**
 * @file LightingFragmentBuilder.ts
 *
 * THREE.js geometry builder for parametric lighting fixtures.
 *
 * Ceiling-mounted:
 *  downlight          — cylindrical canister (black body, gold inner reflector)
 *  pendant            — slim cylinder hanging from a cable
 *  linear_led         — rectangular bar with emissive LED strip on underside
 *  pendant_pebble     — flat disc/pebble pendant (cream, wide)
 *  pendant_ceramic_bell — ceramic bell pendant (dark-red glaze)
 *  pendant_conical    — conical/UFO wide-brim pendant (cream)
 *
 * Floor-standing:
 *  floor_wood_post    — wooden cross-base post + drum shade
 *  floor_arc_brass    — arched brass rod + marble disc base + dome shade
 *  floor_tripod_black — 3-leg tripod + drum shade (all black)
 *
 * Table/surface:
 *  table_terracotta   — terracotta column body + conical shade
 *
 * Night-mode:
 *  Listens to `bam:day-night-changed`. When mode==='night', adds a PointLight
 *  child to each fixture group. When mode==='day', removes them.
 *  The light is NOT present in the group by default (prevents daytime GPU cost).
 *
 * Contract compliance:
 *  §01 §4   — builders never mutate stores.
 *  §01 §4.3 — builders called only from initBuilders/engine layer.
 *  §01 §4.5 — geometry disposed on remove().
 *  §03 §1.1 — no `any` in public API.
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    LightingData,
    DOWNLIGHT_DEFAULTS,
    PENDANT_DEFAULTS,
    LINEAR_LED_DEFAULTS,
    PENDANT_PEBBLE_DEFAULTS,
    PENDANT_CERAMIC_BELL_DEFAULTS,
    PENDANT_CONICAL_DEFAULTS,
    FLOOR_WOOD_POST_DEFAULTS,
    FLOOR_ARC_BRASS_DEFAULTS,
    TABLE_TERRACOTTA_DEFAULTS,
    FLOOR_TRIPOD_BLACK_DEFAULTS,
    DEFAULT_EMISSION,
} from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

// ── Shared materials (one per builder instance) ───────────────────────────────

const _matCache = new Map<string, THREE.MeshStandardMaterial>();

function sharedMat(hex: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const key = hex + JSON.stringify(opts);
    if (!_matCache.has(key)) {
        _matCache.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), ...opts }));
    }
    return _matCache.get(key)!;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export class LightingFragmentBuilder {

    /** scene root → fixture group */
    private readonly _roots = new Map<string, THREE.Group>();

    /** id → point/spot light node (set only in night mode) */
    private readonly _lights = new Map<string, THREE.Light>();

    private _scene: THREE.Object3D | null = null;
    private _isNight = false;

    /** F.events.14 — unsub handle for bam:day-night-changed runtime.events listener. */
    private _unsubDayNight: (() => void) | undefined;

    constructor() {
        // F.events.14 — bam:day-night-changed migrated from DOM CustomEvent to runtime.events.
        this._unsubDayNight = (window as any).runtime?.events?.on(
            'bam:day-night-changed',
            ({ mode }: { mode: 'day' | 'night' }) => {
                this._isNight = mode === 'night';
                this._syncAllLights();
            },
        );
    }

    /** Call once after THREE.Scene is available. */
    setScene(scene: THREE.Object3D): void {
        this._scene = scene;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    add(data: LightingData): void {
        // §57 Day 5 (DAILY-USE 2026-05-21, Round 34) — capture _priorVersion
        // BEFORE remove() nukes the _roots-map entry. Same Round 19 column
        // capture-then-stamp pattern. Defaults to 0 for the first add.
        const _priorVersion: number =
            (this._roots.get(data.id)?.userData?.version as number | undefined) ?? 0;

        if (this._roots.has(data.id)) this.remove(data.id);

        const group = this._buildFixture(data);

        Object.defineProperties(group.userData, {
            id:          { value: data.id,            writable: false, configurable: false },
            elementType: { value: 'Lighting',          writable: false, configurable: false },
            fixtureType: { value: data.fixtureType,    writable: false, configurable: false },
        });
        group.userData.selectable = true;
        group.userData.levelId    = data.levelId;
        group.userData.layerName  = 'A-LGHT';
        // §57 Day 5 — monotonic per-build counter for NMEexporter cache
        // invalidation. Writable so subsequent calls bump it.
        group.userData.version    = _priorVersion + 1;

        const { x, y, z } = data.position;
        group.position.set(x, y, z);
        if (data.rotation) {
            group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.order as THREE.EulerOrder ?? 'XYZ');
        }

        // Mark every child mesh as a sub-element so selection can traverse up to the root
        group.traverse((child: THREE.Object3D) => {
            if (child === group) return;
            if ((child as THREE.Mesh).isMesh || (child as THREE.Light).isLight) {
                child.userData.isSubElement = true;
                child.userData.parentId     = data.id;
                child.userData.elementType  = 'Lighting';
            }
        });

        this._roots.set(data.id, group);
        if (this._scene) this._scene.add(group);

        elementRegistry.registerRoot(data.id, group);

        if (this._isNight) {
            this._attachLight(data, group);
        }
    }

    remove(id: string): void {
        const group = this._roots.get(id);
        if (!group) return;
        this._detachLight(id, group);
        if (this._scene) this._scene.remove(group);
        group.traverse((obj: THREE.Object3D) => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                if (!Array.isArray(mesh.geometry)) mesh.geometry.dispose();
            }
        });
        elementRegistry.unregisterRoot(id);
        this._roots.delete(id);
    }

    update(data: LightingData): void {
        this.remove(data.id);
        this.add(data);
    }

    // ── Geometry builders ─────────────────────────────────────────────────────

    private _buildFixture(data: LightingData): THREE.Group {
        switch (data.fixtureType) {
            case 'downlight':            return this._buildDownlight(data);
            case 'pendant':              return this._buildPendant(data);
            case 'linear_led':           return this._buildLinearLed(data);
            case 'pendant_pebble':       return this._buildPendantPebble(data);
            case 'pendant_ceramic_bell': return this._buildPendantCeramicBell(data);
            case 'pendant_conical':      return this._buildPendantConical(data);
            case 'floor_wood_post':      return this._buildFloorWoodPost(data);
            case 'floor_arc_brass':      return this._buildFloorArcBrass(data);
            case 'table_terracotta':     return this._buildTableTerracotta(data);
            case 'floor_tripod_black':   return this._buildFloorTripodBlack(data);
            default:                     return this._buildDownlight(data);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Existing ceiling-mounted fixtures
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Downlight — surface-mounted cylindrical canister.
     * Body: dark matte cylinder. Interior: gold metallic reflector cap.
     * Positioned with top face at Y=0 (flush with ceiling underside).
     */
    private _buildDownlight(data: LightingData): THREE.Group {
        const p = { ...DOWNLIGHT_DEFAULTS, ...data.downlightParams };
        const group = new THREE.Group();

        const bodyGeo = new THREE.CylinderGeometry(p.radius, p.radius, p.height, 32, 1, false);
        const bodyMat = sharedMat(p.color, { roughness: 0.7, metalness: 0.2 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = -(p.height / 2);
        body.castShadow = true;
        group.add(body);

        const reflR = p.radius * 0.72;
        const reflGeo = new THREE.SphereGeometry(reflR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const reflMat = sharedMat(p.goldColor, { roughness: 0.1, metalness: 0.9, side: THREE.BackSide });
        const refl = new THREE.Mesh(reflGeo, reflMat);
        refl.rotation.x = Math.PI;
        refl.position.y = -p.height + reflR * 0.4;
        group.add(refl);

        const glowGeo = new THREE.CircleGeometry(reflR * 0.55, 24);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.6,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = -p.height + 0.005;
        group.add(glow);

        return group;
    }

    /**
     * Pendant — slim cylinder hanging from a braided cable.
     */
    private _buildPendant(data: LightingData): THREE.Group {
        const p = { ...PENDANT_DEFAULTS, ...data.pendantParams };
        const group = new THREE.Group();

        const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, p.cableLen, 8);
        const cableMat = sharedMat('#888888', { roughness: 0.8, metalness: 0.3 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        const roseGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16);
        const roseMat = sharedMat('#cccccc', { roughness: 0.4, metalness: 0.5 });
        const rose = new THREE.Mesh(roseGeo, roseMat);
        rose.position.y = -0.006;
        group.add(rose);

        const bodyY = -(p.cableLen + p.height / 2);
        const bodyGeo = new THREE.CylinderGeometry(p.radius, p.radius, p.height, 32, 1, true);
        const bodyMat = sharedMat(p.color, { roughness: 0.6, metalness: 0.1, side: THREE.FrontSide });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = bodyY;
        body.castShadow = true;
        group.add(body);

        const topGeo = new THREE.CircleGeometry(p.radius, 32);
        const topMesh = new THREE.Mesh(topGeo, bodyMat);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = bodyY + p.height / 2;
        group.add(topMesh);

        const innerR = p.radius * 0.8;
        const innerGeo = new THREE.RingGeometry(innerR * 0.7, innerR, 32);
        const innerMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#c8a000'),
            emissive: new THREE.Color('#c8a000'),
            emissiveIntensity: 0.3,
            roughness: 0.2, metalness: 0.8,
            side: THREE.DoubleSide,
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.rotation.x = Math.PI / 2;
        inner.position.y = bodyY - p.height / 2 + 0.01;
        group.add(inner);

        const glowGeo = new THREE.CircleGeometry(p.radius * 0.5, 24);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.5,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = bodyY - p.height / 2 + 0.002;
        group.add(glow);

        return group;
    }

    /**
     * Linear LED — rectangular bar pendant hanging from two cables.
     */
    private _buildLinearLed(data: LightingData): THREE.Group {
        const p = { ...LINEAR_LED_DEFAULTS, ...data.linearLedParams };
        const group = new THREE.Group();

        const barY = -(p.cableLen + p.height / 2);

        const cableGeo = new THREE.CylinderGeometry(0.003, 0.003, p.cableLen, 8);
        const cableMat = sharedMat('#555555', { roughness: 0.8, metalness: 0.4 });
        const cableL = new THREE.Mesh(cableGeo, cableMat);
        cableL.position.set(-p.length / 2 + 0.04, -(p.cableLen / 2), 0);
        group.add(cableL);

        const cableR = new THREE.Mesh(cableGeo, cableMat);
        cableR.position.set( p.length / 2 - 0.04, -(p.cableLen / 2), 0);
        group.add(cableR);

        const roseGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.010, 12);
        const roseMat = sharedMat('#333333', { roughness: 0.5, metalness: 0.6 });

        const roseL = new THREE.Mesh(roseGeo, roseMat);
        roseL.position.set(-p.length / 2 + 0.04, -0.005, 0);
        group.add(roseL);

        const roseR = new THREE.Mesh(roseGeo, roseMat);
        roseR.position.set( p.length / 2 - 0.04, -0.005, 0);
        group.add(roseR);

        const barGeo = new THREE.BoxGeometry(p.length, p.height, p.width);
        const barMat = sharedMat(p.color, { roughness: 0.4, metalness: 0.5 });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.y = barY;
        bar.castShadow = true;
        group.add(bar);

        const ledGeo = new THREE.PlaneGeometry(p.length - 0.01, p.width * 0.6);
        const ledMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(p.ledColor),
            emissive: new THREE.Color(p.ledColor),
            emissiveIntensity: 1.0,
            roughness: 1.0,
            metalness: 0.0,
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.rotation.x = Math.PI / 2;
        led.position.y = barY - p.height / 2 - 0.001;
        group.add(led);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // New pendant types (ceiling-hung)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Pendant Pebble — wide flat disc/pebble shape in cream/beige.
     * Mimics a squashed cushion pendant. Ceiling attachment at Y=0.
     */
    private _buildPendantPebble(data: LightingData): THREE.Group {
        const p = { ...PENDANT_PEBBLE_DEFAULTS, ...data.pendantPebbleParams };
        const group = new THREE.Group();

        // Cable (single black cord)
        const cableGeo = new THREE.CylinderGeometry(0.005, 0.005, p.cableLen, 8);
        const cableMat = sharedMat('#222222', { roughness: 0.9, metalness: 0.1 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        // Canopy rose at ceiling
        const roseGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.014, 20);
        const roseMat = sharedMat('#333333', { roughness: 0.5, metalness: 0.6 });
        const rose = new THREE.Mesh(roseGeo, roseMat);
        rose.position.y = -0.007;
        group.add(rose);

        // Socket/connector between cable and shade
        const sockY = -(p.cableLen);
        const sockGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.035, 16);
        const sockMat = sharedMat('#333333', { roughness: 0.5, metalness: 0.7 });
        const sock = new THREE.Mesh(sockGeo, sockMat);
        sock.position.y = sockY - 0.0175;
        group.add(sock);

        // Pebble shade body — use a lathed disc profile for the squashed shape
        const shadeY = -(p.cableLen + 0.035 + p.height / 2);
        const shadeMat = sharedMat(p.color, { roughness: 0.55, metalness: 0.0 });

        // Top rounded cap
        const topGeo = new THREE.SphereGeometry(p.radius, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const top = new THREE.Mesh(topGeo, shadeMat);
        top.position.y = shadeY + p.height * 0.1;
        top.scale.set(1, p.height / (p.radius * 0.8), 1);
        top.castShadow = true;
        group.add(top);

        // Bottom rounded cap (inverted)
        const botGeo = new THREE.SphereGeometry(p.radius, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const bot = new THREE.Mesh(botGeo, shadeMat);
        bot.rotation.x = Math.PI;
        bot.position.y = shadeY - p.height * 0.1;
        bot.scale.set(1, p.height / (p.radius * 0.8), 1);
        bot.castShadow = true;
        group.add(bot);

        // Emissive inner glow disc at bottom opening
        const glowGeo = new THREE.CircleGeometry(p.radius * 0.45, 32);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.55,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = shadeY - p.height * 0.1 - 0.002;
        group.add(glow);

        return group;
    }

    /**
     * Pendant Ceramic Bell — dark-red glazed ceramic bell.
     * Bell widens toward the open bottom, open at base.
     * Ceiling attachment at Y=0.
     */
    private _buildPendantCeramicBell(data: LightingData): THREE.Group {
        const p = { ...PENDANT_CERAMIC_BELL_DEFAULTS, ...data.pendantCeramicBellParams };
        const group = new THREE.Group();

        // Single black cord cable
        const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, p.cableLen, 8);
        const cableMat = sharedMat('#1a1a1a', { roughness: 0.9, metalness: 0.1 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        // Small socket/ferrule connecting cable to ceramic
        const sockGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.025, 14);
        const sockMat = sharedMat('#1a1a1a', { roughness: 0.5, metalness: 0.8 });
        const sock = new THREE.Mesh(sockGeo, sockMat);
        sock.position.y = -(p.cableLen) - 0.0125;
        group.add(sock);

        // Bell body — open-bottom cone/cylinder with organic profile
        const bellY = -(p.cableLen + 0.025 + p.height / 2);
        const bellGeo = new THREE.CylinderGeometry(p.botRadius, p.topRadius, p.height, 32, 2, true);
        const bellMat = sharedMat(p.color, { roughness: 0.15, metalness: 0.05 });
        const bell = new THREE.Mesh(bellGeo, bellMat);
        bell.position.y = bellY;
        bell.castShadow = true;
        group.add(bell);

        // Top cap (closed at top)
        const topGeo = new THREE.CircleGeometry(p.topRadius, 24);
        const topMesh = new THREE.Mesh(topGeo, bellMat);
        topMesh.rotation.x = -Math.PI / 2;
        topMesh.position.y = bellY + p.height / 2;
        group.add(topMesh);

        // Rim detail at bottom — thin white inner lip
        const rimGeo = new THREE.TorusGeometry(p.botRadius, 0.006, 8, 32);
        const rimMat = sharedMat(p.innerColor, { roughness: 0.4, metalness: 0.1 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = bellY - p.height / 2;
        group.add(rim);

        // Exposed bulb visible through opening
        const bulbGeo = new THREE.SphereGeometry(0.038, 16, 12);
        const bulbMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.8,
            roughness: 1, metalness: 0,
        });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.y = bellY - p.height / 2 + 0.005;
        group.add(bulb);

        return group;
    }

    /**
     * Pendant Conical — wide UFO/conical form with flat top and wide brim.
     * Cream/beige matte ceramic appearance. Ceiling attachment at Y=0.
     */
    private _buildPendantConical(data: LightingData): THREE.Group {
        const p = { ...PENDANT_CONICAL_DEFAULTS, ...data.pendantConicalParams };
        const group = new THREE.Group();

        // Single cable
        const cableGeo = new THREE.CylinderGeometry(0.004, 0.004, p.cableLen, 8);
        const cableMat = sharedMat('#1a1a1a', { roughness: 0.9, metalness: 0.1 });
        const cable = new THREE.Mesh(cableGeo, cableMat);
        cable.position.y = -(p.cableLen / 2);
        group.add(cable);

        // Small hardware connector
        const connGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.030, 16);
        const connMat = sharedMat('#888888', { roughness: 0.4, metalness: 0.7 });
        const conn = new THREE.Mesh(connGeo, connMat);
        conn.position.y = -(p.cableLen) - 0.015;
        group.add(conn);

        // Conical shade body
        const shadeY = -(p.cableLen + 0.030 + p.height / 2);
        const shadeMat = sharedMat(p.color, { roughness: 0.65, metalness: 0.0 });

        // Main cone — wide at bottom, narrow at top
        const coneGeo = new THREE.CylinderGeometry(p.topRadius, p.botRadius, p.height, 40, 1, true);
        const cone = new THREE.Mesh(coneGeo, shadeMat);
        cone.position.y = shadeY;
        cone.castShadow = true;
        group.add(cone);

        // Flat top cap
        const topGeo = new THREE.CircleGeometry(p.topRadius, 32);
        const topCap = new THREE.Mesh(topGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.height / 2;
        group.add(topCap);

        // Inner shadow at top near connector
        const innerTopGeo = new THREE.CylinderGeometry(p.topRadius * 0.85, p.topRadius * 0.85, 0.015, 20);
        const innerTopMat = sharedMat('#888880', { roughness: 0.8, metalness: 0.3 });
        const innerTop = new THREE.Mesh(innerTopGeo, innerTopMat);
        innerTop.position.y = shadeY + p.height / 2 - 0.008;
        group.add(innerTop);

        // Bottom rim ring (slight thickness detail)
        const rimGeo = new THREE.TorusGeometry(p.botRadius, 0.007, 8, 48);
        const rim = new THREE.Mesh(rimGeo, shadeMat);
        rim.position.y = shadeY - p.height / 2;
        group.add(rim);

        // Emissive glow disc inside
        const glowGeo = new THREE.CircleGeometry(p.botRadius * 0.55, 36);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.5,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = shadeY - p.height / 2 + 0.002;
        group.add(glow);

        return group;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Floor-standing fixtures (Y=0 is floor level; lamp rises upward)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Floor Wood Post — wooden post with cross base, drum shade at top.
     * Y=0 is floor surface. Post rises to postHeight.
     */
    private _buildFloorWoodPost(data: LightingData): THREE.Group {
        const p = { ...FLOOR_WOOD_POST_DEFAULTS, ...data.floorWoodPostParams };
        const group = new THREE.Group();

        const woodMat = sharedMat(p.postColor, { roughness: 0.8, metalness: 0.0 });

        // Cross base — two planks perpendicular
        const baseGeo = new THREE.BoxGeometry(0.55, 0.04, 0.08);
        const baseA = new THREE.Mesh(baseGeo, woodMat);
        baseA.position.y = 0.02;
        group.add(baseA);

        const baseB = new THREE.Mesh(baseGeo, woodMat);
        baseB.rotation.y = Math.PI / 2;
        baseB.position.y = 0.02;
        group.add(baseB);

        // Central vertical post (two-plank cross-section)
        const postW = 0.048;
        const postD = 0.022;
        const postGeoA = new THREE.BoxGeometry(postW, p.postHeight, postD);
        const postA = new THREE.Mesh(postGeoA, woodMat);
        postA.position.y = p.postHeight / 2 + 0.04;
        postA.castShadow = true;
        group.add(postA);

        const postGeoB = new THREE.BoxGeometry(postD, p.postHeight, postW);
        const postB = new THREE.Mesh(postGeoB, woodMat);
        postB.position.y = p.postHeight / 2 + 0.04;
        postB.castShadow = true;
        group.add(postB);

        // Mid-height band / joiner
        const bandGeo = new THREE.BoxGeometry(0.06, 0.02, 0.06);
        const band = new THREE.Mesh(bandGeo, sharedMat('#c0a080', { roughness: 0.6, metalness: 0.2 }));
        band.position.y = p.postHeight * 0.5 + 0.04;
        group.add(band);

        // Drum shade
        const shadeY = p.postHeight + 0.04 + p.shadeHeight / 2;
        const shadeMat = sharedMat(p.shadeColor, { roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });

        const outerGeo = new THREE.CylinderGeometry(p.shadeRadius, p.shadeRadius, p.shadeHeight, 36, 1, true);
        const outer = new THREE.Mesh(outerGeo, shadeMat);
        outer.position.y = shadeY;
        outer.castShadow = true;
        group.add(outer);

        const topCapGeo = new THREE.CircleGeometry(p.shadeRadius, 36);
        const topCap = new THREE.Mesh(topCapGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.shadeHeight / 2;
        group.add(topCap);

        // Glow disc inside shade
        const glowGeo = new THREE.CircleGeometry(p.shadeRadius * 0.6, 32);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.45,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = shadeY - p.shadeHeight / 2 + 0.005;
        group.add(glow);

        return group;
    }

    /**
     * Floor Arc Brass — tall arc lamp with brass rod, marble disc base, dome shade.
     * Y=0 is floor. The vertical stem rises then arcs horizontally.
     */
    private _buildFloorArcBrass(data: LightingData): THREE.Group {
        const p = { ...FLOOR_ARC_BRASS_DEFAULTS, ...data.floorArcBrassParams };
        const group = new THREE.Group();

        const brassMat = sharedMat(p.color, { roughness: 0.25, metalness: 0.85 });

        // Marble disc base
        const baseGeo = new THREE.CylinderGeometry(p.baseRadius, p.baseRadius, 0.055, 40);
        const baseMat = sharedMat('#f0eeea', { roughness: 0.4, metalness: 0.0 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.0275;
        group.add(base);

        // Thin vertical rod from base up to arc apex
        const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, p.postHeight, 12);
        const rod = new THREE.Mesh(rodGeo, brassMat);
        rod.position.y = p.postHeight / 2 + 0.055;
        rod.castShadow = true;
        group.add(rod);

        // Horizontal arm at top (arc approximated as a tilted thin cylinder)
        const armLen = p.arcRadius;
        const armGeo = new THREE.CylinderGeometry(0.009, 0.009, armLen, 10);
        const arm = new THREE.Mesh(armGeo, brassMat);
        // Rotate 90° to make horizontal, offset to extend outward
        arm.rotation.z = Math.PI / 2;
        arm.position.set(armLen / 2, p.postHeight + 0.055, 0);
        group.add(arm);

        // Shade dome — hemisphere facing downward at end of arm
        const shadeY = p.postHeight + 0.055;
        const domeGeo = new THREE.SphereGeometry(p.shadeRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const domeMat = sharedMat(p.color, { roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.rotation.x = Math.PI; // open face downward
        dome.position.set(armLen, shadeY, 0);
        dome.castShadow = true;
        group.add(dome);

        // Small brass collar joining rod to arm
        const collarGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.025, 14);
        const collar = new THREE.Mesh(collarGeo, brassMat);
        collar.position.y = p.postHeight + 0.055;
        group.add(collar);

        // Glow disc inside dome
        const glowGeo = new THREE.CircleGeometry(p.shadeRadius * 0.65, 28);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff3d0'),
            emissive: new THREE.Color('#fff3d0'),
            emissiveIntensity: 0.5,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.set(armLen, shadeY - p.shadeRadius * 0.1, 0);
        group.add(glow);

        return group;
    }

    /**
     * Table Terracotta — terracotta bullet/column body + cream conical shade.
     * Y=0 is the tabletop surface. Lamp rises upward.
     */
    private _buildTableTerracotta(data: LightingData): THREE.Group {
        const p = { ...TABLE_TERRACOTTA_DEFAULTS, ...data.tableTerracottaParams };
        const group = new THREE.Group();

        const bodyMat = sharedMat(p.bodyColor, { roughness: 0.80, metalness: 0.0 });

        // Base disc
        const baseGeo = new THREE.CylinderGeometry(p.bodyRadius * 1.6, p.bodyRadius * 1.6, 0.018, 28);
        const base = new THREE.Mesh(baseGeo, bodyMat);
        base.position.y = 0.009;
        group.add(base);

        // Tall column body — slightly tapered (bullet shape)
        const colGeo = new THREE.CylinderGeometry(p.bodyRadius * 0.88, p.bodyRadius, p.bodyHeight, 28, 2);
        const col = new THREE.Mesh(colGeo, bodyMat);
        col.position.y = 0.018 + p.bodyHeight / 2;
        col.castShadow = true;
        group.add(col);

        // Small socket ring at top of column
        const sockY = 0.018 + p.bodyHeight;
        const sockGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.025, 16);
        const sockMat = sharedMat('#888888', { roughness: 0.5, metalness: 0.6 });
        const sock = new THREE.Mesh(sockGeo, sockMat);
        sock.position.y = sockY + 0.0125;
        group.add(sock);

        // Conical shade
        const shadeMat = sharedMat(p.shadeColor, { roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide });
        const shadeY = sockY + 0.025 + p.shadeHeight / 2;

        const shadeGeo = new THREE.CylinderGeometry(p.shadeTopR, p.shadeBotR, p.shadeHeight, 36, 1, true);
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.position.y = shadeY;
        shade.castShadow = true;
        group.add(shade);

        // Top cap of shade
        const topCapGeo = new THREE.CircleGeometry(p.shadeTopR, 24);
        const topCap = new THREE.Mesh(topCapGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.shadeHeight / 2;
        group.add(topCap);

        // Glow disc at shade opening
        const glowGeo = new THREE.CircleGeometry(p.shadeBotR * 0.55, 28);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff8e0'),
            emissive: new THREE.Color('#fff8e0'),
            emissiveIntensity: 0.50,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = shadeY - p.shadeHeight / 2 + 0.003;
        group.add(glow);

        return group;
    }

    /**
     * Floor Tripod Black — three angled black legs + central hub + drum shade.
     * Y=0 is floor. Legs splay outward and downward.
     */
    private _buildFloorTripodBlack(data: LightingData): THREE.Group {
        const p = { ...FLOOR_TRIPOD_BLACK_DEFAULTS, ...data.floorTripodBlackParams };
        const group = new THREE.Group();

        const blackMat = sharedMat(p.color, { roughness: 0.7, metalness: 0.2 });

        // Hub where legs meet
        const hubH = p.legHeight * 0.82; // hub sits at ~82% of leg height
        const hubGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.035, 16);
        const hubMat = sharedMat('#2a2a2a', { roughness: 0.5, metalness: 0.5 });
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.y = hubH;
        group.add(hub);

        // Three legs — each is a thin box rotated outward and angled down
        const legLen = Math.sqrt(hubH * hubH + (0.36) * (0.36)); // hypotenuse
        const legAngle = Math.atan2(0.36, hubH); // tilt from vertical

        for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const legGeo = new THREE.BoxGeometry(0.016, legLen, 0.016);
            const leg = new THREE.Mesh(legGeo, blackMat);
            leg.castShadow = true;

            // Position midpoint of leg
            leg.position.set(
                Math.sin(angle) * 0.18,
                hubH / 2,
                Math.cos(angle) * 0.18,
            );

            // Tilt outward
            leg.rotation.set(
                Math.cos(angle) * legAngle,
                0,
                -Math.sin(angle) * legAngle,
            );

            group.add(leg);

            // Small foot pad at floor contact
            const footGeo = new THREE.CylinderGeometry(0.014, 0.016, 0.012, 10);
            const foot = new THREE.Mesh(footGeo, blackMat);
            foot.position.set(Math.sin(angle) * 0.36, 0.006, Math.cos(angle) * 0.36);
            group.add(foot);
        }

        // Short rod from hub up to shade
        const rodH = p.legHeight - hubH;
        const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, rodH + 0.04, 10);
        const rod = new THREE.Mesh(rodGeo, blackMat);
        rod.position.y = hubH + (rodH + 0.04) / 2;
        group.add(rod);

        // Drum shade
        const shadeY = p.legHeight + p.shadeHeight / 2 + 0.01;
        const shadeMat = sharedMat(p.shadeColor, { roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });

        const outerGeo = new THREE.CylinderGeometry(p.shadeRadius, p.shadeRadius, p.shadeHeight, 40, 1, true);
        const outer = new THREE.Mesh(outerGeo, shadeMat);
        outer.position.y = shadeY;
        outer.castShadow = true;
        group.add(outer);

        // Top cap
        const topCapGeo = new THREE.CircleGeometry(p.shadeRadius, 40);
        const topCap = new THREE.Mesh(topCapGeo, shadeMat);
        topCap.rotation.x = -Math.PI / 2;
        topCap.position.y = shadeY + p.shadeHeight / 2;
        group.add(topCap);

        // Glow disc at bottom opening
        const glowGeo = new THREE.CircleGeometry(p.shadeRadius * 0.55, 36);
        const glowMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#fff3d0'),
            emissive: new THREE.Color('#fff3d0'),
            emissiveIntensity: 0.4,
            roughness: 1, metalness: 0,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = Math.PI / 2;
        glow.position.y = shadeY - p.shadeHeight / 2 + 0.005;
        group.add(glow);

        return group;
    }

    // ── Night-mode light management ───────────────────────────────────────────

    private _syncAllLights(): void {
        for (const [id, group] of this._roots) {
            if (this._isNight) {
                const stored = this._getAllData();
                const data = stored.find(d => d.id === id);
                if (data) this._attachLight(data, group);
            } else {
                this._detachLight(id, group);
            }
        }
    }

    /** Stored data accessor — builder doesn't own store; use window ref. */
    private _getAllData(): LightingData[] {
        const store = window.lightingStore; // TODO(TASK-08)
        return store ? store.getAll() : [];
    }

    private _attachLight(data: LightingData, group: THREE.Group): void {
        if (this._lights.has(data.id)) return;

        const em = { ...DEFAULT_EMISSION, ...data.emission };
        const light = new THREE.PointLight(
            new THREE.Color(em.color),
            em.intensity,
            em.distance,
            em.decay,
        );

        // Position light below fixture (at approximate bulb location)
        switch (data.fixtureType) {
            case 'downlight':
                light.position.set(0, -0.10, 0);
                break;
            case 'pendant': {
                const pp = { ...PENDANT_DEFAULTS, ...data.pendantParams };
                light.position.set(0, -(pp.cableLen + pp.height), 0);
                break;
            }
            case 'linear_led': {
                const lp = { ...LINEAR_LED_DEFAULTS, ...data.linearLedParams };
                light.position.set(0, -(lp.cableLen + lp.height), 0);
                break;
            }
            case 'pendant_pebble': {
                const pbl = { ...PENDANT_PEBBLE_DEFAULTS, ...data.pendantPebbleParams };
                light.position.set(0, -(pbl.cableLen + pbl.height + 0.04), 0);
                break;
            }
            case 'pendant_ceramic_bell': {
                const pcb = { ...PENDANT_CERAMIC_BELL_DEFAULTS, ...data.pendantCeramicBellParams };
                light.position.set(0, -(pcb.cableLen + pcb.height + 0.02), 0);
                break;
            }
            case 'pendant_conical': {
                const pc = { ...PENDANT_CONICAL_DEFAULTS, ...data.pendantConicalParams };
                light.position.set(0, -(pc.cableLen + pc.height + 0.03), 0);
                break;
            }
            case 'floor_wood_post': {
                const fwp = { ...FLOOR_WOOD_POST_DEFAULTS, ...data.floorWoodPostParams };
                light.position.set(0, fwp.postHeight + fwp.shadeHeight * 0.5 + 0.04, 0);
                break;
            }
            case 'floor_arc_brass': {
                const fab = { ...FLOOR_ARC_BRASS_DEFAULTS, ...data.floorArcBrassParams };
                light.position.set(fab.arcRadius, fab.postHeight + 0.055, 0);
                break;
            }
            case 'table_terracotta': {
                const tt = { ...TABLE_TERRACOTTA_DEFAULTS, ...data.tableTerracottaParams };
                light.position.set(0, tt.bodyHeight + 0.025 + tt.shadeHeight * 0.5 + 0.018, 0);
                break;
            }
            case 'floor_tripod_black': {
                const ftb = { ...FLOOR_TRIPOD_BLACK_DEFAULTS, ...data.floorTripodBlackParams };
                light.position.set(0, ftb.legHeight + ftb.shadeHeight * 0.5, 0);
                break;
            }
        }

        light.castShadow = true;
        if (light.shadow) {
            light.shadow.mapSize.set(512, 512);
            light.shadow.camera.near = 0.1;
            light.shadow.camera.far  = 8;
        }

        group.add(light);
        this._lights.set(data.id, light);
    }

    private _detachLight(id: string, group: THREE.Group): void {
        const light = this._lights.get(id);
        if (!light) return;
        group.remove(light);
        this._lights.delete(id);
    }

    dispose(): void {
        this._unsubDayNight?.(); // F.events.14 — was window.removeEventListener('bam:day-night-changed')
        for (const id of [...this._roots.keys()]) this.remove(id);
        _matCache.forEach(m => m.dispose());
        _matCache.clear();
    }
}
