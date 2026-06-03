import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { VideoTexture } from '@babylonjs/core/Materials/Textures/videoTexture.js';

// Ensure the glTF / GLB loader plugin is registered for the menu scene asset.
import '@babylonjs/loaders/glTF/2.0/index.js';

const MAIN_MENU_SCENE_GLB_PATH = 'assets/glb/ui/main-menu-scene.glb';
const MAIN_MENU_TV_LOOP_PATH = 'assets/videos/main-menu-tv-loop.mp4';
const CAMERA_TRANSITION_MS = 520;
const BACK_WALL_CAMERA_ALPHA = Math.PI / 1.82 + Math.PI / 2;
const BACK_WALL_CAMERA_BETA = Math.PI / 2.04;

const CAMERA_VIEWS = {
  multiPlay: {
    radius: 4.3,
    targetOffset: new Vector3(-5.8, 0.45, -0.2),
  },
  singlePlay: {
    radius: 5.6,
    targetOffset: new Vector3(-2.3, 0.55, -0.2),
  },
  commissioner: {
    radius: 6.3,
    targetOffset: new Vector3(2.8, 0.65, -0.2),
  },
};

export class MainMenuSceneRenderer {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.meshes = [];
    this.bounds = null;
    this.meshBounds = new Map();
    this.loaded = false;
    this.cameraAnimationFrame = null;
    this.hasFramedOnce = false;
    this.currentPageKey = null;
    this.tvVideoMaterial = null;
    this.tvVideoTexture = null;
  }

  async init(scene, camera) {
    if (this.loaded) return;

    this.scene = scene;
    this.camera = camera;

    const result = await SceneLoader.ImportMeshAsync('', '', MAIN_MENU_SCENE_GLB_PATH, scene);
    this.meshes = result.meshes;
    this.bounds = this._calculateBounds(this.meshes);
    this.meshBounds = this._calculateMeshBounds(this.meshes);
    this._applyTvLoop(scene);
    this.loaded = true;
    this.setActive(false);
  }

  setActive(isActive) {
    for (const mesh of this.meshes) {
      mesh.setEnabled?.(isActive);
    }
  }

  show(pageKey) {
    if (!this.loaded) return;

    this.setActive(true);
    this._playTvLoop();
    if (!this.hasFramedOnce) {
      this.snapCamera(pageKey);
      this.hasFramedOnce = true;
      this.currentPageKey = pageKey;
      return;
    }

    this.frameCamera(pageKey);
  }

  hide() {
    this.tvVideoTexture?.video?.pause();
    this.setActive(false);
  }

  frameCamera(pageKey = 'singlePlay') {
    if (!this.camera || !this.bounds) return;
    if (pageKey === this.currentPageKey) return;

    const { view, target } = this._resolveCameraView(pageKey);
    const maxDimension = Math.max(this.bounds.size.x, this.bounds.size.y, this.bounds.size.z);
    const radius = view.radius ?? Math.max(maxDimension * view.radiusScale, 18);

    this.camera.lowerRadiusLimit = Math.max(Math.min(maxDimension * 0.38, radius * 0.72), 1.2);
    this.camera.upperRadiusLimit = Math.max(maxDimension * 2.4, radius + 8);
    this._animateCameraTo({
      alpha: BACK_WALL_CAMERA_ALPHA,
      beta: BACK_WALL_CAMERA_BETA,
      radius,
      target,
    });
    this.currentPageKey = pageKey;
  }

  _animateCameraTo({ alpha, beta, radius, target }) {
    if (this.cameraAnimationFrame) {
      cancelAnimationFrame(this.cameraAnimationFrame);
    }

    const start = {
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius,
      target: this.camera.target.clone(),
    };
    const startedAt = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startedAt) / CAMERA_TRANSITION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.camera.alpha = this._lerp(start.alpha, alpha, eased);
      this.camera.beta = this._lerp(start.beta, beta, eased);
      this.camera.radius = this._lerp(start.radius, radius, eased);
      this.camera.setTarget(Vector3.Lerp(start.target, target, eased));

      if (progress < 1) {
        this.cameraAnimationFrame = requestAnimationFrame(step);
      } else {
        this.cameraAnimationFrame = null;
      }
    };

    this.cameraAnimationFrame = requestAnimationFrame(step);
  }

  _lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  _resolveCameraView(pageKey = 'singlePlay') {
    const view = CAMERA_VIEWS[pageKey] ?? CAMERA_VIEWS.singlePlay;
    const wallBack = this.meshBounds.get('wall_back');
    const baseTarget = wallBack?.center ?? this.bounds.center;

    return {
      view,
      target: baseTarget.add(view.targetOffset),
    };
  }

  _applyTvLoop(scene) {
    const tvScreen = this.meshes.find((mesh) => mesh.name === 'tv_screen');

    if (!tvScreen) {
      console.warn('Main menu TV screen mesh was not found.');
      return;
    }

    const videoTexture = new VideoTexture(
      'main-menu-tv-loop',
      MAIN_MENU_TV_LOOP_PATH,
      scene,
      false,
      false,
      Texture.NEAREST_SAMPLINGMODE,
      {
        autoPlay: true,
        loop: true,
        muted: true,
        autoUpdateTexture: true,
      },
      (message, exception) => {
        console.warn('Main menu TV loop failed to load.', message, exception);
      },
    );

    videoTexture.video.playsInline = true;
    videoTexture.video.muted = true;
    videoTexture.video.loop = true;
    videoTexture.video.setAttribute('playsinline', '');
    videoTexture.video.addEventListener('canplay', () => this._playTvLoop(), { once: true });
    videoTexture.video.addEventListener('error', () => {
      console.warn('Main menu TV loop video element failed.', videoTexture.video.error);
    });

    const material = new StandardMaterial('mat_screen_video', scene);
    material.diffuseTexture = videoTexture;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.specularColor = Color3.Black();

    tvScreen.material = material;
    this.tvVideoMaterial = material;
    this.tvVideoTexture = videoTexture;
  }

  _playTvLoop() {
    const video = this.tvVideoTexture?.video;
    if (!video || !video.paused) return;

    video.play().catch((error) => {
      console.warn('Main menu TV loop playback was blocked.', error);
    });
  }

  snapCamera(pageKey = 'singlePlay') {
    if (!this.camera || !this.bounds) return;

    const { view, target } = this._resolveCameraView(pageKey);
    const maxDimension = Math.max(this.bounds.size.x, this.bounds.size.y, this.bounds.size.z);
    const radius = view.radius ?? Math.max(maxDimension * view.radiusScale, 18);

    this.camera.alpha = BACK_WALL_CAMERA_ALPHA;
    this.camera.beta = BACK_WALL_CAMERA_BETA;
    this.camera.radius = radius;
    this.camera.lowerRadiusLimit = Math.max(Math.min(maxDimension * 0.38, radius * 0.72), 1.2);
    this.camera.upperRadiusLimit = Math.max(maxDimension * 2.4, radius + 8);
    this.camera.setTarget(target);
    this.currentPageKey = pageKey;
  }

  dispose() {
    if (this.cameraAnimationFrame) {
      cancelAnimationFrame(this.cameraAnimationFrame);
      this.cameraAnimationFrame = null;
    }

    this.tvVideoTexture?.video?.pause();
    this.tvVideoTexture?.dispose();
    this.tvVideoMaterial?.dispose();
    this.tvVideoMaterial = null;
    this.tvVideoTexture = null;

    for (const mesh of this.meshes) {
      mesh.dispose?.();
    }

    this.meshes = [];
    this.bounds = null;
    this.meshBounds = new Map();
    this.loaded = false;
    this.hasFramedOnce = false;
    this.currentPageKey = null;
    this.scene = null;
    this.camera = null;
  }

  _calculateBounds(meshes) {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let foundGeometry = false;

    for (const mesh of meshes) {
      if (!mesh?.getBoundingInfo || !mesh?.getTotalVertices || mesh.getTotalVertices() === 0) {
        continue;
      }

      mesh.computeWorldMatrix?.(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bounds.minimumWorld);
      max = Vector3.Maximize(max, bounds.maximumWorld);
      foundGeometry = true;
    }

    if (!foundGeometry) return null;

    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);
    return { min, max, center, size };
  }

  _calculateMeshBounds(meshes) {
    const bounds = new Map();

    for (const mesh of meshes) {
      if (!mesh?.name || !mesh?.getBoundingInfo || !mesh?.getTotalVertices || mesh.getTotalVertices() === 0) {
        continue;
      }

      mesh.computeWorldMatrix?.(true);
      const boundingBox = mesh.getBoundingInfo().boundingBox;
      const min = boundingBox.minimumWorld.clone();
      const max = boundingBox.maximumWorld.clone();
      const center = min.add(max).scale(0.5);
      const size = max.subtract(min);
      bounds.set(mesh.name, { min, max, center, size });
    }

    return bounds;
  }
}
