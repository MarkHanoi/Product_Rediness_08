export { Wall } from './Wall.js';
export { Slab } from './Slab.js';
export { Door } from './Door.js';
export { Window } from './Window.js';
export { Roof, Skylight } from './Roof.js';
export { CurtainWall } from './CurtainWall.js';
export { Grid } from './Grid.js';
export { Column } from './Column.js';
export { Beam } from './Beam.js';
export { Stair } from './Stair.js';
export { VerticalCirculation, LiftKind } from './VerticalCirculation.js';
export { Handrail } from './Handrail.js';
export { Ceiling } from './Ceiling.js';
// PV-08 / C75 §5 — the applied floor FINISH (IfcCovering/FLOORING), the mirror of
// Ceiling and NOT a structural Slab. Added 2026-08-14 to close
// `check-provenance-coverage`'s C2 finding: `FloorDetectionMethod` existed in
// core-app-model while L0 had no `defineElement('floor')` to retrofit at all.
export { Floor } from './Floor.js';
export { Room } from './Room.js';
export { Furniture, FurnitureRepresentation, FurnitureLod } from './Furniture.js';
export { Annotation } from './Annotation.js';
export { Dimension } from './Dimension.js';
export { Sheet } from './Sheet.js';
export { Schedule } from './Schedule.js';
export { View } from './View.js';
export { Project } from './Project.js';
export { Structural } from './Structural.js';
export { Lighting } from './Lighting.js';
export { Plumbing } from './Plumbing.js';
// §FEAT-PROJECT-ORIGIN (L-109) — singleton Project Origin / Base Point element.
export { ProjectOrigin } from './ProjectOrigin.js';
// §FEAT-SWIMMING-POOL-ELEMENT (L-292) — the pool ASSEMBLY parent + its water body.
// A pool is an ASSEMBLY (hole + walls + floor slab + water), not a primitive; water
// is its OWN family, not a blue slab. Both decisions are recorded in ADR-0124.
export { Pool } from './Pool.js';
export { Water } from './Water.js';
// §P3.4-SE: Section cut annotation element schema + DTO types.
export type { SectionData, SectionLine, SectionsState } from './Section.js';
