// TEMPORARY - Phase 1 verification only
import { SceneManager } from './renderer/SceneManager.js';
import { ArenaRenderer } from './renderer/ArenaRenderer.js';
import '@babylonjs/core/Helpers/sceneHelpers.js';

function getArenaIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const arenaId = params.get('arena');

  if (!arenaId) {
    return 'raw';
  }

  return arenaId.trim() || 'raw';
}

const canvas = document.getElementById('vpg-canvas');
const sceneManager = new SceneManager(canvas);
const arenaId = getArenaIdFromQuery();

function framePreviewCamera(camera, bounds) {
  const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  const target = bounds.center.clone();

  // Bias slightly upward so the canvas is centered in the preview.
  target.y += bounds.size.y * 0.1;

  camera.setTarget(target);
  camera.radius = Math.max(maxDimension * 1.2, 12);
  camera.lowerRadiusLimit = Math.max(maxDimension * 0.35, 8);
  camera.upperRadiusLimit = Math.max(maxDimension * 3, camera.radius + 10);
}

sceneManager.init();
window._scene = sceneManager.scene;
window._sceneManager = sceneManager;

// PBR materials need environment lighting to be visible
sceneManager.scene.createDefaultEnvironment({
  createGround: false,
  createSkybox: false,
});

const arena = new ArenaRenderer();
arena.init(sceneManager.scene, arenaId).then(() => {
  const ringBounds = arena.getRingBounds();
  if (ringBounds) {
    framePreviewCamera(sceneManager.camera, ringBounds);
    console.log('ArenaRenderer: ring bounds', {
      min: ringBounds.min.asArray(),
      max: ringBounds.max.asArray(),
      size: ringBounds.size.asArray(),
      center: ringBounds.center.asArray(),
    });
  }

  console.log(`ArenaRenderer: loaded arena "${arenaId}" successfully`);
}).catch((err) => {
  console.error(`ArenaRenderer: failed to load arena "${arenaId}"`, err);
});

sceneManager.run();
