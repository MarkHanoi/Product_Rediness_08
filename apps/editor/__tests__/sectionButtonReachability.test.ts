// @vitest-environment happy-dom
//
// §SECTION-3D-CAPABILITY (L-1760..L-1762, 2026-08-21) — the 3-D section button.
//
// These cases prove the button AT THE LAYER THE USER MEETS IT: the real DOM the
// real `BottomActionMenu` builds, found the way a user finds it — by its title
// in the rendered control row — not by calling a resolver and trusting it
// ([[committed-is-not-reachable]]).
//
// What they establish:
//   • The Section control EXISTS in the bottom bar (it always did — the audit's
//     verdict was "authored and reachable, but cutting nothing").
//   • On a WebGPU live renderer it is DISABLED and states WHY (C06 §13.5,
//     C84 EI-1b) instead of looking alive and doing nothing.
//   • On a genuine WebGLRenderer it is LIVE and clicking it hands the tool the
//     LIVE renderer — not the silenced OBC one that broke it (L-1486).
//   • Clicking a disabled control cannot reach the tool at all.
//
// ⚠ WHAT THEY DO NOT ESTABLISH: that pixels are cut on a GPU. There is no GPU
// in this environment and no browser to click. The renderer stand-ins carry the
// clipping properties three itself keys on, and the strongest claim made here is
// "the tool was handed the live renderer and set the global clip slot on it".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { BottomActionMenu, type BottomActionMenuProps } from '../src/ui/bottom-menu/BottomActionMenu.js';

const STUB_PROPS: BottomActionMenuProps = {
    toolManager: {},
    selectionManager: {},
    navManager: {},
    service: {},
    wallTool: {},
    deleteSelected: () => {},
} as unknown as BottomActionMenuProps;

/** Shape-accurate stand-in for the genuine THREE.WebGLRenderer ('webgl-only'). */
function webglRenderer() {
    return { localClippingEnabled: false, clippingPlanes: [] as unknown[] };
}

/** Shape-accurate stand-in for WebGPURenderer — no clipping API whatsoever. */
function webgpuRenderer() {
    return { isWebGPURenderer: true, render: () => {} };
}

/** Records what the bottom bar actually handed the tool. */
function makeToolSpy() {
    const calls: { enable: unknown[][]; disable: number } = { enable: [], disable: 0 };
    return {
        calls,
        enabled: false,
        enable(...args: unknown[]) {
            calls.enable.push(args);
            this.enabled = true;
        },
        disable() {
            calls.disable++;
            this.enabled = false;
        },
    };
}

/** Find the Section control the way a user does — by its rendered tooltip. */
function findSectionButton(menu: BottomActionMenu): HTMLButtonElement | null {
    const btns = Array.from(menu.element.querySelectorAll('button')) as HTMLButtonElement[];
    return btns.find(b => /^Section/i.test(b.title)) ?? null;
}

describe('§SECTION-3D-CAPABILITY — the bottom-bar Section control', () => {
    let scene: THREE.Scene;
    let tool: ReturnType<typeof makeToolSpy>;

    beforeEach(() => {
        scene = new THREE.Scene();
        const box = new THREE.Mesh(
            new THREE.BoxGeometry(2, 3, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x888888 }),
        );
        box.userData.id = 'wall-1';
        box.userData.elementType = 'wall';
        scene.add(box);
        (window as any).scene = scene;

        tool = makeToolSpy();
        (window as any).sectionBoxTool = tool;
        (window as any).viewportContainer = document.createElement('div');
        (window as any).world = {
            // The SILENCED OBC renderer — deliberately present, because the bug
            // was that this is what got used. It must NOT be the one handed over.
            renderer: { three: webglRenderer(), needsUpdate: false },
            camera: { three: new THREE.PerspectiveCamera() },
            scene: { three: scene },
        };
    });

    afterEach(() => {
        for (const k of ['scene', 'sectionBoxTool', 'viewportContainer', 'world', 'pryzmRenderer', 'pryzmRendererBackend']) {
            delete (window as any)[k];
        }
    });

    it('renders a Section control in the bottom bar at all', () => {
        (window as any).pryzmRenderer = webglRenderer();
        (window as any).pryzmRendererBackend = 'webgl-only';
        const menu = new BottomActionMenu(STUB_PROPS);
        expect(findSectionButton(menu)).not.toBeNull();
    });

    it('WebGPU backend — the control is DISABLED and says why (C06 §13.5)', () => {
        (window as any).pryzmRenderer = webgpuRenderer();
        (window as any).pryzmRendererBackend = 'webgpu';
        const menu = new BottomActionMenu(STUB_PROPS);

        const btn = findSectionButton(menu)!;
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute('aria-disabled')).toBe('true');
        // The reason is DISCLOSED, not merely absent — and it names the remedy.
        expect(btn.title).toMatch(/unavailable/i);
        expect(btn.title).toMatch(/WebGL/);
    });

    it("WebGPU backend — clicking the disabled control cannot reach the tool", () => {
        (window as any).pryzmRenderer = webgpuRenderer();
        (window as any).pryzmRendererBackend = 'webgpu';
        const menu = new BottomActionMenu(STUB_PROPS);

        findSectionButton(menu)!.click();
        expect(tool.calls.enable.length).toBe(0);
        expect(tool.enabled).toBe(false);
    });

    it("'webgl-fallback' is ALSO disabled — the name says WebGL, the object is WebGPU", () => {
        (window as any).pryzmRenderer = webgpuRenderer();
        (window as any).pryzmRendererBackend = 'webgl-fallback';
        const menu = new BottomActionMenu(STUB_PROPS);
        expect(findSectionButton(menu)!.disabled).toBe(true);
    });

    it('WebGL backend — the control is LIVE and clicking it enables the tool', () => {
        (window as any).pryzmRenderer = webglRenderer();
        (window as any).pryzmRendererBackend = 'webgl-only';
        const menu = new BottomActionMenu(STUB_PROPS);

        const btn = findSectionButton(menu)!;
        expect(btn.disabled).toBe(false);

        btn.click();
        expect(tool.calls.enable.length).toBe(1);
        expect(tool.enabled).toBe(true);
    });

    it('hands the tool the LIVE renderer, never the silenced OBC one (L-1486)', () => {
        const live = webglRenderer();
        (window as any).pryzmRenderer = live;
        (window as any).pryzmRendererBackend = 'webgl-only';
        const obc = (window as any).world.renderer.three;
        expect(live).not.toBe(obc);

        const menu = new BottomActionMenu(STUB_PROPS);
        findSectionButton(menu)!.click();

        const rendererArg = tool.calls.enable[0][0];
        expect(rendererArg).toBe(live);
        expect(rendererArg).not.toBe(obc);
    });

    it('clicking again turns the section OFF', () => {
        (window as any).pryzmRenderer = webglRenderer();
        (window as any).pryzmRendererBackend = 'webgl-only';
        const menu = new BottomActionMenu(STUB_PROPS);

        findSectionButton(menu)!.click();
        expect(tool.enabled).toBe(true);
        // Re-query: the row is rebuilt on every state change.
        findSectionButton(menu)!.click();
        expect(tool.calls.disable).toBeGreaterThanOrEqual(1);
        expect(tool.enabled).toBe(false);
    });

    it('an active section reads as ON while it is live', () => {
        (window as any).pryzmRenderer = webglRenderer();
        (window as any).pryzmRendererBackend = 'webgl-only';
        const menu = new BottomActionMenu(STUB_PROPS);

        findSectionButton(menu)!.click();
        expect(findSectionButton(menu)!.title).toMatch(/On/);
    });
});
