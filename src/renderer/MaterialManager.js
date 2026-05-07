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
   * Apply simple per-material texture overrides to any mesh set.
   *
   * Each key in `overrides` is a material name. String values swap the
   * material texture while `null` values are ignored.
   *
   * @param {object[]} meshes
   * @param {object} overrides
   * @param {object} scene
   * @param {Function} [TextureClass]
   * @returns {Promise<void>}
   */
  async applyMaterialOverrides(meshes, overrides, scene, TextureClass) {
    if (!overrides || typeof overrides !== 'object') {
      console.warn('MaterialManager: no overrides provided — skipping.');
      return;
    }

    const materialMap = this._buildMaterialMap(meshes);
    const unmatchedOverrides = [];

    for (const [matName, value] of Object.entries(overrides)) {
      if (typeof value !== 'string' || value.length === 0) {
        continue;
      }

      const material = materialMap.get(matName);
      if (!material) {
        unmatchedOverrides.push(matName);
        continue;
      }

      this.swapTexture(material, value, scene, TextureClass);
    }

    if (unmatchedOverrides.length > 0) {
      console.warn(
        `MaterialManager: material overrides not found by name: ${unmatchedOverrides.join(', ')}.`
      );
    }
  }

  /**
   * Apply per-material overrides from an arena JSON `ringOverrides` block.
   *
   * Each key in `overrides` is a material name (e.g. "mat_canvas").
   * The value is either:
   *   - a PNG path string  → applied as the diffuse texture
   *   - `null`             → skipped (material keeps its current look)
   *
   * Special colour keys:
   *   - `"ropeColor"` is a fallback colour for all rope materials.
   *   - `"ropeTopColor"`, `"ropeMiddleColor"`, and `"ropeBottomColor"` override
   *     the top, middle, and bottom rope colours independently.
   *   - Rope colours may be hex, rgb(), or rgba() CSS colour strings.
   *     Use rgba() when the colour should be composited transparently over
   *     the rope texture.
   *   - `"postColor"` tints/colours ring post materials.
   *   - `"turnbucklePadColor"` tints/colours turnbuckle pad materials.
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

    const ropeMaterials = ['mat_rope_top', 'mat_rope_middle', 'mat_rope_bottom'];
    const metadataKeys = new Set([
      'ropeColor',
      'ropeTopColor',
      'ropeMiddleColor',
      'ropeBottomColor',
      'canvasColor',
      'postColor',
      'turnbucklePadColor',
    ]);

    for (const [matName, value] of Object.entries(overrides)) {
      // Metadata keys — not material names
      if (metadataKeys.has(matName)) continue;

      const resolvedName = this._resolveMaterialName(matName, materialMap);
      const material = resolvedName ? materialMap.get(resolvedName) : null;
      if (!material) {
        continue;
      }

      matchedMaterials.add(matName);

      if (typeof value === 'string' && value.length > 0) {
        const materialRopeColor = this._getRopeColorForMaterial(matName, overrides);
        if (ropeMaterials.includes(matName) && materialRopeColor) {
          await this._applyRopeTextureWithColorOverlay(
            material,
            value,
            materialRopeColor,
            scene,
            TextureClass
          );
        } else if (matName === 'mat_canvas' && overrides.canvasColor) {
          await this._applyRopeTextureWithColorOverlay(
            material,
            value,
            overrides.canvasColor,
            scene,
            TextureClass
          );
        } else {
          this.swapTexture(material, value, scene, TextureClass);
        }
      } else if (value === null && ropeMaterials.includes(matName)) {
        const materialRopeColor = this._getRopeColorForMaterial(matName, overrides);
        if (!materialRopeColor) {
          continue;
        }

        // Null texture on a rope material — remove any baked GLB texture and apply the rope colour.
        this.clearMaterialTexture(material);
        this.setMaterialColor(material, materialRopeColor);
      } else if (value === null && matName === 'mat_canvas' && overrides.canvasColor) {
        this.clearMaterialTexture(material);
        this.setMaterialColor(material, overrides.canvasColor);
      }
      // value === null on a non-rope material: leave the material as-is.
    }

    this._applyRingColorOverridesByMaterial(materialMap, overrides);

    const unmatchedOverrides = Object.keys(overrides).filter((key) => {
      return !metadataKeys.has(key) && !matchedMaterials.has(key);
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
   * Set a material's base / diffuse colour from a CSS colour string.
   *
   * @param {object} material — Babylon.js material instance
   * @param {string} cssColor — e.g. "#FF0000", "rgb(255,0,0)", or "rgba(255,0,0,0.4)"
   */
  setMaterialColor(material, cssColor) {
    const { r, g, b, a } = this._cssColorToRgba(cssColor);

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

    if (a < 1 || 'alpha' in material) {
      material.alpha = a;
    }
  }

  /**
   * Remove any base/diffuse texture from a material.
   *
   * @param {object} material
   */
  clearMaterialTexture(material) {
    if ('albedoTexture' in material) {
      material.albedoTexture = null;
    } else if ('diffuseTexture' in material) {
      material.diffuseTexture = null;
    }
  }

  // ── private helpers ─────────────────────────────────────────────

  /**
   * Load a rope texture, composite the arena colour over it, and assign the
   * result to the material.
   *
   * Compositing is done on an HTML Canvas (normal SourceOver alpha blend):
   *   final = source texture + cssColor fill
   *
   * Falls back to a solid colour if the image fails to load.
   *
   * @param {object}   material
   * @param {string}   texturePath
   * @param {string}   cssColor
   * @param {object}   scene
   * @param {Function} [TextureClass]
   * @returns {Promise<void>}
   */
  async _applyRopeTextureWithColorOverlay(material, texturePath, cssColor, scene, TextureClass) {
    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        ctx.fillStyle = cssColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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
        this.setMaterialColor(material, cssColor);
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
        if (overrides.canvasColor) {
          await this._applyRopeTextureWithColorOverlay(
            material,
            platformTexture,
            overrides.canvasColor,
            scene,
            TextureClass
          );
        } else {
          this.swapTexture(material, platformTexture, scene, TextureClass);
        }

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
        const meshRopeColor = this._getRopeColorForMesh(meshName, overrides);
        if (meshRopeColor && (
          overrides.ropeTopColor
          || overrides.ropeMiddleColor
          || overrides.ropeBottomColor
        )) {
          this.clearMaterialTexture(material);
          this.setMaterialColor(material, meshRopeColor);
        } else {
          this.swapTexture(
            material, 'assets/textures/ring/shared/rope.png', scene, TextureClass
          );
        }
        continue;
      }

      if (meshName.startsWith('ring-post-')) {
        if (overrides.postColor) {
          this.clearMaterialTexture(material);
          this.setMaterialColor(material, overrides.postColor);
        } else {
          this.swapTexture(material, 'assets/textures/ring/shared/post.png', scene, TextureClass);
        }
        continue;
      }

      if (meshName.startsWith('turnbuckle-pad-')) {
        if (overrides.turnbucklePadColor) {
          this.clearMaterialTexture(material);
          this.setMaterialColor(material, overrides.turnbucklePadColor);
        } else {
          const padTexture = overrides.mat_turnbuckle ?? 'assets/textures/ring/shared/turnbuckle.png';
          this.swapTexture(material, padTexture, scene, TextureClass);
        }
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
   * Resolve the effective colour for a named rope material.
   *
   * @param {string} matName
   * @param {object} overrides
   * @returns {string|null}
   */
  _getRopeColorForMaterial(matName, overrides) {
    const colorsByMaterial = {
      mat_rope_top: overrides.ropeTopColor,
      mat_rope_middle: overrides.ropeMiddleColor,
      mat_rope_bottom: overrides.ropeBottomColor,
    };

    return colorsByMaterial[matName] ?? overrides.ropeColor ?? null;
  }

  /**
   * Resolve the effective colour for fallback rope mesh names such as
   * `rope-east-top`, `rope-west-middle`, or `rope-south-bottom`.
   *
   * @param {string} meshName
   * @param {object} overrides
   * @returns {string|null}
   */
  _getRopeColorForMesh(meshName, overrides) {
    if (meshName.includes('-top')) {
      return overrides.ropeTopColor ?? overrides.ropeColor ?? null;
    }

    if (meshName.includes('-middle')) {
      return overrides.ropeMiddleColor ?? overrides.ropeColor ?? null;
    }

    if (meshName.includes('-bottom')) {
      return overrides.ropeBottomColor ?? overrides.ropeColor ?? null;
    }

    return overrides.ropeColor ?? null;
  }

  /**
   * Apply colour-only ring overrides to named GLB materials.
   *
   * @param {Map<string, object>} materialMap
   * @param {object} overrides
   */
  _applyRingColorOverridesByMaterial(materialMap, overrides) {
    const colorTargets = [
      ['postColor', ['mat_post']],
      ['turnbucklePadColor', ['mat_turnbuckle']],
    ];

    for (const [overrideKey, materialNames] of colorTargets) {
      const color = overrides[overrideKey];
      if (typeof color !== 'string' || color.length === 0) {
        continue;
      }

      for (const matName of materialNames) {
        const resolvedName = this._resolveMaterialName(matName, materialMap);
        const material = resolvedName ? materialMap.get(resolvedName) : null;
        if (!material) {
          continue;
        }

        this.clearMaterialTexture(material);
        this.setMaterialColor(material, color);
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

  /**
   * Parse a CSS colour string into normalised 0-1 RGBA floats.
   *
   * Supported forms: "#RGB", "#RRGGBB", "rgb(r,g,b)", "rgba(r,g,b,a)".
   *
   * @param {string} color
   * @returns {{ r: number, g: number, b: number, a: number }}
   */
  _cssColorToRgba(color) {
    if (typeof color !== 'string') {
      return { r: 1, g: 1, b: 1, a: 1 };
    }

    const trimmed = color.trim();
    if (trimmed.startsWith('#') || /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) {
      return { ...this._hexToRgb(trimmed), a: 1 };
    }

    const match = trimmed.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) {
      return { r: 1, g: 1, b: 1, a: 1 };
    }

    const [r = 255, g = 255, b = 255, a = 1] = match[1]
      .split(',')
      .map((part) => Number(part.trim()));

    return {
      r: this._clamp01(r / 255),
      g: this._clamp01(g / 255),
      b: this._clamp01(b / 255),
      a: this._clamp01(a),
    };
  }

  /**
   * Clamp a number to the 0-1 range.
   *
   * @param {number} value
   * @returns {number}
   */
  _clamp01(value) {
    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.min(Math.max(value, 0), 1);
  }
}
