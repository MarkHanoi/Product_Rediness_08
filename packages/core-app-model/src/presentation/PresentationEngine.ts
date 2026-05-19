import { RenderingIntent } from './RenderingIntent.js';
import { VisualStyleManager } from './VisualStyleManager.js';
import { GraphicHierarchyRenderer } from './GraphicHierarchyRenderer.js';

export class PresentationEngine {
    private styleManager = new VisualStyleManager();
    private graphicRenderer: GraphicHierarchyRenderer;
    private currentMode: RenderingIntent = RenderingIntent.TECHNICAL;

    constructor(private world: any) {
        this.graphicRenderer = new GraphicHierarchyRenderer(this.world.scene.three, this.styleManager);
    }

    public setMode(mode: RenderingIntent) {
        this.currentMode = mode;
        const isGraphic = mode === RenderingIntent.GRAPHIC;
        
        // Disable/Enable lighting influence for Graphic mode
        this.world.scene.three.traverse((obj: any) => {
            if (obj.isLight) {
                obj.visible = !isGraphic;
            }
        });

        // Toggle environment map influence
        if (isGraphic) {
            this.world.scene.three.environment = null;
        } else if (this.world.scene.three.userData.originalEnvironment) {
            this.world.scene.three.environment = this.world.scene.three.userData.originalEnvironment;
        }

        this.graphicRenderer.apply(isGraphic);

        // Update Post-processing for Technical Mode
        if (this.world.renderer && (this.world.renderer as any).postproduction) {
            const post = (this.world.renderer as any).postproduction;
            post.enabled = !isGraphic; // Disable completely for Graphic mode
            
            if (!isGraphic) {
                // Configure SSAO and Shadows for Technical Mode
                post.settings.ssao.enabled = true;
                post.settings.customEffects.outline.enabled = true;
                post.update();
            }
        }
        
        // Broadcast change for other systems (like annotations)
        window.dispatchEvent(new CustomEvent('presentation-mode-changed', { detail: { mode } })); // TODO(TASK-15)
    }

    public getMode(): RenderingIntent {
        return this.currentMode;
    }

    public render() {
        // Future WebGPU / Custom render loop logic would go here
        if (this.world.renderer && this.world.renderer.needsUpdate) {
            this.world.renderer.update();
        }
    }

    public getStyleManager() {
        return this.styleManager;
    }
}
