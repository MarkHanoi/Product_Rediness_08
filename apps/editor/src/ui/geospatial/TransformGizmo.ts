import * as Cesium from "cesium";

export enum GizmoMode {
  TRANSLATE,
  ROTATE
}

export class TransformGizmo {
  private viewer: Cesium.Viewer;
  private primitives: Cesium.PrimitiveCollection;
  private mode: GizmoMode = GizmoMode.TRANSLATE;
  private model: Cesium.Model | null = null;
  private gizmoPrimitives: Cesium.Primitive[] = [];
  
  private activeAxis: string | null = null;
  private isDragging: boolean = false;
  private lastMousePosition: Cesium.Cartesian2 = new Cesium.Cartesian2();

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(viewer: Cesium.Viewer, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this.viewer = viewer;
    this.primitives = new Cesium.PrimitiveCollection();
    this.viewer.scene.primitives.add(this.primitives);
    this.setupEvents();
  }

  public attach(model: Cesium.Model | null) {
    this.model = model;
    this.updateGizmoVisibility();
    if (model) {
      this.render();
    }
  }

  private updateGizmoVisibility() {
    this.primitives.removeAll();
    this.gizmoPrimitives = [];
    if (this.model) {
      this.render();
    }
  }

  private render() {
    if (!this.model) return;
    const position = Cesium.Matrix4.getTranslation(this.model.modelMatrix, new Cesium.Cartesian3());
    const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);

    // Render both gizmos at the same location, visibility controlled by mode
    if (this.mode === GizmoMode.TRANSLATE) {
      this.createArrow(enuMatrix, Cesium.Cartesian3.UNIT_X, Cesium.Color.RED, "X");
      this.createArrow(enuMatrix, Cesium.Cartesian3.UNIT_Y, Cesium.Color.GREEN, "Y");
      this.createArrow(enuMatrix, Cesium.Cartesian3.UNIT_Z, Cesium.Color.BLUE, "Z");
    } else if (this.mode === GizmoMode.ROTATE) {
      this.createRing(enuMatrix, Cesium.Cartesian3.UNIT_X, Cesium.Color.RED, "X");
      this.createRing(enuMatrix, Cesium.Cartesian3.UNIT_Y, Cesium.Color.GREEN, "Y");
      this.createRing(enuMatrix, Cesium.Cartesian3.UNIT_Z, Cesium.Color.BLUE, "Z");
    }
  }

  private createArrow(enuMatrix: Cesium.Matrix4, direction: Cesium.Cartesian3, color: Cesium.Color, id: string) {
    const length = 10.0;
    const endPoint = Cesium.Matrix4.multiplyByPoint(
      enuMatrix,
      Cesium.Cartesian3.multiplyByScalar(direction, length, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const startPoint = Cesium.Matrix4.getTranslation(enuMatrix, new Cesium.Cartesian3());

    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions: [startPoint, endPoint],
          width: 5.0,
          vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
        },
        id: `gizmo-arrow-${id}`
      }),
      appearance: new Cesium.PolylineColorAppearance(),
      asynchronous: false
    });

    this.primitives.add(primitive);
    this.gizmoPrimitives.push(primitive);
  }

  private createRing(enuMatrix: Cesium.Matrix4, axis: Cesium.Cartesian3, color: Cesium.Color, id: string) {
    // Basic ring implementation using polyline for simplicity
    const radius = 8.0;
    const points = [];
    for (let i = 0; i <= 360; i += 10) {
      const angle = Cesium.Math.toRadians(i);
      let localPos;
      if (axis.equals(Cesium.Cartesian3.UNIT_X)) {
        localPos = new Cesium.Cartesian3(0, Math.cos(angle) * radius, Math.sin(angle) * radius);
      } else if (axis.equals(Cesium.Cartesian3.UNIT_Y)) {
        localPos = new Cesium.Cartesian3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      } else {
        localPos = new Cesium.Cartesian3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      }
      points.push(Cesium.Matrix4.multiplyByPoint(enuMatrix, localPos, new Cesium.Cartesian3()));
    }

    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions: points,
          width: 5.0,
          vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
        },
        id: `gizmo-ring-${id}`
      }),
      appearance: new Cesium.PolylineColorAppearance(),
      asynchronous: false
    });

    this.primitives.add(primitive);
    this.gizmoPrimitives.push(primitive);
  }

  private setupEvents() {
    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    
    handler.setInputAction((movement: any) => {
      const picked = this.viewer.scene.pick(movement.position);
      // FIX A.21.D28#3 — `s.id.startsWith is not a function`. `picked.id` is only
      // a string for the gizmo PRIMITIVES (which set `id: "gizmo-…"`); for a
      // Cesium Entity (e.g. a Forma massing/slab/furniture polygon or the parcel
      // boundary) `picked.id` is the Entity OBJECT, and for some primitives it is
      // a number/undefined. Calling `.startsWith` on a non-string threw on every
      // LEFT_DOWN over the massing, aborting the handler. Guard on the type.
      const pickedId: unknown = Cesium.defined(picked) ? (picked as { id?: unknown }).id : undefined;
      if (typeof pickedId === "string" && pickedId.startsWith("gizmo-")) {
        this.activeAxis = pickedId.split("-").pop();
        this.isDragging = true;
        this.lastMousePosition = Cesium.Cartesian2.clone(movement.position);
        this.viewer.scene.screenSpaceCameraController.enableInputs = false;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement: any) => {
      if (!this.isDragging || !this.model || !this.activeAxis) return;

      const deltaX = movement.endPosition.x - this.lastMousePosition.x;
      const deltaY = movement.endPosition.y - this.lastMousePosition.y;
      
      const sensitivity = 0.5;
      
      if (this.mode === GizmoMode.TRANSLATE) {
        const translation = new Cesium.Cartesian3();
        if (this.activeAxis === "X") translation.x = deltaX * sensitivity;
        if (this.activeAxis === "Y") translation.y = -deltaY * sensitivity;
        if (this.activeAxis === "Z") translation.z = -deltaY * sensitivity; // Simplified screen to world mapping
        
        this.applyTransform(translation, 0);
      } else {
        const rotation = (deltaX + deltaY) * sensitivity;
        this.applyTransform(Cesium.Cartesian3.ZERO, rotation);
      }

      this.lastMousePosition = Cesium.Cartesian2.clone(movement.endPosition);
      this.updateGizmoVisibility(); // Re-center gizmo
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      this.isDragging = false;
      this.activeAxis = null;
      this.viewer.scene.screenSpaceCameraController.enableInputs = true;
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
  }

  private applyTransform(translation: Cesium.Cartesian3, rotationDelta: number) {
    if (!this.model) return;
    
    const matrix = this.model.modelMatrix;
    const currentPos = Cesium.Matrix4.getTranslation(matrix, new Cesium.Cartesian3());
    const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(currentPos);
    
    const transECEF = Cesium.Matrix4.multiplyByPointAsVector(enuToEcef, translation, new Cesium.Cartesian3());
    const newPos = Cesium.Cartesian3.add(currentPos, transECEF, new Cesium.Cartesian3());
    
    const currentRot = Cesium.Matrix4.getMatrix3(matrix, new Cesium.Matrix3());
    if (rotationDelta !== 0) {
      let rotMatrix;
      if (this.activeAxis === "X") rotMatrix = Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(rotationDelta));
      else if (this.activeAxis === "Y") rotMatrix = Cesium.Matrix3.fromRotationY(Cesium.Math.toRadians(rotationDelta));
      else rotMatrix = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotationDelta));
      
      Cesium.Matrix3.multiply(currentRot, rotMatrix, currentRot);
    }

    const newMatrix = Cesium.Matrix4.fromRotationTranslation(currentRot, newPos);
    this.model.modelMatrix = newMatrix;

    window.runtime?.events?.emit('cesium-model-transformed', { matrix: newMatrix, position: newPos }); // F.events.16
  }

  public setMode(mode: GizmoMode) {
    this.mode = mode;
    this.updateGizmoVisibility();
  }
}