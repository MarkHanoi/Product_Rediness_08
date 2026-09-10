import { planBuildFromDesign, type DesignEnvelopeDatum } from '../apps/editor/src/ui/site/buildFromDesignPlan';

const ring = (cx: number, cz: number, s: number) => [
  { x: cx - s, z: cz - s }, { x: cx + s, z: cz - s },
  { x: cx + s, z: cz + s }, { x: cx - s, z: cz + s },
];
const area = (s: number) => (2 * s) * (2 * s);

// THREE BUILDINGS on ONE parcel, all ground storey (baseOffset 0), all on level L0.
const plate = (id: string, cx: number): DesignEnvelopeDatum => ({
  id, levelId: 'L0', name: `Block ${id} · Level 0`, role: 'level', withinId: null,
  baseOffset: 0, height: 3, footprint: ring(cx, 0, 5), footprintAreaM2: area(5), occupancy: null,
});
const room = (id: string, host: string, cx: number): DesignEnvelopeDatum => ({
  id, levelId: 'L0', name: `Room ${id}`, role: 'room', withinId: host,
  baseOffset: 0, height: 2.7, footprint: ring(cx, 0, 2), footprintAreaM2: area(2), occupancy: 'living',
});

const envelopes: DesignEnvelopeDatum[] = [
  plate('A', 0), room('rA', 'A', 0),
  plate('B', 20), room('rB', 'B', 20),
  plate('C', 40), room('rC', 'C', 40),
];

const three = planBuildFromDesign({ envelopes, activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0, authoredWallCountByLevelId: { L0: 0 } });
console.log('=== THREE BUILDINGS, ONE STOREY ===');
console.log('ok =', three.ok);
if (!three.ok) console.log('code =', (three as any).refusal.code, '\ntext =', (three as any).refusal.text?.slice(0, 400));
else console.log('walls =', three.plan.walls.length, 'slabs =', three.plan.slabs.length, 'storeys =', three.plan.storeys.length);

// CONTROL: ONE building only.
const one = planBuildFromDesign({ envelopes: [plate('A', 0), room('rA', 'A', 0)], activeLevelId: 'L0', authoredWallCountOnActiveLevel: 0, authoredWallCountByLevelId: { L0: 0 } });
console.log('\n=== CONTROL — ONE BUILDING ===');
console.log('ok =', one.ok);
if (!one.ok) console.log('code =', (one as any).refusal.code);
else console.log('walls =', one.plan.walls.length, 'slabs =', one.plan.slabs.length, 'storeys =', one.plan.storeys.length);
