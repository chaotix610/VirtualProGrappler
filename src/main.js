// TEMPORARY - Phase 1 verification only
import { SceneManager } from './renderer/SceneManager.js';
import { ArenaRenderer } from './renderer/ArenaRenderer.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';

const canvas = document.getElementById('vpg-canvas');
const sceneManager = new SceneManager(canvas);

sceneManager.init();
window._scene = sceneManager.scene;
window._sceneManager = sceneManager;

// PBR materials need environment lighting to be visible
sceneManager.scene.createDefaultEnvironment({
  createGround: false,
  createSkybox: false,
});

// Target camera at ring canvas height (~0.45m above ground)
sceneManager.camera.target = new Vector3(0, 0.45, 0);

const arena = new ArenaRenderer();
arena.init(sceneManager.scene, 'raw').then(() => {
  console.log('ArenaRenderer: ring loaded successfully');
}).catch((err) => {
  console.error('ArenaRenderer: failed to load ring', err);
});

sceneManager.run();
