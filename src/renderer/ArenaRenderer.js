import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';

// Ensure the glTF / GLB loader plugin is registered.
import '@babylonjs/loaders/glTF/2.0/index.js';

import { loadJSON } from '../data/DataLoader.js';
import { MaterialManager } from './MaterialManager.js';

/**
 * ArenaRenderer — loads a ring GLB and an arena-specific GLB, positions
 * them at world origin, and applies per-arena material overrides.
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

    /** @type {object[]} all meshes loaded for the arena GLB */
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
      'assets/glb/ring/ring-standard.glb',
      scene
    );

    this.ringMeshes = ringResult.meshes;

    // Position ring root at world origin
    const ringRoot = this._findRoot(this.ringMeshes);
    if (ringRoot) {
      ringRoot.position = new Vector3(0, 0, 0);
    }

    // 3. Load the arena GLB (if specified) ───────────────────────
    if (this.arenaData.arenaGlb) {
      try {
        const arenaResult = await SceneLoader.ImportMeshAsync(
          '',
          '',
          this.arenaData.arenaGlb,
          scene
        );
        this.arenaMeshes = arenaResult.meshes;

        // Position arena root at world origin
        const arenaRoot = this._findRoot(this.arenaMeshes);
        if (arenaRoot) {
          arenaRoot.position = new Vector3(0, 0, 0);
        }
      } catch (err) {
        console.warn(
          `ArenaRenderer: failed to load arena GLB "${this.arenaData.arenaGlb}" — ` +
          `ring will render without arena surroundings.\n${err.message}`
        );
      }
    }

    // 4. Apply material overrides from arena JSON ────────────────
    if (this.arenaData.ringOverrides) {
      this.materialManager.applyRingOverrides(
        this.ringMeshes,
        this.arenaData.ringOverrides,
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
    this._disposeMeshes(this.arenaMeshes);

    this.ringMeshes = [];
    this.arenaMeshes = [];
    this.arenaData = null;
    this.scene = null;
  }

  // ── private helpers ─────────────────────────────────────────────

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
