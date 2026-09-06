// TEMPORARY PROBE — deleted before commit. Reads the R4/R5 rate on one option.
import { generateDeterministicLayouts } from '../../packages/ai-host/src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { polygonAreaM2, type ShellAnalysis } from '../../packages/ai-host/src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../../packages/ai-host/src/workflows/apartmentLayout/types.js';
import { projectLayoutOption } from '../../packages/ai-host/src/workflows/apartmentLayout/validators/layoutOptionAdapter.js';
import { validateApartmentLayout } from '../../packages/ai-host/src/workflows/apartmentLayout/validators/orchestrator.js';
import { toValidationInput } from '../../packages/ai-host/src/workflows/apartmentLayout/validators/layout-adapter.js';

const rect = (w: number, d: number) => [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
const shell: ShellAnalysis = { netAreaM2: polygonAreaM2(rect(8.3, 11.084)), widthM: 8.3, depthM: 11.084, perimeter: rect(8.3, 11.084), faces: [] };
const prog: ApartmentProgram = { bedrooms: 2, bathrooms: 1, masterEnSuite: true, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
const constraints: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const weights: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

const o = generateDeterministicLayouts(shell, prog, constraints, weights, 1)[0]!;
const p = projectLayoutOption(o);
console.log('measured/approx/unmeasurable:', p.measuredRooms.length, p.approximatedRooms.length, p.unmeasurableRooms.length);
console.log('unruledTypes:', p.unruledTypes, 'dupNames:', p.duplicateNames, 'entrance:', p.entranceRoomId);
console.log('access edges:', p.access.edges!.length, 'nuisance edges:', p.nuisance.edges!.length);
for (const g of ['access', 'nuisance'] as const) {
  const rep = validateApartmentLayout(toValidationInput(p[g]));
  console.log(`--- ${g}: ${rep.errors} errors, ${rep.warnings} warnings, byClass=${JSON.stringify(rep.violationsByClass)} notMeasured=${rep.notMeasured.length}`);
  for (const v of rep.topology) console.log(`    ${v.classId} ${v.severity} ${v.roomAId}: ${v.message}`);
  for (const v of rep.dimensional) console.log(`    ${v.classId} ${v.severity} ${v.roomId}: ${v.message}`);
}
