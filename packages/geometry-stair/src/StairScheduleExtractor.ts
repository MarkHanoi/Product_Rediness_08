// §06-STAIR-INTEGRATION-CONTRACT — Phase 8: Task 8.2
// Reads from StairStore; produces schedule rows for ScheduleRegistry.
// Registered in EngineBootstrap alongside Door/Window schedules.

import { StairData } from './StairTypes';

export interface StairScheduleRow {
    id: string;
    mark: string;
    shape: string;
    baseLevelName: string;
    topLevelName: string;
    width: string;
    riserCount: number;
    riserHeight: string;
    treadDepth: string;
    blondel: string;
    material: string;
    fireRating: string;
    accessibility: string;
    blondelOk: boolean;
}

export interface StairScheduleExtractorDeps {
    getLevelName: (levelId: string) => string;
}

export class StairScheduleExtractor {

    static extractRow(stair: StairData, deps: StairScheduleExtractorDeps): StairScheduleRow {
        const totalRisers = stair.riserCount || stair.flights.reduce((s, f) => s + f.riserCount, 0);
        const blondel = 2 * stair.riserHeight + stair.treadDepth;
        const blondelOk = blondel >= 0.600 && blondel <= 0.650;

        return {
            id: stair.id,
            mark: stair.properties.mark ?? '—',
            shape: stair.shape,
            baseLevelName: deps.getLevelName(stair.baseLevelId),
            topLevelName: deps.getLevelName(stair.topLevelId),
            width: (stair.width * 1000).toFixed(0) + ' mm',
            riserCount: totalRisers,
            riserHeight: (stair.riserHeight * 1000).toFixed(0) + ' mm',
            treadDepth: (stair.treadDepth * 1000).toFixed(0) + ' mm',
            blondel: (blondel * 1000).toFixed(0) + ' mm',
            material: stair.properties.material ?? 'default',
            fireRating: stair.fireRating ?? '—',
            accessibility: stair.accessibilityType ?? 'standard',
            blondelOk
        };
    }

    static extractAll(stairs: StairData[], deps: StairScheduleExtractorDeps): StairScheduleRow[] {
        return stairs.map(s => this.extractRow(s, deps));
    }

    static getScheduleDefinition() {
        return {
            id: 'Stairs Schedule',
            label: 'Stairs Schedule',
            category: 'Stairs' as any,
            columns: [
                { id: 'mark',          label: 'Mark',           value: (e: any) => e.mark },
                { id: 'shape',         label: 'Shape',          value: (e: any) => e.shape },
                { id: 'baseLevelName', label: 'Base Level',     value: (e: any) => e.baseLevelName },
                { id: 'topLevelName',  label: 'Top Level',      value: (e: any) => e.topLevelName },
                { id: 'width',         label: 'Width',          value: (e: any) => e.width },
                { id: 'riserCount',    label: 'Risers',         value: (e: any) => e.riserCount },
                { id: 'riserHeight',   label: 'Riser Height',   value: (e: any) => e.riserHeight },
                { id: 'treadDepth',    label: 'Tread Depth',    value: (e: any) => e.treadDepth },
                { id: 'blondel',       label: 'Blondel (2R+T)', value: (e: any) => e.blondel + (e.blondelOk ? ' ✓' : ' ⚠') },
                { id: 'material',      label: 'Material',       value: (e: any) => e.material },
                { id: 'fireRating',    label: 'Fire Rating',    value: (e: any) => e.fireRating },
                { id: 'accessibility', label: 'Accessibility',  value: (e: any) => e.accessibility },
            ]
        };
    }
}
