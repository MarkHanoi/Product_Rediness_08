import { SlabTool } from '@pryzm/geometry-slab';
import { WallTool, WallDrawingMode } from '@pryzm/geometry-wall';
import { WindowTool } from '@pryzm/geometry-window';
import { DoorTool } from '@pryzm/geometry-door';
import { CurtainWallTool } from '@pryzm/geometry-curtain-wall';
import { ColumnTool } from '@pryzm/geometry-column';
import { BeamTool } from './BeamTool.js';
import { StairTool } from '@pryzm/geometry-stair';
import { OpeningTool } from './OpeningTool.js';
import { RoofTool, RoofToolState } from '@pryzm/geometry-roof';
import { FloorTool } from '@pryzm/geometry-slab';
import { CeilingTool } from '@pryzm/geometry-slab';
import { ToolName, ToolEventEmitter, ToolState } from './types.js';
import { CommandManager } from '@pryzm/command-registry';
import { StairShape } from '@pryzm/geometry-stair';

// §ANN — All annotation tools → @pryzm/plugin-annotations (Sprint C)
import {
    LinearDimensionAnnotationTool,
    TextNoteTool,
    ElementTagTool,
    AngularDimensionAnnotationTool,
    SpotElevationAnnotationTool,
    KeynoteTool,
    RadiusDimensionTool,
    DiameterDimensionTool,
    SlopeDimensionTool,
    DoorTagTool,
    WindowTagTool,
    LevelTagTool,
    GridBubbleTool,
    RevisionCloudTool,
} from '@pryzm/plugin-annotations';
import { RoomTool } from '@pryzm/room-topology';
import { SelectionManager } from './SelectionManager.js';
import { drawingEditorService } from '@pryzm/core-app-model/views';

export type ActiveTool = ToolName;

interface ToolRegistration {
    tool: any;
    name: ToolName;
    isActive: () => boolean;
    activate: (options?: any) => void | Promise<void>;
    deactivate: () => void;
    cleanup?: () => void;
}

export class ToolManager {
    public commandManager: CommandManager;
    private slabTool: SlabTool | null = null;
    private wallTool: WallTool | null = null;
    private windowTool: WindowTool | null = null;
    private doorTool: DoorTool | null = null;
    private curtainWallTool: CurtainWallTool | null = null;
    private columnTool: ColumnTool | null = null;
    private beamTool: BeamTool | null = null;
    // §DIM-IV-3 — New annotation-system linear dim (Class A tool)
    private _linearDimAnnotationTool: LinearDimensionAnnotationTool | null = null;
    private stairTool: StairTool | null = null;
    private openingTool: OpeningTool | null = null;
    // §ANN-B3/B4 — new annotation tools
    private textNoteTool: TextNoteTool | null = null;
    private elementTagTool: ElementTagTool | null = null;
    // §ANN-Phase-IV — additional annotation tools (instances owned by AnnotationManager)
    private angularDimensionTool: AngularDimensionAnnotationTool | null = null;
    private spotElevationTool: SpotElevationAnnotationTool | null = null;
    private keynoteTool: KeynoteTool | null = null;
    // DOC-2.4 — New dimension tools
    private radiusDimensionTool: RadiusDimensionTool | null = null;
    private diameterDimensionTool: DiameterDimensionTool | null = null;
    private slopeDimensionTool: SlopeDimensionTool | null = null;
    // DOC-2.5 — Specialised tag tools
    private doorTagTool: DoorTagTool | null = null;
    private windowTagTool: WindowTagTool | null = null;
    private levelTagTool: LevelTagTool | null = null;
    private gridBubbleTool: GridBubbleTool | null = null;
    // DOC-2.8 — Revision cloud tool
    private revisionCloudTool: RevisionCloudTool | null = null;
    // DOC-2.7/2.8 — Section mark, elevation mark, callout detail
    private sectionMarkTool:   any | null = null;
    private elevationMarkTool: any | null = null;
    private calloutDetailTool: any | null = null;
    // §ROOM-Phase-6
    private roomTool: RoomTool | null = null;
    private _roofTool: RoofTool | null = null;
    private _floorTool: FloorTool | null = null;
    private _ceilingTool: CeilingTool | null = null;

    get roofTool(): RoofTool | null { return this._roofTool; }
    
    private activeTool: ActiveTool = 'none';
    private previousTool: ActiveTool = 'none';
    private isTransitioning = false;
    
    private listeners: ((tool: ActiveTool) => void)[] = [];
    private events = new ToolEventEmitter();
    
    private toolRegistry: Map<ToolName, ToolRegistration> = new Map();
    private selectionManager: SelectionManager | null = null;

    constructor(commandContext: any) {
        this.commandManager = new CommandManager(commandContext);
        this.setupGlobalEscapeHandler();
    }

    private setupGlobalEscapeHandler(): void {
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.activeTool !== 'none') {
                this.deactivateAll();
            }
        });
    }

    private registerTool(registration: ToolRegistration): void {
        this.toolRegistry.set(registration.name, registration);
    }

    setSlabTool(slabTool: SlabTool): void {
        this.slabTool = slabTool;
        this.registerTool({
            tool: slabTool,
            name: 'slab',
            isActive: () => slabTool.isActive,
            activate: () => slabTool.enterSketchMode(),
            deactivate: () => slabTool.exitSketchMode()
        });
    }

    setWallTool(wallTool: WallTool): void {
        this.wallTool = wallTool;
        this.registerTool({
            tool: wallTool,
            name: 'wall',
            isActive: () => wallTool.active,
            activate: async () => await wallTool.activate(),
            deactivate: () => wallTool.deactivate()
        });
    }

    setWindowTool(windowTool: WindowTool): void {
        this.windowTool = windowTool;
        this.registerTool({
            tool: windowTool,
            name: 'window',
            isActive: () => windowTool.active,
            activate: async () => await windowTool.activate(),
            deactivate: () => windowTool.deactivate()
        });
    }

    setDoorTool(doorTool: DoorTool): void {
        this.doorTool = doorTool;
        this.registerTool({
            tool: doorTool,
            name: 'door',
            isActive: () => doorTool.active,
            activate: async () => await doorTool.activate(),
            deactivate: () => doorTool.deactivate()
        });
    }

    setCurtainWallTool(tool: CurtainWallTool): void {
        this.curtainWallTool = tool;
        this.registerTool({
            tool: tool,
            name: 'curtain-wall',
            isActive: () => (tool as any).isActive ?? false,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate()
        });
    }

    setColumnTool(tool: ColumnTool): void {
        this.columnTool = tool;
        this.registerTool({
            tool: tool,
            name: 'column',
            isActive: () => (tool as any).isActive ?? false,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate()
        });
    }

    setBeamTool(tool: BeamTool): void {
        this.beamTool = tool;
        this.registerTool({
            tool: tool,
            name: 'beam' as any,
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate()
        });
    }

    // §DIM-IV-3 — Register the new annotation-system linear dimension tool
    setLinearDimAnnotationTool(tool: LinearDimensionAnnotationTool): void {
        this._linearDimAnnotationTool = tool;
        this.registerTool({
            tool: tool,
            name: 'linear-dim',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // §DIM-IV-3 — Activate the annotation-system linear dimension tool (Revit-grade)
    async activateLinearDimAnnotation(): Promise<void> {
        console.log('ToolManager: activateLinearDimAnnotation called');
        await this.activateTool('linear-dim', () => {
            if (this._linearDimAnnotationTool) {
                this._linearDimAnnotationTool.activate();
            } else {
                console.warn('ToolManager: _linearDimAnnotationTool is NULL — was setLinearDimAnnotationTool() called?');
            }
        });
    }

    setStairTool(tool: StairTool): void {
        this.stairTool = tool;
        this.registerTool({
            tool: tool,
            name: 'stair' as any,
            isActive: () => tool.active,
            activate: (options: any) => tool.activate(options),
            deactivate: () => tool.deactivate()
        });
    }

    setOpeningTool(tool: OpeningTool): void {
        this.openingTool = tool;
        this.registerTool({
            tool: tool,
            name: 'opening' as any,
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate()
        });
    }

    setRoofTool(tool: RoofTool): void {
        this._roofTool = tool;
        this.registerTool({
            tool: tool,
            name: 'roof' as any,
            isActive: () => tool.state !== RoofToolState.IDLE,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate()
        });
    }

    // §ANN-B3 — Text Note Tool
    setTextNoteTool(tool: TextNoteTool): void {
        this.textNoteTool = tool;
        this.registerTool({
            tool: tool,
            name: 'text-note',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // §ANN-B4 — Element Tag Tool
    setElementTagTool(tool: ElementTagTool): void {
        this.elementTagTool = tool;
        this.registerTool({
            tool: tool,
            name: 'element-tag',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // §ANN-Phase-IV — Angular Dimension Tool
    setAngularDimensionTool(tool: AngularDimensionAnnotationTool): void {
        this.angularDimensionTool = tool;
        this.registerTool({
            tool: tool,
            name: 'angular-dimension',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // §ANN-Phase-IV — Spot Elevation Tool
    setSpotElevationTool(tool: SpotElevationAnnotationTool): void {
        this.spotElevationTool = tool;
        this.registerTool({
            tool: tool,
            name: 'spot-elevation',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // §ANN-Phase-IV — Keynote Tool
    setKeynoteTool(tool: KeynoteTool): void {
        this.keynoteTool = tool;
        this.registerTool({
            tool: tool,
            name: 'keynote',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.4 — Radius Dimension Tool
    setRadiusDimensionTool(tool: RadiusDimensionTool): void {
        this.radiusDimensionTool = tool;
        this.registerTool({
            tool: tool,
            name: 'radius-dimension',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.4 — Diameter Dimension Tool
    setDiameterDimensionTool(tool: DiameterDimensionTool): void {
        this.diameterDimensionTool = tool;
        this.registerTool({
            tool: tool,
            name: 'diameter-dimension',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.4 — Slope Dimension Tool
    setSlopeDimensionTool(tool: SlopeDimensionTool): void {
        this.slopeDimensionTool = tool;
        this.registerTool({
            tool: tool,
            name: 'slope-dimension',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.5 — Door Tag Tool
    setDoorTagTool(tool: DoorTagTool): void {
        this.doorTagTool = tool;
        this.registerTool({
            tool: tool,
            name: 'door-tag',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.5 — Window Tag Tool
    setWindowTagTool(tool: WindowTagTool): void {
        this.windowTagTool = tool;
        this.registerTool({
            tool: tool,
            name: 'window-tag',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.5 — Level Tag Tool
    setLevelTagTool(tool: LevelTagTool): void {
        this.levelTagTool = tool;
        this.registerTool({
            tool: tool,
            name: 'level-tag',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.5 — Grid Bubble Tool
    setGridBubbleTool(tool: GridBubbleTool): void {
        this.gridBubbleTool = tool;
        this.registerTool({
            tool: tool,
            name: 'grid-bubble',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.8 — Revision Cloud Tool
    setRevisionCloudTool(tool: RevisionCloudTool): void {
        this.revisionCloudTool = tool;
        this.registerTool({
            tool: tool,
            name: 'revision-cloud',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.7 — Section Mark Tool
    setSectionMarkTool(tool: any): void {
        this.sectionMarkTool = tool;
        this.registerTool({
            tool,
            name: 'section-mark',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.7 — Elevation Mark Tool
    setElevationMarkTool(tool: any): void {
        this.elevationMarkTool = tool;
        this.registerTool({
            tool,
            name: 'elevation-mark',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // DOC-2.8 — Callout Detail Tool
    setCalloutDetailTool(tool: any): void {
        this.calloutDetailTool = tool;
        this.registerTool({
            tool,
            name: 'callout-detail' as any,
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    // §ROOM-Phase-6 — Room Tool registration
    setRoomTool(tool: RoomTool): void {
        this.roomTool = tool;
        this.registerTool({
            tool: tool,
            name: 'room',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    setSelectionManager(selectionManager: SelectionManager): void {
        this.selectionManager = selectionManager;
    }

    getActiveTool(): ActiveTool {
        return this.activeTool;
    }

    getPreviousTool(): ActiveTool {
        return this.previousTool;
    }

    isAnyToolActive(): boolean {
        return this.activeTool !== 'none';
    }

    isTransitioningTools(): boolean {
        return this.isTransitioning;
    }

    getToolState(toolName: ToolName): ToolState | null {
        const registration = this.toolRegistry.get(toolName);
        if (!registration) return null;
        
        const tool = registration.tool;
        if (tool.state) return tool.state;
        if (tool.toolState) return tool.toolState;
        if (tool.toolMode && tool.toolMode !== 'NONE') return ToolState.DRAWING;
        return registration.isActive() ? ToolState.IDLE : ToolState.IDLE;
    }

    private async activateTool(
        toolName: ToolName,
        activateFn: () => void | Promise<void>
    ): Promise<void> {
        console.log(`ToolManager: activateTool called for ${toolName}`);
        if (this.isTransitioning) {
            console.warn(`ToolManager: Cannot activate ${toolName} - transition in progress`);
            return;
        }

        try {
            this.isTransitioning = true;
            this.previousTool = this.activeTool;
            
            console.log(`ToolManager: deactivating previous tool ${this.activeTool}`);
            await this.deactivateAllInternal();
            drawingEditorService.syncForTool(toolName);
            
            console.log(`ToolManager: executing activateFn for ${toolName}`);
            await activateFn();
            this.activeTool = toolName;
            
            if (this.selectionManager) {
                this.selectionManager.setEnabled(false);
            }
            
            window.dispatchEvent(new CustomEvent('tool:activated', { detail: toolName })); // TODO(TASK-15)
            this.events.emit('tool:activated', { 
                tool: toolName, 
                previous: this.previousTool 
            });
            this.notify();
            
        } catch (error) {
            console.error(`ToolManager: Error activating ${toolName}:`, error);
            this.events.emit('tool:error', { 
                tool: toolName, 
                error: error as Error 
            });
            this.activeTool = 'none';
            drawingEditorService.disable();
            this.notify();
        } finally {
            this.isTransitioning = false;
        }
    }

    async activateRoof(mode: '2point' | 'polyline' | 'region' | 'single_slope' | 'hip_roof' = '2point'): Promise<void> {
        await this.activateTool('roof', () => {
            if (this._roofTool) {
                switch (mode) {
                    case '2point':       this._roofTool.enterRectangleMode();    break;
                    case 'polyline':     this._roofTool.enterPolylineMode();      break;
                    case 'region':       this._roofTool.enterRegionMode();        break;
                    case 'single_slope': this._roofTool.enterSingleSlopeMode();   break;
                    case 'hip_roof':     this._roofTool.enterHipRoofMode();       break;
                    default:             this._roofTool.enterRectangleMode();
                }
            }
        });
    }

    async activateSlab(mode: 'sketch' | '2point' | 'polyline' | 'region' | 'hollow' | 'pickWalls' = 'sketch'): Promise<void> {
        await this.activateTool('slab', async () => {
            if (this.slabTool) {
                switch (mode) {
                    case '2point':
                    case 'sketch':
                        await this.slabTool.enterSketchMode();
                        break;
                    case 'polyline':
                        await this.slabTool.enterPolylineMode();
                        break;
                    case 'region':
                        await this.slabTool.enterRegionMode();
                        break;
                    case 'hollow':
                        await this.slabTool.enterHollowMode();
                        break;
                    case 'pickWalls':
                        await this.slabTool.enterPickWallsMode();
                        break;
                    default:
                        await this.slabTool.enterSketchMode();
                }
            }
        });
    }

    async activateWall(mode: WallDrawingMode = WallDrawingMode.SINGLE): Promise<void> {
        await this.activateTool('wall', async () => {
            if (this.wallTool) {
                await this.wallTool.activate(mode);
            }
        });
    }

    async activateCurtainWall(mode: import('@pryzm/geometry-curtain-wall').CurtainWallDrawingMode = 'SINGLE'): Promise<void> {
        await this.activateTool('curtain-wall', () => {
            if (this.curtainWallTool) {
                this.curtainWallTool.activate(mode);
            }
        });
    }

    async activateColumn(typeConfig?: { profile: 'rectangular' | 'circular' | 'UC' | 'UB'; width: number; depth: number; steelProfileName?: string }): Promise<void> {
        await this.activateTool('column', () => {
            if (this.columnTool) {
                if (typeConfig && typeof (this.columnTool as any).setColumnType === 'function') {
                    (this.columnTool as any).setColumnType(typeConfig);
                }
                this.columnTool.activate();
            }
        });
    }

    async activateBeam(typeConfig?: { profile: 'rectangular' | 'circular' | 'UC' | 'UB'; width: number; depth: number; steelProfileName?: string }): Promise<void> {
        await this.activateTool('beam' as any, () => {
            if (this.beamTool) {
                if (typeConfig) {
                    this.beamTool.setBeamType({ id: 'custom', ...typeConfig });
                }
                this.beamTool.activate();
            }
        });
    }

    async activateWindow(type: 'single' | 'double' = 'single', systemTypeId?: string): Promise<void> {
        await this.activateTool('window', async () => {
            if (this.windowTool) {
                this.windowTool.windowType = type;
                this.windowTool.systemTypeId = systemTypeId;
                await this.windowTool.activate();
            }
        });
    }

    async activateDoor(type: 'single' | 'double' = 'single', systemTypeId?: string): Promise<void> {
        await this.activateTool('door', async () => {
            if (this.doorTool) {
                this.doorTool.doorType = type;
                this.doorTool.systemTypeId = systemTypeId;
                await this.doorTool.activate();
            }
        });
    }

    // §ANN-B3
    async activateTextNote(): Promise<void> {
        console.log('ToolManager: activateTextNote called');
        await this.activateTool('text-note', () => {
            if (this.textNoteTool) {
                this.textNoteTool.activate();
            } else {
                console.warn('ToolManager: textNoteTool is NULL — was setTextNoteTool() called?');
            }
        });
    }

    // §ANN-B4
    async activateElementTag(): Promise<void> {
        console.log('ToolManager: activateElementTag called');
        await this.activateTool('element-tag', () => {
            if (this.elementTagTool) {
                this.elementTagTool.activate();
            } else {
                console.warn('ToolManager: elementTagTool is NULL — was setElementTagTool() called?');
            }
        });
    }

    // §ANN-Phase-IV
    async activateAngularDimension(): Promise<void> {
        console.log('ToolManager: activateAngularDimension called');
        await this.activateTool('angular-dimension', () => {
            if (this.angularDimensionTool) {
                this.angularDimensionTool.activate();
            } else {
                console.warn('ToolManager: angularDimensionTool is NULL — was setAngularDimensionTool() called?');
            }
        });
    }

    // §ANN-Phase-IV
    async activateSpotElevation(): Promise<void> {
        console.log('ToolManager: activateSpotElevation called');
        await this.activateTool('spot-elevation', () => {
            if (this.spotElevationTool) {
                this.spotElevationTool.activate();
            } else {
                console.warn('ToolManager: spotElevationTool is NULL — was setSpotElevationTool() called?');
            }
        });
    }

    // §ANN-Phase-IV
    async activateKeynote(): Promise<void> {
        console.log('ToolManager: activateKeynote called');
        await this.activateTool('keynote', () => {
            if (this.keynoteTool) {
                this.keynoteTool.activate();
            } else {
                console.warn('ToolManager: keynoteTool is NULL — was setKeynoteTool() called?');
            }
        });
    }

    // DOC-2.4 — Activate radius dimension tool
    async activateRadiusDimension(): Promise<void> {
        console.log('ToolManager: activateRadiusDimension called');
        await this.activateTool('radius-dimension', () => {
            if (this.radiusDimensionTool) {
                this.radiusDimensionTool.activate();
            } else {
                console.warn('ToolManager: radiusDimensionTool is NULL — was setRadiusDimensionTool() called?');
            }
        });
    }

    // DOC-2.4 — Activate diameter dimension tool
    async activateDiameterDimension(): Promise<void> {
        console.log('ToolManager: activateDiameterDimension called');
        await this.activateTool('diameter-dimension', () => {
            if (this.diameterDimensionTool) {
                this.diameterDimensionTool.activate();
            } else {
                console.warn('ToolManager: diameterDimensionTool is NULL — was setDiameterDimensionTool() called?');
            }
        });
    }

    // DOC-2.4 — Activate slope dimension tool
    async activateSlopeDimension(): Promise<void> {
        console.log('ToolManager: activateSlopeDimension called');
        await this.activateTool('slope-dimension', () => {
            if (this.slopeDimensionTool) {
                this.slopeDimensionTool.activate();
            } else {
                console.warn('ToolManager: slopeDimensionTool is NULL — was setSlopeDimensionTool() called?');
            }
        });
    }

    // DOC-2.5 — Activate door tag tool
    async activateDoorTag(): Promise<void> {
        console.log('ToolManager: activateDoorTag called');
        await this.activateTool('door-tag', () => {
            if (this.doorTagTool) {
                this.doorTagTool.activate();
            } else {
                console.warn('ToolManager: doorTagTool is NULL — was setDoorTagTool() called?');
            }
        });
    }

    // DOC-2.5 — Activate window tag tool
    async activateWindowTag(): Promise<void> {
        console.log('ToolManager: activateWindowTag called');
        await this.activateTool('window-tag', () => {
            if (this.windowTagTool) {
                this.windowTagTool.activate();
            } else {
                console.warn('ToolManager: windowTagTool is NULL — was setWindowTagTool() called?');
            }
        });
    }

    // DOC-2.5 — Activate level tag tool
    async activateLevelTag(): Promise<void> {
        console.log('ToolManager: activateLevelTag called');
        await this.activateTool('level-tag', () => {
            if (this.levelTagTool) {
                this.levelTagTool.activate();
            } else {
                console.warn('ToolManager: levelTagTool is NULL — was setLevelTagTool() called?');
            }
        });
    }

    // DOC-2.5 — Activate grid bubble tool (auto-places on view activation; manual trigger)
    async activateGridBubble(): Promise<void> {
        console.log('ToolManager: activateGridBubble called');
        await this.activateTool('grid-bubble', () => {
            if (this.gridBubbleTool) {
                this.gridBubbleTool.activate();
            } else {
                console.warn('ToolManager: gridBubbleTool is NULL — was setGridBubbleTool() called?');
            }
        });
    }

    // DOC-2.8 — Activate revision cloud tool
    async activateRevisionCloud(): Promise<void> {
        console.log('ToolManager: activateRevisionCloud called');
        await this.activateTool('revision-cloud', () => {
            if (this.revisionCloudTool) {
                this.revisionCloudTool.activate();
            } else {
                console.warn('ToolManager: revisionCloudTool is NULL — was setRevisionCloudTool() called?');
            }
        });
    }

    // DOC-2.7 — Section Mark
    async activateSectionMark(): Promise<void> {
        console.log('ToolManager: activateSectionMark called');
        await this.activateTool('section-mark', () => {
            if (this.sectionMarkTool) {
                this.sectionMarkTool.activate();
            } else {
                console.warn('ToolManager: sectionMarkTool is NULL — was setSectionMarkTool() called?');
            }
        });
    }

    // DOC-2.7 — Elevation Mark
    async activateElevationMark(): Promise<void> {
        console.log('ToolManager: activateElevationMark called');
        await this.activateTool('elevation-mark', () => {
            if (this.elevationMarkTool) {
                this.elevationMarkTool.activate();
            } else {
                console.warn('ToolManager: elevationMarkTool is NULL — was setElevationMarkTool() called?');
            }
        });
    }

    // DOC-2.8 — Callout Detail
    async activateCalloutDetail(): Promise<void> {
        console.log('ToolManager: activateCalloutDetail called');
        await this.activateTool('callout-detail' as any, () => {
            if (this.calloutDetailTool) {
                this.calloutDetailTool.activate();
            } else {
                console.warn('ToolManager: calloutDetailTool is NULL — was setCalloutDetailTool() called?');
            }
        });
    }

    async activateStair(options: { shape: StairShape; baseLevelElevation: number; topLevelElevation: number; baseLevelId: string; topLevelId: string; width: number; typeId?: string; mode?: 'linear' | 'ortho' }): Promise<void> {
        await this.activateTool('stair', () => {
            if (this.stairTool) {
                this.stairTool.activate(options);
            }
        });
    }

    // §C19-P14 — Ceiling, Floor, Railing tool routing through ToolManager so that
    // PlanViewToolOverlay.subscribe receives 'ceiling'/'floor'/'railing' and can
    // activate the corresponding plan-view handler.
    setCeilingTool(tool: CeilingTool): void {
        this._ceilingTool = tool;
        this.registerTool({
            tool,
            name: 'ceiling',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    setFloorTool(tool: FloorTool): void {
        this._floorTool = tool;
        this.registerTool({
            tool,
            name: 'floor',
            isActive: () => tool.isActive,
            activate: () => tool.activate(),
            deactivate: () => tool.deactivate(),
        });
    }

    async activateCeiling(): Promise<void> {
        await this.activateTool('ceiling', () => {
            if (this._ceilingTool) {
                this._ceilingTool.activate();
            } else {
                console.warn('ToolManager: _ceilingTool is NULL — was setCeilingTool() called?');
            }
        });
    }

    async activateFloor(): Promise<void> {
        await this.activateTool('floor', () => {
            if (this._floorTool) {
                this._floorTool.activate();
            } else {
                console.warn('ToolManager: _floorTool is NULL — was setFloorTool() called?');
            }
        });
    }

    async activateRailing(): Promise<void> {
        await this.activateTool('railing', () => {
            const tool = window.handrailTool;
            if (tool?.activate) tool.activate();
        });
    }

    // Sprint 3 §A — Furniture tool routing through ToolManager so that
    // PlanViewToolOverlay.subscribe receives 'furniture' and activates FurniturePlanToolHandler.
    async activateFurniture(type: string): Promise<void> {
        window._pryzmActiveFurnitureType = type;
        await this.activateTool('furniture', () => {
            const tool = window.furnitureTool;
            if (tool) {
                tool.setFurnitureType(type);
                tool.activate();
            }
        });
    }

    async activateOpening(): Promise<void> {
        await this.activateTool('opening', () => {
            if (this.openingTool) {
                this.openingTool.activate();
            }
        });
    }

    /**
     * Activate the slab opening tool in plan view with a specific drawing mode.
     * Sets window._pryzmActiveOpeningMode before activation so that
     * OpeningPlanToolHandler reads the correct mode on activate().
     *
     * @param mode 'polyline' — freeform polygon (min 3 pts, Enter/dbl-click to close)
     *             '2point'  — rectangle from two diagonal corners
     */
    async activateOpeningTool(mode: '2point' | 'polyline' = 'polyline'): Promise<void> {
        window._pryzmActiveOpeningMode = mode;

        // Capture the currently-selected slab ID at the moment of button press and
        // store it on window so OpeningPlanToolHandler can resolve it even after a
        // view switch (3D → plan) clears the Three.js selectedObject reference.
        const sm = window.selectionManager;
        if (sm) {
            let host = sm.selectedObject ?? null;
            while (host && !host.userData?.elementType) host = host.parent ?? null;
            if (host?.userData?.elementType?.toLowerCase() === 'slab' && host?.userData?.id) {
                window._pryzmSelectedSlabId = host.userData.id;
                console.log('[ToolManager] activateOpeningTool — captured slab from 3D selection:', host.userData.id);
            } else {
                const selectedId: string | null = sm.getSelectedId?.() ?? sm.selectedId ?? null;
                if (selectedId) {
                    const slabStore = window.slabStore // TODO(TASK-08)
                        ?? window.commandManager?.context?.stores?.slabStore; // TODO(TASK-06)
                    if (slabStore?.getById?.(selectedId)) {
                        window._pryzmSelectedSlabId = selectedId;
                        console.log('[ToolManager] activateOpeningTool — captured slab from selection ID:', selectedId);
                    }
                }
            }
        }

        await this.activateTool('opening', () => {
            if (this.openingTool) {
                // Pass the mode directly so the 3D OpeningTool runs the correct
                // drawing flow (2-point rectangle vs polyline). The plan-view
                // OpeningPlanToolHandler reads the same mode from
                // window._pryzmActiveOpeningMode set above.
                this.openingTool.activate(mode);
            }
        });
    }

    async activatePlumbing(type: string, variant?: string): Promise<void> {
        window._pryzmActivePlumbingType = type;
        if (type === 'toilet' && variant) {
            window._pryzmActiveToiletVariant = variant;
        }
        if (type === 'shower' && variant) {
            window._pryzmActiveShowerVariant = variant;
        }
        await this.activateTool('plumbing', () => {
            const tool = window.plumbingTool;
            if (tool) {
                if (typeof tool.setFixtureType === 'function') tool.setFixtureType(type);
                if (type === 'toilet' && variant && typeof tool.setToiletVariant === 'function') {
                    tool.setToiletVariant(variant);
                }
                if (type === 'shower' && variant && typeof tool.setShowerVariant === 'function') {
                    tool.setShowerVariant(variant);
                }
                tool.activate();
            }
        });
    }

    async activateGrid(): Promise<void> {
        await this.activateTool('grid', () => {
            console.log('[ToolManager] activateGrid — plan view grid line tool ready');
        });
    }

    /** Activate the 2D polyline stair-path drawing tool in plan view.
     * @param config.initialShape — 'I' | 'L' | 'U' hint from the ribbon buttons.
     *   Dispatched as a CustomEvent before the handler activates, so it can
     *   pre-configure auto-finish behaviour and HUD guidance text.
     */
    async activateStairPath(config?: { initialShape?: string }): Promise<void> {
        await this.activateTool('stair-path', () => {
            if (config?.initialShape) {
                window.dispatchEvent(new CustomEvent('stair-path:shape-hint', { // TODO(TASK-15)
                    detail: config.initialShape,
                }));
            }
            console.log('[ToolManager] activateStairPath — plan view stair-path tool ready',
                config?.initialShape ? `(shape: ${config.initialShape})` : '');
        });
    }

    // §ROOM-Phase-6 — activate room detection tool
    async activateRoom(): Promise<void> {
        console.log('ToolManager: activateRoom called');
        await this.activateTool('room', () => {
            if (this.roomTool) {
                this.roomTool.activate();
            } else {
                console.warn('ToolManager: roomTool is NULL — was setRoomTool() called?');
            }
        });
    }

    /**
     * Gap 4 — Activate RoomTool in POINT_PICK mode.
     * User clicks inside a wall enclosure to select/highlight a room.
     */
    async activateRoomPointPick(): Promise<void> {
        console.log('ToolManager: activateRoomPointPick called');
        await this.activateTool('room', () => {
            if (this.roomTool) {
                this.roomTool.activatePointPickMode();
            } else {
                console.warn('ToolManager: roomTool is NULL — was setRoomTool() called?');
            }
        });
    }

    /**
     * Gap 4 — Activate RoomTool in MANUAL_BOUNDARY mode.
     * User draws a polygon on the 3D canvas; on close, CreateRoomCommand is fired.
     */
    async activateRoomManualBoundary(): Promise<void> {
        console.log('ToolManager: activateRoomManualBoundary called');
        await this.activateTool('room', () => {
            if (this.roomTool) {
                this.roomTool.activateManualBoundaryMode();
            } else {
                console.warn('ToolManager: roomTool is NULL — was setRoomTool() called?');
            }
        });
    }

    private async deactivateAllInternal(): Promise<void> {
        const deactivatedTool = this.activeTool;
        
        for (const [name, registration] of this.toolRegistry) {
            try {
                if (registration.isActive()) {
                    registration.deactivate();
                    if (registration.cleanup) {
                        registration.cleanup();
                    }
                }
            } catch (error) {
                console.error(`ToolManager: Error deactivating ${name}:`, error);
            }
        }
        
        if (deactivatedTool !== 'none') {
            window.dispatchEvent(new CustomEvent('tool:deactivated', { detail: deactivatedTool })); // TODO(TASK-15)
            this.events.emit('tool:deactivated', { tool: deactivatedTool });
        }
    }

    async deactivateAll(): Promise<void> {
        if (this.isTransitioning) {
            console.warn('ToolManager: Cannot deactivate - transition in progress');
            return;
        }

        try {
            this.isTransitioning = true;
            await this.deactivateAllInternal();
            this.previousTool = this.activeTool;
            this.activeTool = 'none';
            drawingEditorService.disable();

            if (this.selectionManager) {
                this.selectionManager.setEnabled(true);
            }

            this.notify();
        } finally {
            this.isTransitioning = false;
        }
    }

    forceCleanup(): void {
        console.warn('ToolManager: Force cleanup triggered');
        
        for (const [name, registration] of this.toolRegistry) {
            try {
                registration.deactivate();
                if (registration.cleanup) {
                    registration.cleanup();
                }
            } catch (error) {
                console.error(`ToolManager: Force cleanup error for ${name}:`, error);
            }
        }
        
        this.activeTool = 'none';
        this.isTransitioning = false;
        drawingEditorService.disable();
        this.notify();
    }

    getRegisteredTools(): ToolName[] {
        return Array.from(this.toolRegistry.keys());
    }

    getToolRegistration(name: ToolName): ToolRegistration | undefined {
        return this.toolRegistry.get(name);
    }

    onToolActivated(handler: (event: { tool: ToolName; previous: ToolName }) => void): () => void {
        return this.events.on('tool:activated', handler);
    }

    onToolDeactivated(handler: (event: { tool: ToolName }) => void): () => void {
        return this.events.on('tool:deactivated', handler);
    }

    onToolError(handler: (event: { tool: ToolName; error: Error }) => void): () => void {
        return this.events.on('tool:error', handler);
    }

    subscribe(listener: (tool: ActiveTool) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify(): void {
        this.listeners.forEach(l => {
            try {
                l(this.activeTool);
            } catch (error) {
                console.error('ToolManager: Error in subscriber:', error);
            }
        });
    }

    dispose(): void {
        this.forceCleanup();
        this.listeners = [];
        this.events.clear();
        this.toolRegistry.clear();
    }
}
