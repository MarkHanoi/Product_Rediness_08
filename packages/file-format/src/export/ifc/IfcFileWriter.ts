/**
 * IfcFileWriter.ts
 * 
 * Handles final IFC file serialization.
 * Returns Uint8Array for caller to handle (no auto-download).
 * 
 * Responsibilities:
 * - Serialize IFC model to STEP format
 * - Return raw bytes
 * - Provide optional download utility
 */

import type { IfcAPI } from 'web-ifc';

export class IfcFileWriter {
    private api: IfcAPI;
    private modelID: number;

    constructor(api: IfcAPI, modelID: number) {
        this.api = api;
        this.modelID = modelID;
    }

    saveToBytes(): Uint8Array {
        try {
            const data = this.api.SaveModel(this.modelID);
            if (!data || data.length < 1000) {
                console.warn("Warning: Exported IFC data is very small. Check if elements were correctly added.");
            }
            return data;
        } catch (err) {
            console.error("Error saving IFC model to bytes:", err);
            throw err;
        }
    }

    static downloadFile(data: Uint8Array, filename: string = 'model.ifc'): void {
        const arrayBuffer = new ArrayBuffer(data.length);
        const view = new Uint8Array(arrayBuffer);
        view.set(data);
        const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
