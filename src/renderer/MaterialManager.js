/**
 * MaterialManager — runtime material and texture management for ring and arena meshes.
 *
 * Design constraints:
 *   - No Babylon.js imports at the top level; `scene` is passed in so this class
 *     stays testable under Vitest with mocked Babylon objects.
 *   - All texture paths come from arena JSON — nothing is hardcoded.
 *   - Missing material names log a warning instead of throwing.
 */
export class MaterialManager {
  /**
   * Apply per-material overrides from an arena JSON `ringOverrides` block.
   *
   * Each key in `overrides` is a material name (e.g. "mat_canvas").
   * The value is either:
   *   - a PNG path string  → applied as the diffuse texture
   *   - `null`             → skipped (material keeps its current look)
   *
   * The special key `"ropeColor"` is a hex colour string applied to every
   * rope material whose override value is `null`.
   *
   * @param {object[]} meshes       — array of Babylon mesh objects from the loaded GLB
   * @param {object}   overrides    — `ringOverrides` object from the arena JSON
   * @param {object}   scene        — the active Babylon.js Scene instance
   * @param {Function} [TextureClass] — Babylon Texture constructor (injected by ArenaRenderer)
   */
  applyRingOverrides(meshes, overrides, scene, TextureClass) {
    if (!overrides || typeof overrides !== 'object') {
      console.warn('MaterialManager: no overrides provided — skipping.');
      return;
    }

    // Build a lookup: material name → material reference
    const materialMap = this._buildMaterialMap(meshes);

    const ropeColor = overrides.ropeColor ?? null;
    const ropeMaterials = ['mat_rope_top', 'mat_rope_middle', 'mat_rope_bottom'];

    for (const [matName, value] of Object.entries(overrides)) {
      // ropeColor is handled separately — it isn't a material name
      if (matName === 'ropeColor') continue;

      const material = materialMap.get(matName);
      if (!material) {
        console.warn(
          `MaterialManager: material "${matName}" not found on any loaded mesh — skipping.`
        );
        continue;
      }

      if (typeof value === 'string' && value.length > 0) {
        // Texture path override
        this.swapTexture(material, value, scene, TextureClass);
      } else if (value === null && ropeMaterials.includes(matName) && ropeColor) {
        // Null texture on a rope material — apply the rope colour instead
        this.setMaterialColor(material, ropeColor);
      }
      // If value is null and it's not a rope, leave the material as-is (white base).
    }
  }

  /**
   * Replace (or assign) the diffuse texture on a single Babylon PBR or
   * Standard material.
   *
   * @param {object}   material       — Babylon.js material instance
   * @param {string}   texturePath    — relative path to a PNG file
   * @param {object}   scene          — active Babylon.js Scene
   * @param {Function} [TextureClass] — Babylon Texture constructor (optional, for runtime use)
   */
  swapTexture(material, texturePath, scene, TextureClass) {
    let texture;

    if (scene._createTexture) {
      // Test / mock path — lets us unit-test without Babylon.js
      texture = scene._createTexture(texturePath);
    } else if (TextureClass) {
      // Runtime path — use the injected Babylon Texture constructor.
      // invertY must be false to match glTF/GLB UV convention.
      texture = new TextureClass(texturePath, scene, undefined, false);
    } else {
      console.warn(
        `MaterialManager: no Texture constructor available — cannot load "${texturePath}".`
      );
      return;
    }

    // PBR materials use `albedoTexture`; StandardMaterial uses `diffuseTexture`.
    if ('albedoTexture' in material) {
      material.albedoTexture = texture;
    } else {
      material.diffuseTexture = texture;
    }
  }

  /**
   * Set a material's base / diffuse colour from a CSS hex string.
   *
   * @param {object} material — Babylon.js material instance
   * @param {string} hexColor — e.g. "#FF0000"
   */
  setMaterialColor(material, hexColor) {
    const { r, g, b } = this._hexToRgb(hexColor);

    if ('albedoColor' in material) {
      // PBR material
      material.albedoColor.r = r;
      material.albedoColor.g = g;
      material.albedoColor.b = b;
    } else if ('diffuseColor' in material) {
      // Standard material
      material.diffuseColor.r = r;
      material.diffuseColor.g = g;
      material.diffuseColor.b = b;
    }
  }

  // ── private helpers ─────────────────────────────────────────────

  /**
   * Walk the mesh array and build a Map<materialName, material>.
   * A single mesh may have multiple materials (multi-material), so we
   * inspect both `mesh.material` and `mesh.material.subMaterials`.
   *
   * @param {object[]} meshes
   * @returns {Map<string, object>}
   */
  _buildMaterialMap(meshes) {
    /** @type {Map<string, object>} */
    const map = new Map();

    for (const mesh of meshes) {
      if (!mesh.material) continue;

      const mat = mesh.material;

      // Multi-material (e.g. rope mesh with 3 sub-materials)
      if (mat.subMaterials && Array.isArray(mat.subMaterials)) {
        for (const sub of mat.subMaterials) {
          if (sub && sub.name) {
            map.set(sub.name, sub);
          }
        }
      } else if (mat.name) {
        map.set(mat.name, mat);
      }
    }

    return map;
  }

  /**
   * Parse a CSS hex colour string into normalised 0-1 RGB floats.
   *
   * @param {string} hex — "#RGB", "#RRGGBB", or "RRGGBB"
   * @returns {{ r: number, g: number, b: number }}
   */
  _hexToRgb(hex) {
    let h = hex.replace(/^#/, '');

    // Expand shorthand "#F00" → "FF0000"
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }

    const n = parseInt(h, 16);
    return {
      r: ((n >> 16) & 0xff) / 255,
      g: ((n >> 8) & 0xff) / 255,
      b: (n & 0xff) / 255,
    };
  }
}
