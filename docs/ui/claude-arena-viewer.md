# Claude Implementation Notes: Arena Viewer

Use this document to recreate the Arena Viewer in a newer version of Virtual Pro Grappler.

Context for the newer product:

- The menu system and controls mapper already exist.
- The combat system tester is new code and unrelated to arena rendering.
- Arena data already exists in `data/arenas`.
- Arena textures already exist in `assets/textures`.
- The arena schema already exists at `data/schemas/arenas.schemas.json` or similar. If the filename is `arenas.schemas.json`, keep that name unless the project already standardizes on `arenas.schema.json`.
- Nothing else for arenas is implemented yet.

The Arena Viewer should live under:

```text
Main Menu -> Commissioner -> Arena Viewer
```

## Required Assets

The arena JSON files reference textures, but the renderer also needs GLB geometry. The new product already has a newer ring with elastic ropes; use that ring as the required ring asset. Do not copy this older product's `assets/glb/ring/ring-standard.glb` over it.

Use the new project's elastic-rope ring GLB path as `RING_GLB_PATH`. If the exact filename is different, keep the actual filename from the new project and update the constant accordingly.

Copy or recreate these arena support GLBs from this product only if they are not already present in the new project:

```text
assets/glb/arena/ring-steps.glb
assets/glb/arena/arena-floor.glb
assets/glb/arena/barricade.glb
```

If any `data/arenas/*.json` file references more `arenaParts`, copy those referenced GLBs too.

Expected important texture folders:

```text
assets/textures/arena
assets/textures/arena/previews
assets/textures/ring
assets/textures/ring/shared
```

## Dependencies

Install Babylon runtime packages if they are not already present:

```bash
npm install @babylonjs/core @babylonjs/loaders
```

The renderer depends on the glTF/GLB loader side-effect import:

```js
import '@babylonjs/loaders/glTF/2.0/index.js';
```

## Arena JSON Shape

Each arena file should be loaded by arena id, matching the filename:

```text
data/arenas/raw.json -> arena id "raw"
```

Representative arena file:

```json
{
  "id": "raw",
  "displayName": "RAW is WAR",
  "previewImage": "assets/textures/arena/previews/preview-rawiswar.png",
  "arenaParts": [
    "assets/glb/arena/arena-floor.glb",
    "assets/glb/arena/barricade.glb"
  ],
  "arenaOverrides": {
    "mat_floor_cut_4x8": "assets/textures/arena/floor_mat_1.png",
    "mat_floor_8x8": "assets/textures/arena/floor_mat_1_double.png",
    "Material_1": "assets/textures/arena/floor_mat_1_double.png"
  },
  "ringOverrides": {
    "mat_canvas": "assets/textures/ring/shared/canvas.png",
    "mat_apron": "assets/textures/ring/apron_raw.png",
    "mat_rope_top": "assets/textures/ring/shared/rope.png",
    "mat_rope_middle": "assets/textures/ring/shared/rope.png",
    "mat_rope_bottom": "assets/textures/ring/shared/rope.png",
    "ropeColor": "rgba(255, 0, 0, 0.4)",
    "postColor": "#000000",
    "turnbucklePadColor": "#FF0000"
  }
}
```

`arenaParts` can contain either strings or objects:

```json
[
  "assets/glb/arena/arena-floor.glb",
  {
    "glb": "assets/glb/arena/barricade.glb",
    "position": [0, 0, 0],
    "rotation": [0, 0, 0]
  }
]
```

Rotation is Euler radians ordered `[x, y, z]`.

## Viewer UX

Create a full-screen Arena Viewer screen opened from the Commissioner menu.

Behavior:

- List all arenas found in `data/arenas`.
- Sort arenas by `displayName`.
- Show the selected arena's preview image.
- Include a `Back` item.
- Pressing A/Enter on an arena loads it into a Babylon canvas.
- Pressing B/Escape from selection returns to Commissioner.
- Pressing B/Escape while an arena scene is open closes the scene and returns to arena selection.
- Once an arena is loaded, hide the selection UI and show only the 3D canvas.

Controls while an arena is open:

```text
Control Stick Up -> rotate camera down
Control Stick Down -> rotate camera up
Control Stick Left -> rotate camera right
Control Stick Right -> rotate camera left
C-Up -> zoom in
C-Down -> zoom out
B -> close arena scene
```

Use the existing virtual input layer from the controls mapper. Do not listen for separate raw arena-viewer keys.

## Menu Integration

Add this item to the existing Commissioner menu data:

```json
{
  "id": "arena_viewer",
  "displayName": "Arena Viewer",
  "target": "commissioner.arena_viewer",
  "instructions": {
    "title": "<< Arena Viewer >>",
    "blocks": [
      {
        "type": "paragraph",
        "text": "View the arenas currently available in VPG."
      }
    ]
  }
}
```

Route it from the menu shell:

```js
function openActiveTarget() {
  const item = getActiveItem();

  if (item.target === 'commissioner.arena_viewer') {
    showScreen('arena-viewer');
    return;
  }

  // existing routes...
}
```

When returning from Arena Viewer, return to the Commissioner menu, not the root menu, if the newer product tracks menu history.

## Scene Manager

Create a small Babylon scene manager. Initialize lazily when the first arena is opened.

```js
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = null;
    this.scene = null;
    this.camera = null;
  }

  init() {
    if (this.engine) return;

    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);

    this.camera = new ArcRotateCamera(
      'mainCamera',
      -Math.PI / 2,
      Math.PI / 2.6,
      18,
      Vector3.Zero(),
      this.scene
    );

    this.camera.attachControl(this.canvas, true);
    this.camera.lowerBetaLimit = Math.PI / 6;
    this.camera.upperBetaLimit = Math.PI / 2.2;
    this.camera.lowerRadiusLimit = 8;
    this.camera.upperRadiusLimit = 30;

    const light = new HemisphericLight('ambientLight', new Vector3(0, 1, 0), this.scene);
    light.intensity = 1.0;

    window.addEventListener('resize', () => this.engine.resize());
  }

  run() {
    if (!this.engine || !this.scene) return;
    this.engine.runRenderLoop(() => this.scene.render());
  }

  dispose() {
    this.engine?.stopRenderLoop();
    this.scene?.dispose();
    this.engine?.dispose();
    this.engine = null;
    this.scene = null;
    this.camera = null;
  }
}
```

## Data Loading

Use the framework's normal JSON import/fetch approach. In Vite, eager glob imports work well for the arena list:

```js
const arenaModules = import.meta.glob('../data/arenas/*.json', {
  eager: true,
  import: 'default',
});

function getAvailableArenas() {
  return Object.entries(arenaModules)
    .map(([path, data]) => ({
      id: path.split('/').pop()?.replace(/\.json$/i, '') ?? data.id,
      displayName: data.displayName ?? data.id,
      previewImage: data.previewImage,
    }))
    .filter((arena) => arena.id && arena.displayName)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function loadArenaJson(arenaId) {
  const response = await fetch(`data/arenas/${arenaId}.json`);
  if (!response.ok) {
    throw new Error(`Failed to load arena data: ${arenaId}`);
  }
  return response.json();
}
```

If the newer product has schema validation wired up, validate each arena file against `data/schemas/arenas.schemas.json` before rendering.

## Arena Renderer

Create `ArenaRenderer` to assemble:

```text
the new project's elastic-rope ring GLB
+ two ring-steps.glb instances
+ arenaParts from data/arenas/{arenaId}.json
+ material overrides from arenaOverrides and ringOverrides
```

Core implementation:

```js
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import '@babylonjs/loaders/glTF/2.0/index.js';

// Use the new project's ring with elastic ropes here.
// Example only: replace this with the actual path/filename in the new project.
const RING_GLB_PATH = 'assets/glb/ring/ring-elastic-ropes.glb';
const RING_STEPS_GLB_PATH = 'assets/glb/arena/ring-steps.glb';

const RING_STEPS_PLACEMENTS = [
  {
    corner: 'ne',
    position: [3.7936058044433594, 0.675000011920929, -3.80749249458313],
    rotation: [0.27059805393218994, 0.6532813310623169, -0.6532816290855408, 0.2705979645252228],
  },
  {
    corner: 'sw',
    position: [-3.5595788955688477, 0.675000011920929, 3.2128915786743164],
    rotation: [0.6532816290855408, -0.27059799432754517, 0.2705981135368347, 0.6532813310623169],
  },
];

export class ArenaRenderer {
  constructor(materialManager, loadArenaJson) {
    this.materialManager = materialManager;
    this.loadArenaJson = loadArenaJson;
    this.scene = null;
    this.ringMeshes = [];
    this.ringStepsMeshes = [];
    this.arenaMeshes = [];
    this.arenaData = null;
  }

  async init(scene, arenaId) {
    this.scene = scene;
    this.arenaData = await this.loadArenaJson(arenaId);

    const ringResult = await SceneLoader.ImportMeshAsync('', '', RING_GLB_PATH, scene);
    this.ringMeshes = ringResult.meshes;
    const ringRoot = this.findRoot(this.ringMeshes);
    if (ringRoot) ringRoot.position = new Vector3(0, 0, 0);

    for (const placement of this.ringStepsPlacements()) {
      const stepsResult = await SceneLoader.ImportMeshAsync('', '', RING_STEPS_GLB_PATH, scene);
      this.applyRingStepsTransform(stepsResult.meshes, placement);
      this.ringStepsMeshes.push(...stepsResult.meshes);
    }

    for (const part of this.getArenaPartDefs(this.arenaData)) {
      const arenaResult = await SceneLoader.ImportMeshAsync('', '', part.glb, scene);
      this.applyPartTransform(arenaResult.meshes, part);
      this.arenaMeshes.push(...arenaResult.meshes);
    }

    if (this.arenaData.ringOverrides) {
      await this.materialManager.applyRingOverrides(
        this.ringMeshes,
        this.arenaData.ringOverrides,
        scene,
        Texture
      );
    }

    if (this.arenaData.arenaOverrides) {
      await this.materialManager.applyMaterialOverrides(
        this.arenaMeshes,
        this.arenaData.arenaOverrides,
        scene,
        Texture
      );
    }
  }

  dispose() {
    this.disposeMeshes(this.ringMeshes);
    this.disposeMeshes(this.ringStepsMeshes);
    this.disposeMeshes(this.arenaMeshes);
    this.ringMeshes = [];
    this.ringStepsMeshes = [];
    this.arenaMeshes = [];
    this.arenaData = null;
    this.scene = null;
  }

  getRingBounds() {
    return this.calculateBounds(this.ringMeshes);
  }

  getArenaBounds() {
    return this.calculateBounds([
      ...this.ringMeshes,
      ...this.ringStepsMeshes,
      ...this.arenaMeshes,
    ]);
  }

  findRoot(meshes) {
    return meshes.find((mesh) => !mesh.parent) ?? meshes[0] ?? null;
  }

  getArenaPartDefs(arenaData) {
    if (Array.isArray(arenaData?.arenaParts)) {
      return arenaData.arenaParts.map((part) => this.normalizeArenaPart(part)).filter(Boolean);
    }

    if (typeof arenaData?.arenaGlb === 'string' && arenaData.arenaGlb.length > 0) {
      return [{ glb: arenaData.arenaGlb, position: Vector3.Zero(), rotation: Vector3.Zero() }];
    }

    return [];
  }

  normalizeArenaPart(part) {
    if (typeof part === 'string' && part.length > 0) {
      return { glb: part, position: Vector3.Zero(), rotation: Vector3.Zero() };
    }

    if (!part || typeof part !== 'object' || typeof part.glb !== 'string') {
      return null;
    }

    return {
      glb: part.glb,
      position: this.toVector3(part.position),
      rotation: this.toVector3(part.rotation),
    };
  }

  applyPartTransform(meshes, part) {
    for (const mesh of meshes) {
      if (!mesh || mesh.parent || !mesh.position?.addInPlace) continue;

      if (part.rotation && (part.rotation.x || part.rotation.y || part.rotation.z)) {
        if (mesh.rotationQuaternion) {
          const placementRotation = Quaternion.RotationYawPitchRoll(
            part.rotation.y,
            part.rotation.x,
            part.rotation.z
          );
          mesh.rotationQuaternion = placementRotation.multiply(mesh.rotationQuaternion);
        } else {
          mesh.rotation?.addInPlace?.(part.rotation);
        }
      }

      if (part.position && (part.position.x || part.position.y || part.position.z)) {
        mesh.position.addInPlace(part.position);
      }
    }
  }

  ringStepsPlacements() {
    return RING_STEPS_PLACEMENTS.map((placement) => ({
      corner: placement.corner,
      position: new Vector3(...placement.position),
      rotation: new Quaternion(...placement.rotation),
    }));
  }

  applyRingStepsTransform(meshes, placement) {
    const target = meshes.find((mesh) => mesh?.name === 'ring-steps');
    if (!target) return;

    target.position.set(placement.position.x, placement.position.y, placement.position.z);
    target.rotationQuaternion = placement.rotation.clone();
  }

  toVector3(value) {
    if (Array.isArray(value) && value.length === 3) {
      return new Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    }
    return Vector3.Zero();
  }

  calculateBounds(meshes) {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let foundGeometry = false;

    for (const mesh of meshes) {
      if (!mesh?.getBoundingInfo || !mesh?.getTotalVertices || mesh.getTotalVertices() === 0) {
        continue;
      }

      mesh.computeWorldMatrix?.(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld);
      max = Vector3.Maximize(max, box.maximumWorld);
      foundGeometry = true;
    }

    if (!foundGeometry) return null;
    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);
    return { min, max, center, size };
  }

  disposeMeshes(meshes) {
    for (const mesh of meshes) {
      mesh.material?.dispose?.();
      mesh.dispose?.();
    }
  }
}
```

## Material Overrides

Implement a `MaterialManager` with these minimum methods:

```js
export class MaterialManager {
  async applyMaterialOverrides(meshes, overrides, scene, TextureClass) {
    const materialMap = this.buildMaterialMap(meshes);

    for (const [materialName, texturePath] of Object.entries(overrides ?? {})) {
      if (typeof texturePath !== 'string' || texturePath.length === 0) continue;
      const material = materialMap.get(materialName);
      if (!material) {
        console.warn(`Arena material not found: ${materialName}`);
        continue;
      }
      this.swapTexture(material, texturePath, scene, TextureClass);
    }
  }

  async applyRingOverrides(meshes, overrides, scene, TextureClass) {
    const materialMap = this.buildMaterialMap(meshes);

    for (const [materialName, value] of Object.entries(overrides ?? {})) {
      if (materialName.endsWith('Color')) continue;
      const material = materialMap.get(materialName);
      if (!material) continue;

      if (typeof value === 'string') {
        this.swapTexture(material, value, scene, TextureClass);
      }
    }

    this.applyColorOverride(materialMap.get('mat_post'), overrides.postColor);
    this.applyColorOverride(materialMap.get('mat_turnbuckle'), overrides.turnbucklePadColor);
  }

  swapTexture(material, texturePath, scene, TextureClass) {
    const texture = new TextureClass(texturePath, scene, undefined, false);

    if ('albedoTexture' in material) {
      material.albedoTexture = texture;
    } else {
      material.diffuseTexture = texture;
    }
  }

  applyColorOverride(material, cssColor) {
    if (!material || typeof cssColor !== 'string') return;
    const color = this.cssColorToRgb(cssColor);

    if ('albedoColor' in material) {
      material.albedoColor.r = color.r;
      material.albedoColor.g = color.g;
      material.albedoColor.b = color.b;
    } else if ('diffuseColor' in material) {
      material.diffuseColor.r = color.r;
      material.diffuseColor.g = color.g;
      material.diffuseColor.b = color.b;
    }
  }

  buildMaterialMap(meshes) {
    const map = new Map();
    for (const mesh of meshes) {
      const material = mesh.material;
      if (!material) continue;

      if (Array.isArray(material.subMaterials)) {
        for (const sub of material.subMaterials) {
          if (sub?.name) map.set(sub.name, sub);
        }
      } else if (material.name) {
        map.set(material.name, material);
      }
    }
    return map;
  }

  cssColorToRgb(cssColor) {
    if (cssColor.startsWith('#')) {
      return this.hexToRgb(cssColor);
    }

    const rgba = cssColor.match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([01]?\.\d+|0|1))?\s*\)$/i
    );

    if (rgba) {
      return {
        r: Math.min(Number(rgba[1]), 255) / 255,
        g: Math.min(Number(rgba[2]), 255) / 255,
        b: Math.min(Number(rgba[3]), 255) / 255,
      };
    }

    return { r: 1, g: 1, b: 1 };
  }

  hexToRgb(cssColor) {
    const hex = cssColor.replace(/^#/, '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = parseInt(full, 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }
}
```

For closer parity with this product, add support for:

- `ropeColor`
- `ropeTopColor`
- `ropeMiddleColor`
- `ropeBottomColor`
- `canvasColor`
- `postColor`
- `turnbucklePadColor`

The parity implementation composites rope/canvas color over texture paths using a temporary `<canvas>` and then creates a Babylon `Texture` from the resulting data URL. That can be added after the basic viewer is working.

Important texture detail:

```js
new Texture(texturePath, scene, undefined, false);
```

The final `false` keeps `invertY` disabled, matching glTF/GLB UV convention.

## Viewer State And Loading

Recommended state:

```js
const state = {
  screen: 'main-menu',
  arenaIndex: 0,
  arenaId: 'raw',
  arenaSceneOpen: false,
};
```

Load arena:

```js
let loadToken = 0;

async function loadArena(arenaId) {
  const token = ++loadToken;
  state.arenaId = arenaId;
  state.arenaSceneOpen = true;
  canvas.dataset.active = 'true';
  updateArenaPage();

  try {
    sceneManager.init();
    sceneManager.run();

    arenaRenderer.dispose();
    await arenaRenderer.init(sceneManager.scene, arenaId);

    if (token !== loadToken) return;

    const bounds = arenaRenderer.getRingBounds() ?? arenaRenderer.getArenaBounds();
    if (bounds) framePreviewCamera(sceneManager.camera, bounds);

    updateArenaPage();
  } catch (error) {
    state.arenaSceneOpen = false;
    canvas.dataset.active = 'false';
    updateArenaPage();
    console.error(`Failed to load arena "${arenaId}"`, error);
  }
}
```

Close arena:

```js
function closeArenaScene() {
  loadToken += 1;
  arenaRenderer.dispose();
  state.arenaSceneOpen = false;
  canvas.dataset.active = 'false';
  updateArenaPage();
}
```

Camera framing:

```js
function framePreviewCamera(camera, bounds) {
  const maxDimension = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
  const target = bounds.center.clone();
  target.y += bounds.size.y * 0.1;

  camera.setTarget(target);
  camera.radius = Math.max(maxDimension * 1.2, 12);
  camera.lowerRadiusLimit = Math.max(maxDimension * 0.35, 8);
  camera.upperRadiusLimit = Math.max(maxDimension * 3, camera.radius + 10);
}
```

Camera controls:

```js
const ARENA_VIEW_ROTATION_STEP = Math.PI / 48;
const ARENA_VIEW_ZOOM_STEP = 1.2;

function moveArenaCamera(input) {
  const camera = sceneManager.camera;

  if (input === 'stickUp') {
    camera.beta = clamp(camera.beta + ARENA_VIEW_ROTATION_STEP, camera.lowerBetaLimit, camera.upperBetaLimit);
  } else if (input === 'stickDown') {
    camera.beta = clamp(camera.beta - ARENA_VIEW_ROTATION_STEP, camera.lowerBetaLimit, camera.upperBetaLimit);
  } else if (input === 'stickLeft') {
    camera.alpha -= ARENA_VIEW_ROTATION_STEP;
  } else if (input === 'stickRight') {
    camera.alpha += ARENA_VIEW_ROTATION_STEP;
  } else if (input === 'cUp') {
    camera.radius = clamp(camera.radius - ARENA_VIEW_ZOOM_STEP, camera.lowerRadiusLimit, camera.upperRadiusLimit);
  } else if (input === 'cDown') {
    camera.radius = clamp(camera.radius + ARENA_VIEW_ZOOM_STEP, camera.lowerRadiusLimit, camera.upperRadiusLimit);
  }
}

function clamp(value, lowerLimit, upperLimit) {
  const lower = lowerLimit ?? -Infinity;
  const upper = upperLimit ?? Infinity;
  return Math.min(Math.max(value, lower), upper);
}
```

Arena input handler:

```js
function handleArenaViewerInput(input, event) {
  if (state.arenaSceneOpen) {
    if (input === 'b') {
      event.preventDefault();
      closeArenaScene();
      return;
    }

    if (['stickUp', 'stickDown', 'stickLeft', 'stickRight', 'cUp', 'cDown'].includes(input)) {
      event.preventDefault();
      moveArenaCamera(input);
    }
    return;
  }

  const itemCount = arenaItems.length;

  if (['up', 'down', 'left', 'right'].includes(input)) {
    event.preventDefault();
    const direction = input === 'up' || input === 'left' ? -1 : 1;
    state.arenaIndex = (state.arenaIndex + direction + itemCount) % itemCount;
    updateArenaPage();
    return;
  }

  if (input === 'a') {
    event.preventDefault();
    if (state.arenaIndex === arenas.length) {
      closeArenaViewerToCommissioner();
      return;
    }
    loadArena(arenas[state.arenaIndex].id);
    return;
  }

  if (input === 'b') {
    event.preventDefault();
    closeArenaViewerToCommissioner();
  }
}
```

`closeArenaViewerToCommissioner()` should hide the Arena Viewer screen and restore the active menu page to `Commissioner`.

## Minimal DOM/CSS Requirements

DOM:

```html
<div id="app"></div>
<canvas id="vpg-canvas" data-active="false"></canvas>
```

Canvas CSS:

```css
#vpg-canvas {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  display: block;
  touch-action: none;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 160ms ease, visibility 160ms ease;
  z-index: 1;
}

#vpg-canvas[data-active="true"] {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
```

Arena screen CSS:

```css
.arena-page {
  position: fixed;
  inset: 0;
  z-index: 4;
  overflow: auto;
}

.arena-page[data-active="false"] {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.arena-page[data-mode="scene"] {
  background: transparent;
  pointer-events: none;
}

.arena-page[data-mode="scene"] .arena-select-layout {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.arena-select-layout {
  display: grid;
  grid-template-columns: minmax(250px, 30vw) minmax(320px, 1fr);
  gap: clamp(24px, 5vw, 72px);
}

.arena-preview-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}
```

## Acceptance Criteria

- Commissioner menu includes `Arena Viewer`.
- Arena Viewer lists all valid files from `data/arenas`.
- Selecting an arena shows its preview image before loading.
- Opening an arena loads the new project's elastic-rope ring GLB, two positioned `ring-steps.glb` instances, and every GLB listed in `arenaParts`.
- `arenaOverrides` apply to environment material names.
- `ringOverrides` apply to ring textures and basic colors.
- The camera frames the ring or arena after load.
- Control stick rotates the camera.
- C-Up/C-Down zooms.
- B/Escape closes the loaded scene or backs out from arena selection.
- Missing optional GLB parts should warn and continue where practical; missing ring GLB should fail visibly.
- The Arena Viewer uses the existing menu/control mapper virtual input layer.
