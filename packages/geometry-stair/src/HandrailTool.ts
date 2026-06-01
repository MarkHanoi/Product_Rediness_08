import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ProjectContext } from '@pryzm/core-app-model';
import { CreateHandrailCommand } from '@pryzm/command-registry';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import { SnapManager } from '@pryzm/snapping';
import { CommandManager } from '@pryzm/command-registry';
import { PREVIEW_COLOR, createGhostBoxBetween, createFootprintLine, disposePreviewObject } from '@pryzm/core-app-model';

export class HandrailTool {
    private world: OBC.World;
    private projectContext: ProjectContext;
    private commandManager: CommandManager;
    private snapManager: SnapManager | null = null;
    private isActive = false;
    private startPoint: THREE.Vector3 | null = null;
    private previewLine: THREE.Line | null = null;
    private previewBody: THREE.Mesh | null = null;
    private _selectedTypeId: string | undefined;

    private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
    private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        world: OBC.World,
        _handrailStore: HandrailStore,
        projectContext: ProjectContext,
        commandManager: CommandManager
    ) {
        this.world = world;
        this.projectContext = projectContext;
        this.commandManager = commandManager;
        this.snapManager = SnapManager.createWithDefaults(world.scene.three as THREE.Scene, null);
    }

    setTypeId(id: string | undefined): void {
        this._selectedTypeId = id;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        this.attachEventListeners();
        if (this.world.camera?.controls) this.world.camera.controls.enabled = false;
        this.showUI();
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        this.detachEventListeners();
        this.clearPreview();
        if (this.world.camera?.controls) this.world.camera.controls.enabled = true;
        this.hideUI();
    }

    private showUI(): void {
        const existing = document.getElementById('handrail-tool-ui');
        if (existing) existing.remove();

        const ui = document.createElement('div');
        ui.id = 'handrail-tool-ui';
        ui.className = 'th-overlay';

        const text = document.createElement('div');
        text.id = 'handrail-tool-text';
        text.className = 'th-text';
        text.innerHTML = '<strong>Handrail</strong> — Click to set start point';
        ui.appendChild(text);

        const hint = document.createElement('div');
        hint.className = 'th-hint';
        hint.textContent = 'Click again to set end point · Esc to cancel';
        ui.appendChild(hint);

        const buttons = document.createElement('div');
        buttons.className = 'th-btn-row';

        const finishBtn = document.createElement('button');
        finishBtn.type = 'button';
        finishBtn.className = 'th-btn th-btn--primary';
        finishBtn.textContent = 'Finish';
        finishBtn.onclick = () => this.deactivate();
        buttons.appendChild(finishBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'th-btn th-btn--neutral';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
            this.startPoint = null;
            this.clearPreview();
            this.deactivate();
        };
        buttons.appendChild(cancelBtn);

        ui.appendChild(buttons);
        document.body.appendChild(ui);
    }

    private hideUI(): void {
        const ui = document.getElementById('handrail-tool-ui');
        if (ui) ui.remove();
    }

    private attachEventListeners(): void {
        const canvas = this.world.renderer!.three.domElement;
        this.pointerDownHandler = (e: PointerEvent) => this.onPointerDown(e);
        this.pointerMoveHandler = (e: PointerEvent) => this.onPointerMove(e);
        canvas.addEventListener('pointerdown', this.pointerDownHandler);
        canvas.addEventListener('pointermove', this.pointerMoveHandler);
    }

    private detachEventListeners(): void {
        const canvas = this.world.renderer!.three.domElement;
        if (this.pointerDownHandler) canvas.removeEventListener('pointerdown', this.pointerDownHandler);
        if (this.pointerMoveHandler) canvas.removeEventListener('pointermove', this.pointerMoveHandler);
    }

    private onPointerDown(event: PointerEvent): void {
        if (event.button !== 0) return;
        const point = this.getWorldPoint(event);
        if (!point) return;
        const snapped = this.snapManager?.snap(point, { x: event.clientX, y: event.clientY }).point || point;

        if (!this.startPoint) {
            this.startPoint = snapped;
            const text = document.getElementById('handrail-tool-text');
            if (text) text.innerText = 'Handrail Tool: Click to set end point';
        } else {
            const typeDef = this._selectedTypeId
                ? handrailTypeStore.getById(this._selectedTypeId)
                : undefined;

            const cmd = new CreateHandrailCommand({
                id:            crypto.randomUUID(),
                start:         { x: this.startPoint.x, z: this.startPoint.z },
                end:           { x: snapped.x,          z: snapped.z },
                height:        typeDef?.height        ?? 1.0,
                thickness:     typeDef?.thickness     ?? 0.05,
                baseOffset:    typeDef?.baseOffset    ?? 0,
                fillType:      typeDef?.fillType,
                railProfile:   typeDef?.railProfile,
                railDiameter:  typeDef?.railDiameter,
                postSpacing:   typeDef?.postSpacing,
                materialColor: typeDef?.materialColor,
                levelId:       this.projectContext.activeLevelId,
            });
            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('handrail.create', {}).catch(() => {}); }
            this.commandManager.execute(cmd);
            this.startPoint = null;
            this.clearPreview();
            const text = document.getElementById('handrail-tool-text');
            if (text) text.innerText = 'Handrail Tool: Click to set start point';
        }
    }

    private onPointerMove(event: PointerEvent): void {
        if (!this.startPoint) return;
        const point = this.getWorldPoint(event);
        if (!point) return;
        const snapped = this.snapManager?.snap(point, { x: event.clientX, y: event.clientY }).point || point;
        this.updatePreview(this.startPoint, snapped);
    }

    private getWorldPoint(event: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, intersection) ? intersection : null;
    }

    private updatePreview(start: THREE.Vector3, end: THREE.Vector3): void {
        this.clearPreview();

        const length = start.distanceTo(end);
        if (length < 0.05) return;

        // Resolve the active type's geometric defaults so the ghost body
        // matches what will actually be created on the next click. Falls
        // back to the same defaults used in onPointerDown's command payload.
        const typeDef = this._selectedTypeId
            ? handrailTypeStore.getById(this._selectedTypeId)
            : undefined;
        const height     = typeDef?.height     ?? 1.0;
        const thickness  = typeDef?.thickness  ?? 0.05;
        const baseOffset = typeDef?.baseOffset ?? 0;

        // Both start/end are already at the active storey elevation (the
        // raycaster intersects the y=0 ground plane in this tool — handrail
        // creation is currently storey‑local). Use start.y as the floor.
        const elevation = start.y + baseOffset;

        // Footprint line — visible even when the body is occluded.
        this.previewLine = createFootprintLine(start, end, elevation, PREVIEW_COLOR.PRIMARY);
        if (this.previewLine) this.world.scene.three.add(this.previewLine);

        // Translucent 3D ghost body — same convention as Wall / CurtainWall
        // (see Contract §41, docs/02-decisions/contracts/41-ELEMENT-PREVIEW-VISUAL-CONTRACT.md).
        this.previewBody = createGhostBoxBetween(start, end, elevation, {
            color:     PREVIEW_COLOR.PRIMARY,
            length,
            height,
            thickness,
        });
        if (this.previewBody) this.world.scene.three.add(this.previewBody);
    }

    private clearPreview(): void {
        disposePreviewObject(this.previewLine); this.previewLine = null;
        disposePreviewObject(this.previewBody); this.previewBody = null;
    }
}
