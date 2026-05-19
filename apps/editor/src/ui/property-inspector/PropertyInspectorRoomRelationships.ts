import * as THREE from '@pryzm/renderer-three/three';

/**
 * Appends room relationship rows to the Relationships section.
 *
 * Extracted from PropertyInspector._appendRoomRelationships (Wave 7 WS-B split).
 *
 * Uses RoomRelationshipService (lazy-imported) to compute spatial
 * relationships between this element and detected rooms:
 *   • door        → Room From + Room To  (directional)
 *   • window      → Room + Adjacent Room
 *   • wall        → Room (Side A) + Room (Side B)
 *   • curtainwall → Room (Side A) + Room (Side B)
 *   • all others  → Containing Room (centroid point-in-polygon)
 *
 * Appended asynchronously so the Relationships section renders
 * immediately and room rows appear once the service resolves.
 */
export function appendRoomRelationships(
    container: HTMLElement,
    type: string,
    data: any,
    selectedObject: THREE.Object3D | null,
): void {
    import('@pryzm/room-topology').then(({ RoomRelationshipService }) => {
        const elementId: string = data.id ?? '';

        // Resolve levelId — may not be present on door/window userData
        const levelId: string = data.levelId
            ?? window.wallStore?.getById?.(data.wallId ?? data.parentId)?.levelId // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            ?? window.wallStore?.getById?.(elementId)?.levelId // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            ?? '';

        const rows: Array<{ label: string; roomRef: any }> = [];

        if (type === 'door') {
            const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            const wallData = wallStore?.getById?.(data.wallId ?? data.parentId);
            if (wallData) {
                const rel = RoomRelationshipService.getDoorRelationships(data, wallData);
                rows.push({ label: 'Room From', roomRef: rel.roomFrom });
                rows.push({ label: 'Room To',   roomRef: rel.roomTo   });
            }
        } else if (type === 'window') {
            const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            const wallData = wallStore?.getById?.(data.wallId ?? data.parentId);
            if (wallData) {
                const rel = RoomRelationshipService.getWindowRelationships(data, wallData);
                rows.push({ label: 'Room', roomRef: rel.roomId });
                if (rel.adjacentRoomId) {
                    rows.push({ label: 'Adjacent Room', roomRef: rel.adjacentRoomId });
                }
            }
        } else if (type === 'wall') {
            const wallStore = window.wallStore; // TODO(E.wall.S): replace with runtime.stores.wall — Phase E.wall.S
            const wallData = wallStore?.getById?.(elementId);
            if (wallData) {
                const adjacent = RoomRelationshipService.getWallAdjacentRooms(wallData);
                if (adjacent[0]) rows.push({ label: 'Room (Side A)', roomRef: adjacent[0] });
                if (adjacent[1]) rows.push({ label: 'Room (Side B)', roomRef: adjacent[1] });
            }
        } else if (type === 'curtainwall') {
            const cwStore = window.curtainWallStore; // TODO(E.curtain-wall.S): replace with runtime.stores.curtainWall — Phase E.curtain-wall.S
            const cwData = cwStore?.get?.(elementId) ?? cwStore?.getById?.(elementId);
            if (cwData?.baseLine) {
                const cwLevelId = levelId || cwData.levelId || '';
                const fakeOpening = { anchor: { t: 0.5 } };
                const fakeWall    = { baseLine: cwData.baseLine, levelId: cwLevelId };
                const rel = RoomRelationshipService.getWindowRelationships(fakeOpening, fakeWall);
                if (rel.roomId)         rows.push({ label: 'Room (Side A)', roomRef: rel.roomId         });
                if (rel.adjacentRoomId) rows.push({ label: 'Room (Side B)', roomRef: rel.adjacentRoomId });
            }
        } else {
            // Generic containment: use 3D object world position
            const obj3d = selectedObject;
            const rLevelId = levelId || data.levelId || '';
            if (obj3d && rLevelId) {
                const pos = new THREE.Vector3();
                obj3d.getWorldPosition(pos);
                const room = RoomRelationshipService.getContainingRoom(pos.x, pos.z, rLevelId);
                if (room) rows.push({ label: 'Room', roomRef: room });
            }
        }

        if (rows.length === 0) return;

        // ── Build DOM ────────────────────────────────────────────────
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid var(--app-border-light,#f0f0f0);';

        const sectionLabel = document.createElement('div');
        sectionLabel.style.cssText = 'font-size:10px;font-weight:700;color:var(--app-text-muted,#888);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;';
        sectionLabel.textContent = 'Room Relationships';
        wrapper.appendChild(sectionLabel);

        for (const { label, roomRef } of rows) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;gap:6px;';

            const lbl = document.createElement('span');
            lbl.style.cssText = 'font-size:11px;color:#666;flex-shrink:0;min-width:80px;';
            lbl.textContent = label;
            row.appendChild(lbl);

            if (roomRef) {
                const right = document.createElement('span');
                right.style.cssText = 'display:flex;align-items:center;gap:5px;';

                const swatch = document.createElement('div');
                swatch.style.cssText = `width:10px;height:10px;border-radius:2px;background:${roomRef.colour};border:1px solid rgba(0,0,0,0.15);flex-shrink:0;`;

                const nameSpan = document.createElement('span');
                nameSpan.style.cssText = 'font-size:11px;color:#222;font-weight:500;text-align:right;';
                const displayName = roomRef.name || '(unnamed)';
                const displayNum  = roomRef.roomNumber ? ` [${roomRef.roomNumber}]` : '';
                nameSpan.textContent = displayName + displayNum;

                // Phase B.1 Feature 3: "Go to room" button
                // Contract: 18-BIM30-ROOM-INTELLIGENCE-ANALYSIS.md §2.3 Feature 3
                const goBtn = document.createElement('button');
                goBtn.textContent = 'Go →';
                goBtn.title = `Select ${displayName}`;
                goBtn.style.cssText = [
                    'padding:2px 6px;font-size:9px;font-weight:600;',
                    'background:var(--app-accent,#3f51b5);color:#fff;',
                    'border:none;border-radius:4px;cursor:pointer;',
                    'flex-shrink:0;white-space:nowrap;',
                ].join('');
                goBtn.addEventListener('click', () => {
                    const sm = window.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
                    if (sm?.selectById) sm.selectById(roomRef.id);
                });

                right.appendChild(swatch);
                right.appendChild(nameSpan);
                right.appendChild(goBtn);
                row.appendChild(right);
            } else {
                const none = document.createElement('span');
                none.style.cssText = 'font-size:11px;color:#bbb;font-style:italic;';
                none.textContent = 'Exterior / None';
                row.appendChild(none);
            }

            wrapper.appendChild(row);
        }

        container.appendChild(wrapper);
    }).catch(() => {
        // RoomRelationshipService not available — skip silently
    });
}
