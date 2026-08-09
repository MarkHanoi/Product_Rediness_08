import * as THREE from '@pryzm/renderer-three/three';
import { LIGHT_BG_HEX, DARK_BG_HEX } from '@pryzm/renderer-three/background';

// §VIEWPORT-BG-ONE-AUTHORITY (2026-08-08) — these used to be independent string
// literals that HAPPENED to agree with renderer-three's LIGHT_BG_HEX/DARK_BG_HEX.
// Two copies of one colour is how this repo has drifted before, and the drift is
// invisible until a user reports the wrong background. They now DERIVE from the
// single low-layer authority, so the renderer clear colour, the TSL bgUniform,
// the `<bim-viewport>` CSS and `scene.background` cannot disagree.
export const SCENE_BG_HEX: string = LIGHT_BG_HEX;
export const SCENE_BG_NUM: number = Number.parseInt(LIGHT_BG_HEX.slice(1), 16);
// §NIGHT-DARK-BLUE-BG (2026-06-11) — night-mode background is a deep navy blue
// (was grey-navy #1f2433). Derived from DARK_BG_HEX in renderer-three.
export const SCENE_BG_DARK_HEX: string = DARK_BG_HEX;
export const GRID_COLOR_NUM = 0x9aaac8;
export const SCENE_BG_STORAGE_KEY = 'pryzm_scene_bg_color';

/**
 * §VIEWPORT-BG-RESET-DRIFT (2026-08-08) — the ONLY code path that ever wrote
 * this value was the View-Properties "Scene Background → Reset to default"
 * button, which reset to the APP-CHROME colour (`--app-bg`, index.html
 * `#container`) instead of the actual scene default. Anyone who pressed it got
 * a permanently GREY 3D viewport, persisted in localStorage, surviving every
 * reload — and no amount of fixing the renderer would have cleared it.
 *
 * The button is fixed below/at its call site; this treats the value it wrote as
 * "never chosen" so an already-affected session heals on next load. The trade:
 * a user who DELIBERATELY picked exactly #e8edf6 from the colour well loses it
 * once. The picker opens on the stored colour (white), so hitting this precise
 * value by hand is not a realistic scenario, whereas the buggy button wrote it
 * in one click.
 */
const LEGACY_APP_CHROME_BG = '#e8edf6';

export const SceneTheme = {
    applyBackground(
        world: { renderer: any; scene: any },
        viewport: HTMLElement
    ): void {
        const hex = SceneTheme.getStoredColor();
        SceneTheme._applyHex(hex, world, viewport);
    },

    setBackground(
        colorHex: string,
        world: { renderer: any; scene: any },
        viewport: HTMLElement
    ): void {
        localStorage.setItem(SCENE_BG_STORAGE_KEY, colorHex);
        SceneTheme._applyHex(colorHex, world, viewport);
    },

    getStoredColor(): string {
        try {
            const stored = localStorage.getItem(SCENE_BG_STORAGE_KEY);
            if (!stored) return SCENE_BG_HEX;
            // §VIEWPORT-BG-RESET-DRIFT — heal a viewport greyed by the old
            // "Reset to default" button (see the constant's doc comment).
            if (stored.toLowerCase() === LEGACY_APP_CHROME_BG) return SCENE_BG_HEX;
            return stored;
        } catch {
            return SCENE_BG_HEX;
        }
    },

    _applyHex(
        hex: string,
        world: { renderer: any; scene: any },
        viewport: HTMLElement
    ): void {
        viewport.style.background = hex;
        if (!window.pryzmCanvas) {
            world.scene.three.background = new THREE.Color(hex);
            try {
                world.renderer.three.setClearColor(new THREE.Color(hex), 1);
            } catch {
                // PostproductionRenderer may override this — Layer 1 & 2 provide fallback.
            }
        }
    },

    applyGridColor(grid: any): void {
        try {
            grid.material.uniforms.uColor.value.set(GRID_COLOR_NUM);
            grid.material.uniforms.uSize1.value = 2.0;
        } catch {
            // Grid material not available yet — no-op.
        }
    },
};
