import { StairData, STAIR_CONSTRAINTS } from '@pryzm/geometry-stair';

export class StairComplianceReporter {

    generateReport(stair: StairData, levelHeight: number): string {
        const totalRisers = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
        const blondel = 2 * stair.riserHeight + stair.treadDepth;
        const blondelOk = blondel >= 0.600 && blondel <= 0.650;

        const lines: string[] = [
            `Stair ${stair.properties.mark ?? stair.id}:`,
            `  Shape: ${stair.shape} (${stair.flights.length} flight${stair.flights.length !== 1 ? 's' : ''})`,
            `  Risers: ${totalRisers} × ${(stair.riserHeight * 1000).toFixed(0)}mm ` +
                `(range: ${STAIR_CONSTRAINTS.MIN_RISER_HEIGHT * 1000}–${STAIR_CONSTRAINTS.MAX_RISER_HEIGHT * 1000}mm) ` +
                `${stair.riserHeight >= STAIR_CONSTRAINTS.MIN_RISER_HEIGHT && stair.riserHeight <= STAIR_CONSTRAINTS.MAX_RISER_HEIGHT ? '✓' : '✗'}`,
            `  Tread: ${(stair.treadDepth * 1000).toFixed(0)}mm ` +
                `(min: ${STAIR_CONSTRAINTS.MIN_TREAD_DEPTH * 1000}mm) ` +
                `${stair.treadDepth >= STAIR_CONSTRAINTS.MIN_TREAD_DEPTH ? '✓' : '✗'}`,
            `  Width: ${(stair.width * 1000).toFixed(0)}mm ` +
                `${stair.width >= STAIR_CONSTRAINTS.MIN_WIDTH ? '✓' : '✗'}` +
                `${stair.accessibilityType === 'accessible' && stair.width >= STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH ? ' (accessible ✓)' : ''}`,
            `  Blondel formula (2R+T): ${(blondel * 1000).toFixed(0)}mm — ${blondelOk ? 'comfortable range ✓' : 'outside 600–650mm range ⚠'}`,
            `  Total rise: ${(totalRisers * stair.riserHeight * 1000).toFixed(0)}mm / level height: ${(levelHeight * 1000).toFixed(0)}mm`,
            `  Fire rating: ${stair.fireRating ?? 'not set ⚠'}`,
            `  Accessibility: ${stair.accessibilityType ?? 'standard'}`,
            `  Material: ${stair.properties.material ?? 'default'}`,
            `  Stringer: ${stair.properties.stringerType ?? 'none'}`,
            `  Nosing: ${stair.properties.nosingType ?? 'none'}${stair.properties.nosingDepth ? ` (${(stair.properties.nosingDepth * 1000).toFixed(0)}mm)` : ''}`,
        ];

        return lines.join('\n');
    }

    generateCompactSummary(stair: StairData): string {
        const totalRisers = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
        const ok = stair.riserHeight >= STAIR_CONSTRAINTS.MIN_RISER_HEIGHT &&
                   stair.riserHeight <= STAIR_CONSTRAINTS.MAX_RISER_HEIGHT &&
                   stair.treadDepth >= STAIR_CONSTRAINTS.MIN_TREAD_DEPTH &&
                   stair.width >= STAIR_CONSTRAINTS.MIN_WIDTH;
        return `${stair.properties.mark ?? 'Stair'} — ${stair.shape} shape, ${totalRisers} risers, ${(stair.width * 1000).toFixed(0)}mm wide ${ok ? '✓' : '⚠'}`;
    }
}
