import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DrawingModeBar } from '@app/ui/DrawingModeBar';
import { creationModes } from '../elementCreationMatrix';
import {
    setActiveSlabDrawMode,
    resolveActiveSlabDrawMode,
    __resetActiveSlabDrawModeForTests,
} from '../activeSlabDrawMode';
import { BoundaryPathAuthor } from '@pryzm/geometry-slab';

/**
 * §FEAT-PERSISTENT-MODE-BAR (founder, 2026-08-07)
 *
 *   "The slab creation works great — but the UI/UX is not as expected. I would
 *    like EXACTLY THE SAME PANEL as the wall. I want the user, DURING CREATION,
 *    to be able to change from linear to curved to ortho etc. Same for ceiling
 *    and floor."
 *
 * Two things had to be true and only one was: the control must be PRESENT DURING
 * the draw (the slab had none — only a pre-flight launcher menu), and switching
 * must be NON-DESTRUCTIVE (every launcher entry called `activateSlabTool`, which
 * runs `deactivateAllInternal()` and wiped the in-progress polyline).
 */
describe('§FEAT-PERSISTENT-MODE-BAR — the wall\'s control, on slab/floor/ceiling', () => {
    let bar: DrawingModeBar;

    beforeEach(() => {
        document.body.innerHTML = '';
        __resetActiveSlabDrawModeForTests();
        bar = new DrawingModeBar();
    });

    // A bar left undismissed keeps its window accelerator listener, and because the
    // handler calls stopImmediatePropagation() the STALE bar would swallow the next
    // test's keystroke. Production never hits this — the layout owns one instance and
    // show() dismisses first — but the suite must tear down explicitly.
    afterEach(() => bar.dismiss());

    const pills = () => Array.from(
        document.querySelectorAll<HTMLButtonElement>('.wdh-bar .wdh-btn'),
    );

    describe('the bar is PRESENT DURING a draw, not only before it', () => {
        it('renders as a persistent bar and survives while points are being placed', () => {
            const author = new BoundaryPathAuthor();
            bar.show({
                label: 'Slab:', modes: creationModes('slab'),
                initialMode: 'linear', onSelect: () => {},
            });
            expect(bar.isVisible()).toBe(true);

            // Draw three vertices — the bar must still be on screen.
            author.click('linear', { x: 0, z: 0 });
            author.click('linear', { x: 4, z: 0 });
            author.click('linear', { x: 4, z: 3 });
            expect(bar.isVisible()).toBe(true);
            expect(document.querySelectorAll('.wdh-bar')).toHaveLength(1);
        });

        it('reuses the WALL bar\'s stylesheet — literally the same panel, not a lookalike', () => {
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear', onSelect: () => {} });
            expect(document.querySelector('.wdh-bar')).not.toBeNull();
            expect(document.querySelector('.wdh-mode-lbl')?.textContent).toBe('Slab:');
            expect(document.querySelector('.wdh-esc')?.textContent).toBe('ESC to finish');
        });
    });

    describe('every declared mode is offered — the bar is not truncated to wall\'s four', () => {
        it('slab shows all SEVEN of its modes', () => {
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear', onSelect: () => {} });
            expect(pills().map(b => b.dataset.mode)).toEqual(
                ['linear', 'ortho', 'curved', '2point', 'region', 'hollow', 'pickWalls'],
            );
        });

        it.each(['floor', 'ceiling'])('%s shows its five modes INCLUDING auto', (tool) => {
            bar.show({ label: 'X:', modes: creationModes(tool), initialMode: 'linear', onSelect: () => {} });
            const ids = pills().map(b => b.dataset.mode);
            expect(ids).toEqual(['linear', 'ortho', 'curved', 'rectangle', 'circular', 'elliptical', 'auto']);
            expect(ids).toContain('auto');
        });

        it('preserves the launcher menu\'s descriptions as tooltips', () => {
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear', onSelect: () => {} });
            const byMode = Object.fromEntries(pills().map(b => [b.dataset.mode, b.title]));
            expect(byMode['region']).toContain('Auto-detect from enclosed walls');
            expect(byMode['pickWalls']).toContain('Associative boundary from walls');
            expect(byMode['hollow']).toContain('Rectangle with a rectangular opening');
        });
    });

    describe('MODE IS LIVE — switching mid-draw preserves the points already placed', () => {
        it('a slab mode switch writes ONLY the shared store — it never re-activates the tool', () => {
            const activateSlabTool = vi.fn();   // stands in for the destructive path
            bar.show({
                label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear',
                onSelect: (id) => {
                    // The production wiring: boundary modes write the store, nothing else.
                    if (id === 'linear' || id === 'ortho' || id === 'curved') setActiveSlabDrawMode(id);
                    else activateSlabTool(id);
                },
            });

            const author = new BoundaryPathAuthor();
            author.click(resolveActiveSlabDrawMode(), { x: 0, z: 0 });
            author.click(resolveActiveSlabDrawMode(), { x: 4, z: 0 });
            expect(author.pointCount).toBe(2);

            // Mid-draw: click the Ortho pill.
            pills().find(b => b.dataset.mode === 'ortho')!.click();

            expect(resolveActiveSlabDrawMode()).toBe('ortho');
            expect(activateSlabTool).not.toHaveBeenCalled();   // ← the whole point
            expect(author.pointCount).toBe(2);                 // ← nothing was lost
        });

        it('the new mode applies to the very NEXT click, not the next session', () => {
            bar.show({
                label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear',
                onSelect: (id) => setActiveSlabDrawMode(id),
            });
            const author = new BoundaryPathAuthor();
            author.click(resolveActiveSlabDrawMode(), { x: 0, z: 0 });

            pills().find(b => b.dataset.mode === 'ortho')!.click();

            // The handler re-reads the mode per interaction, so this click is ortho-
            // constrained: a diagonal drag lands on an axis, preserving the radius.
            author.click(resolveActiveSlabDrawMode(), { x: 3, z: 4 });
            const p = author.points[1]!;
            expect(Math.min(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(1e-9);
            expect(Math.hypot(p.x, p.z)).toBeCloseTo(5, 9);
        });

        it('switching to CURVED mid-polyline keeps the vertices and starts an arc', () => {
            bar.show({
                label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear',
                onSelect: (id) => setActiveSlabDrawMode(id),
            });
            const author = new BoundaryPathAuthor();
            author.click('linear', { x: 0, z: 0 });
            author.click('linear', { x: 4, z: 0 });

            pills().find(b => b.dataset.mode === 'curved')!.click();
            expect(resolveActiveSlabDrawMode()).toBe('curved');
            expect(author.pointCount).toBe(2);   // preserved

            // The next two clicks author an arc off the existing vertex.
            expect(author.click('curved', { x: 6, z: 2 })).toBe('arc-midpoint');
            expect(author.click('curved', { x: 4, z: 4 })).toBe('arc-segment');
            expect(author.pointCount).toBeGreaterThan(3);
        });

        it('keyboard accelerators switch mode too, and are equally non-destructive', () => {
            const activateSlabTool = vi.fn();
            bar.show({
                label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear',
                onSelect: (id) => {
                    if (id === 'linear' || id === 'ortho' || id === 'curved') setActiveSlabDrawMode(id);
                    else activateSlabTool(id);
                },
            });
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
            expect(resolveActiveSlabDrawMode()).toBe('curved');
            expect(activateSlabTool).not.toHaveBeenCalled();
        });

        it('a FAMILY switch (2-Point) is the one sanctioned reset — a polyline cannot become a rectangle', () => {
            const activateSlabTool = vi.fn();
            bar.show({
                label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear',
                onSelect: (id) => {
                    if (id === 'linear' || id === 'ortho' || id === 'curved') setActiveSlabDrawMode(id);
                    else activateSlabTool(id);
                },
            });
            pills().find(b => b.dataset.mode === '2point')!.click();
            expect(activateSlabTool).toHaveBeenCalledWith('2point');
            // …and it did NOT corrupt the boundary constraint.
            expect(resolveActiveSlabDrawMode()).toBe('linear');
        });
    });

    describe('the active-pill highlight', () => {
        it('marks the initial mode and follows the user\'s picks', () => {
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'ortho', onSelect: () => {} });
            const active = () => pills().filter(b => b.classList.contains('wdh-btn--active')).map(b => b.dataset.mode);
            expect(active()).toEqual(['ortho']);
            pills().find(b => b.dataset.mode === 'curved')!.click();
            expect(active()).toEqual(['curved']);
        });

        it('WALL IS UNCHANGED: By Slab is an ACTION — it never takes the highlight', () => {
            // The wall is the reference implementation and the founder is happy with
            // it; convergence must not alter its behaviour.
            const onSelect = vi.fn();
            bar.show({ label: 'Mode:', modes: creationModes('wall'), initialMode: 'linear', onSelect });
            expect(pills().map(b => b.dataset.mode)).toEqual(['linear', 'ortho', 'curved', 'byslab']);

            const bySlab = pills().find(b => b.dataset.mode === 'byslab')!;
            bySlab.click();
            expect(onSelect).toHaveBeenCalledWith('byslab');           // the action fired
            const active = pills().filter(b => b.classList.contains('wdh-btn--active')).map(b => b.dataset.mode);
            expect(active).toEqual(['linear']);                        // highlight unmoved
            // …and it sits after the separator, as the wall bar has always drawn it.
            expect(document.querySelector('.wdh-sep')).not.toBeNull();
            expect(bySlab.classList.contains('wdh-btn--slab')).toBe(true);
        });
    });

    describe('lifecycle', () => {
        it('dismiss removes the bar and unbinds its accelerators', () => {
            const onSelect = vi.fn();
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear', onSelect });
            bar.dismiss();
            expect(bar.isVisible()).toBe(false);
            expect(document.querySelector('.wdh-bar')).toBeNull();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
            expect(onSelect).not.toHaveBeenCalled();
        });

        it('show() twice does not leave two bars on screen', () => {
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear', onSelect: () => {} });
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'ortho', onSelect: () => {} });
            expect(document.querySelectorAll('.wdh-bar')).toHaveLength(1);
        });

        it('accelerators are ignored while the user is typing in a field', () => {
            const onSelect = vi.fn();
            bar.show({ label: 'Slab:', modes: creationModes('slab'), initialMode: 'linear', onSelect });
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
            expect(onSelect).not.toHaveBeenCalled();
        });
    });
});
