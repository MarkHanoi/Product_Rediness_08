import * as THREE from '@pryzm/renderer-three/three';

export const SCENE_BG_HEX = '#ffffff';
export const SCENE_BG_NUM = 0xffffff;
// §NIGHT-DARK-BLUE-BG (2026-06-11) — night-mode background is a deep navy blue
// (was grey-navy #1f2433). Mirrors DARK_BG_HEX in renderer-three BackgroundUniform.
export const SCENE_BG_DARK_HEX = '#0a0f2c';
export const GRID_COLOR_NUM = 0x9aaac8;
export const SCENE_BG_STORAGE_KEY = 'pryzm_scene_bg_color';

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
            return localStorage.getItem(SCENE_BG_STORAGE_KEY) || SCENE_BG_HEX;
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
