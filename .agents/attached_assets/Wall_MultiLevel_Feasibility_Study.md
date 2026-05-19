# Feasibility Study: Multi-Level Wall Creation

## 1. Executive Summary
This study evaluates the complexity of enabling wall creation on levels other than Level 0. Currently, walls are logically assigned to the active level but geometrically restricted to $Y=0$. Correcting this requires ensuring that the wall's base elevation matches the active level's elevation during creation and preview.

## 2. Current Architecture & Flow
- **State Management**: `ProjectContext` tracks the `activeLevelId`.
- **UI/Tooling**: `WallTool` handles mouse interactions and provides a visual preview. It retrieves the active level's elevation via `BimManager`.
- **Command Pattern**: `CreateWallCommand` is responsible for the final creation. It correctly reads the level's elevation and sets the wall's `baseLine` Y-coordinates.
- **Data Persistence**: `WallStore.add()` also attempts to enforce elevation consistency, but it currently has a hardcoded fallback or potential mismatch with the tool's preview logic.

## 3. Root Cause Analysis
The issue is **coordinate-system related** and **UI-implementation related**:
1. **Raycasting**: `WallTool.getWorldPoint` uses a `groundPlane` at a specific elevation. If this elevation doesn't match the active level, the mouse coordinates are projected onto the wrong plane.
2. **Preview Logic**: `WallTool.updatePreview` and `createStartMarker` use the level elevation for rendering, but there are inconsistent checks or hardcoded defaults in some segments of the tool.
3. **Redundancy**: Both `CreateWallCommand` and `WallStore` try to set elevations. If the input coordinates from the tool are already "flattened" to Level 0, the logic in the command might be using a mix of intended elevation and flattened coordinates.

## 4. Proposed Solution Approaches

### Option A: Level-Aware Tool Projection (Recommended)
*   **Description**: Modify `WallTool` to dynamically update its raycasting plane and preview markers based on `projectContext.activeLevelId`.
*   **Invasiveness**: Low.
*   **Core Logic Change**: None. It only changes how the tool perceives the mouse position.
*   **Pros**: Safest; respects existing command logic; provides immediate visual feedback.
*   **Cons**: Requires careful syncing of tool state with level changes.

### Option B: Command-Level Elevation Enforcement
*   **Description**: Ensure `CreateWallCommand` always overrides input Y-coordinates with the target level's elevation.
*   **Invasiveness**: Medium.
*   **Core Logic Change**: Minor modification to `CreateWallCommand.execute`.
*   **Pros**: Guarantees data integrity regardless of tool behavior.
*   **Cons**: Doesn't fix the "ghosting" preview where walls appear on Level 0 while drawing.

### Option C: Architectural "Spatial Anchor" Adapter
*   **Description**: Introduce an abstraction layer that translates all "tool-space" coordinates to "world-space" based on the active level.
*   **Invasiveness**: High.
*   **Core Logic Change**: Requires refactoring multiple tools.
*   **Pros**: Cleanest architectural solution for long-term multi-level support.
*   **Cons**: High regression risk.

## 5. Risk Assessment
- **Stability**: Option A has the lowest risk as it only affects the "Interaction" layer.
- **Regression**: Low, provided the `groundPlane` logic in `WallTool` is correctly scoped.
- **Compatibility**: High. Existing walls on Level 0 remain untouched.

## 6. Estimated Effort
- **Development**: 2-4 hours.
- **Testing**: 1-2 hours.

## 7. Recommendation
Implement **Option A**. By making the `WallTool` aware of the active level's elevation during the `getWorldPoint` and `updatePreview` phases, the geometry will naturally align with the logical level without requiring changes to the core `CreateWallCommand` logic. This preserves the stability of the wall system while fixing the user-facing mismatch.

---
**Status**: Feasibility Study Complete. 
**Next Step**: Propose implementation of Level-Aware Tool Projection.