import * as THREE from '@pryzm/renderer-three/three';

const CELL_SIZE       = 1.0;
const SECTION_SIZE    = 10.0;
const PLANE_SIZE      = 10000;
const FADE_NEAR       = 30;
const FADE_FAR        = 120;
const CELL_COLOR      = new THREE.Color(0x787878);
const SECTION_COLOR   = new THREE.Color(0x787878);
const CELL_OPACITY    = 0.12;
const SECTION_OPACITY = 0.30;

export class InfiniteGrid3D {
    public readonly mesh: THREE.Mesh;
    private readonly _material: THREE.ShaderMaterial;

    constructor() {
        const geometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, 1, 1);
        geometry.rotateX(-Math.PI / 2);

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                uCellSize:       { value: CELL_SIZE },
                uSectionSize:    { value: SECTION_SIZE },
                uCellColor:      { value: CELL_COLOR },
                uSectionColor:   { value: SECTION_COLOR },
                uCellOpacity:    { value: CELL_OPACITY },
                uSectionOpacity: { value: SECTION_OPACITY },
                uFadeNear:       { value: FADE_NEAR },
                uFadeFar:        { value: FADE_FAR },
            },
            vertexShader: /* glsl */ `
                varying vec3 vWorldPos;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorldPos = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: /* glsl */ `
                varying vec3 vWorldPos;
                uniform float uCellSize;
                uniform float uSectionSize;
                uniform vec3  uCellColor;
                uniform vec3  uSectionColor;
                uniform float uCellOpacity;
                uniform float uSectionOpacity;
                uniform float uFadeNear;
                uniform float uFadeFar;

                float gridLine(vec2 worldXZ, float size) {
                    vec2 coord = worldXZ / size;
                    vec2 grid  = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
                    float line = min(grid.x, grid.y);
                    return 1.0 - min(line, 1.0);
                }

                void main() {
                    vec2 xz = vWorldPos.xz;
                    float cell    = gridLine(xz, uCellSize);
                    float section = gridLine(xz, uSectionSize);
                    float dist = distance(cameraPosition, vWorldPos);
                    float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);
                    if (fade <= 0.0) discard;
                    vec3  color   = mix(uCellColor,   uSectionColor,   section);
                    float opacity = mix(cell * uCellOpacity, uSectionOpacity, section);
                    opacity *= fade;
                    if (opacity < 0.001) discard;
                    gl_FragColor = vec4(color, opacity);
                }
            `,
            transparent:    true,
            depthWrite:     false,
            polygonOffset:  true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits:  -1,
            side:           THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(geometry, this._material);
        this.mesh.name = 'pryzm-infinite-grid-3d';
        this.mesh.renderOrder = -1;
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = true;
    }

    setElevation(y: number): void {
        this.mesh.position.y = y;
        this.mesh.updateMatrix();
        this.mesh.updateMatrixWorld(true);
    }

    setVisible(visible: boolean): void {
        this.mesh.visible = visible;
    }

    get visible(): boolean {
        return this.mesh.visible;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this._material.dispose();
    }
}
