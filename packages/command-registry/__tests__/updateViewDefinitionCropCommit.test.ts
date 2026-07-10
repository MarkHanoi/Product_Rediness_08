/**
 * §PERF-ELEV-CROP-DRAG-FLOW (L-222) — one gesture ⇒ one command ⇒ one undo entry.
 *
 * A section/elevation SCOPE-box drag changes BOTH the view's `spatial` (sectionVolume /
 * cropRegion / sectionPlane) AND the `crop` it derives (farClip / region). The old drag
 * fired UPDATE_VIEW_DEFINITION *and* SET_VIEW_CROP per pointermove — two commands, two
 * undo entries, two competing projections. The commit now fires ONE
 * UpdateViewDefinitionCommand carrying both spatial and crop. This suite pins that the
 * single command applies BOTH and its single undo entry restores BOTH — the invariant
 * that makes a crop drag one undoable gesture.
 *
 * DATA/COMMAND test — no THREE, no DOM. Drives the command against the real
 * viewDefinitionStore singleton (the command's mutation target).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateViewDefinitionCommand } from '../src/views/UpdateViewDefinitionCommand';
import type { CommandContext } from '../src/types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewCropSettings } from '@pryzm/core-app-model';

const VIEW = 'vd-test-elev-south';
const CTX = {} as CommandContext;

const PRE_CROP: ViewCropSettings = { enabled: true, farClip: { offset: 8 }, region: { min: [-10, 0], max: [10, 3] } };
const FINAL_CROP: ViewCropSettings = { enabled: true, farClip: { offset: 3 }, region: { min: [-10, 0], max: [10, 3] } };

describe('§PERF-ELEV-CROP-DRAG-FLOW (L-222) — scope-drag commit is ONE command carrying spatial + crop', () => {
    beforeEach(() => {
        // Fresh view for each test: pre-drag spatial.sectionVolume.far = 8, crop.farClip = 8.
        viewDefinitionStore.delete?.(VIEW);
        viewDefinitionStore.create({
            id: VIEW,
            name: 'South Elevation',
            viewType: 'elevation',
            spatial: {
                sectionVolume: {
                    origin: [0, 0, 0], direction: [0, 0, -1],
                    width: 20, height: 3, near: 0, far: 8,
                },
            } as any,
            crop: PRE_CROP,
        });
    });

    it('execute() applies BOTH the final spatial and the final crop from a single command', () => {
        const cmd = new UpdateViewDefinitionCommand(VIEW, {
            spatial: { sectionVolume: { origin: [0, 0, 0], direction: [0, 0, -1], width: 20, height: 3, near: 0, far: 3 } } as any,
            crop: FINAL_CROP,
        });
        const res = cmd.execute(CTX);
        expect(res.success).toBe(true);

        const after = viewDefinitionStore.get(VIEW)!;
        expect(after.spatial.sectionVolume!.far).toBe(3);
        expect(after.crop!.farClip!.offset).toBe(3);
    });

    it('undo() restores BOTH the pre-drag spatial and the pre-drag crop (single undo entry)', () => {
        const cmd = new UpdateViewDefinitionCommand(VIEW, {
            spatial: { sectionVolume: { origin: [0, 0, 0], direction: [0, 0, -1], width: 20, height: 3, near: 0, far: 3 } } as any,
            crop: FINAL_CROP,
        });
        cmd.execute(CTX);
        cmd.undo(CTX);

        const restored = viewDefinitionStore.get(VIEW)!;
        expect(restored.spatial.sectionVolume!.far).toBe(8);          // spatial reverted
        expect(restored.crop!.farClip!.offset).toBe(8);               // crop reverted too
    });

    it('a spatial-only command (crop omitted) never touches an unrelated crop', () => {
        const cmd = new UpdateViewDefinitionCommand(VIEW, {
            spatial: { sectionVolume: { origin: [0, 0, 0], direction: [0, 0, -1], width: 20, height: 3, near: 0, far: 5 } } as any,
        });
        cmd.execute(CTX);
        expect(viewDefinitionStore.get(VIEW)!.crop!.farClip!.offset).toBe(8);  // crop untouched
        cmd.undo(CTX);
        expect(viewDefinitionStore.get(VIEW)!.crop!.farClip!.offset).toBe(8);  // still untouched
    });
});
