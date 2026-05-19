import * as THREE from '@pryzm/renderer-three/three';
import { StairData } from './StairTypes';

export class StairStringerBuilder {

    buildStringerGeometries(stair: StairData): THREE.BufferGeometry[] {
        const stringerType = stair.properties.stringerType;
        if (!stringerType || stringerType === 'none') return [];

        const geometries: THREE.BufferGeometry[] = [];

        // Track the running XZ position and elevation across flights, mirroring
        // the same flight-position logic as StairMeshBuilder.buildStairGeometry().
        // This ensures L-shape flight[1] stringers start from the correct position
        // (after the landing) rather than from stair.startPosition.
        let trackPos = new THREE.Vector3(
            stair.startPosition.x,
            stair.startPosition.y,
            stair.startPosition.z
        );
        let trackElevation = stair.startPosition.y;

        stair.flights.forEach((flight, flightIndex) => {
            // Phase 1: Vec3 → THREE.Vector3 conversion at builder boundary
            const dir = new THREE.Vector3(
                flight.direction.x,
                flight.direction.y,
                flight.direction.z
            ).normalize();
            const flatDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();

            let startPos: THREE.Vector3;
            if (flight.startOverride) {
                // U-shape: explicit start position supplied (XZ only; elevation from tracker).
                startPos = new THREE.Vector3(
                    flight.startOverride.x,
                    trackElevation,
                    flight.startOverride.z
                );
                trackPos = startPos.clone();
            } else {
                // I-shape (flight 0) or L-shape (all flights): use tracked running position.
                startPos = new THREE.Vector3(trackPos.x, trackElevation, trackPos.z);
            }

            // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — honour per-flight tread depth.
            const flightTread = flight.treadDepth ?? stair.treadDepth;
            const totalRun = flight.riserCount * flightTread;
            const totalRise = flight.riserCount * stair.riserHeight;
            const stringerThickness = stair.properties.stringerThickness ?? 0.05;
            const stringerHeight = 0.25;

            if (stringerType === 'closed' || stringerType === 'open') {
                const sideAxis = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
                const leftOffset = sideAxis.clone().multiplyScalar(stair.width / 2 + stringerThickness / 2);
                const rightOffset = leftOffset.clone().negate();

                [leftOffset, rightOffset].forEach(offset => {
                    const geom = this.buildSlopedBoard(
                        startPos.clone().add(offset),
                        dir,
                        totalRun,
                        totalRise,
                        stringerThickness,
                        stringerHeight
                    );
                    geometries.push(geom);
                });

            } else if (stringerType === 'mono') {
                // The mono stringer runs diagonally under the treads.
                // localY = cross(slopeDir, sideAxis) points DOWNWARD, so the stringer's
                // "depth" half-extent in the upward direction is +cos(θ) * depth/2 in world Y.
                // Without correction the top surface protrudes through the treads by that amount.
                //
                // Correct offset: lower the centre so the stringer top surface is flush with
                // the tread underside (start.y + riseHeight/2 - treadThickness).
                const length = Math.sqrt(totalRun * totalRun + totalRise * totalRise);
                const slopeAngleCos = totalRun / length; // cos(pitch angle)
                const treadThickness = (stair as any).properties?.treadThickness ?? 0.04;
                // yOffset that moves centre down so top = tread underside at midpoint
                const monoYOffset = -treadThickness - slopeAngleCos * stringerHeight / 2;

                const geom = this.buildSlopedBoard(
                    startPos.clone(),
                    dir,
                    totalRun,
                    totalRise,
                    stringerThickness * 1.5,
                    stringerHeight,
                    monoYOffset
                );
                geometries.push(geom);
            }

            // Advance the tracker past this flight's run.
            trackPos.add(flatDir.clone().multiplyScalar(totalRun));
            trackElevation += totalRise;

            // Advance past the landing (if any) so the next flight starts at the right place.
            const landing = stair.landings?.[flightIndex];
            const nextFlight = stair.flights[flightIndex + 1];
            if (landing && nextFlight && !nextFlight.startOverride) {
                // Legacy L-shape (auto-advance) flow: advance the tracker to match
                // StairMeshBuilder's auto-advance branch.
                //
                // §STAIR-PREVIEW-MATCH-2026-04-25 v2 — uses per-flight tread depth so
                // 2D-driven stairs that fall back to auto-advance still align stringers
                // with treads.  When `nextFlight.startOverride` is set (corner-pinned
                // mode), we skip this branch entirely — the next iteration's
                // `flight.startOverride` block will set trackPos to the polyline corner.
                const nextFlatDir = new THREE.Vector3(
                    nextFlight.direction.x, 0, nextFlight.direction.z
                ).normalize();
                trackPos
                    .add(flatDir.clone().multiplyScalar(flightTread / 2 + stair.width / 2))
                    .add(nextFlatDir.clone().multiplyScalar(landing.depth / 2 - flightTread / 2));
            }
        });

        return geometries;
    }

    private buildSlopedBoard(
        start: THREE.Vector3,
        direction: THREE.Vector3,
        runLength: number,
        riseHeight: number,
        thickness: number,
        depth: number,
        yOffset: number = 0
    ): THREE.BufferGeometry {
        const length = Math.sqrt(runLength * runLength + riseHeight * riseHeight);

        // Horizontal unit vector in the flight's travel direction.
        const flatDir = new THREE.Vector3(direction.x, 0, direction.z).normalize();

        // Left perpendicular of flatDir (stringer side axis — the "width" of the board).
        const sideAxis = new THREE.Vector3(-flatDir.z, 0, flatDir.x).normalize();

        // Slope direction: flatDir tilted upward at the stair pitch angle.
        // This is the unit vector along the stringer's length axis in 3-D.
        const slopeDir = new THREE.Vector3(
            flatDir.x * (runLength / length),
            riseHeight / length,
            flatDir.z * (runLength / length)
        ); // already unit length (cos²+sin²=1)

        // Build an explicit orthonormal basis so that:
        //   local +Z (length axis)    → slopeDir  (along the stringer slope)
        //   local +X (thickness axis) → sideAxis  (perpendicular to travel)
        //   local +Y (depth axis)     → cross(slopeDir, sideAxis)
        //
        // Note: localY points DOWNWARD and FORWARD (negative world-Y component).
        // The stringer's depth therefore extends downward from the centre, which is
        // what we want for a stringer that hangs below the tread line.
        const localY = new THREE.Vector3().crossVectors(slopeDir, sideAxis).normalize();

        const rotMatrix = new THREE.Matrix4();
        rotMatrix.makeBasis(sideAxis, localY, slopeDir);

        const geom = new THREE.BoxGeometry(thickness, depth, length);
        geom.applyMatrix4(rotMatrix);

        // Translate to the centre of the stringer (midpoint of run/rise) plus any
        // caller-supplied vertical offset (used to shift mono stringers below treads).
        const center = start.clone()
            .add(flatDir.clone().multiplyScalar(runLength / 2))
            .setY(start.y + riseHeight / 2 + yOffset);

        geom.translate(center.x, center.y, center.z);

        return geom;
    }
}
