// @pryzm/constraint-solver — StairConstraintEngine (Sprint H, 2026-05-10)
// Moved from src/engine/subsystems/constraints/StairConstraintEngine.ts.
// STAIR_CONSTRAINTS inlined to eliminate src/ dependency.
// §05-STAIR-CONSTRAINT-ENGINE-CONTRACT — Phase 2 implementation
// Owns ALL validation logic. StairStore is a pure data container; commands call this.

const STAIR_CONSTRAINTS = {
    MIN_RISER_HEIGHT: 0.150,
    MAX_RISER_HEIGHT: 0.190,
    MIN_TREAD_DEPTH: 0.250,
    MIN_WIDTH: 0.900,
    MIN_ACCESSIBLE_WIDTH: 1.200,
    MIN_RISER_COUNT: 2,
    HEIGHT_TOLERANCE: 0.050,
    MAX_RISERS_PER_FLIGHT: 16,
    MIN_LANDING_DEPTH: 0.900,
    MIN_HANDRAIL_HEIGHT: 0.900,
    MAX_HANDRAIL_HEIGHT: 1.100,
} as const;

export interface ValidationResult {
    ok: boolean;
    severity?: 'ok' | 'warn' | 'error';
    message?: string;
}

export interface ConstraintViolation {
    code: string;
    message: string;
    field?: string;
    currentValue?: number | string;
    requiredValue?: number | string;
    severity: 'error' | 'warning';
}

export interface ConstraintValidationResult {
    valid: boolean;
    violations: ConstraintViolation[];
    warnings: ConstraintViolation[];
}

export interface StairValidationInput {
    riserHeight: number;
    treadDepth: number;
    width: number;
    riserCount: number;
    levelHeight?: number;
    accessibilityType?: 'standard' | 'accessible';
    handrailHeight?: number;
    nosingDepth?: number;
    perFlightRiserCount?: number[];
    buildingCode?: 'UK_ADM' | 'US_IBC' | 'EU_EN17210' | 'default';
}

export interface StairComputedParameters {
    riserCount: number;
    riserHeight: number;
    treadDepth: number;
    blondel: number;
    totalRun: number;
}

export class StairConstraintEngine {

    static validate(input: StairValidationInput): ConstraintValidationResult {
        const violations: ConstraintViolation[] = [];
        const warnings: ConstraintViolation[] = [];

        const maxRiser = input.buildingCode === 'UK_ADM' ? 0.220 : STAIR_CONSTRAINTS.MAX_RISER_HEIGHT;
        const minRiser = STAIR_CONSTRAINTS.MIN_RISER_HEIGHT;

        if (input.riserHeight < minRiser) {
            violations.push({
                code: 'STAIR-RISER-TOO-LOW',
                message: `Riser height ${(input.riserHeight * 1000).toFixed(0)}mm is below minimum ${(minRiser * 1000).toFixed(0)}mm`,
                field: 'riserHeight',
                currentValue: input.riserHeight,
                requiredValue: minRiser,
                severity: 'error'
            });
        }
        if (input.riserHeight > maxRiser) {
            violations.push({
                code: 'STAIR-RISER-TOO-HIGH',
                message: `Riser height ${(input.riserHeight * 1000).toFixed(0)}mm exceeds maximum ${(maxRiser * 1000).toFixed(0)}mm`,
                field: 'riserHeight',
                currentValue: input.riserHeight,
                requiredValue: maxRiser,
                severity: 'error'
            });
        }

        const minTread = STAIR_CONSTRAINTS.MIN_TREAD_DEPTH;
        if (input.treadDepth < minTread) {
            violations.push({
                code: 'STAIR-TREAD-TOO-SHALLOW',
                message: `Tread depth ${(input.treadDepth * 1000).toFixed(0)}mm is below minimum ${(minTread * 1000).toFixed(0)}mm`,
                field: 'treadDepth',
                currentValue: input.treadDepth,
                requiredValue: minTread,
                severity: 'error'
            });
        }

        if (input.width < STAIR_CONSTRAINTS.MIN_WIDTH) {
            violations.push({
                code: 'STAIR-TOO-NARROW',
                message: `Stair width ${(input.width * 1000).toFixed(0)}mm below minimum ${(STAIR_CONSTRAINTS.MIN_WIDTH * 1000).toFixed(0)}mm`,
                field: 'width',
                currentValue: input.width,
                requiredValue: STAIR_CONSTRAINTS.MIN_WIDTH,
                severity: 'error'
            });
        }
        if (input.accessibilityType === 'accessible' && input.width < STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH) {
            violations.push({
                code: 'STAIR-ACCESSIBLE-TOO-NARROW',
                message: `Accessible stair width ${(input.width * 1000).toFixed(0)}mm below minimum ${(STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`,
                field: 'width',
                currentValue: input.width,
                requiredValue: STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH,
                severity: 'error'
            });
        }

        const blondelCheck = StairConstraintEngine.checkBlondel(input.riserHeight, input.treadDepth);
        if (!blondelCheck.ok) {
            warnings.push({
                code: 'STAIR-BLONDEL-VIOLATION',
                message: blondelCheck.message ?? 'Blondel formula violated',
                field: 'riserHeight/treadDepth',
                severity: 'warning'
            });
        }

        if (input.riserCount < STAIR_CONSTRAINTS.MIN_RISER_COUNT) {
            violations.push({
                code: 'STAIR-TOO-FEW-RISERS',
                message: `Total riser count ${input.riserCount} below minimum ${STAIR_CONSTRAINTS.MIN_RISER_COUNT}`,
                field: 'riserCount',
                currentValue: input.riserCount,
                requiredValue: STAIR_CONSTRAINTS.MIN_RISER_COUNT,
                severity: 'error'
            });
        }

        const maxPerFlight = input.buildingCode === 'UK_ADM' ? 16 : 18;
        if (input.perFlightRiserCount) {
            input.perFlightRiserCount.forEach((count, idx) => {
                if (count > maxPerFlight) {
                    violations.push({
                        code: 'STAIR-FLIGHT-TOO-MANY-RISERS',
                        message: `Flight ${idx + 1} has ${count} risers, exceeding maximum ${maxPerFlight}`,
                        field: `flights[${idx}].riserCount`,
                        currentValue: count,
                        requiredValue: maxPerFlight,
                        severity: 'error'
                    });
                }
            });
        }

        if (input.levelHeight !== undefined) {
            const calculatedHeight = input.riserHeight * input.riserCount;
            const diff = Math.abs(calculatedHeight - input.levelHeight);
            if (diff > STAIR_CONSTRAINTS.HEIGHT_TOLERANCE) {
                violations.push({
                    code: 'STAIR-HEIGHT-MISMATCH',
                    message: `Total stair height ${(calculatedHeight * 1000).toFixed(0)}mm does not match level height ${(input.levelHeight * 1000).toFixed(0)}mm (tolerance ±${(STAIR_CONSTRAINTS.HEIGHT_TOLERANCE * 1000).toFixed(0)}mm)`,
                    field: 'riserHeight/riserCount',
                    currentValue: calculatedHeight,
                    requiredValue: input.levelHeight,
                    severity: 'error'
                });
            }
        }

        if (input.handrailHeight !== undefined) {
            if (input.handrailHeight < 0.900 || input.handrailHeight > 1.100) {
                warnings.push({
                    code: 'STAIR-HANDRAIL-HEIGHT-OOB',
                    message: `Handrail height ${(input.handrailHeight * 1000).toFixed(0)}mm outside range 900–1100mm`,
                    field: 'handrailHeight',
                    currentValue: input.handrailHeight,
                    severity: 'warning'
                });
            }
        }

        if (input.nosingDepth !== undefined) {
            if (input.nosingDepth < 0.010 || input.nosingDepth > 0.050) {
                warnings.push({
                    code: 'STAIR-NOSING-OOB',
                    message: `Nosing depth ${(input.nosingDepth * 1000).toFixed(0)}mm outside range 10–50mm`,
                    field: 'nosingDepth',
                    currentValue: input.nosingDepth,
                    severity: 'warning'
                });
            }
        }

        if (input.width < STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH && input.accessibilityType !== 'accessible') {
            warnings.push({
                code: 'STAIR-ACCESSIBILITY-RECOMMENDED',
                message: `Width ${(input.width * 1000).toFixed(0)}mm below accessibility minimum ${(STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`,
                field: 'width',
                severity: 'warning'
            });
        }

        return {
            valid: violations.length === 0,
            violations,
            warnings
        };
    }

    static checkBlondel(riserHeight: number, treadDepth: number): ValidationResult {
        const blondel = 2 * riserHeight + treadDepth;
        const blondelMm = blondel * 1000;
        const inRange = blondelMm >= 600 && blondelMm <= 650;

        if (inRange) {
            return { ok: true, severity: 'ok', message: `Blondel: ${blondelMm.toFixed(0)}mm ✓` };
        }
        return {
            ok: false,
            severity: 'warn',
            message: `Blondel formula (2R+T) = ${blondelMm.toFixed(0)}mm — outside comfort range 600–650mm`
        };
    }

    static validateQuick(
        riserHeight: number,
        treadDepth: number,
        width: number
    ): { ok: boolean; issues: string[] } {
        const issues: string[] = [];

        if (riserHeight < STAIR_CONSTRAINTS.MIN_RISER_HEIGHT)
            issues.push(`Riser too low (min ${(STAIR_CONSTRAINTS.MIN_RISER_HEIGHT * 1000).toFixed(0)}mm)`);
        if (riserHeight > STAIR_CONSTRAINTS.MAX_RISER_HEIGHT)
            issues.push(`Riser too high (max ${(STAIR_CONSTRAINTS.MAX_RISER_HEIGHT * 1000).toFixed(0)}mm)`);
        if (treadDepth < STAIR_CONSTRAINTS.MIN_TREAD_DEPTH)
            issues.push(`Tread too shallow (min ${(STAIR_CONSTRAINTS.MIN_TREAD_DEPTH * 1000).toFixed(0)}mm)`);
        if (width < STAIR_CONSTRAINTS.MIN_WIDTH)
            issues.push(`Too narrow (min ${(STAIR_CONSTRAINTS.MIN_WIDTH * 1000).toFixed(0)}mm)`);

        return { ok: issues.length === 0, issues };
    }

    static computeOptimalParameters(
        levelHeight: number,
        _targetWidth: number = 1.0,
        buildingCode: 'UK_ADM' | 'US_IBC' | 'EU_EN17210' | 'default' = 'default'
    ): StairComputedParameters {
        const targetRiserHeight = buildingCode === 'UK_ADM' ? 0.175 : 0.170;
        let bestRiserCount = Math.round(levelHeight / targetRiserHeight);
        if (bestRiserCount < STAIR_CONSTRAINTS.MIN_RISER_COUNT) bestRiserCount = STAIR_CONSTRAINTS.MIN_RISER_COUNT;

        let bestSolution: StairComputedParameters | null = null;
        let bestBlondelDiff = Infinity;

        for (let n = bestRiserCount - 3; n <= bestRiserCount + 3; n++) {
            if (n < STAIR_CONSTRAINTS.MIN_RISER_COUNT) continue;

            const rh = levelHeight / n;
            if (rh < STAIR_CONSTRAINTS.MIN_RISER_HEIGHT || rh > STAIR_CONSTRAINTS.MAX_RISER_HEIGHT) continue;

            const td = Math.max(STAIR_CONSTRAINTS.MIN_TREAD_DEPTH, 0.630 - 2 * rh);
            const blondel = 2 * rh + td;
            const blondelDiff = Math.abs(blondel - 0.630);

            if (blondelDiff < bestBlondelDiff) {
                bestBlondelDiff = blondelDiff;
                bestSolution = {
                    riserCount: n,
                    riserHeight: Math.round(rh * 1000) / 1000,
                    treadDepth: Math.round(td * 1000) / 1000,
                    blondel: Math.round(blondel * 1000) / 1000,
                    totalRun: n * (Math.round(td * 1000) / 1000)
                };
            }
        }

        if (!bestSolution) {
            const rh = levelHeight / bestRiserCount;
            const td = STAIR_CONSTRAINTS.MIN_TREAD_DEPTH;
            bestSolution = {
                riserCount: bestRiserCount,
                riserHeight: Math.round(rh * 1000) / 1000,
                treadDepth: td,
                blondel: Math.round((2 * rh + td) * 1000) / 1000,
                totalRun: bestRiserCount * td
            };
        }

        return bestSolution;
    }

    static readonly CONSTRAINTS = STAIR_CONSTRAINTS;
}
