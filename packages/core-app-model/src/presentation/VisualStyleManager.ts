export interface VisualStyle {
    fillColor: string;
    lineWeight: number;
    edgeColor: string;
}

export interface StyleSchema {
    [key: string]: VisualStyle;
}

export class VisualStyleManager {
    private styles: StyleSchema = {
        wall: {
            fillColor: "#222222",
            lineWeight: 2,
            edgeColor: "#000000"
        },
        slab: {
            fillColor: "#f0f0f0",
            lineWeight: 1,
            edgeColor: "#333333"
        },
        column: {
            fillColor: "#111111",
            lineWeight: 2,
            edgeColor: "#000000"
        }
    };

    public getStyleFor(elementType: string): VisualStyle {
        return this.styles[elementType.toLowerCase()] || {
            fillColor: "#cccccc",
            lineWeight: 1,
            edgeColor: "#000000"
        };
    }

    public setStyle(elementType: string, style: Partial<VisualStyle>) {
        if (!this.styles[elementType.toLowerCase()]) {
            this.styles[elementType.toLowerCase()] = { fillColor: "#cccccc", lineWeight: 1, edgeColor: "#000000" };
        }
        Object.assign(this.styles[elementType.toLowerCase()]!, style);
    }
}
