// @vitest-environment happy-dom
//
// BIM 2/3 D-α-4 — Apartment Data Test Modal smoke tests.
//
// Scope:
//   • The open → close cycle does not throw.
//   • With a stub apartmentParametersStore listing 2 apartments, both
//     render in the LEFT column.
//   • Clicking on an apartment row populates the RIGHT panel with the
//     apartment's name (typology) somewhere visible.
//
// happy-dom does not implement the native <dialog> `showModal()` / `close()`
// state machine perfectly; we shim them so the dialog still raises the
// `close` event and the cleanup branch runs (same pattern as
// modelTreeTestModal.test.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import {
    openApartmentDataTestModal,
    type ApartmentDataRuntimeLike,
} from '../src/ui/dev/apartmentDataTestModal.js';
import type {
    ApartmentParameters,
    RoomParameters,
} from '@pryzm/schemas/apartment';

// ── happy-dom <dialog> shim ──────────────────────────────────────────────────
beforeEach(() => {
    const proto = HTMLDialogElement?.prototype;
    if (!proto) return;
    if (typeof proto.showModal !== 'function' || !('__pryzmShim' in proto.showModal)) {
        const shim = function (this: HTMLDialogElement): void {
            this.setAttribute('open', '');
        };
        (shim as unknown as { __pryzmShim: true }).__pryzmShim = true;
        proto.showModal = shim;
    }
    if (typeof proto.close !== 'function' || !('__pryzmShim' in proto.close)) {
        const shim = function (this: HTMLDialogElement): void {
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
        (shim as unknown as { __pryzmShim: true }).__pryzmShim = true;
        proto.close = shim;
    }
    // Tear down any leftover dialog between tests.
    for (const d of [...document.body.querySelectorAll('dialog.adtm-dialog')]) {
        d.remove();
    }
});

// ── Stub store factory ───────────────────────────────────────────────────────
const apt = (over: Partial<ApartmentParameters> = {}): ApartmentParameters => ({
    id: 'apt-1',
    shellAreaM2: { value: 85, min: 60, max: 120 },
    bedrooms: 2,
    bathrooms: 1,
    masterEnSuite: true,
    openPlanKitchenDining: true,
    livingRoom: true,
    entranceHall: true,
    typology: 'open-plan-mid-rise',
    ...over,
});

const room = (over: Partial<RoomParameters> = {}): RoomParameters => ({
    id: 'room-1',
    apartmentId: 'apt-1',
    type: 'living',
    name: 'Living',
    areaM2: { value: 24, min: 14, max: 40 },
    widthM: { value: 4, min: 3, max: 6 },
    depthM: { value: 6, min: 3, max: 8 },
    daylightRequired: true,
    privacyTier: 1,
    ...over,
});

function makeStubRuntime(
    apartments: ApartmentParameters[],
    rooms: RoomParameters[],
): ApartmentDataRuntimeLike {
    return {
        apartmentParametersStore: {
            list: (): ApartmentParameters[] => apartments,
        },
        roomParametersStore: {
            forApartment: (id: string): RoomParameters[] =>
                rooms.filter(r => r.apartmentId === id),
            list: (): RoomParameters[] => rooms,
        },
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('openApartmentDataTestModal — open + close', () => {
    it('opens and closes a dialog without throwing', () => {
        const runtime = makeStubRuntime([apt()], [room()]);
        expect(() => openApartmentDataTestModal(runtime)).not.toThrow();
        const dialog = document.body.querySelector<HTMLDialogElement>('dialog.adtm-dialog');
        expect(dialog).not.toBeNull();
        expect(() => dialog!.close()).not.toThrow();
        expect(document.body.querySelector('dialog.adtm-dialog')).toBeNull();
    });

    it('renders one row per apartment in the LEFT column', () => {
        const runtime = makeStubRuntime(
            [apt({ id: 'apt-A' }), apt({ id: 'apt-B', typology: 'compact-studio' })],
            [room({ apartmentId: 'apt-A' }), room({ id: 'room-2', apartmentId: 'apt-B' })],
        );
        openApartmentDataTestModal(runtime);

        const dialog = document.body.querySelector<HTMLDialogElement>('dialog.adtm-dialog');
        expect(dialog).not.toBeNull();
        const rows = dialog!.querySelectorAll('.adtm-list-row');
        expect(rows.length).toBe(2);
        // The id appears in each row's id label.
        const ids = [...rows].map(r => r.querySelector('.adtm-list-row-id')?.textContent ?? '');
        expect(ids.sort()).toEqual(['apt-A', 'apt-B']);

        dialog!.close();
    });

    it('clicking an apartment row populates the RIGHT detail panel', () => {
        const runtime = makeStubRuntime(
            [
                apt({ id: 'apt-A' }),
                apt({ id: 'apt-B', typology: 'compact-studio' }),
            ],
            [room({ apartmentId: 'apt-A' }), room({ id: 'room-2', apartmentId: 'apt-B' })],
        );
        openApartmentDataTestModal(runtime);

        const dialog = document.body.querySelector<HTMLDialogElement>('dialog.adtm-dialog');
        expect(dialog).not.toBeNull();

        // Click apt-B's row.
        const row = dialog!.querySelector<HTMLElement>('[data-apt-id="apt-B"]');
        expect(row).not.toBeNull();
        row!.click();

        // The detail host should now mention the apt-B id in an Identity row.
        const detailText = dialog!.querySelector('.adtm-detail-host')?.textContent ?? '';
        expect(detailText).toContain('apt-B');
        // typology shows up in the Identity table.
        expect(detailText).toContain('compact-studio');

        dialog!.close();
    });
});
