# W4i RECOVERY — ceiling + curtain-wall, seven facts, EXECUTED (2026-08-31)

## F1. CEILING `exports` HAS MOVED NO -> YES. Executed.
Wave 4b (§W4B-EXPORT / §W4B-CEILING-EXPORTS, 2026-08-31, UNCOMMITTED working tree) built the
missing arm the 2026-08-29 row measured as absent.

$ git status --porcelain packages/file-format/src/export/ifc/readers/CeilingReader.ts \
    packages/file-format/src/export/ifc/FragmentReader.ts packages/file-format/src/export/ifc/ExportIFC.ts
 M packages/file-format/src/export/ifc/FragmentReader.ts
 M packages/file-format/src/export/ifc/ExportIFC.ts
?? packages/file-format/src/export/ifc/readers/CeilingReader.ts

$ grep -n -i ceiling packages/file-format/src/export/ifc/FragmentReader.ts
 34: import { FloorStore, CeilingStore } from '@pryzm/core-app-model/stores';
 49: import { CeilingReader } from './readers/CeilingReader';
 68:   ceilingStore?: CeilingStore;
145:   if (this.stores.ceilingStore) {
147:   elements.push(...new CeilingReader(this.stores.ceilingStore, this).read());

$ grep -n -i ceiling packages/file-format/src/export/ifc/ExportIFC.ts
 58: ceilingStore: window.ceilingStore ?? undefined, // TODO(TASK-07)

EXECUTED:
$ cd packages/file-format && npx vitest run __tests__/ifc-export-floor-ceiling-lift.test.ts
RC=0 — Test Files 1 passed (1) · Tests 6 passed (6)
  CEILING: FragmentReader emits an IfcCovering/CEILING element  (ifcClass IfcCovering,
  predefinedType CEILING, geometry.vertices.length > 0)
  + 2 CONTROLS: empty scene -> undefined; unsupplied store -> elements.length 0.
The controls are what make this non-vacuous: the pre-fix state is reproduced and fails.

HONEST LIMIT (the reader's own header says it too): CeilingReader emits only for a ceiling that
has a MESH (`ctx.findMesh(ceiling.id)`; `if (!mesh) continue`). The test supplies that mesh by
hand. So `exports = YES` is CONDITIONAL ON `renders_3d`, which is a SEPARATE fact below.
