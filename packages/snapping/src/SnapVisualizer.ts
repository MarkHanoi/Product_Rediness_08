import * as THREE from '@pryzm/renderer-three/three';
import { SnapCandidate, SnapType } from './types';

interface SnapVisualizerConfig {
    indicatorSize: number;
    indicatorColor: Record<SnapType, number>;
    showLabel: boolean;
    fadeOutDuration: number;
}

const DEFAULT_CONFIG: SnapVisualizerConfig = {
    indicatorSize: 0.15,
    indicatorColor: {
        [SnapType.ENDPOINT]:    0x00ff00,   // green
        [SnapType.MIDPOINT]:    0x00ffff,   // cyan
        [SnapType.INTERSECTION]:0xff00ff,   // magenta
        [SnapType.PERPENDICULAR]:0xffff00,  // yellow
        [SnapType.GRID]:        0x888888,   // grey
        [SnapType.FACE]:        0xff8800,   // orange
        [SnapType.EDGE]:        0x0088ff,   // blue
        [SnapType.CENTER]:      0x8800ff,   // purple
        [SnapType.NEAREST]:     0x888888,   // grey
        [SnapType.CENTERLINE]:  0x00e5ff,   // light cyan — Revit-style centreline indicator
        [SnapType.WALL_JOIN]:   0xff4444,   // red — join candidate
        // §40 §7 — BIM grid snaps stand out from the uniform math grid:
        [SnapType.GRID_LINE]:        0xfacc15, // amber — single BIM grid datum
        [SnapType.GRID_INTERSECTION]:0xf97316  // strong orange — grid × grid
    },
    showLabel: true,
    fadeOutDuration: 150
};

export class SnapVisualizer {
    private scene: THREE.Scene;
    private config: SnapVisualizerConfig;

    private indicatorMesh: THREE.Mesh | null = null;
    private ringMesh: THREE.Mesh | null = null;
    private crosshairGroup: THREE.Group | null = null;
    private labelElement: HTMLDivElement | null = null;

    private currentCandidate: SnapCandidate | null = null;
    private fadeTimeout: number | null = null;
    /** Auto-hides the indicator if snap() stops being called (e.g., after a click with no further mouse movement). */
    private autoHideTimeout: number | null = null;
    private static readonly AUTO_HIDE_MS = 800;

    constructor(scene: THREE.Scene, config: Partial<SnapVisualizerConfig> = {}) {
        this.scene = scene;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.createIndicators();
        this.createLabel();
    }

    private createIndicators(): void {
        const geometry = new THREE.SphereGeometry(this.config.indicatorSize, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.9,
            depthTest: false
        });
        this.indicatorMesh = new THREE.Mesh(geometry, material);
        this.indicatorMesh.visible = false;
        this.indicatorMesh.renderOrder = 999;
        this.scene.add(this.indicatorMesh);

        const ringGeometry = new THREE.RingGeometry(
            this.config.indicatorSize * 1.5,
            this.config.indicatorSize * 2,
            32
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthTest: false
        });
        this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        this.ringMesh.rotation.x = -Math.PI / 2;
        this.ringMesh.visible = false;
        this.ringMesh.renderOrder = 998;
        this.scene.add(this.ringMesh);

        this.crosshairGroup = new THREE.Group();
        const lineLength = this.config.indicatorSize * 3;
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8,
            depthTest: false
        });

        const createLine = (start: THREE.Vector3, end: THREE.Vector3) => {
            const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
            return new THREE.Line(geometry, lineMaterial.clone());
        };

        this.crosshairGroup.add(createLine(
            new THREE.Vector3(-lineLength, 0, 0),
            new THREE.Vector3(lineLength, 0, 0)
        ));
        this.crosshairGroup.add(createLine(
            new THREE.Vector3(0, 0, -lineLength),
            new THREE.Vector3(0, 0, lineLength)
        ));
        this.crosshairGroup.visible = false;
        this.crosshairGroup.renderOrder = 997;
        this.scene.add(this.crosshairGroup);
    }

    private createLabel(): void {
        if (!this.config.showLabel) return;

        this.labelElement = document.createElement('div');
        this.labelElement.style.cssText = `
            position: fixed;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            font-size: 11px;
            font-family: system-ui, sans-serif;
            border-radius: 4px;
            pointer-events: none;
            z-index: 10000;
            display: none;
            white-space: nowrap;
        `;
        document.body.appendChild(this.labelElement);
    }

    show(candidate: SnapCandidate, screenPosition?: { x: number; y: number }): void {
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
            this.fadeTimeout = null;
        }
        // Reset auto-hide timer every time we receive a fresh snap — this keeps
        // the indicator visible while the mouse keeps moving over snap points,
        // but clears it automatically if snap() stops being called (e.g., after
        // the user clicks and doesn't move the mouse).
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
        }
        this.autoHideTimeout = window.setTimeout(() => {
            this.hideImmediate();
        }, SnapVisualizer.AUTO_HIDE_MS);

        this.currentCandidate = candidate;
        const color = this.config.indicatorColor[candidate.type] || 0x00ff00;
        const position = candidate.point.clone();
        position.y = 0.1;

        if (this.indicatorMesh) {
            (this.indicatorMesh.material as THREE.MeshBasicMaterial).color.setHex(color);
            this.indicatorMesh.position.copy(position);
            this.indicatorMesh.visible = true;
        }

        if (this.ringMesh) {
            (this.ringMesh.material as THREE.MeshBasicMaterial).color.setHex(color);
            this.ringMesh.position.copy(position);
            this.ringMesh.visible = true;
        }

        if (this.crosshairGroup) {
            this.crosshairGroup.position.copy(position);
            this.crosshairGroup.children.forEach(child => {
                if (child instanceof THREE.Line) {
                    (child.material as THREE.LineBasicMaterial).color.setHex(color);
                }
            });
            this.crosshairGroup.visible = candidate.type !== SnapType.GRID;
        }

        if (this.labelElement) {
            const label = screenPosition ? this.getSnapLabel(candidate) : '';
            if (label && screenPosition) {
                this.labelElement.textContent = label;
                this.labelElement.style.left = `${screenPosition.x + 20}px`;
                this.labelElement.style.top = `${screenPosition.y - 10}px`;
                this.labelElement.style.display = 'block';
                this.labelElement.style.borderLeft = `3px solid #${color.toString(16).padStart(6, '0')}`;
            } else {
                // No screen position or empty label — always hide immediately
                // to prevent stale labels from floating in the viewport
                this.labelElement.style.display = 'none';
            }
        }
    }

    hide(): void {
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
        }
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = null;
        }

        this.fadeTimeout = window.setTimeout(() => {
            if (this.indicatorMesh) this.indicatorMesh.visible = false;
            if (this.ringMesh) this.ringMesh.visible = false;
            if (this.crosshairGroup) this.crosshairGroup.visible = false;
            if (this.labelElement) this.labelElement.style.display = 'none';
            this.currentCandidate = null;
            this.fadeTimeout = null;
        }, this.config.fadeOutDuration);
    }

    hideImmediate(): void {
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
            this.fadeTimeout = null;
        }
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = null;
        }
        if (this.indicatorMesh) this.indicatorMesh.visible = false;
        if (this.ringMesh) this.ringMesh.visible = false;
        if (this.crosshairGroup) this.crosshairGroup.visible = false;
        if (this.labelElement) this.labelElement.style.display = 'none';
        this.currentCandidate = null;
    }

    /**
     * Returns a human-readable snap label.
     * For FACE snaps uses the metadata to show "Face — Interior" / "Face — Exterior".
     * For WALL_JOIN snaps shows the join type.
     */
    private getSnapLabel(candidate: SnapCandidate): string {
        const meta = candidate.metadata;

        switch (candidate.type) {
            case SnapType.ENDPOINT:
                return 'Endpoint';
            case SnapType.MIDPOINT:
                return 'Midpoint';
            case SnapType.INTERSECTION:
                return 'Intersection';
            case SnapType.PERPENDICULAR:
                return 'Perpendicular';
            case SnapType.GRID: {
                // Uniform math grid is always active — suppress the label to avoid
                // noise. BIM-structural-grid snaps now use SnapType.GRID_LINE.
                return '';
            }
            case SnapType.GRID_LINE: {
                return meta?.gridName ? `Grid ${meta.gridName}` : 'Grid';
            }
            case SnapType.GRID_INTERSECTION: {
                if (meta?.gridNameA && meta?.gridNameB) {
                    return `Grid ${meta.gridNameA} × ${meta.gridNameB}`;
                }
                return 'Grid Intersection';
            }
            case SnapType.CENTERLINE:
                return 'Wall Centerline';
            case SnapType.FACE: {
                if (meta?.facePosition === 'near') return 'Wall Face — Near';
                if (meta?.facePosition === 'far')  return 'Wall Face — Far';
                return 'Wall Face';
            }
            case SnapType.WALL_JOIN: {
                if (meta?.joinType === 'corner') return 'Wall Join — Corner';
                if (meta?.joinType === 't-join') return 'Wall Join — T';
                return 'Wall Join';
            }
            case SnapType.EDGE:
                return 'Edge';
            case SnapType.CENTER:
                return 'Center';
            case SnapType.NEAREST:
                return 'Nearest';
            default:
                return 'Snap';
        }
    }

    getCurrentCandidate(): SnapCandidate | null {
        return this.currentCandidate;
    }

    dispose(): void {
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
            this.fadeTimeout = null;
        }
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = null;
        }

        if (this.indicatorMesh) {
            this.scene.remove(this.indicatorMesh);
            this.indicatorMesh.geometry.dispose();
            (this.indicatorMesh.material as THREE.Material).dispose();
        }

        if (this.ringMesh) {
            this.scene.remove(this.ringMesh);
            this.ringMesh.geometry.dispose();
            (this.ringMesh.material as THREE.Material).dispose();
        }

        if (this.crosshairGroup) {
            this.scene.remove(this.crosshairGroup);
            this.crosshairGroup.children.forEach(child => {
                if (child instanceof THREE.Line) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
        }

        if (this.labelElement && this.labelElement.parentNode) {
            this.labelElement.parentNode.removeChild(this.labelElement);
        }
    }
}
