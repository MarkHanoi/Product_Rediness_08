import * as THREE from '@pryzm/renderer-three/three';
import { StairData } from './StairTypes';

export class StairPlanRepresentation {

    buildWalkingLine(stair: StairData): THREE.Line {
        const points: THREE.Vector3[] = [];

        // Phase 1: Vec3 → THREE.Vector3 at builder boundary
        let pos = new THREE.Vector3(stair.startPosition.x, stair.startPosition.y, stair.startPosition.z);

        stair.flights.forEach(flight => {
            if (flight.startOverride) {
                pos = new THREE.Vector3(flight.startOverride.x, pos.y, flight.startOverride.z);
            }
            const dir = new THREE.Vector3(
                flight.direction.x,
                flight.direction.y,
                flight.direction.z
            ).normalize();
            // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — honour per-flight tread depth
            // so the walking line matches the actual mesh geometry.
            const flightTread = flight.treadDepth ?? stair.treadDepth;
            const flightLength = flight.riserCount * flightTread;

            points.push(pos.clone().setY(pos.y + 0.02));
            pos.add(dir.clone().multiplyScalar(flightLength));
            points.push(pos.clone().setY(pos.y + 0.02));
        });

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineDashedMaterial({
            color: 0x000000,
            dashSize: 0.1,
            gapSize: 0.05,
            linewidth: 1
        });

        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        line.userData.type = 'stair-walking-line';
        line.userData.stairId = stair.id;
        line.userData.selectable = false;

        return line;
    }

    buildDirectionArrow(stair: StairData): THREE.ArrowHelper {
        const firstFlight = stair.flights[0];
        if (!firstFlight) return new THREE.ArrowHelper();

        // Phase 1: Vec3 → THREE.Vector3
        const dir = new THREE.Vector3(
            firstFlight.direction.x,
            firstFlight.direction.y,
            firstFlight.direction.z
        ).normalize();
        const origin = new THREE.Vector3(
            stair.startPosition.x,
            stair.startPosition.y + 0.05,
            stair.startPosition.z
        );
        const length = 0.5;

        const arrow = new THREE.ArrowHelper(dir, origin, length, 0x000000, 0.15, 0.1);
        arrow.userData.type = 'stair-direction-arrow';
        arrow.userData.stairId = stair.id;
        arrow.userData.selectable = false;

        return arrow;
    }

    buildBreakLine(stair: StairData, cutHeight: number = 1.0): THREE.Line {
        const firstFlight = stair.flights[0];
        if (!firstFlight) return new THREE.Line();

        // Phase 1: Vec3 → THREE.Vector3
        const dir = new THREE.Vector3(
            firstFlight.direction.x,
            firstFlight.direction.y,
            firstFlight.direction.z
        ).normalize();
        const perp = new THREE.Vector3(-dir.z, 0, dir.x);

        const riserAtCut = Math.floor(cutHeight / stair.riserHeight);
        const startPos = new THREE.Vector3(stair.startPosition.x, stair.startPosition.y, stair.startPosition.z);
        const cutPos = startPos.add(dir.clone().multiplyScalar(riserAtCut * stair.treadDepth));

        const leftPoint = cutPos.clone().add(perp.clone().multiplyScalar(stair.width / 2 + 0.1));
        const rightPoint = cutPos.clone().add(perp.clone().multiplyScalar(-(stair.width / 2 + 0.1)));

        const geometry = new THREE.BufferGeometry().setFromPoints([leftPoint, rightPoint]);
        const material = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });

        const line = new THREE.Line(geometry, material);
        line.userData.type = 'stair-break-line';
        line.userData.stairId = stair.id;
        line.userData.selectable = false;

        return line;
    }
}
