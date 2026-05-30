import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';

// Ensure the glTF / GLB loader plugin is registered.
import '@babylonjs/loaders/glTF/2.0/index.js';

import { loadJSON } from '../data/DataLoader.js';
import { MaterialManager } from './MaterialManager.js';

const RING_GLB_PATH = 'assets/glb/ring/ring-standard.glb';
const RING_STEPS_GLB_PATH = 'assets/glb/arena/ring-steps.glb';

// Local-frame TRS values lifted verbatim from the two `ring-steps` nodes inside
// ring-with-steps.glb. Overriding the loaded node's TRS with these values
// reproduces the exact placement seen in that reference scene (steps butted up
// against the ring at the NE and SW corners, treads facing outward).
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

/**
 * ArenaRenderer — loads a ring GLB plus zero or more arena environment GLBs,
 * positions them in the scene, and applies per-arena ring material overrides.
 *
 * All paths and material names come from the arena JSON file at
 * `data/arenas/{arenaId}.json` — nothing is hardcoded.
 *
 * Lifecycle:
 *   const arena = new ArenaRenderer();
 *   await arena.init(scene, 'raw');
 *   // … later …
 *   arena.dispose();
 */
export class ArenaRenderer {
  constructor() {
    /** @type {object|null} Babylon.js Scene */
    this.scene = null;

    /** @type {object[]} all meshes loaded for the ring GLB */
    this.ringMeshes = [];

    /** @type {object[]} meshes loaded for the NE/SW ring-steps instances */
    this.ringStepsMeshes = [];

    /** @type {object[]} all meshes loaded for the arena GLBs */
    this.arenaMeshes = [];

    /** @type {object|null} parsed arena JSON data */
    this.arenaData = null;

    /** @type {MaterialManager} */
    this.materialManager = new MaterialManager();
  }

  /**
   * Load and assemble the ring + arena for the given arena ID.
   *
   * @param {object} scene   — active Babylon.js Scene instance
   * @param {string} arenaId — arena identifier (matches filename in data/arenas/)
   */
  async init(scene, arenaId) {
    this.scene = scene;

    // 1. Load arena definition JSON ──────────────────────────────
    this.arenaData = await loadJSON(`data/arenas/${arenaId}.json`);

    // 2. Load the ring GLB ───────────────────────────────────────
    const ringResult = await SceneLoader.ImportMeshAsync(
      '',                        // meshNames — empty string = all meshes
      '',                        // rootUrl — empty, path is fully qualified
      RING_GLB_PATH,
      scene
    );

    this.ringMeshes = ringResult.meshes;

    // Position ring root at world origin
    const ringRoot = this._findRoot(this.ringMeshes);
    if (ringRoot) {
      ringRoot.position = new Vector3(0, 0, 0);
    }

    // 3. Load NE + SW ring-steps instances ───────────────────────
    for (const placement of this._ringStepsPlacements()) {
      try {
        const stepsResult = await SceneLoader.ImportMeshAsync(
          '',
          '',
          RING_STEPS_GLB_PATH,
          scene
        );
        this._applyRingStepsTransform(stepsResult.meshes, placement);
        this.ringStepsMeshes.push(...stepsResult.meshes);
      } catch (err) {
        console.warn(
          `ArenaRenderer: failed to load ring-steps GLB "${RING_STEPS_GLB_PATH}" ` +
          `for ${placement.corner} corner.\n${err.message}`
        );
      }
    }

    // 4. Load the arena environment GLBs (if specified) ──────────
    const arenaParts = this._getArenaPartDefs(this.arenaData);
    for (const part of arenaParts) {
      try {
        const arenaResult = await SceneLoader.ImportMeshAsync('', '', part.glb, scene);
        this._applyPartTransform(arenaResult.meshes, part);
        this.arenaMeshes.push(...arenaResult.meshes);
      } catch (err) {
        console.warn(
          `ArenaRenderer: failed to load arena GLB "${part.glb}" — ` +
          `continuing without that environment piece.\n${err.message}`
        );
      }
    }

    // 5. Apply material overrides from arena JSON ────────────────
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

  /**
   * Tear down all loaded meshes and materials for this arena.
   * Safe to call multiple times.
   */
  dispose() {
    this._disposeMeshes(this.ringMeshes);
    this._disposeMeshes(this.ringStepsMeshes);
    this._disposeMeshes(this.arenaMeshes);

    this.ringMeshes = [];
    this.ringStepsMeshes = [];
    this.arenaMeshes = [];
    this.arenaData = null;
    this.scene = null;
  }

  /**
   * Calculate world-space bounds for the currently loaded ring meshes.
   *
   * @returns {{ min: Vector3, max: Vector3, center: Vector3, size: Vector3 } | null}
   */
  getRingBounds() {
    return this._calculateBounds(this.ringMeshes);
  }

  /**
   * Calculate world-space bounds for all loaded environment and ring meshes.
   *
   * @returns {{ min: Vector3, max: Vector3, center: Vector3, size: Vector3 } | null}
   */
  getArenaBounds() {
    return this._calculateBounds([
      ...this.ringMeshes,
      ...this.ringStepsMeshes,
      ...this.arenaMeshes,
    ]);
  }

  // ── private helpers ─────────────────────────────────────────────

  /**
   * Calculate a combined bounding box for a set of Babylon meshes.
   *
   * @param {object[]} meshes
   * @returns {{ min: Vector3, max: Vector3, center: Vector3, size: Vector3 } | null}
   */
  _calculateBounds(meshes) {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let foundGeometry = false;

    for (const mesh of meshes) {
      if (!mesh?.getBoundingInfo || !mesh?.getTotalVertices) {
        continue;
      }

      if (mesh.getTotalVertices() === 0) {
        continue;
      }

      mesh.computeWorldMatrix?.(true);

      const bounds = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, bounds.minimumWorld);
      max = Vector3.Maximize(max, bounds.maximumWorld);
      foundGeometry = true;
    }

    if (!foundGeometry) {
      return null;
    }

    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);

    return { min, max, center, size };
  }

  /**
   * Find the root (parent-less) mesh from an ImportMesh result.
   * Babylon's GLB importer creates a __root__ transform node that
   * parents every mesh in the file.
   *
   * @param {object[]} meshes
   * @returns {object|null}
   */
  _findRoot(meshes) {
    return meshes.find((m) => !m.parent) ?? meshes[0] ?? null;
  }

  /**
   * Normalize arena JSON into a list of GLB part definitions.
   *
   * Supports both the new `arenaParts` array and the older `arenaGlb`
   * single-file field for backward compatibility.
   *
   * @param {object|null} arenaData
   * @returns {{ glb: string, position: Vector3, rotation: Vector3 }[]}
   */
  _getArenaPartDefs(arenaData) {
    if (!arenaData || typeof arenaData !== 'object') {
      return [];
    }

    if (Array.isArray(arenaData.arenaParts)) {
      return arenaData.arenaParts
        .map((part) => this._normalizeArenaPart(part))
        .filter(Boolean);
    }

    if (typeof arenaData.arenaGlb === 'string' && arenaData.arenaGlb.length > 0) {
      return [{ glb: arenaData.arenaGlb, position: Vector3.Zero(), rotation: Vector3.Zero() }];
    }

    return [];
  }

  /**
   * Convert a raw arena-part JSON entry into a normalized runtime shape.
   *
   * Accepted forms:
   *   - `"assets/glb/arena/floor.glb"`
   *   - `{ "glb": "assets/glb/arena/floor.glb", "position": [0, 0, 0] }`
   *   - `{ "glb": "assets/glb/arena/steps.glb", "position": [4, 0, -4], "rotation": [0, 3.141593, 0] }`
   *
   * @param {string|object|null} part
   * @returns {{ glb: string, position: Vector3, rotation: Vector3 }|null}
   */
  _normalizeArenaPart(part) {
    if (typeof part === 'string' && part.length > 0) {
      return { glb: part, position: Vector3.Zero(), rotation: Vector3.Zero() };
    }

    if (!part || typeof part !== 'object') {
      return null;
    }

    if (typeof part.glb !== 'string' || part.glb.length === 0) {
      return null;
    }

    return {
      glb: part.glb,
      position: this._toVector3(part.position),
      rotation: this._toVector3(part.rotation),
    };
  }

  /**
   * Apply world-space placement to each root-level mesh in an imported part.
   *
   * We preserve the authored relative transforms inside the GLB and simply
   * transform the part as a whole when placement data is provided.
   *
   * @param {object[]} meshes
   * @param {{ position: Vector3, rotation: Vector3 }} part
   */
  _applyPartTransform(meshes, part) {
    if (!part) {
      return;
    }

    const { position, rotation } = part;

    for (const mesh of meshes) {
      if (!mesh || mesh.parent || !mesh.position?.addInPlace) {
        continue;
      }

      if (rotation && (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0)) {
        if (mesh.rotationQuaternion) {
          const placementRotation = Quaternion.RotationYawPitchRoll(
            rotation.y,
            rotation.x,
            rotation.z
          );
          mesh.rotationQuaternion = placementRotation.multiply(mesh.rotationQuaternion);
        } else if (mesh.rotation?.addInPlace) {
          mesh.rotation.addInPlace(rotation);
        }
      }

      if (position && (position.x !== 0 || position.y !== 0 || position.z !== 0)) {
        mesh.position.addInPlace(position);
      }
    }
  }

  /**
   * Materialize the static ring-steps placement table into Vector3/Quaternion
   * pairs. Two placements are always returned: one for the NE corner and one
   * for the SW corner.
   *
   * @returns {{ corner: string, position: Vector3, rotation: Quaternion }[]}
   */
  _ringStepsPlacements() {
    return RING_STEPS_PLACEMENTS.map((p) => ({
      corner: p.corner,
      position: new Vector3(p.position[0], p.position[1], p.position[2]),
      rotation: new Quaternion(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3]),
    }));
  }

  /**
   * Override the local TRS of an imported ring-steps mesh so its world-space
   * placement matches the corresponding node inside ring-with-steps.glb.
   *
   * The standalone ring-steps.glb has its own baked node TRS; we replace it
   * (rather than add to it) because the placement values were authored in the
   * same local frame as ring-with-steps.glb and both files go through the same
   * Babylon importer axis conversion.
   *
   * @param {object[]} meshes
   * @param {{ position: Vector3, rotation: Quaternion }} placement
   */
  _applyRingStepsTransform(meshes, placement) {
    const target = meshes.find((m) => m && m.name === 'ring-steps');
    if (!target || !placement) {
      return;
    }

    if (target.position?.set) {
      target.position.set(placement.position.x, placement.position.y, placement.position.z);
    } else {
      target.position = placement.position.clone();
    }

    target.rotationQuaternion = placement.rotation.clone();
  }

  /**
   * Apply a world-space offset to each root-level mesh in an imported part.
   *
   * @param {object[]} meshes
   * @param {Vector3} offset
   */
  _applyPartOffset(meshes, offset) {
    this._applyPartTransform(meshes, {
      position: offset,
      rotation: Vector3.Zero(),
    });
  }

  /**
   * Convert a JSON position array into a Babylon Vector3.
   *
   * @param {unknown} value
   * @returns {Vector3}
   */
  _toVector3(value) {
    if (Array.isArray(value) && value.length === 3) {
      return new Vector3(
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0
      );
    }

    return Vector3.Zero();
  }

  /**
   * Dispose an array of meshes and their materials.
   *
   * @param {object[]} meshes
   */
  _disposeMeshes(meshes) {
    for (const mesh of meshes) {
      if (mesh.material) {
        // Dispose sub-materials if multi-material
        if (mesh.material.subMaterials) {
          for (const sub of mesh.material.subMaterials) {
            sub?.dispose?.();
          }
        }
        mesh.material.dispose?.();
      }
      mesh.dispose?.();
    }
  }
}
