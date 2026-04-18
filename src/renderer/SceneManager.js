import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';

/**
 * Initialises the Babylon.js engine, scene, arc-rotate camera, and basic lighting.
 * Phase 0 deliverable — will be extended in Phase 1 with GLB loading.
 */
export class SceneManager {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = null;
    this.scene = null;
    this.camera = null;
  }

  init() {
    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);

    // Arc-rotate camera centered on ring origin, default orbit distance
    this.camera = new ArcRotateCamera(
      'mainCamera',
      -Math.PI / 2, // alpha — horizontal angle
      Math.PI / 3,  // beta  — vertical angle
      12,           // radius
      Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerRadiusLimit = 4;
    this.camera.upperRadiusLimit = 30;

    // Ambient hemisphere light — N64-style flat shading baseline
    const light = new HemisphericLight('ambientLight', new Vector3(0, 1, 0), this.scene);
    light.intensity = 1.0;

    window.addEventListener('resize', () => this.engine.resize());
  }

  run() {
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });
  }

  dispose() {
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
