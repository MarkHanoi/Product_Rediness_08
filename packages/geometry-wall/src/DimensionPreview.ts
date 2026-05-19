import * as THREE from '@pryzm/renderer-three/three';

export class DimensionPreview {
    private group: THREE.Group;
    private mainLine: THREE.Line;
    private extensionLines: THREE.LineSegments;
    private ticks: THREE.LineSegments;
    private label: HTMLDivElement;

    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private canvas: HTMLCanvasElement;

    /**
     * §04-12 Typed Dimension Input — when non-null, the label shows this text
     * instead of the auto-computed distance.  WallTool sets this while the user
     * is typing a dimension; reset to null when input is cleared.
     */
    private inputOverride: string | null = null;

    private readonly OFFSET_DISTANCE = 0.5; // World space meters
    private readonly TICK_SIZE = 0.15; // World space meters
    private readonly EXTENSION_OVERHANG = 0.1; // Extra length beyond dimension line

    constructor(
        scene: THREE.Scene,
        camera: THREE.Camera,
        canvas: HTMLCanvasElement
    ) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;

        this.group = new THREE.Group();
        this.group.renderOrder = 1000;
        this.group.visible = false;
        this.scene.add(this.group);

        // Materials
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x2196f3,
            depthTest: false,
            transparent: true,
            opacity: 0.8
        });

        // Main dimension line
        this.mainLine = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
        this.group.add(this.mainLine);

        // Extension lines
        this.extensionLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        this.group.add(this.extensionLines);

        // Ticks (diagonal slashes)
        this.ticks = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
        this.group.add(this.ticks);

        // ---- HTML Label ----
        this.label = document.createElement('div');
        this.label.style.position = 'absolute';
        this.label.style.padding = '2px 6px';
        this.label.style.background = '#2196f3';
        this.label.style.color = 'white';
        this.label.style.fontSize = '12px';
        this.label.style.fontWeight = 'bold';
        this.label.style.fontFamily = 'monospace';
        this.label.style.borderRadius = '4px';
        this.label.style.pointerEvents = 'none';
        this.label.style.whiteSpace = 'nowrap';
        this.label.style.transform = 'translate(-50%, -110%)';
        this.label.style.display = 'none';
        this.label.style.zIndex = '1000';
        this.label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

        const parent = this.canvas.parentElement as HTMLElement;
        parent.style.position = parent.style.position || 'relative';
        parent.appendChild(this.label);
    }

    update(start: THREE.Vector3, end: THREE.Vector3, camera?: THREE.Camera): void {
        if (camera) {
            this.camera = camera;
        }
        const distance = start.distanceTo(end);

        if (distance < 0.01) {
            this.hide();
            return;
        }

        this.camera.updateMatrixWorld(true);

        // 1. Calculate Vectors
        const wallDir = new THREE.Vector3().subVectors(end, start).normalize();

        // Perpendicular in XZ plane (for horizontal walls)
        const perp = new THREE.Vector3(-wallDir.z, 0, wallDir.x).normalize();

        // Ensure consistent offset side
        const offset = perp.clone().multiplyScalar(this.OFFSET_DISTANCE);

        // 2. Define Key Points
        const dimStart = start.clone().add(offset);
        const dimEnd = end.clone().add(offset);

        const extStartStart = start.clone();
        const extStartEnd = dimStart.clone().add(perp.clone().multiplyScalar(this.EXTENSION_OVERHANG));

        const extEndStart = end.clone();
        const extEndEnd = dimEnd.clone().add(perp.clone().multiplyScalar(this.EXTENSION_OVERHANG));

        // 3. Ticks (45-degree diagonal slashes at intersections)
        const tickDir = wallDir.clone().add(perp).normalize().multiplyScalar(this.TICK_SIZE);

        const tick1Start = dimStart.clone().sub(tickDir);
        const tick1End = dimStart.clone().add(tickDir);

        const tick2Start = dimEnd.clone().sub(tickDir);
        const tick2End = dimEnd.clone().add(tickDir);

        // 4. Update Geometries
        // Main Line
        this.mainLine.geometry.setFromPoints([dimStart, dimEnd]);

        // Extension Lines
        this.extensionLines.geometry.setFromPoints([
            extStartStart, extStartEnd,
            extEndStart, extEndEnd
        ]);

        // Ticks
        this.ticks.geometry.setFromPoints([
            tick1Start, tick1End,
            tick2Start, tick2End
        ]);

        this.group.visible = true;

        // 5. Label Projection
        const midPoint = new THREE.Vector3()
            .addVectors(dimStart, dimEnd)
            .multiplyScalar(0.5);

        const projected = midPoint.clone().project(this.camera);

        if ((this.camera as any).isPerspectiveCamera && projected.z > 1) {
            this.hide();
            return;
        }

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;

        // §04-12: show typed dimension value when input override is set
        if (this.inputOverride !== null) {
            this.label.textContent = this.inputOverride;
            this.label.style.background = '#1565c0';
            this.label.style.outline = '2px solid #90caf9';
        } else {
            this.label.textContent = `${distance.toFixed(3)} m`;
            this.label.style.background = '#2196f3';
            this.label.style.outline = '';
        }
        this.label.style.left = `${x}px`;
        this.label.style.top = `${y}px`;
        this.label.style.display = 'block';
    }

    /**
     * §04-12 Typed Dimension Input — set/clear the label override text.
     * Pass a non-null string to display a typed value (e.g. "5000| mm").
     * Pass null to return to the auto-computed distance display.
     * The override persists until explicitly cleared via setInputOverride(null).
     */
    setInputOverride(text: string | null): void {
        this.inputOverride = text;
    }

    hide(): void {
        this.group.visible = false;
        this.label.style.display = 'none';
    }

    dispose(): void {
        this.scene.remove(this.group);
        this.mainLine.geometry.dispose();
        this.extensionLines.geometry.dispose();
        this.ticks.geometry.dispose();

        const mat = this.mainLine.material as THREE.Material;
        mat.dispose();

        if (this.label.parentNode) {
            this.label.parentNode.removeChild(this.label);
        }
    }
}
