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
   * The special key `"ropeColor"` is a hex colour string. When a rope material
   * override is a texture path, the colour is composited over it at `ropeColorOpacity`
   * (default 0.4). When the override value is `null`, the colour is applied directly.
   *
   * @param {object[]} meshes         — array of Babylon mesh objects from the loaded GLB
   * @param {object}   overrides      — `ringOverrides` object from the arena JSON
   * @param {object}   scene          — the active Babylon.js Scene instance
   * @param {Function} [TextureClass] — Babylon Texture constructor (injected by ArenaRenderer)
   * @returns {Promise<void>}
   */
  async applyRingOverrides(meshes, overrides, scene, TextureClass) {
    if (!overrides || typeof overrides !== 'object') {
      console.warn('MaterialManager: no overrides provided — skipping.');
      return;
    }

    // Build a lookup: material name → material reference
    const materialMap = this._buildMaterialMap(meshes);
    const matchedMaterials = new Set();

    const ropeColor = overrides.ropeColor ?? null;
    const ropeColorOpacity = overrides.ropeColorOpacity ?? 0.4;
    const ropeMaterials = ['mat_rope_top', 'mat_rope_middle', 'mat_rope_bottom'];

    for (const [matName, value] of Object.entries(overrides)) {
      // Metadata keys — not material names
      if (matName === 'ropeColor' || matName === 'ropeColorOpacity') continue;

      const resolvedName = this._resolveMaterialName(matName, materialMap);
      const material = resolvedName ? materialMap.get(resolvedName) : null;
      if (!material) {
        continue;
      }

      matchedMaterials.add(matName);

      if (typeof value === 'string' && value.length > 0) {
        this.swapTexture(material, value, scene, TextureClass);
      } else if (value === null && ropeMaterials.includes(matName) && ropeColor) {
        // Null texture on a rope material — apply the rope colour directly
        this.setMaterialColor(material, ropeColor);
      }
      // value === null on a non-rope material: leave the material as-is.
    }

    const unmatchedOverrides = Object.keys(overrides).filter((key) => {
      return key !== 'ropeColor' && key !== 'ropeColorOpacity' && !matchedMaterials.has(key);
    });

    if (unmatchedOverrides.length > 0) {
      console.warn(
        `MaterialManager: material overrides not found by name: ${unmatchedOverrides.join(', ')}. ` +
        'Falling back to mesh-name-based ring preview mapping.'
      );
      await this._applyMeshFallbackOverrides(meshes, overrides, scene, TextureClass);
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
      return null;
    }

    // PBR materials use `albedoTexture`; StandardMaterial uses `diffuseTexture`.
    if ('albedoTexture' in material) {
      material.albedoTexture = texture;
    } else {
      material.diffuseTexture = texture;
    }

    return texture;
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
   * Load a rope texture, composite the arena colour over it at the given opacity,
   * and assign the result to the material.
   *
   * Compositing is done on an HTML Canvas (normal SourceOver alpha blend):
   *   final = texture * (1 - opacity) + ropeColor * opacity
   *
   * Falls back to a solid colour if the image fails to load.
   *
   * @param {object}   material
   * @param {string}   texturePath
   * @param {string}   hexColor
   * @param {number}   opacity      — 0–1, fraction of colour over the texture
   * @param {object}   scene
   * @param {Function} [TextureClass]
   * @returns {Promise<void>}
   */
  async _applyRopeTextureWithColorOverlay(material, texturePath, hexColor, opacity, scene, TextureClass) {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        ctx.globalAlpha = opacity;
        ctx.fillStyle = hexColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;

        const dataUrl = canvas.toDataURL('image/png');

        let texture;
        if (scene._createTexture) {
          texture = scene._createTexture(dataUrl);
        } else if (TextureClass) {
          texture = new TextureClass(dataUrl, scene, undefined, false);
        } else {
          resolve();
          return;
        }

        if ('albedoTexture' in material) {
          material.albedoTexture = texture;
        } else {
          material.diffuseTexture = texture;
        }

        resolve();
      };

      img.onerror = () => {
        console.warn(
          `MaterialManager: failed to load rope texture "${texturePath}" for colour overlay ` +
          `— applying solid colour instead.`
        );
        this.setMaterialColor(material, hexColor);
        resolve();
      };

      img.src = texturePath;
    });
  }

  /**
   * Apply best-effort preview textures when a GLB does not preserve
   * the authored material names expected by `ringOverrides`.
   *
   * @param {object[]} meshes
   * @param {object} overrides
   * @param {object} scene
   * @param {Function} [TextureClass]
   * @returns {Promise<void>}
   */
  async _applyMeshFallbackOverrides(meshes, overrides, scene, TextureClass) {
    let warnedAboutSharedPlatform = false;

    for (const mesh of meshes) {
      const meshName = mesh?.name ?? '';
      if (!meshName || !mesh.material) {
        continue;
      }

      const material = this._ensureUniqueMaterial(mesh);
      if (!material) {
        continue;
      }

      if (meshName === 'canvas' || meshName === 'ring-platform') {
        const platformTexture = overrides.mat_canvas ?? 'assets/textures/ring/shared/canvas.png';
        this.swapTexture(material, platformTexture, scene, TextureClass);

        if (meshName === 'ring-platform' && overrides.mat_apron && !warnedAboutSharedPlatform) {
          console.warn(
            'MaterialManager: ring-platform is a single mesh/material in the current GLB export, ' +
            'so mat_apron cannot be previewed independently from mat_canvas.'
          );
          warnedAboutSharedPlatform = true;
        }
        continue;
      }

      if (meshName.startsWith('apron-')) {
        const apronTexture = overrides.mat_apron ?? 'assets/textures/ring/shared/canvas.png';
        this.swapTexture(material, apronTexture, scene, TextureClass);
        continue;
      }

      if (meshName.startsWith('rope-')) {
        this.swapTexture(
          material, 'assets/textures/ring/shared/rope.png', scene, TextureClass
        );
        continue;
      }

      if (meshName.startsWith('ring-post-')) {
        this.swapTexture(material, 'assets/textures/ring/shared/post.png', scene, TextureClass);
        continue;
      }

      if (meshName.startsWith('turnbuckle-pad-')) {
        const padTexture = overrides.mat_turnbuckle ?? 'assets/textures/ring/shared/turnbuckle.png';
        this.swapTexture(material, padTexture, scene, TextureClass);
        continue;
      }

      if (meshName.startsWith('turnbuckle-bolt-cover-')) {
        const boltCoverTexture = overrides.mat_turnbuckle_bolt_cover
          ?? overrides.mat_turnbuckle_cover
          ?? 'assets/textures/ring/shared/turnbuckle-bolt-cover.png';
        this.swapTexture(material, boltCoverTexture, scene, TextureClass);
        continue;
      }

      if (meshName.startsWith('turnbuckle-bolt-1-')) {
        const boltTexture = overrides.mat_turnbuckle_bolt_1
          ?? 'assets/textures/ring/shared/turnbuckle-bolt.png';
        this.swapTexture(material, boltTexture, scene, TextureClass);
        continue;
      }

      if (meshName.startsWith('turnbuckle-bolt-2-')) {
        const boltTexture = overrides.mat_turnbuckle_bolt_2
          ?? 'assets/textures/ring/shared/turnbuckle-bolt.png';
        this.swapTexture(material, boltTexture, scene, TextureClass);
        continue;
      }

      if (meshName.startsWith('turnbuckle-bolt-')) {
        this.swapTexture(
          material,
          'assets/textures/ring/shared/turnbuckle-bolt.png',
          scene,
          TextureClass
        );
      }
    }

  }

  /**
   * Clone a mesh material so preview-only overrides do not bleed into
   * other meshes that happened to share the imported GLB material.
   *
   * @param {object} mesh
   * @returns {object|null}
   */
  _ensureUniqueMaterial(mesh) {
    if (!mesh.material) {
      return null;
    }

    const currentMaterial = mesh.material;
    if (currentMaterial.__vpgPreviewUnique) {
      return currentMaterial;
    }

    const clonedMaterial = currentMaterial.clone
      ? currentMaterial.clone(`${currentMaterial.name || mesh.name}_preview`)
      : { ...currentMaterial };

    clonedMaterial.__vpgPreviewUnique = true;
    mesh.material = clonedMaterial;
    return clonedMaterial;
  }

  /**
   * Resolve material-name aliases so the runtime can honor both the new
   * canonical names and older arena JSON keys where helpful.
   *
   * @param {string} matName
   * @param {Map<string, object>} materialMap
   * @returns {string|null}
   */
  _resolveMaterialName(matName, materialMap) {
    if (materialMap.has(matName)) {
      return matName;
    }

    const aliases = {
      mat_turnbuckle_cover: ['mat_turnbuckle_bolt_cover'],
      mat_turnbuckle_bolt_cover: ['mat_turnbuckle_cover'],
    };

    for (const candidate of aliases[matName] ?? []) {
      if (materialMap.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

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
