export interface PlanViewCanvasStyle {
    visible: boolean;
    edgeColor?: string | null;
    fillColor?: string | null;
    fillPattern?: string | null;
    lineWeight?: number | null;
    transparency?: number | null;
}

export interface PlanViewCanvasOptions {
    gridVisible?: boolean;
    styleResolver?: (category: string, layerTag: string) => PlanViewCanvasStyle | null;
}

export interface PlanViewCanvasRenderOptions {
    activeLinkedViewId?: string | null;
}
