REQUEST: We need to review an important issue. FIRST READ ALL THE CONTRACTS ON docs/00_Contracts. Now -when a project is crreated and elements are generated , specifically walls and door and windows hosted on walls > and the session is closest - the project is saved. when the user opens it again (this issue happened before with wall joinst and was solved) at the moment The wall profile on the hosting area of the widnow and door doesnt seem to be done cleanly or very well - you can see the line that defines the different surfaces splited and merged during opening creation for window creation and window hosting. (see screeshot) this doesnt occur normally - but on this circustance occurs - can you check this? Also on ifc generation and openning (check second screen shot)) it becomes evident that wall profiles are cut and merged- however, a wall coming from revit with doorr hosted doesnt have such cut -- can you do first a feasiblity study to understand if there is a way to create proper merging still keeping the wall surface correct for bim quantity take off and semantically robust? (check editor to see how they do)




Feasibility study complete: this is feasible, and it should be treated as two related but separate fixes.

Finding
The defect is not primarily a save/load corruption issue. Save/load appears to preserve the wall/opening data deterministically.

The visible seams come from the wall rendering strategy:

LayeredWallOpeningBuilder.ts splits each wall layer into multiple independent box segments around each door/window.
Those segment boundaries become real mesh boundaries.
After reload, the same segmented geometry is rebuilt, so the seams reappear consistently.
The current “single outline edge overlay” reduces extra edge lines, but it does not remove the physical split topology.
The IFC issue has the same root cause:

WallReader.ts exports wall geometry from the scene mesh when available.
If that scene mesh is already segmented around openings, IFC receives a wall made from baked cut pieces.
The exporter does already have partial support for IfcOpeningElement, IfcRelVoidsElement, and IfcRelFillsElement, but the wall body geometry is still exported as pre-cut triangulated mesh, so it does not match the cleaner Revit-style pattern.
Recommended direction
1. Rendering fix: single continuous wall/layer geometry with holes
Replace the segmented “box pieces around openings” approach with a single generated mesh per wall layer, where openings are represented as holes/cutouts in that mesh.

Best path:

Keep wall.openings[] as the source of truth.
Keep hosted doors/windows in the existing dual store model.
Change only the geometry projection layer.
For layered walls, generate one continuous mesh per layer with rectangular holes for openings.
Preserve layer thicknesses, layer material, wall baseline, wall joins, and _sourceBaseLine.
This matches the editor reference pattern conceptually: one wall body, openings cut out of it, not separate wall chunks.

2. IFC fix: semantic opening export, not baked wall fragments
For IFC export, the wall reader/export pipeline should avoid using the segmented visible mesh as the authoritative IFC wall shape.

Recommended path:

Export the wall as a single clean IfcWall or IfcWallStandardCase body.
Export each opening as an IfcOpeningElement.
Connect wall → opening with IfcRelVoidsElement.
Connect opening → door/window with IfcRelFillsElement.
Give the opening actual placement/geometry based on the hosted opening data, not just an empty placeholder.
The current IfcModelBuilder already has a starting point for void/fill relationships, so this is not a greenfield feature. The missing piece is making wall geometry and opening geometry semantic/parametric instead of relying on the cut scene mesh.

BIM safety assessment
This approach can preserve the important BIM semantics:

Quantity takeoff: yes, if layer volumes/opening deductions are computed from wall/opening data, not from fragmented scene mesh.
Stable IDs: yes, no need to change wall, opening, door, or window IDs.
Hosted-element graph: yes, keep wall.openings[], doorStore, windowStore, and semantic graph relationships intact.
Save/load determinism: yes, because geometry remains derived from stored parametric data.
IFC round-trip integrity: improved, because export would represent the same relationship model that BIM tools expect.
Risks / complexity
Main risks are geometry robustness, not data modeling:

Multiple or overlapping openings need clustering/validation.
Openings near wall ends and joined/mitered walls need careful handling.
Layered walls need per-layer holes while preserving total wall thickness.
Curved wall openings are currently out of scope and should probably remain unsupported until a separate curved-opening design is done.
IFC opening placements need to be correct in local wall coordinates.
Practical implementation plan
I would do this in phases:

Replace layered wall opening rendering with a continuous per-layer cutout mesh.
Keep the existing segmented builder behind a temporary fallback/debug path.
Add regression coverage around save → reload → rebuild equivalence.
Update IFC wall export to prefer parametric wall geometry for walls with openings.
Add real IfcOpeningElement geometry/placement and connect void/fill relationships.
Verify exported IFC in an external IFC viewer against a Revit-like structure.
Recommendation
Proceed. The fix is architecturally sound and aligns better with BIM expectations than the current segmented render/export path. I would not patch this by hiding lines or tweaking materials; that may reduce the visual symptom but would leave the IFC and topology problem intact.