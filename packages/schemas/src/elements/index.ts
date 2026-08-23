export { Wall } from './Wall.js';
export { Slab } from './Slab.js';
export { Door } from './Door.js';
export { Window } from './Window.js';
export { Roof, Skylight } from './Roof.js';
export { CurtainWall } from './CurtainWall.js';
// §CW-2a / C87 §13.2 — THE MASTER curtain-panel vocabulary. L0 because it is the
// only layer every consumer can import downward; see the file header for why
// `geometry-curtain-wall` could not hold it (C87 CW-Voc-5 is corrected there).
export {
    CURTAIN_PANEL_TYPES,
    CURTAIN_PANEL_KINDS,
    CURTAIN_PANEL_TYPE_TO_KIND,
    CURTAIN_PANEL_KINDS_WITHOUT_A_TYPE,
    curtainPanelKindOf,
    curtainPanelTypesLosingIdentityInKind,
    isCurtainPanelType,
    isCurtainPanelKind,
} from './CurtainPanelVocabulary.js';
export type { CurtainPanelTypeName, CurtainPanelKindName } from './CurtainPanelVocabulary.js';
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
// §FEAT-BALCONY-COMPOUND (L-5600) — the balcony COMPOUND parent (C103, ADR-0333).
// A balcony is a COMPOUND (cantilever slab + floor finish + railing runs) whose
// three members are real records of EXISTING families, derived from ONE polygon.
// Unlike the pool it mints NO new member family — the compound is the only new kind.
export { Balcony } from './Balcony.js';
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900) — the AUTHORED construction / setting-out
// line (C105, ADR-0348). ⛔ NOT `Parcel.boundary` (C19 §1.4 — legal, immutable, owned
// by the site subsystem) and NOT `RoomBoundingLine` (an invisible room-detection
// splitter). It is a HOST: what is built on it moves with it.
export { BoundaryLine, BoundaryLineAttachmentSchema } from './BoundaryLine.js';
export type { BoundaryLineAttachment } from './BoundaryLine.js';
// §P3.4-SE: Section cut annotation element schema + DTO types.
export type { SectionData, SectionLine, SectionsState } from './Section.js';
